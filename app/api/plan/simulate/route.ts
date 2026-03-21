import { NextResponse } from 'next/server'
import { resolveBackendServiceExecution } from '../../../../src/lib/runtime/backend-service-execution'
import { toOperationChargeSkipReason } from '../../../../src/lib/runtime/build-execution'
import type { PlanSimulationProgress } from '../../../../src/shared/types/lap-api'
import type { ResourceUsageSummary } from '../../../../src/shared/types/resource-usage'
import {
  canChargeOperation,
  chargeOperation,
  recordChargeResult,
  simulatePlanViabilityWithProgress,
  summarizeOperationCharge,
  traceCollector
} from '../../_domain'
import {
  createOperationCharge,
  getPlan,
  getProfile,
  getProgressByPlan,
  trackCost,
  trackEvent,
  updatePlanManifest
} from '../../_db'
import { apiErrorMessages, encodeSseData, sseHeaders } from '../../_shared'
import { planSimulateRequestSchema } from '../../_schemas'
import {
  createSimulationManifest,
  getProfileTimezone,
  parseStoredProfile,
  toChargeErrorMessage,
  toPlanBuildErrorMessage
} from '../../_plan'
import { summarizeResourceUsage } from '../../../../src/lib/runtime/resource-usage-summary'
import { toResourceUsageTrackingPayload } from '../../../../src/lib/runtime/resource-usage-tracking'

const SIMULATION_PROVIDER_ID = 'lap'
const SIMULATION_MODEL_ID = 'lap:plan-simulator'

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
      let chargeRecord: Awaited<ReturnType<typeof createOperationCharge>> | null = null
      let resourceUsage: ResourceUsageSummary | null = null

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

        const execution = resolveBackendServiceExecution({
          operation: 'plan_simulate',
          providerId: SIMULATION_PROVIDER_ID,
          modelId: SIMULATION_MODEL_ID,
          resolutionSource: 'requested-mode'
        })
        resourceUsage = summarizeResourceUsage({
          executionContext: execution.executionContext,
          billingPolicy: execution.billingPolicy
        })
        const prechargeDecision = execution.billingPolicy.chargeable
          ? await canChargeOperation({
              operation: 'plan_simulate',
              model: SIMULATION_MODEL_ID,
              estimatedCostUsd: execution.billingPolicy.estimatedCostUsd,
              estimatedCostSats: execution.billingPolicy.estimatedCostSats,
              chargeable: true
            })
          : null
        const skipReason = execution.billingPolicy.chargeable ? null : toOperationChargeSkipReason(execution.billingPolicy)
        const initialChargeStatus = execution.billingPolicy.chargeable
          ? prechargeDecision?.decision === 'chargeable'
            ? 'pending'
            : prechargeDecision?.decision ?? 'skipped'
          : 'skipped'
        const initialReasonCode = execution.billingPolicy.chargeable
          ? prechargeDecision?.decision === 'chargeable'
            ? null
            : prechargeDecision?.reasonCode ?? null
          : skipReason?.reasonCode ?? null
        const initialReasonDetail = execution.billingPolicy.chargeable
          ? prechargeDecision?.decision === 'chargeable'
            ? null
            : prechargeDecision?.reasonDetail ?? null
          : skipReason?.reasonDetail ?? null

        chargeRecord = await createOperationCharge({
          profileId: planRow.profileId,
          planId,
          operation: 'plan_simulate',
          model: SIMULATION_MODEL_ID,
          status: initialChargeStatus,
          estimatedCostUsd: execution.billingPolicy.estimatedCostUsd,
          estimatedCostSats: execution.billingPolicy.estimatedCostSats,
          reasonCode: initialReasonCode,
          reasonDetail: initialReasonDetail,
          metadata: {
            requestedModelId: SIMULATION_MODEL_ID,
            executionContext: execution.executionContext,
            billingPolicy: execution.billingPolicy,
            resourceUsage,
            mode
          }
        })

        await trackEvent('SIMULATION_STARTED', {
          planId,
          profileId: planRow.profileId,
          mode,
          chargeId: chargeRecord.id,
          chargeDecision: execution.billingPolicy.chargeable
            ? prechargeDecision?.decision ?? initialChargeStatus
            : 'skipped',
          ...toResourceUsageTrackingPayload(resourceUsage)
        })

        if (prechargeDecision?.decision === 'rejected') {
          await trackEvent('SIMULATION_CHARGE_BLOCKED', {
            planId,
            chargeId: chargeRecord.id,
            reasonCode: prechargeDecision.reasonCode,
            reasonDetail: prechargeDecision.reasonDetail,
            ...toResourceUsageTrackingPayload(resourceUsage)
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

        const timezone = getProfileTimezone(profile)
        const rows = await getProgressByPlan(planId)

        traceId = traceCollector.startTrace('plan-simulator', SIMULATION_MODEL_ID, {
          planId,
          mode,
          executionMode: execution.executionContext.mode,
          resourceOwner: execution.executionContext.resourceOwner
        })

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

        if (!chargeRecord) {
          throw new Error('CHARGE_RECORD_MISSING')
        }

        if (chargeRecord.status === 'pending') {
          const chargeResult = await chargeOperation({
            operation: 'plan_simulate',
            amountSats: chargeRecord.estimatedCostSats,
            description: `LAP plan simulate ${planId}`
          })

          chargeRecord = await recordChargeResult(chargeRecord.id, {
            model: SIMULATION_MODEL_ID,
            paymentProvider: chargeResult.paymentProvider,
            status: chargeResult.status,
            finalCostUsd: 0,
            finalCostSats: 0,
            chargedSats: chargeResult.chargedSats,
            reasonCode: chargeResult.reasonCode,
            reasonDetail: chargeResult.reasonDetail,
            lightningInvoice: chargeResult.lightningInvoice,
            lightningPaymentHash: chargeResult.lightningPaymentHash,
            lightningPreimage: chargeResult.lightningPreimage,
            providerReference: chargeResult.providerReference,
            metadata: {
              requestedModelId: SIMULATION_MODEL_ID,
              executionContext: execution.executionContext,
              billingPolicy: execution.billingPolicy,
              resourceUsage,
              mode
            }
          }) ?? chargeRecord

          if (chargeRecord.status !== 'paid') {
            await trackEvent('SIMULATION_CHARGE_FAILED', {
              planId,
              chargeId: chargeRecord.id,
              chargeStatus: chargeRecord.status,
              reasonCode: chargeRecord.reasonCode,
              reasonDetail: chargeRecord.reasonDetail,
              ...toResourceUsageTrackingPayload(resourceUsage)
            })

            send({
              type: 'result',
              result: {
                success: false,
                error: toChargeErrorMessage(chargeRecord.reasonCode),
                charge: summarizeOperationCharge(chargeRecord),
                resourceUsage
              }
            })
            controller.close()
            return
          }
        } else {
          const finalSkipReason = toOperationChargeSkipReason(execution.billingPolicy)

          chargeRecord = await recordChargeResult(chargeRecord.id, {
            model: SIMULATION_MODEL_ID,
            status: 'skipped',
            finalCostUsd: 0,
            finalCostSats: 0,
            chargedSats: 0,
            reasonCode: chargeRecord.reasonCode ?? finalSkipReason.reasonCode,
            reasonDetail: chargeRecord.reasonDetail ?? finalSkipReason.reasonDetail,
            metadata: {
              requestedModelId: SIMULATION_MODEL_ID,
              executionContext: execution.executionContext,
              billingPolicy: execution.billingPolicy,
              resourceUsage,
              mode
            }
          }) ?? chargeRecord
        }

        const chargeSummary = summarizeOperationCharge(chargeRecord)

        await updatePlanManifest(
          planId,
          createSimulationManifest(planRow.manifest, simulation, timezone, chargeSummary)
        )
        await trackCost(planId, 'plan_simulate', SIMULATION_MODEL_ID, 0, 0, chargeRecord.id)
        await trackEvent('SIMULATION_RAN', {
          planId,
          mode,
          overallStatus: simulation.summary.overallStatus,
          pass: simulation.summary.pass,
          warn: simulation.summary.warn,
          fail: simulation.summary.fail,
          missing: simulation.summary.missing,
          chargeId: chargeRecord.id,
          chargeStatus: chargeRecord.status,
          chargedSats: chargeRecord.chargedSats,
          ...toResourceUsageTrackingPayload(resourceUsage)
        })

        send({
          type: 'result',
          result: {
            success: true,
            simulation,
            charge: chargeSummary,
            resourceUsage
          }
        })
        controller.close()
      } catch (error) {
        traceCollector.failTrace(traceId, error)
        const message = error instanceof Error ? error.message : toPlanBuildErrorMessage(error)

        if (chargeRecord?.status === 'pending') {
          chargeRecord = await recordChargeResult(chargeRecord.id, {
            status: 'failed',
            reasonCode: 'unknown_error',
            reasonDetail: message,
            metadata: {
              requestedModelId: SIMULATION_MODEL_ID,
              resourceUsage,
              mode
            }
          }) ?? chargeRecord
        }

        await trackEvent('ERROR_OCCURRED', {
          code: 'PLAN_SIMULATION_FAILED',
          message,
          planId,
          chargeId: chargeRecord?.id ?? null,
          ...toResourceUsageTrackingPayload(
            chargeRecord
              ? summarizeOperationCharge(chargeRecord).resourceUsage ?? resourceUsage
              : resourceUsage
          )
        })
        send({
          type: 'result',
          result: {
            success: false,
            error: toPlanBuildErrorMessage(error),
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
