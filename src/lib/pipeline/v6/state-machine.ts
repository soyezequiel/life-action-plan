import type {
  OrchestratorContext,
  OrchestratorPhase,
  OrchestratorState,
  ClarificationRound,
  FeasibilityReport,
  CriticReport,
} from './types';

// ─── Phase score map (for progress tracking) ────────────────────────────────

const PHASE_PROGRESS: Record<OrchestratorPhase, number> = {
  interpret: 10,
  clarify: 25,
  plan: 40,
  check: 50,
  schedule: 65,
  critique: 80,
  revise: 70,
  package: 95,
  done: 100,
  failed: 0,
};

export function phaseProgressScore(phase: OrchestratorPhase): number {
  return PHASE_PROGRESS[phase];
}

// ─── State transition logic ─────────────────────────────────────────────────

export function nextPhase(
  currentPhase: OrchestratorPhase,
  state: OrchestratorState,
  context: OrchestratorContext,
  lastResult: unknown,
): OrchestratorPhase {
  // Safety valves — force finish regardless of phase
  if (state.iteration >= state.maxIterations) {
    return 'package';
  }
  if (state.tokenBudget.used >= state.tokenBudget.limit) {
    return 'package';
  }

  switch (currentPhase) {
    case 'interpret':
      return 'clarify';

    case 'clarify': {
      const clarifyResult = lastResult as ClarificationRound | null;
      const confidence = clarifyResult?.confidence ?? context.interpretation?.confidence ?? 0;
      const readyToAdvance = clarifyResult?.readyToAdvance ?? false;
      const hasPendingQuestions = (clarifyResult?.questions?.length ?? 0) > 0;

      if (readyToAdvance || (confidence >= 0.8 && !hasPendingQuestions)) {
        return 'plan';
      }
      if (state.clarifyRounds >= state.maxClarifyRounds && hasPendingQuestions) {
        return 'clarify';
      }
      if (state.clarifyRounds >= state.maxClarifyRounds) {
        return 'plan';
      }
      // Stay in clarify for another round (after user input)
      return 'clarify';
    }

    case 'plan':
      return 'check';

    case 'check': {
      const feasibility = lastResult as FeasibilityReport | null;
      const status = feasibility?.status ?? context.feasibilityReport?.status ?? 'feasible';

      if (status === 'feasible' || status === 'tight') {
        return 'schedule';
      }
      // infeasible
      if (state.revisionCycles < state.maxRevisionCycles) {
        return 'plan';
      }
      // max revisions reached — best effort
      return 'package';
    }

    case 'schedule':
      return 'critique';

    case 'critique': {
      const critic = lastResult as CriticReport | null;
      const verdict = critic?.verdict ?? context.criticReport?.verdict ?? 'approve';

      if (verdict === 'approve') {
        return 'package';
      }
      if (verdict === 'revise') {
        if (state.revisionCycles < state.maxRevisionCycles) {
          return 'revise';
        }
        // max revisions — best effort
        return 'package';
      }
      if (verdict === 'rethink') {
        if (state.clarifyRounds < state.maxClarifyRounds) {
          return 'clarify';
        }
        // max clarify rounds — best effort
        return 'package';
      }
      return 'package';
    }

    case 'revise':
      return 'critique';

    case 'package':
      return 'done';

    case 'done':
    case 'failed':
      return currentPhase;

    default:
      return 'package';
  }
}

// ─── User input check ───────────────────────────────────────────────────────

export function requiresUserInput(phase: OrchestratorPhase): boolean {
  return phase === 'clarify';
}
