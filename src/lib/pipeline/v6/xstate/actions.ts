import type { V6MachineContext } from './machine';
import type { V6MachineEvent } from './events';

export function buildRuntimePatch(event: V6MachineEvent): Partial<V6MachineContext> {
  const runtime = event.runtime;

  return {
    iteration: runtime.iteration,
    maxIterations: runtime.maxIterations,
    clarifyRounds: runtime.clarifyRounds,
    maxClarifyRounds: runtime.maxClarifyRounds,
    revisionCycles: runtime.revisionCycles,
    maxRevisionCycles: runtime.maxRevisionCycles,
    tokenBudgetUsed: runtime.tokenBudgetUsed,
    tokenBudgetLimit: runtime.tokenBudgetLimit,
    progressScore: runtime.progressScore,
    goalSignalsSnapshot: runtime.goalSignalsSnapshot,
    pendingQuestionCount: runtime.pendingQuestionCount,
    lastClarifyReadyToAdvance: runtime.lastClarifyReadyToAdvance,
    lastFeasibilityStatus: runtime.lastFeasibilityStatus,
    lastCritiqueVerdict: runtime.lastCritiqueVerdict,
    publicationState: runtime.publicationState,
  };
}
