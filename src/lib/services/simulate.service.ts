import { resolveBackendServiceExecution } from '../runtime/backend-service-execution'
import { executeWithBilling } from '../billing/operation-lifecycle'
import {
  getPlan,
  getProfile,
  getProgressByPlan,
  trackCost,
  trackEvent,
  updatePlanManifest
} from '../db/db-helpers'
import {
  createSimulationManifest,
  getProfileTimezone,
  parseStoredProfile
} from '../domain/plan-helpers'
import { summarizeResourceUsage } from '../runtime/resource-usage-summary'
import { toResourceUsageTrackingPayload } from '../runtime/resource-usage-tracking'
import { executePlanSimulationWorkflow } from '../domain/plan-simulation'
import type { ResourceUsageSummary } from '../../shared/types/resource-usage'

import type { PlanSimulateRequestData, SimulateResult, SimulateServiceOptions } from './types'
import { apiErrorMessages } from '../../shared/api-utils'
import { planSimulateRequestSchema } from '../../shared/api-schemas'

const SIMULATION_PROVIDER_ID = 'lap'
const SIMULATION_MODEL_ID = 'lap:plan-simulator'

export async function processPlanSimulate(
  rawData: PlanSimulateRequestData,
  options: SimulateServiceOptions = {}
): Promise<SimulateResult> {
  const data = planSimulateRequestSchema.parse(rawData)
  const { planId, mode } = data
  const userId = options.userId

  let resourceUsage: ResourceUsageSummary | null = null

  try {
    const planRow = await getPlan(planId)
    if (!planRow) {
      throw new Error(apiErrorMessages.planNotFound())
    }

    const profileRow = await getProfile(planRow.profileId)
    const profile = profileRow ? parseStoredProfile(profileRow.data) : null
    if (!profile) {
      throw new Error(apiErrorMessages.profileNotFound())
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
    const timezone = getProfileTimezone(profile)

    const { result: simulation, charge: finalChargeRecord } = await executeWithBilling({
      profileId: planRow.profileId,
      planId,
      operation: 'plan_simulate',
      modelId: SIMULATION_MODEL_ID,
      userId: userId ?? undefined,
      billingPolicy: execution.billingPolicy,
      resourceUsage,
      description: `LAP plan simulate ${planId}`,
      onStartEvent: 'SIMULATION_STARTED',
      onFailureEvent: 'SIMULATION_CHARGE_FAILED',
      extraEventData: {
        mode,
        ...toResourceUsageTrackingPayload(resourceUsage)
      }
    }, async () => {
      const rows = await getProgressByPlan(planId)
      const simulation = await executePlanSimulationWorkflow(profile, rows, {
        planId,
        timezone,
        locale: 'es-AR',
        mode,
        executionMode: execution.executionContext.mode,
        resourceOwner: execution.executionContext.resourceOwner,
        onProgress: async (progress) => {
          if (options.onProgress) {
            options.onProgress({
              planId,
              ...progress
            })
          }
        }
      })

      return {
        data: simulation,
        billingMetadata: {
          mode
        }
      }
    })

    await updatePlanManifest(
      planId,
      createSimulationManifest(planRow.manifest, simulation, timezone, finalChargeRecord)
    )
    await trackCost(planId, 'plan_simulate', SIMULATION_MODEL_ID, 0, 0, finalChargeRecord.chargeId)
    
    await trackEvent('SIMULATION_RAN', {
      planId,
      mode,
      overallStatus: simulation.summary.overallStatus,
      pass: simulation.summary.pass,
      warn: simulation.summary.warn,
      fail: simulation.summary.fail,
      missing: simulation.summary.missing,
      chargeId: finalChargeRecord.chargeId,
      chargeStatus: finalChargeRecord.status,
      chargedSats: finalChargeRecord.chargedSats,
      ...toResourceUsageTrackingPayload(resourceUsage)
    })

    return {
      simulation,
      charge: finalChargeRecord,
      resourceUsage
    }

  } catch (error) {
    const finalError = error instanceof Error ? error : new Error(String(error))
    const charge = (finalError as any).charge

    await trackEvent('ERROR_OCCURRED', {
      code: 'PLAN_SIMULATION_FAILED',
      message: finalError.message,
      planId,
      chargeId: charge?.chargeId ?? null,
      ...toResourceUsageTrackingPayload(charge?.resourceUsage ?? resourceUsage)
    })

    throw finalError
  }
}
