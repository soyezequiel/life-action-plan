import { NextResponse } from 'next/server'
import type { PlanBuildProgress } from '../../../../src/shared/types/lap-api'
import { decryptApiKey } from '../../../../src/lib/auth/api-key-auth'
import { canUseLocalOllama, getDeploymentMode } from '../../../../src/lib/env/deployment'
import {
  canChargeOperation,
  chargeOperation,
  createInstrumentedRuntime,
  buildWithOllamaFallback,
  generatePlan,
  getProvider,
  quoteOperationCharge,
  recordChargeResult,
  summarizeOperationCharge,
  traceCollector
} from '../../_domain'
import {
  createOperationCharge,
  createPlan,
  estimateCostSats,
  estimateCostUsd,
  seedProgressFromEvents,
  trackCost,
  trackEvent,
  getProfile,
  getUserSetting
} from '../../_db'
import { apiErrorMessages, encodeSseData, sseHeaders } from '../../_shared'
import { planBuildRequestSchema } from '../../_schemas'
import {
  buildPlanManifest,
  createUniquePlanSlug,
  getProfileTimezone,
  parseStoredProfile,
  toChargeErrorMessage,
  toPlanBuildErrorMessage
} from '../../_plan'
import { DEFAULT_USER_ID, getApiKeySettingKey } from '../../_user-settings'
import {
  getCloudApiKeyEnvName,
  getModelProviderName,
  isLocalModel,
  resolveBuildModel
} from '../../../../src/lib/providers/provider-metadata'

export const maxDuration = 60

export async function POST(request: Request): Promise<Response> {
  const parsed = planBuildRequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encodeSseData({
          type: 'result',
          result: {
            success: false,
            error: apiErrorMessages.invalidRequest()
          }
        }))
        controller.close()
      }
    })

    return new NextResponse(stream, { headers: sseHeaders() })
  }

  const { profileId, apiKey, provider } = parsed.data
  const modelId = resolveBuildModel(provider)
  const localOllamaAvailable = canUseLocalOllama(getDeploymentMode())

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encodeSseData(payload))
      }

      let traceId: string | null = null
      let streamedCharCount = 0
      let chargeRecord: Awaited<ReturnType<typeof createOperationCharge>> | null = null

      try {
        const profileRow = await getProfile(profileId)
        if (!profileRow) {
          send({
            type: 'result',
            result: {
              success: false,
              error: apiErrorMessages.profileNotFound()
            }
          })
          controller.close()
          return
        }

        const profile = parseStoredProfile(profileRow.data)
        if (!profile) {
          send({
            type: 'result',
            result: {
              success: false,
              error: apiErrorMessages.profileNotFound()
            }
          })
          controller.close()
          return
        }

        const chargeQuote = quoteOperationCharge({
          operation: 'plan_build',
          model: modelId
        })
        const chargeDecision = await canChargeOperation({
          operation: 'plan_build',
          model: modelId,
          estimatedCostUsd: chargeQuote.estimatedCostUsd,
          estimatedCostSats: chargeQuote.estimatedCostSats
        })

        chargeRecord = await createOperationCharge({
          profileId,
          operation: 'plan_build',
          model: modelId,
          status: chargeDecision.decision === 'chargeable' ? 'pending' : chargeDecision.decision,
          estimatedCostUsd: chargeQuote.estimatedCostUsd,
          estimatedCostSats: chargeQuote.estimatedCostSats,
          reasonCode: chargeDecision.decision === 'chargeable' ? null : chargeDecision.reasonCode,
          reasonDetail: chargeDecision.decision === 'chargeable' ? null : chargeDecision.reasonDetail,
          metadata: {
            requestedModelId: modelId
          }
        })

        await trackEvent('PLAN_BUILD_STARTED', {
          profileId,
          modelId,
          chargeId: chargeRecord.id,
          chargeDecision: chargeDecision.decision,
          estimatedCostSats: chargeQuote.estimatedCostSats
        })
        const preparingProgress: PlanBuildProgress = {
          profileId,
          provider: modelId,
          stage: 'preparing',
          current: 1,
          total: 4,
          charCount: 0
        }
        send({
          type: 'progress',
          progress: preparingProgress
        })

        if (chargeDecision.decision === 'rejected') {
          await trackEvent('PLAN_BUILD_CHARGE_BLOCKED', {
            profileId,
            modelId,
            chargeId: chargeRecord.id,
            reasonCode: chargeDecision.reasonCode,
            reasonDetail: chargeDecision.reasonDetail
          })

          send({
            type: 'result',
            result: {
              success: false,
              error: toChargeErrorMessage(chargeDecision.reasonCode),
              charge: summarizeOperationCharge(chargeRecord)
            }
          })
          controller.close()
          return
        }

        if (isLocalModel(modelId) && !localOllamaAvailable) {
          send({
            type: 'result',
            result: {
              success: false,
              error: apiErrorMessages.localAssistantUnavailable()
            }
          })
          controller.close()
          return
        }

        traceId = traceCollector.startTrace('plan-builder', modelId, { profileId, transport: 'api' })

        const buildResult = await buildWithOllamaFallback(
          modelId,
          async (nextModelId) => {
            if (isLocalModel(nextModelId) && !localOllamaAvailable) {
              throw new Error(apiErrorMessages.localAssistantUnavailable())
            }

            const cloudApiKeyEnvName = getCloudApiKeyEnvName(nextModelId)
            const cloudApiKeyProvider = getModelProviderName(nextModelId)
            const encryptedStoredApiKey = cloudApiKeyProvider === 'openrouter' || cloudApiKeyProvider === 'openai'
              ? await getUserSetting(DEFAULT_USER_ID, getApiKeySettingKey(cloudApiKeyProvider))
              : undefined
            const storedApiKey = encryptedStoredApiKey ? decryptApiKey(encryptedStoredApiKey) : ''
            const resolvedApiKey = isLocalModel(nextModelId)
              ? ''
              : apiKey.trim() || storedApiKey || (cloudApiKeyEnvName ? process.env[cloudApiKeyEnvName]?.trim() || '' : '')

            if (!isLocalModel(nextModelId) && !resolvedApiKey) {
              throw new Error('API key not configured')
            }

            const runtime = getProvider(nextModelId, {
              apiKey: resolvedApiKey,
              baseURL: isLocalModel(nextModelId)
                ? process.env.OLLAMA_BASE_URL?.trim()
                : undefined
            })
            const instrumentedRuntime = createInstrumentedRuntime(
              runtime,
              traceId,
              'plan-builder',
              nextModelId
            )

            return generatePlan(instrumentedRuntime, profile, {
              planDir: '',
              profileId,
              userLocale: 'es-AR',
              formalityLevel: 'informal',
              tokenMultiplier: 1.22
            }, {
              onStageChange: (stage) => {
                if (stage === 'generating') {
                  const generatingProgress: PlanBuildProgress = {
                    profileId,
                    provider: nextModelId,
                    stage: 'generating',
                    current: 2,
                    total: 4,
                    charCount: streamedCharCount
                  }
                  send({
                    type: 'progress',
                    progress: generatingProgress
                  })
                } else if (stage === 'validating') {
                  const validatingProgress: PlanBuildProgress = {
                    profileId,
                    provider: nextModelId,
                    stage: 'validating',
                    current: 3,
                    total: 4,
                    charCount: streamedCharCount
                  }
                  send({
                    type: 'progress',
                    progress: validatingProgress
                  })
                }
              },
              onToken: (chunk) => {
                streamedCharCount += chunk.length
                const chunkProgress: PlanBuildProgress = {
                  profileId,
                  provider: nextModelId,
                  stage: 'generating',
                  current: 2,
                  total: 4,
                  charCount: streamedCharCount,
                  chunk
                }
                send({
                  type: 'progress',
                  progress: chunkProgress
                })
              }
            })
          },
          {
            allowFallback: localOllamaAvailable,
            onFallback: async (originalError) => {
              await trackEvent('PLAN_BUILD_FALLBACK', {
                profileId,
                originalModel: modelId,
                originalError: originalError.message
              })
            }
          }
        )

        traceCollector.completeTrace(traceId)

        const result = buildResult.result
        const fallbackUsed = buildResult.fallbackUsed
        const finalModelId = buildResult.modelId
        const timezone = getProfileTimezone(profile)
        const actualCostUsd = estimateCostUsd(
          finalModelId,
          result.tokensUsed.input,
          result.tokensUsed.output
        )
        const actualCostSats = estimateCostSats(actualCostUsd)

        const savingProgress: PlanBuildProgress = {
          profileId,
          provider: finalModelId,
          stage: 'saving',
          current: 4,
          total: 4,
          charCount: streamedCharCount
        }
        send({
          type: 'progress',
          progress: savingProgress
        })

        if (!chargeRecord) {
          throw new Error('CHARGE_RECORD_MISSING')
        }

        if (chargeRecord.status === 'pending' && !isLocalModel(finalModelId)) {
          const chargeResult = await chargeOperation({
            operation: 'plan_build',
            amountSats: chargeRecord.estimatedCostSats,
            description: `LAP plan build ${profileId}`
          })

          chargeRecord = await recordChargeResult(chargeRecord.id, {
            model: finalModelId,
            paymentProvider: chargeResult.paymentProvider,
            status: chargeResult.status,
            finalCostUsd: actualCostUsd,
            finalCostSats: actualCostSats,
            chargedSats: chargeResult.chargedSats,
            reasonCode: chargeResult.reasonCode,
            reasonDetail: chargeResult.reasonDetail,
            lightningInvoice: chargeResult.lightningInvoice,
            lightningPaymentHash: chargeResult.lightningPaymentHash,
            lightningPreimage: chargeResult.lightningPreimage,
            providerReference: chargeResult.providerReference,
            metadata: {
              requestedModelId: modelId,
              finalModelId,
              fallbackUsed
            }
          }) ?? chargeRecord

          if (chargeRecord.status !== 'paid') {
            await trackEvent('PLAN_BUILD_CHARGE_FAILED', {
              profileId,
              modelId: finalModelId,
              chargeId: chargeRecord.id,
              chargeStatus: chargeRecord.status,
              reasonCode: chargeRecord.reasonCode,
              reasonDetail: chargeRecord.reasonDetail
            })

            send({
              type: 'result',
              result: {
                success: false,
                error: toChargeErrorMessage(chargeRecord.reasonCode),
                charge: summarizeOperationCharge(chargeRecord)
              }
            })
            controller.close()
            return
          }
        } else {
          chargeRecord = await recordChargeResult(chargeRecord.id, {
            model: finalModelId,
            status: 'skipped',
            finalCostUsd: actualCostUsd,
            finalCostSats: actualCostSats,
            chargedSats: 0,
            reasonCode: isLocalModel(finalModelId)
              ? 'free_local_operation'
              : chargeRecord.reasonCode ?? 'operation_not_chargeable',
            reasonDetail: isLocalModel(finalModelId)
              ? (fallbackUsed ? 'FALLBACK_TO_LOCAL' : 'FREE_LOCAL_OPERATION')
              : chargeRecord.reasonDetail ?? 'OPERATION_NOT_CHARGEABLE',
            metadata: {
              requestedModelId: modelId,
              finalModelId,
              fallbackUsed
            }
          }) ?? chargeRecord
        }

        const planSlug = await createUniquePlanSlug(result.nombre)
        const manifest = buildPlanManifest({
          nombre: result.nombre,
          fallbackUsed,
          modelId: finalModelId,
          tokensInput: result.tokensUsed.input,
          tokensOutput: result.tokensUsed.output,
          costUsd: actualCostUsd,
          costSats: actualCostSats,
          charge: summarizeOperationCharge(chargeRecord)
        })
        const planId = await createPlan(profileId, result.nombre, planSlug, manifest)

        chargeRecord = await recordChargeResult(chargeRecord.id, {
          planId
        }) ?? chargeRecord

        await trackCost(
          planId,
          'plan_build',
          finalModelId,
          result.tokensUsed.input,
          result.tokensUsed.output,
          chargeRecord.id
        )

        const seeded = await seedProgressFromEvents(planId, result.eventos, timezone)
        await trackEvent('PLAN_BUILT', {
          planId,
          modelId: finalModelId,
          fallbackUsed,
          eventCount: result.eventos.length,
          progressSeeded: seeded,
          tokensInput: result.tokensUsed.input,
          tokensOutput: result.tokensUsed.output,
          costUsd: actualCostUsd,
          costSats: actualCostSats,
          chargeId: chargeRecord.id,
          chargeStatus: chargeRecord.status,
          chargedSats: chargeRecord.chargedSats
        })

        send({
          type: 'result',
          result: {
            success: true,
            planId,
            nombre: result.nombre,
            resumen: result.resumen,
            eventos: result.eventos,
            tokensUsed: result.tokensUsed,
            fallbackUsed,
            charge: summarizeOperationCharge(chargeRecord)
          }
        })
        controller.close()
      } catch (error) {
        traceCollector.failTrace(traceId, error)
        const message = toPlanBuildErrorMessage(error)

        if (chargeRecord?.status === 'pending') {
          chargeRecord = await recordChargeResult(chargeRecord.id, {
            status: 'failed',
            reasonCode: 'unknown_error',
            reasonDetail: error instanceof Error ? error.message : 'Unknown error',
            metadata: {
              requestedModelId: modelId
            }
          }) ?? chargeRecord
        }

        send({
          type: 'result',
          result: {
            success: false,
            error: message,
            charge: chargeRecord ? summarizeOperationCharge(chargeRecord) : undefined
          }
        })
        controller.close()
      }
    }
  })

  return new NextResponse(stream, { headers: sseHeaders() })
}
