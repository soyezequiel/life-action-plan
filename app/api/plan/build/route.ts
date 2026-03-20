import { NextResponse } from 'next/server'
import type { PlanBuildProgress } from '../../../../src/shared/types/lap-api'
import { decryptApiKey } from '../../../../src/lib/auth/api-key-auth'
import { createInstrumentedRuntime, buildWithOllamaFallback, generatePlan, getProvider, traceCollector } from '../../_domain'
import { createPlan, seedProgressFromEvents, trackCost, trackEvent, updatePlanManifest, getProfile, getUserSetting } from '../../_db'
import { apiErrorMessages, encodeSseData, sseHeaders } from '../../_shared'
import { planBuildRequestSchema } from '../../_schemas'
import { buildPlanManifest, createUniquePlanSlug, getProfileTimezone, parseStoredProfile, toPlanBuildErrorMessage } from '../../_plan'
import { API_KEY_SETTING_KEY, DEFAULT_USER_ID } from '../../_user-settings'

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
  const modelId = provider || 'openai:gpt-4o-mini'

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encodeSseData(payload))
      }

      let traceId: string | null = null
      let streamedCharCount = 0

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

        await trackEvent('PLAN_BUILD_STARTED', { profileId, modelId })
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

        traceId = traceCollector.startTrace('plan-builder', modelId, { profileId, transport: 'api' })
        const encryptedStoredApiKey = await getUserSetting(DEFAULT_USER_ID, API_KEY_SETTING_KEY)
        const storedApiKey = encryptedStoredApiKey ? decryptApiKey(encryptedStoredApiKey) : ''

        const buildResult = await buildWithOllamaFallback(
          modelId,
          async (nextModelId) => {
            const resolvedApiKey = nextModelId.startsWith('ollama:')
              ? ''
              : apiKey.trim() || storedApiKey || process.env.OPENAI_API_KEY?.trim() || ''

            if (!nextModelId.startsWith('ollama:') && !resolvedApiKey) {
              throw new Error('OpenAI API key not configured')
            }

            const runtime = getProvider(nextModelId, {
              apiKey: resolvedApiKey,
              baseURL: nextModelId.startsWith('ollama:')
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
          async (originalError) => {
            await trackEvent('PLAN_BUILD_FALLBACK', {
              profileId,
              originalModel: modelId,
              originalError: originalError.message
            })
          }
        )

        traceCollector.completeTrace(traceId)

        const result = buildResult.result
        const fallbackUsed = buildResult.fallbackUsed
        const finalModelId = buildResult.modelId
        const timezone = getProfileTimezone(profile)
        const planSlug = await createUniquePlanSlug(result.nombre)
        const baseManifest = buildPlanManifest({
          nombre: result.nombre,
          fallbackUsed,
          modelId: finalModelId,
          tokensInput: result.tokensUsed.input,
          tokensOutput: result.tokensUsed.output,
          costUsd: 0,
          costSats: 0
        })

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

        const planId = await createPlan(profileId, result.nombre, planSlug, baseManifest)
        const costEntry = await trackCost(
          planId,
          'plan_build',
          finalModelId,
          result.tokensUsed.input,
          result.tokensUsed.output
        )

        await updatePlanManifest(planId, buildPlanManifest({
          nombre: result.nombre,
          fallbackUsed,
          modelId: finalModelId,
          tokensInput: result.tokensUsed.input,
          tokensOutput: result.tokensUsed.output,
          costUsd: costEntry.costUsd,
          costSats: costEntry.costSats
        }))

        const seeded = await seedProgressFromEvents(planId, result.eventos, timezone)
        await trackEvent('PLAN_BUILT', {
          planId,
          modelId: finalModelId,
          fallbackUsed,
          eventCount: result.eventos.length,
          progressSeeded: seeded,
          tokensInput: result.tokensUsed.input,
          tokensOutput: result.tokensUsed.output,
          costUsd: costEntry.costUsd,
          costSats: costEntry.costSats
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
            fallbackUsed
          }
        })
        controller.close()
      } catch (error) {
        traceCollector.failTrace(traceId, error)
        const message = toPlanBuildErrorMessage(error)
        send({
          type: 'result',
          result: {
            success: false,
            error: message
          }
        })
        controller.close()
      }
    }
  })

  return new NextResponse(stream, { headers: sseHeaders() })
}
