import { GoalTypeSchema, type GoalType } from '../../src/lib/domain/goal-taxonomy'
import type { InteractivePauseFromPhase } from '../../src/shared/schemas/pipeline-interactive'
import { t } from '../../src/i18n'

export const GOAL_TYPE_OPTIONS = GoalTypeSchema.options

export function goalTypeLabel(goalType: GoalType): string {
  return t(`flowInteractive.goalType.${goalType}`)
}

export function pausePhaseLabel(phase: InteractivePauseFromPhase | 'package'): string {
  return t(`flowInteractive.step.${phase}`)
}

export function riskLabel(risk: string): string {
  return t(`flowInteractive.risk.${risk}`)
}

export function energyLabel(energy: 'low' | 'medium' | 'high'): string {
  return t(`flowInteractive.energy.${energy}`)
}

export function signalLabel(signal: string): string {
  return t(`flowInteractive.signal.${signal}`)
}
