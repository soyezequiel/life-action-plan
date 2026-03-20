import { NextResponse } from 'next/server'
import type { PlanSimulationProgress } from '../../../../src/shared/types/lap-api'
import { simulatePlanViabilityWithProgress, traceCollector } from '../../_domain'
import { getPlan, getProfile, getProgressByPlan, trackEvent, updatePlanManifest } from '../../_db'
import { apiErrorMessages, encodeSseData, sseHeaders } from '../../_shared'
import { planSimulateRequestSchema } from '../../_schemas'
import { createSimulationManifest, getProfileTimezone, parseStoredProfile, toPlanBuildErrorMessage } from '../../_plan'

export const maxDuration = 60

export async function POST(request: Request): Promise<Response> {
  const parsed = planSimulateRequestSchema.safeParse(await request.json().catch(() => null))

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

  const { planId, mode } = parsed.data

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encodeSseData(payload))
      }

      let traceId: string | null = null

      try {
        const planRow = await getPlan(planId)
        if (!planRow) {
          send({
            type: 'result',
            result: {
              success: false,
              error: apiErrorMessages.planNotFound()
            }
          })
          controller.close()
          return
        }

        const profileRow = await getProfile(planRow.profileId)
        const profile = profileRow ? parseStoredProfile(profileRow.data) : null
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

        const timezone = getProfileTimezone(profile)
        const rows = await getProgressByPlan(planId)

        traceId = traceCollector.startTrace('plan-simulator', 'local', { planId, mode })

        const simulation = await simulatePlanViabilityWithProgress(profile, rows, {
          timezone,
          locale: 'es-AR',
          mode,
          onProgress: async (progress: Omit<PlanSimulationProgress, 'planId'>) => {
            const simulationProgress: PlanSimulationProgress = {
              planId,
              ...progress
            }
            send({
              type: 'progress',
              progress: simulationProgress
            })
          }
        })

        traceCollector.completeTrace(traceId)

        await updatePlanManifest(planId, createSimulationManifest(planRow.manifest, simulation, timezone))
        await trackEvent('SIMULATION_RAN', {
          planId,
          mode,
          overallStatus: simulation.summary.overallStatus,
          pass: simulation.summary.pass,
          warn: simulation.summary.warn,
          fail: simulation.summary.fail,
          missing: simulation.summary.missing
        })

        send({
          type: 'result',
          result: {
            success: true,
            simulation
          }
        })
        controller.close()
      } catch (error) {
        traceCollector.failTrace(traceId, error)
        const message = error instanceof Error ? error.message : toPlanBuildErrorMessage(error)
        await trackEvent('ERROR_OCCURRED', { code: 'PLAN_SIMULATION_FAILED', message, planId })
        send({
          type: 'result',
          result: {
            success: false,
            error: toPlanBuildErrorMessage(error)
          }
        })
        controller.close()
      }
    }
  })

  return new NextResponse(stream, { headers: sseHeaders() })
}
