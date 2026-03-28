import { NextResponse } from 'next/server'
import { z } from 'zod'

import { apiErrorMessages, encodeSseData, sseHeaders } from '../../_shared'
import { planBuildRequestSchema } from '../../_schemas'
import { resolveUserId } from '../../_user-settings'

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
        const { getProvider } = await import(
          '../../../../src/lib/providers/provider-factory'
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

        const runtime = getProvider(execution.runtime.modelId, {
          apiKey: execution.runtime.apiKey,
          baseURL: execution.runtime.baseURL,
          thinkingMode,
        })

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

        const orchestrator = new PlanOrchestrator({}, runtime)
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
            userId: userId ?? null,
            expiresAt,
          })

          send({
            type: 'v6:needs_input',
            data: {
              sessionId,
              questions: result.pendingQuestions,
            },
          })
        } else if (result.status === 'completed') {
          if (!result.package) {
            send({
              type: 'result',
              result: {
                success: false,
                error: 'No pudimos guardar el plan en este momento.',
                scratchpad: result.scratchpad,
              },
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

          send({
            type: 'v6:complete',
            data: {
              planId: persistedPlan.planId,
              score: result.package.qualityScore,
              iterations: result.iterations,
              package: result.package,
              reasoningTrace,
              scratchpad: result.scratchpad,
            },
          })
        } else {
          send({
            type: 'result',
            result: {
              success: false,
              error: 'V6 pipeline failed',
              scratchpad: result.scratchpad,
            },
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
