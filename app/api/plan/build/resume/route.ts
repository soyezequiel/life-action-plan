import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorMessages, encodeSseData, sseHeaders } from '../../../_shared'
import { resolveUserId } from '../../../_user-settings'
import * as terminalFailure from '../_terminal-failure'

export const maxDuration = 120

const resumeRequestSchema = z.object({
  sessionId: z.string().trim().min(1),
  answers: z.record(z.string(), z.string()),
}).strict()

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
        const { createBuildAgentRuntime } = await import(
          '../../../../../src/lib/runtime/build-agent-runtime'
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
        const {
          createV6RuntimeSnapshot,
          parseV6RuntimeSnapshot,
        } = await import('../../../../../src/lib/pipeline/v6/session-snapshot')

        const session = await getInteractiveSession(sessionId)
        if (!session || session.status !== 'active') {
          send({
            type: 'result',
            result: { success: false, error: 'Session not found or expired' }
          })
          return
        }

        let v6Snapshot: ReturnType<typeof parseV6RuntimeSnapshot>
        try {
          v6Snapshot = parseV6RuntimeSnapshot(session.runtimeSnapshot)
        } catch {
          send({
            type: 'result',
            result: { success: false, error: 'Session is not a v6 pipeline session' }
          })
          return
        }

        const { goalText, profileId, provider, resourceMode, apiKey, backendCredentialId, thinkingMode } = v6Snapshot.request

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
          const { toExecutionBlockErrorMessage } = await import('../../../_plan')
          send({
            type: 'result',
            result: {
              success: false,
              error: toExecutionBlockErrorMessage(execution.executionContext.blockReasonCode ?? null)
            }
          })
          return
        }

        const runtime = createBuildAgentRuntime(execution.runtime, {
          thinkingMode: thinkingMode ?? undefined
        })

        send({ type: 'v6:phase', data: { phase: 'clarify-resume', iteration: 0 } })

        const timezone = getProfileTimezone(profile)
        const orchestrator = PlanOrchestrator.restore(v6Snapshot.orchestrator, runtime)
        const finalResult = await orchestrator.resume(answers)

        if (finalResult.status === 'needs_input') {
          await updateInteractiveSession(sessionId, {
            runtimeSnapshot: createV6RuntimeSnapshot({
              request: v6Snapshot.request,
              orchestrator: orchestrator.getSnapshot(),
            }),
          })

          send({
            type: 'v6:needs_input',
            data: {
              sessionId,
              questions: finalResult.pendingQuestions,
            }
          })
        } else if (finalResult.status === 'completed' && finalResult.publicationState === 'ready') {
          if (!finalResult.package) {
            await updateInteractiveSession(sessionId, {
              status: 'error',
              runtimeSnapshot: createV6RuntimeSnapshot({
                request: v6Snapshot.request,
                orchestrator: orchestrator.getSnapshot(),
              }),
            })

            const progress = orchestrator.getProgress()
            send({
              type: 'v6:progress',
              data: { score: progress.progressScore, lastAction: progress.lastAction }
            })
            terminalFailure.sendTerminalFailure(send, {
              ...finalResult,
              publicationState: finalResult.publicationState ?? 'failed',
              failureCode: finalResult.failureCode ?? 'failed_for_quality_review',
            })
            return
          }

          const { persistPlanFromV5Package } = await import(
            '../../../../../src/lib/domain/plan-v5-activation'
          )
          const reasoningTrace = finalResult.package.reasoningTrace ?? finalResult.scratchpad
          const persistedPlan = await persistPlanFromV5Package({
            profileId,
            package: finalResult.package,
            goalId: finalResult.package.plan.goalIds[0] || 'generated-goal',
            goalText,
            timezone,
            modelId: execution.runtime.modelId,
            reasoningTrace,
          })

          await updateInteractiveSession(sessionId, {
            status: 'completed',
            runtimeSnapshot: createV6RuntimeSnapshot({
              request: v6Snapshot.request,
              orchestrator: orchestrator.getSnapshot(),
            }),
          })

          const progress = orchestrator.getProgress()
          send({
            type: 'v6:progress',
            data: { score: progress.progressScore, lastAction: progress.lastAction }
          })

          if (finalResult.degraded) {
            const fallbackAgents = finalResult.agentOutcomes
              .filter((outcome) => outcome.source === 'fallback')
              .map((outcome) => `${outcome.agent}: ${outcome.errorMessage ?? 'unknown'}`)
              .join('; ')

            send({
              type: 'v6:degraded',
              data: {
                message: `El plan se genero con datos parcialmente sinteticos porque ${finalResult.agentOutcomes.filter((outcome) => outcome.source === 'fallback').length} agente(s) no pudieron conectarse al LLM.`,
                failedAgents: fallbackAgents,
                agentOutcomes: finalResult.agentOutcomes,
              }
            })
          }

          send({
            type: 'v6:complete',
            data: {
              planId: persistedPlan.planId,
              score: finalResult.package.qualityScore,
              iterations: finalResult.iterations,
              package: finalResult.package,
              reasoningTrace,
              scratchpad: finalResult.scratchpad,
              degraded: finalResult.degraded,
              agentOutcomes: finalResult.agentOutcomes,
            }
          })
        } else {
          await updateInteractiveSession(sessionId, {
            status: 'error',
            runtimeSnapshot: createV6RuntimeSnapshot({
              request: v6Snapshot.request,
              orchestrator: orchestrator.getSnapshot(),
            }),
          })

          const progress = orchestrator.getProgress()
          send({
            type: 'v6:progress',
            data: { score: progress.progressScore, lastAction: progress.lastAction }
          })
          terminalFailure.sendTerminalFailure(send, {
            ...finalResult,
            publicationState: finalResult.publicationState ?? 'failed',
            failureCode: finalResult.failureCode ?? (finalResult.publicationState === 'blocked' ? 'requires_regeneration' : 'failed_for_quality_review'),
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
