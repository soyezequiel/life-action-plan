import { FLOW_STEPS, FLOW_PHASES } from './flow-definition'
import { FLOW_PHASES_V2 } from './flow-definition'

export function logPhase(phaseId: string) {
  const phasesV1 = typeof FLOW_PHASES !== 'undefined' ? FLOW_PHASES : []
  const phasesV2 = typeof FLOW_PHASES_V2 !== 'undefined' ? FLOW_PHASES_V2 : []
  const allPhases = [...phasesV1, ...phasesV2]
  const phase = allPhases.find(p => p.id === phaseId)
  if (phase) {
    console.error(`\n[LAP Runner] === PHASE: ${phase.name} ===`)
  } else {
    console.error(`\n[LAP Runner] === PHASE: ${phaseId} ===`)
  }
}

export function logStep(stepId: string) {
  const steps = typeof FLOW_STEPS !== 'undefined' ? FLOW_STEPS : []
  const step = steps.find(s => s.id === stepId)
  if (step) {
    console.error(`[LAP Runner] -> ${step.name}: ${step.description}`)
  } else {
    console.error(`[LAP Runner] -> Step ${stepId}`)
  }
}

export function logRepairAttempt(attempt: number, maxAttempts: number, findingsCount: number) {
  console.error(`[LAP Runner] 🔧 REPAIR attempt ${attempt}/${maxAttempts} — ${findingsCount} findings to fix`)
}
