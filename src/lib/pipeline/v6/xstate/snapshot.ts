import type { AnyActorRef } from 'xstate';

import type {
  OrchestratorPhase,
  V6MachineRuntimeSnapshot,
  V6MachineSnapshot,
  V6MachineStateValue,
} from '../types';
import { V6MachineSnapshotSchema } from '../types';

import { getMachineStateFromPhase } from './services';

export interface V6MachineActorSnapshotLike {
  value: unknown;
  context: {
    iteration: number;
    maxIterations: number;
    clarifyRounds: number;
    maxClarifyRounds: number;
    revisionCycles: number;
    maxRevisionCycles: number;
    tokenBudgetUsed: number;
    tokenBudgetLimit: number;
    progressScore: number;
    goalSignalsSnapshot: V6MachineRuntimeSnapshot['goalSignalsSnapshot'];
    pendingQuestionCount: number;
    lastClarifyReadyToAdvance: boolean | null;
    lastFeasibilityStatus: V6MachineRuntimeSnapshot['lastFeasibilityStatus'];
    lastCritiqueVerdict: V6MachineRuntimeSnapshot['lastCritiqueVerdict'];
    publicationState: V6MachineRuntimeSnapshot['publicationState'];
  };
}

export function serializeMachineSnapshot(actor: AnyActorRef): V6MachineSnapshot {
  const snapshot = actor.getSnapshot() as V6MachineActorSnapshotLike;

  return V6MachineSnapshotSchema.parse({
    state: snapshot.value as V6MachineStateValue,
    runtime: {
      iteration: snapshot.context.iteration,
      maxIterations: snapshot.context.maxIterations,
      clarifyRounds: snapshot.context.clarifyRounds,
      maxClarifyRounds: snapshot.context.maxClarifyRounds,
      revisionCycles: snapshot.context.revisionCycles,
      maxRevisionCycles: snapshot.context.maxRevisionCycles,
      tokenBudgetUsed: snapshot.context.tokenBudgetUsed,
      tokenBudgetLimit: snapshot.context.tokenBudgetLimit,
      progressScore: snapshot.context.progressScore,
      goalSignalsSnapshot: snapshot.context.goalSignalsSnapshot,
      pendingQuestionCount: snapshot.context.pendingQuestionCount,
      lastClarifyReadyToAdvance: snapshot.context.lastClarifyReadyToAdvance,
      lastFeasibilityStatus: snapshot.context.lastFeasibilityStatus,
      lastCritiqueVerdict: snapshot.context.lastCritiqueVerdict,
      publicationState: snapshot.context.publicationState,
    },
  });
}

export function parseMachineSnapshot(snapshot: unknown): V6MachineSnapshot {
  return V6MachineSnapshotSchema.parse(snapshot);
}

export function getPublicPhaseFromMachineState(
  state: V6MachineStateValue,
  fallbackPhase: OrchestratorPhase = 'interpret',
): OrchestratorPhase {
  switch (state) {
    case 'paused_for_input':
      return 'clarify';
    case 'blocked':
      return 'package';
    case 'boot':
      return fallbackPhase;
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
      return state;
    default:
      return fallbackPhase;
  }
}

export function inferLegacyMachineState(input: {
  phase: OrchestratorPhase;
  clarifyRounds: number;
  pendingAnswers: Record<string, string> | null;
}): V6MachineStateValue {
  if (input.phase !== 'clarify') {
    return getMachineStateFromPhase(input.phase);
  }

  const hasPendingAnswers = input.pendingAnswers !== null
    && Object.values(input.pendingAnswers).some((answer) => answer.trim().length > 0);
  const pausedForInput = input.clarifyRounds > 0 && !hasPendingAnswers;

  return getMachineStateFromPhase('clarify', { pausedForInput });
}
