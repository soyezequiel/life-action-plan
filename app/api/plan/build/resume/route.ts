import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorMessages, encodeSseData, sseHeaders } from '../../../_shared'
import { resolveUserId } from '../../../_user-settings'

export const maxDuration = 120

const resumeRequestSchema = z.object({
  sessionId: z.string().trim().min(1),
  answers: z.record(z.string(), z.string()),
}).strict()

interface V6SessionState {
  goalText: string
  profileId: string
  provider: string | null
  resourceMode: string | null
  apiKey: string | null
  backendCredentialId: string | null
  thinkingMode: string | null
  tokensUsed: number
  iterations: number
  scratchpad: unknown[]
}

export async function POST(request: Request): Promise<Response> {
  const parsed = resumeRequestSchema.safeParse(await request.json().catch(() => null))

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

  const { sessionId, answers } = parsed.data
  const userId = resolveUserId(request)

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encodeSseData(payload))
      }

      try {
        const { getInteractiveSession, updateInteractiveSession } = await import(
          '../../../../../src/lib/db/interactive-sessions'
        )
        const { resolvePlanBuildExecution } = await import(
          '../../../../../src/lib/runtime/build-execution'
        )
        const { getDeploymentMode } = await import(
          '../../../../../src/lib/env/deployment'
        )
        const { resolveBuildModel } = await import(
          '../../../../../src/lib/providers/provider-metadata'
        )
        const { getProvider } = await import(
          '../../../../../src/lib/providers/provider-factory'
        )
        const { getProfile } = await import(
          '../../../../../src/lib/db/db-helpers'
        )
        const { parseStoredProfile, getProfileTimezone } = await import(
          '../../../../../src/lib/domain/plan-helpers'
        )
        const { PlanOrchestrator } = await import(
          '../../../../../src/lib/pipeline/v6/orchestrator'
        )

        const session = await getInteractiveSession(sessionId)
        if (!session || session.status !== 'active') {
          send({
            type: 'result',
            result: { success: false, error: 'Session not found or expired' }
          })
          return
        }

        const snapshot = session.runtimeSnapshot as unknown as { v6State?: V6SessionState }
        const v6State = snapshot.v6State
        if (!v6State) {
          send({
            type: 'result',
            result: { success: false, error: 'Session is not a v6 pipeline session' }
          })
          return
        }

        const { goalText, profileId, provider, resourceMode, apiKey, backendCredentialId, thinkingMode } = v6State

        const profileRow = await getProfile(profileId)
        if (!profileRow) {
          send({
            type: 'result',
            result: { success: false, error: apiErrorMessages.profileNotFound() }
          })
          return
        }

        const profile = parseStoredProfile(profileRow.data)
        if (!profile) {
          send({
            type: 'result',
            result: { success: false, error: apiErrorMessages.profileNotFound() }
          })
          return
        }

        const modelId = resolveBuildModel(provider ?? undefined)
        const deploymentMode = getDeploymentMode()
        const requestedMode = resourceMode === 'backend'
          ? 'backend-cloud' as const
          : resourceMode === 'user'
            ? 'user-cloud' as const
            : resourceMode === 'codex'
              ? 'codex-cloud' as const
              : backendCredentialId
                ? 'backend-cloud' as const
                : undefined

        const execution = await resolvePlanBuildExecution({
          modelId,
          deploymentMode,
          userId: userId ?? undefined,
          requestedMode,
          userSuppliedApiKey: apiKey || undefined,
          backendCredentialId
        })

        if (!execution.runtime) {
          send({
            type: 'result',
            result: { success: false, error: apiErrorMessages.localAssistantUnavailable() }
          })
          return
        }

        const runtime = getProvider(execution.runtime.modelId, {
          apiKey: execution.runtime.apiKey,
          baseURL: execution.runtime.baseURL,
          thinkingMode: (thinkingMode as 'enabled' | 'disabled' | undefined) ?? undefined
        })

        send({ type: 'v6:phase', data: { phase: 'clarify-resume', iteration: 0 } })

        const timezone = getProfileTimezone(profile)
        const participant = profile.participantes?.[0]
        const hours = participant?.calendario?.horasLibresEstimadas
        const commitments = participant?.calendario?.eventosInamovibles ?? []
        const userProfile = {
          freeHoursWeekday: hours?.diasLaborales ?? 2,
          freeHoursWeekend: hours?.diasDescanso ?? 4,
          energyLevel: 'medium' as const,
          fixedCommitments: commitments.map((e: { nombre: string }) => e.nombre),
          scheduleConstraints: [] as string[],
        }

        // Create a fresh orchestrator and run the full pipeline with answers pre-loaded
        const orchestrator = new PlanOrchestrator({}, runtime)
        const result = await orchestrator.run(goalText, {
          profile: userProfile,
          timezone,
          locale: 'es-AR',
        })

        // If the orchestrator pauses for clarification again, resume with the provided answers
        let finalResult = result
        if (finalResult.status === 'needs_input') {
          finalResult = await orchestrator.resume(answers)
        }

        if (finalResult.status === 'needs_input') {
          // Still needs more input — update session and return questions
          await updateInteractiveSession(sessionId, {
            runtimeSnapshot: {
              v6State: {
                ...v6State,
                tokensUsed: finalResult.tokensUsed,
                iterations: finalResult.iterations,
                scratchpad: finalResult.scratchpad,
              },
            } as never,
          })

          send({
            type: 'v6:needs_input',
            data: {
              sessionId,
              questions: finalResult.pendingQuestions,
            }
          })
        } else if (finalResult.status === 'completed') {
          await updateInteractiveSession(sessionId, { status: 'completed' })

          const progress = orchestrator.getProgress()
          send({
            type: 'v6:progress',
            data: { score: progress.progressScore, lastAction: progress.lastAction }
          })

          send({
            type: 'v6:complete',
            data: {
              planId: null,
              score: progress.progressScore,
              iterations: finalResult.iterations,
              package: finalResult.package,
              scratchpad: finalResult.scratchpad,
            }
          })
        } else {
          await updateInteractiveSession(sessionId, { status: 'error' })

          send({
            type: 'result',
            result: {
              success: false,
              error: 'V6 pipeline failed during resume',
              scratchpad: finalResult.scratchpad,
            }
          })
        }
      } catch (cause: unknown) {
        const error = cause instanceof Error ? cause : new Error(String(cause))

        send({
          type: 'result',
          result: {
            success: false,
            error: error.message,
          }
        })
      } finally {
        controller.close()
      }
    }
  })

  return new NextResponse(stream, { headers: sseHeaders() })
}
