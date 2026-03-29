import { NextResponse } from 'next/server'
import { z } from 'zod'

import { apiErrorMessages, encodeSseData, sseHeaders } from '../../_shared'
import { planBuildRequestSchema } from '../../_schemas'
import { resolveUserId } from '../../_user-settings'
import * as terminalFailure from './_terminal-failure'

export const maxDuration = 120

const v6RequestSchema = planBuildRequestSchema.extend({
  goalText: z.string().trim().min(1).max(2000).optional(),
}).strict()

export async function POST(request: Request): Promise<Response> {
  const parsed = v6RequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encodeSseData({
          type: 'result',
          result: {
            success: false,
            error: apiErrorMessages.invalidRequest(),
          },
        }))
        controller.close()
      },
    })

    return new NextResponse(stream, { headers: sseHeaders() })
  }

  return handleV6Build(parsed.data, resolveUserId(request))
}

function handleV6Build(
  data: z.infer<typeof v6RequestSchema>,
  userId: string | null,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encodeSseData(payload))
      }

      try {
        const { resolvePlanBuildExecution } = await import(
          '../../../../src/lib/runtime/build-execution'
        )
        const { getDeploymentMode } = await import(
          '../../../../src/lib/env/deployment'
        )
        const { resolveBuildModel } = await import(
          '../../../../src/lib/providers/provider-metadata'
        )
        const { createBuildAgentRuntime } = await import(
          '../../../../src/lib/runtime/build-agent-runtime'
        )
        const { getProfile } = await import(
          '../../../../src/lib/db/db-helpers'
        )
        const { parseStoredProfile, getProfileTimezone } = await import(
          '../../../../src/lib/domain/plan-helpers'
        )
        const { PlanOrchestrator } = await import(
          '../../../../src/lib/pipeline/v6/orchestrator'
        )
        const { createV6RuntimeSnapshot } = await import(
          '../../../../src/lib/pipeline/v6/session-snapshot'
        )
        const { createInteractiveSession } = await import(
          '../../../../src/lib/db/interactive-sessions'
        )
        const { DateTime } = await import('luxon')

        const { profileId, apiKey, provider, backendCredentialId, resourceMode, thinkingMode, goalText } = data

        if (!goalText) {
          send({
            type: 'result',
            result: { success: false, error: 'goalText is required for v6 pipeline' },
          })
          return
        }

        const profileRow = await getProfile(profileId)
        if (!profileRow) {
          send({
            type: 'result',
            result: { success: false, error: apiErrorMessages.profileNotFound() },
          })
          return
        }

        const profile = parseStoredProfile(profileRow.data)
        if (!profile) {
          send({
            type: 'result',
            result: { success: false, error: apiErrorMessages.profileNotFound() },
          })
          return
        }

        const modelId = resolveBuildModel(provider)
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
          backendCredentialId,
        })

        if (!execution.runtime) {
          const { toExecutionBlockErrorMessage } = await import('../../_plan')
          send({
            type: 'result',
            result: {
              success: false,
              error: toExecutionBlockErrorMessage(execution.executionContext.blockReasonCode ?? null),
            },
          })
          return
        }

        const runtime = createBuildAgentRuntime(execution.runtime, {
          thinkingMode,
        })

        try {
          const preflight = await runtime.chat([{
            role: 'user',
            content: 'Respond with exactly: OK',
          }])

          if (!preflight.content.includes('OK')) {
            send({
              type: 'result',
              result: {
                success: false,
                error: `El modelo respondio de forma inesperada. Respuesta: "${preflight.content.slice(0, 100)}". Verifica que ${execution.runtime.modelId} este disponible.`,
              },
            })
            return
          }
        } catch (preflightError) {
          const message = preflightError instanceof Error ? preflightError.message : String(preflightError)
          send({
            type: 'result',
            result: {
              success: false,
              error: `No se pudo conectar con el modelo (${execution.runtime.modelId}). Error: ${message}. ${execution.runtime.authMode === 'codex-oauth'
                ? 'Verifica que tu sesion de Codex este activa: ejecuta "codex" en la terminal para re-autenticar.'
                : 'Verifica tu API key o que Ollama este corriendo.'}`,
            },
          })
          return
        }

        send({ type: 'v6:phase', data: { phase: 'interpret', iteration: 0 } })

        const { buildSchedulingContextFromProfile } = await import(
          '../../../../src/lib/pipeline/shared/scheduling-context'
        )

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

        const schedulingCtx = buildSchedulingContextFromProfile(profile)

        const orchestrator = new PlanOrchestrator({}, runtime, execution.runtime.modelId)
        const result = await orchestrator.run(goalText, {
          profile: userProfile,
          timezone,
          locale: 'es-AR',
          availability: schedulingCtx.availability,
          blocked: schedulingCtx.blocked,
        })

        if (result.status === 'needs_input') {
          const sessionId = crypto.randomUUID()
          const expiresAt = DateTime.utc().plus({ minutes: 30 }).toISO()
            ?? DateTime.utc().plus({ minutes: 30 }).toFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")

          // userId from resolveUserId may not exist in the users table (e.g. CLI requests).
          // Pass null to avoid FK violation on interactive_sessions.user_id.
          let sessionUserId: string | null = null
          if (userId) {
            try {
              const { getUserById } = await import('../../../../src/lib/db/db-helpers')
              const userRow = await getUserById(userId)
              sessionUserId = userRow ? userId : null
            } catch {
              sessionUserId = null
            }
          }

          await createInteractiveSession({
            id: sessionId,
            status: 'active',
            runtimeSnapshot: createV6RuntimeSnapshot({
              request: {
                goalText,
                profileId,
                provider: provider ?? null,
                resourceMode: resourceMode ?? null,
                apiKey: apiKey || null,
                backendCredentialId: backendCredentialId ?? null,
                thinkingMode: thinkingMode ?? null,
              },
              orchestrator: orchestrator.getSnapshot(),
            }),
            userId: sessionUserId,
            expiresAt,
          })

          send({
            type: 'v6:needs_input',
            data: {
              sessionId,
              questions: result.pendingQuestions,
            },
          })
        } else if (result.status === 'completed' && result.publicationState === 'ready') {
          if (!result.package) {
            const progress = orchestrator.getProgress()
            send({
              type: 'v6:progress',
              data: { score: progress.progressScore, lastAction: progress.lastAction },
            })
            terminalFailure.sendTerminalFailure(send, {
              ...result,
              publicationState: result.publicationState ?? 'failed',
              failureCode: result.failureCode ?? 'failed_for_quality_review',
            })
            return
          }

          const { persistPlanFromV5Package } = await import(
            '../../../../src/lib/domain/plan-v5-activation'
          )
          const reasoningTrace = result.package.reasoningTrace ?? result.scratchpad
          const persistedPlan = await persistPlanFromV5Package({
            profileId,
            package: result.package,
            goalId: result.package.plan.goalIds[0] || 'generated-goal',
            goalText,
            timezone,
            modelId: execution.runtime.modelId,
            reasoningTrace,
          })

          const progress = orchestrator.getProgress()
          send({
            type: 'v6:progress',
            data: { score: progress.progressScore, lastAction: progress.lastAction },
          })

          if (result.degraded) {
            const fallbackAgents = result.agentOutcomes
              .filter((outcome) => outcome.source === 'fallback')
              .map((outcome) => `${outcome.agent}: ${outcome.errorMessage ?? 'unknown'}`)
              .join('; ')

            send({
              type: 'v6:degraded',
              data: {
                message: `El plan se genero con datos parcialmente sinteticos porque ${result.agentOutcomes.filter((outcome) => outcome.source === 'fallback').length} agente(s) no pudieron conectarse al LLM.`,
                failedAgents: fallbackAgents,
                agentOutcomes: result.agentOutcomes,
              },
            })
          }

          send({
            type: 'v6:complete',
            data: {
              planId: persistedPlan.planId,
              score: result.package.qualityScore,
              iterations: result.iterations,
              package: result.package,
              reasoningTrace,
              scratchpad: result.scratchpad,
              degraded: result.degraded,
              agentOutcomes: result.agentOutcomes,
            },
          })
        } else {
          const progress = orchestrator.getProgress()
          send({
            type: 'v6:progress',
            data: { score: progress.progressScore, lastAction: progress.lastAction },
          })
          terminalFailure.sendTerminalFailure(send, {
            ...result,
            publicationState: result.publicationState ?? 'failed',
            failureCode: result.failureCode ?? (result.publicationState === 'blocked' ? 'requires_regeneration' : 'failed_for_quality_review'),
          })
        }
      } catch (cause: unknown) {
        const { toPlanBuildErrorMessage } = await import('../../_plan')
        const error = cause instanceof Error ? cause : new Error(String(cause))
        send({
          type: 'result',
          result: {
            success: false,
            error: toPlanBuildErrorMessage(error),
          },
        })
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, { headers: sseHeaders() })
}
