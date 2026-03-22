import { NextResponse } from 'next/server'
import { getDeploymentMode } from '../../../../src/lib/env/deployment'
import {
  resolvePlanBuildExecution,
  toOperationChargeSkipReason,
  type ResolvedPlanBuildExecution
} from '../../../../src/lib/runtime/build-execution'
import {
  DEFAULT_OLLAMA_FALLBACK_MODEL,
  canChargeOperation,
  chargeOperation,
  createInstrumentedRuntime,
  buildWithOllamaFallback,
  generatePlan,
  getProvider,
  recordChargeResult,
  summarizeOperationCharge,
  traceCollector
} from '../../_domain'
import type { PlanBuildProgress } from '../../../../src/shared/types/lap-api'
import {
  createOperationCharge,
  createPlan,
  estimateCostSats,
  estimateCostUsd,
  seedProgressFromEvents,
  trackCost,
  trackEvent,
  getProfile
} from '../../_db'
import { apiErrorMessages, encodeSseData, sseHeaders } from '../../_shared'
import { planBuildRequestSchema } from '../../_schemas'
import {
  buildPlanManifest,
  createUniquePlanSlug,
  getProfileTimezone,
  parseStoredProfile,
  toChargeErrorMessage,
  toExecutionBlockErrorMessage,
  toPlanBuildErrorMessage
} from '../../_plan'
import { resolveBuildModel } from '../../../../src/lib/providers/provider-metadata'
import { summarizeResourceUsage } from '../../../../src/lib/runtime/resource-usage-summary'
import { toResourceUsageTrackingPayload } from '../../../../src/lib/runtime/resource-usage-tracking'
import { resolveUserId } from '../../_user-settings'

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

  const { profileId, apiKey, provider, backendCredentialId, resourceMode, thinkingMode } = parsed.data
  const requestedModelId = resolveBuildModel(provider)
  const deploymentMode = getDeploymentMode()
  const userId = resolveUserId(request)
  const requestedMode = resourceMode === 'backend'
    ? 'backend-cloud'
    : resourceMode === 'user'
      ? 'user-cloud'
      : resourceMode === 'codex'
        ? 'codex-cloud'
      : backendCredentialId
        ? 'backend-cloud'
        : undefined

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encodeSseData(payload))
      }

      let traceId: string | null = null
      let streamedCharCount = 0
      let chargeRecord: Awaited<ReturnType<typeof createOperationCharge>> | null = null
      let requestedExecution: ResolvedPlanBuildExecution | null = null
      let fallbackExecution: ResolvedPlanBuildExecution | null = null

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

        requestedExecution = await resolvePlanBuildExecution({
          modelId: requestedModelId,
          deploymentMode,
          userId,
          requestedMode,
          userSuppliedApiKey: apiKey,
          backendCredentialId
        })

        const { executionContext, billingPolicy, runtime } = requestedExecution
        const requestedResourceUsage = summarizeResourceUsage({
          executionContext,
          billingPolicy
        })
        const prechargeDecision = billingPolicy.chargeable
          ? await canChargeOperation({
              operation: 'plan_build',
              model: requestedModelId,
              userId,
              estimatedCostUsd: billingPolicy.estimatedCostUsd,
              estimatedCostSats: billingPolicy.estimatedCostSats,
              chargeable: true
            })
          : null
        const skipReason = billingPolicy.chargeable ? null : toOperationChargeSkipReason(billingPolicy)
        const initialChargeStatus = billingPolicy.chargeable
          ? prechargeDecision?.decision === 'chargeable'
            ? 'pending'
            : prechargeDecision?.decision ?? 'skipped'
          : 'skipped'
        const initialReasonCode = billingPolicy.chargeable
          ? prechargeDecision?.decision === 'chargeable'
            ? null
            : prechargeDecision?.reasonCode ?? null
          : skipReason?.reasonCode ?? null
        const initialReasonDetail = billingPolicy.chargeable
          ? prechargeDecision?.decision === 'chargeable'
            ? null
            : prechargeDecision?.reasonDetail ?? null
          : skipReason?.reasonDetail ?? null

        chargeRecord = await createOperationCharge({
          profileId,
          operation: 'plan_build',
          model: requestedModelId,
          status: initialChargeStatus,
          estimatedCostUsd: billingPolicy.estimatedCostUsd,
          estimatedCostSats: billingPolicy.estimatedCostSats,
          reasonCode: initialReasonCode,
          reasonDetail: initialReasonDetail,
          metadata: {
            requestedModelId,
            requestedExecutionContext: executionContext,
            billingPolicy,
            resourceUsage: requestedResourceUsage
          }
        })

        await trackEvent('PLAN_BUILD_STARTED', {
          profileId,
          chargeId: chargeRecord.id,
          chargeDecision: billingPolicy.chargeable
            ? prechargeDecision?.decision ?? initialChargeStatus
            : 'skipped',
          ...toResourceUsageTrackingPayload(requestedResourceUsage)
        })

        const preparingProgress: PlanBuildProgress = {
          profileId,
          provider: requestedModelId,
          stage: 'preparing',
          current: 1,
          total: 4,
          charCount: 0
        }
        send({
          type: 'progress',
          progress: preparingProgress
        })

        if (!executionContext.canExecute) {
          await trackEvent('PLAN_BUILD_EXECUTION_BLOCKED', {
            profileId,
            chargeId: chargeRecord.id,
            ...toResourceUsageTrackingPayload(requestedResourceUsage)
          })

          send({
            type: 'result',
            result: {
              success: false,
              error: toExecutionBlockErrorMessage(executionContext.blockReasonCode),
              charge: summarizeOperationCharge(chargeRecord),
              resourceUsage: requestedResourceUsage
            }
          })
          controller.close()
          return
        }

        if (!runtime) {
          throw new Error('BUILD_RUNTIME_UNAVAILABLE')
        }

        if (prechargeDecision?.decision === 'rejected') {
          await trackEvent('PLAN_BUILD_CHARGE_BLOCKED', {
            profileId,
            chargeId: chargeRecord.id,
            reasonCode: prechargeDecision.reasonCode,
            reasonDetail: prechargeDecision.reasonDetail,
            ...toResourceUsageTrackingPayload(requestedResourceUsage)
          })

          send({
            type: 'result',
            result: {
              success: false,
              error: toChargeErrorMessage(prechargeDecision.reasonCode),
              charge: summarizeOperationCharge(chargeRecord)
            }
          })
          controller.close()
          return
        }

        if (executionContext.mode === 'backend-cloud') {
          fallbackExecution = await resolvePlanBuildExecution({
            modelId: DEFAULT_OLLAMA_FALLBACK_MODEL,
            deploymentMode,
            requestedMode: 'backend-local'
          })
        }

        const allowFallback = Boolean(fallbackExecution?.executionContext.canExecute && fallbackExecution.runtime)

        traceId = traceCollector.startTrace('plan-builder', runtime.modelId, {
          profileId,
          transport: 'api',
          executionMode: executionContext.mode,
          resourceOwner: executionContext.resourceOwner
        })

        const buildResult = await buildWithOllamaFallback(
          runtime.modelId,
          async (nextModelId) => {
            const activeExecution = nextModelId === runtime.modelId
              ? requestedExecution!
              : fallbackExecution && fallbackExecution.runtime && nextModelId === fallbackExecution.runtime.modelId
                ? fallbackExecution
                : await resolvePlanBuildExecution({
                    modelId: nextModelId,
                    deploymentMode,
                    requestedMode: 'backend-local'
                  })

            if (!activeExecution.executionContext.canExecute || !activeExecution.runtime) {
              throw new Error(apiErrorMessages.localAssistantUnavailable())
            }

            const activeRuntime = getProvider(activeExecution.runtime.modelId, {
              apiKey: activeExecution.runtime.apiKey,
              baseURL: activeExecution.runtime.baseURL,
              thinkingMode
            })
            const instrumentedRuntime = createInstrumentedRuntime(
              activeRuntime,
              traceId,
              'plan-builder',
              activeExecution.runtime.modelId
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
                    provider: activeExecution.runtime!.modelId,
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
                    provider: activeExecution.runtime!.modelId,
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
                  provider: activeExecution.runtime!.modelId,
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
            allowFallback,
            onFallback: async (originalError) => {
              await trackEvent('PLAN_BUILD_FALLBACK', {
                profileId,
                originalModel: requestedModelId,
                fallbackModel: fallbackExecution?.runtime?.modelId ?? DEFAULT_OLLAMA_FALLBACK_MODEL,
                originalError: originalError.message,
                requestedExecutionMode: executionContext.mode,
                fallbackExecutionMode: fallbackExecution?.executionContext.mode ?? null
              })
            }
          }
        )

        traceCollector.completeTrace(traceId)

        const result = buildResult.result
        const fallbackUsed = buildResult.fallbackUsed
        const finalModelId = buildResult.modelId
        const finalExecution = fallbackUsed && fallbackExecution
          ? fallbackExecution
          : requestedExecution
        const finalResourceUsage = summarizeResourceUsage({
          executionContext: finalExecution.executionContext,
          billingPolicy: finalExecution.billingPolicy
        })
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

        if (chargeRecord.status === 'pending') {
          const chargeResult = await chargeOperation({
            operation: 'plan_build',
            amountSats: chargeRecord.estimatedCostSats,
            userId,
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
              requestedModelId,
              finalModelId,
              fallbackUsed,
              requestedExecutionContext: requestedExecution.executionContext,
              finalExecutionContext: finalExecution.executionContext,
              billingPolicy,
              resourceUsage: finalResourceUsage
            }
          }) ?? chargeRecord

          if (chargeRecord.status !== 'paid') {
            await trackEvent('PLAN_BUILD_CHARGE_FAILED', {
              profileId,
              chargeId: chargeRecord.id,
              chargeStatus: chargeRecord.status,
              reasonCode: chargeRecord.reasonCode,
              reasonDetail: chargeRecord.reasonDetail,
              ...toResourceUsageTrackingPayload(finalResourceUsage)
            })

            send({
              type: 'result',
              result: {
                success: false,
                error: toChargeErrorMessage(chargeRecord.reasonCode),
                charge: summarizeOperationCharge(chargeRecord),
                resourceUsage: finalResourceUsage
              }
            })
            controller.close()
            return
          }
        } else {
          const finalSkipReason = toOperationChargeSkipReason(billingPolicy)

          chargeRecord = await recordChargeResult(chargeRecord.id, {
            model: finalModelId,
            status: 'skipped',
            finalCostUsd: actualCostUsd,
            finalCostSats: actualCostSats,
            chargedSats: 0,
            reasonCode: chargeRecord.reasonCode ?? finalSkipReason.reasonCode,
            reasonDetail: chargeRecord.reasonDetail ?? finalSkipReason.reasonDetail,
            metadata: {
              requestedModelId,
              finalModelId,
              fallbackUsed,
              requestedExecutionContext: requestedExecution.executionContext,
              finalExecutionContext: finalExecution.executionContext,
              billingPolicy,
              resourceUsage: finalResourceUsage
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
          fallbackUsed,
          eventCount: result.eventos.length,
          progressSeeded: seeded,
          tokensInput: result.tokensUsed.input,
          tokensOutput: result.tokensUsed.output,
          costUsd: actualCostUsd,
          costSats: actualCostSats,
          chargeId: chargeRecord.id,
          chargeStatus: chargeRecord.status,
          chargedSats: chargeRecord.chargedSats,
          ...toResourceUsageTrackingPayload(finalResourceUsage)
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
            charge: summarizeOperationCharge(chargeRecord),
            resourceUsage: finalResourceUsage
          }
        })
        controller.close()
      } catch (error) {
        traceCollector.failTrace(traceId, error)
        const message = toPlanBuildErrorMessage(error)
        const failedResourceUsage = requestedExecution
          ? summarizeResourceUsage({
              executionContext: requestedExecution.executionContext,
              billingPolicy: requestedExecution.billingPolicy
            })
          : null

        if (chargeRecord?.status === 'pending') {
          chargeRecord = await recordChargeResult(chargeRecord.id, {
            status: 'failed',
            reasonCode: 'unknown_error',
            reasonDetail: error instanceof Error ? error.message : 'Unknown error',
            metadata: {
              requestedModelId,
              requestedExecutionContext: requestedExecution?.executionContext ?? null,
              fallbackExecutionContext: fallbackExecution?.executionContext ?? null,
              resourceUsage: failedResourceUsage
            }
          }) ?? chargeRecord
        }

        await trackEvent('ERROR_OCCURRED', {
          code: 'PLAN_BUILD_FAILED',
          message,
          profileId,
          chargeId: chargeRecord?.id ?? null,
          ...toResourceUsageTrackingPayload(
            chargeRecord
              ? summarizeOperationCharge(chargeRecord).resourceUsage ?? failedResourceUsage
              : failedResourceUsage
          )
        })

        send({
          type: 'result',
          result: {
            success: false,
            error: message,
            charge: chargeRecord ? summarizeOperationCharge(chargeRecord) : undefined,
            resourceUsage: chargeRecord ? summarizeOperationCharge(chargeRecord).resourceUsage ?? undefined : undefined
          }
        })
        controller.close()
      }
    }
  })

  return new NextResponse(stream, { headers: sseHeaders() })
}
