import type { PlanSimulationSnapshot } from '../../shared/types/lap-api'

export type QualityDecision = 'deliver' | 'repair' | 'best-effort'

/**
 * Decides what to do after a simulation run.
 *
 * deliver     → plan passed (or WARN with score ≥ 70)
 * repair      → plan failed but attempts remain
 * best-effort → plan failed and attempts exhausted (or score is regressing)
 */
export function evaluateQualityGate(
  snapshot: PlanSimulationSnapshot,
  attemptNumber: number,
  maxAttempts: number,
  previousScore?: number
): QualityDecision {
  const { overallStatus } = snapshot.summary
  const score = snapshot.qualityScore ?? 0

  // PASS or acceptable WARN → deliver immediately
  if (overallStatus === 'PASS' || (overallStatus !== 'FAIL' && score >= 70)) {
    return 'deliver'
  }

  // Score is regressing vs previous attempt → stop trying, best-effort
  if (
    previousScore !== undefined &&
    score < previousScore &&
    attemptNumber > 1
  ) {
    return 'best-effort'
  }

  // FAIL but attempts remain → repair
  if (attemptNumber < maxAttempts) {
    return 'repair'
  }

  // Exhausted attempts
  return 'best-effort'
}
