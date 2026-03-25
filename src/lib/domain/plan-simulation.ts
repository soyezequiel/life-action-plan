import { simulatePlanViabilityWithProgress } from '../skills/plan-simulator'
import { traceCollector } from '../../debug/trace-collector'
import type { Perfil } from '../../shared/schemas/perfil'
import type { PlanSimulationSnapshot, PlanSimulationProgress } from '../../shared/types/lap-api'

export async function executePlanSimulationWorkflow(
  profile: Perfil,
  rows: any[],
  options: {
    planId: string
    timezone: string
    locale: string
    mode: 'automatic' | 'interactive'
    executionMode: string
    resourceOwner: string
    onProgress?: (progress: Omit<PlanSimulationProgress, 'planId'>) => Promise<void> | void
  }
): Promise<PlanSimulationSnapshot> {
  const { planId, timezone, locale, mode, executionMode, resourceOwner, onProgress } = options
  
  const traceId = traceCollector.startTrace('plan-simulator', 'lap:plan-simulator', {
    planId,
    mode,
    executionMode,
    resourceOwner
  })

  try {
    const simulation = await simulatePlanViabilityWithProgress(profile, rows, {
      timezone,
      locale,
      mode,
      onProgress
    })
    
    traceCollector.completeTrace(traceId)
    return simulation
  } catch (error) {
    traceCollector.failTrace(traceId, error)
    throw error
  }
}
