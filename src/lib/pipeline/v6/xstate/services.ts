import type {
  CriticReport,
  FeasibilityReport,
  GoalSignalsSnapshot,
  OrchestratorContext,
  OrchestratorPhase,
  OrchestratorState,
  V6MachineRuntimeSnapshot,
  V6MachineStateValue,
} from '../types';

export function extractPendingQuestionCount(context: OrchestratorContext): number {
  return context.clarificationRounds.at(-1)?.questions.length ?? 0;
}

export function buildMachineRuntimeSnapshot(input: {
  state: OrchestratorState;
  context: OrchestratorContext;
  publicationState?: 'ready' | 'blocked' | 'failed' | null;
}): V6MachineRuntimeSnapshot {
  const lastClarification = input.context.clarificationRounds.at(-1) ?? null;
  const feasibilityReport = input.context.feasibilityReport as FeasibilityReport | null;
  const criticReport = input.context.criticReport as CriticReport | null;
  const goalSignalsSnapshot = (input.context.goalSignalsSnapshot ?? null) as GoalSignalsSnapshot | null;

  return {
    iteration: input.state.iteration,
    maxIterations: input.state.maxIterations,
    clarifyRounds: input.state.clarifyRounds,
    maxClarifyRounds: input.state.maxClarifyRounds,
    revisionCycles: input.state.revisionCycles,
    maxRevisionCycles: input.state.maxRevisionCycles,
    tokenBudgetUsed: input.state.tokenBudget.used,
    tokenBudgetLimit: input.state.tokenBudget.limit,
    progressScore: input.state.progressScore,
    goalSignalsSnapshot,
    pendingQuestionCount: extractPendingQuestionCount(input.context),
    lastClarifyReadyToAdvance: lastClarification?.readyToAdvance ?? null,
    lastFeasibilityStatus: feasibilityReport?.status ?? null,
    lastCritiqueVerdict: criticReport?.verdict ?? null,
    publicationState: input.publicationState ?? null,
  };
}

export function getMachineStateFromPhase(
  phase: OrchestratorPhase,
  options?: {
    pausedForInput?: boolean;
    blocked?: boolean;
  },
): V6MachineStateValue {
  if (options?.blocked) {
    return 'blocked';
  }

  if (options?.pausedForInput && phase === 'clarify') {
    return 'paused_for_input';
  }

  switch (phase) {
    case 'interpret':
    case 'clarify':
    case 'plan':
    case 'check':
    case 'schedule':
    case 'critique':
    case 'revise':
    case 'package':
    case 'done':
    case 'failed':
      return phase;
    default:
      return 'interpret';
  }
}
