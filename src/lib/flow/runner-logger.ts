import { FLOW_STEPS, FLOW_PHASES } from './flow-definition'
import type { PhaseIO } from '../pipeline/phase-io'

export function logPhase(phaseId: string) {
  const phase = FLOW_PHASES.find(p => p.id === phaseId)
  if (phase) {
    console.error(`\n[LAP Runner] === PHASE: ${phase.name} ===`)
  } else {
    console.error(`\n[LAP Runner] === PHASE: ${phaseId} ===`)
  }
}

export function logPhaseIO(phaseId: string, io: PhaseIO | undefined) {
  if (!io) return

  const input = io.input as Record<string, unknown>
  const output = io.output as Record<string, unknown>

  // Descripción de qué hace la fase
  if (io.processing) {
    console.error(`[LAP Runner]   🔄 ${io.processing}`)
  }

  // Resumen compacto del input (solo keys con valor)
  const inputKeys = Object.entries(input)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.length}]`
      if (typeof v === 'object') return `${k}: {...}`
      return `${k}: ${String(v).slice(0, 40)}`
    })
    .join(', ')

  const outputKeys = Object.entries(output)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.length}]`
      if (typeof v === 'object') return `${k}: {...}`
      return `${k}: ${String(v).slice(0, 40)}`
    })
    .join(', ')

  console.error(`[LAP Runner]   📥 IN:  ${inputKeys}`)
  console.error(`[LAP Runner]   📤 OUT: ${outputKeys}`)
  console.error(`[LAP Runner]   ⏱ ${io.durationMs}ms`)
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
