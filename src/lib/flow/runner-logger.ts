import { FLOW_STEPS, FLOW_PHASES } from './flow-definition'

export function logPhase(phaseId: string) {
  const phase = FLOW_PHASES.find(p => p.id === phaseId)
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

export function logPhaseSkipped(phaseId: string) {
  const phase = FLOW_PHASES.find(p => p.id === phaseId)
  const label = phase?.name ?? phaseId
  console.error(`[LAP Runner] >>> SKIPPED: ${label}`)
}

export function logRepairAttempt(attempt: number, maxAttempts: number, findingsCount: number) {
  console.error(`[LAP Runner] 🔧 REPAIR attempt ${attempt}/${maxAttempts} — ${findingsCount} findings to fix`)
}
