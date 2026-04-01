import type { V6MachineContext } from './machine';
import type { V6MachineEvent } from './events';
import type { V6MachineStateValue } from '../types';

function isRuntimeEvent(event: V6MachineEvent): event is Extract<V6MachineEvent, { runtime: unknown }> {
  return 'runtime' in event;
}

export const startsAt = (state: V6MachineStateValue) =>
  ({ context }: { context: V6MachineContext }) => context.restoredStateValue === state;

export const clarifyCanAdvance = ({ event }: { event: V6MachineEvent }) =>
  isRuntimeEvent(event)
  && event.runtime.lastClarifyReadyToAdvance === true
  && event.runtime.pendingQuestionCount === 0
  && (event.runtime.goalSignalsSnapshot?.hasSufficientSignalsForPlanning ?? false);

export const clarifyNeedsInput = ({ event }: { event: V6MachineEvent }) =>
  isRuntimeEvent(event)
  && event.runtime.pendingQuestionCount > 0;

export const checkCanSchedule = ({ event }: { event: V6MachineEvent }) =>
  isRuntimeEvent(event)
  && (event.runtime.lastFeasibilityStatus === 'feasible' || event.runtime.lastFeasibilityStatus === 'tight');

export const checkNeedsReplan = ({ event }: { event: V6MachineEvent }) =>
  isRuntimeEvent(event)
  && event.runtime.lastFeasibilityStatus === 'infeasible'
  && event.runtime.revisionCycles < event.runtime.maxRevisionCycles;

export const critiqueApproved = ({ event }: { event: V6MachineEvent }) =>
  isRuntimeEvent(event) && event.runtime.lastCritiqueVerdict === 'approve';

export const critiqueNeedsRevision = ({ event }: { event: V6MachineEvent }) =>
  isRuntimeEvent(event)
  && event.runtime.lastCritiqueVerdict === 'revise'
  && event.runtime.revisionCycles < event.runtime.maxRevisionCycles;

export const critiqueNeedsClarify = ({ event }: { event: V6MachineEvent }) =>
  isRuntimeEvent(event)
  && event.runtime.lastCritiqueVerdict === 'rethink'
  && event.runtime.clarifyRounds < event.runtime.maxClarifyRounds;

export const packageBlocked = ({ event }: { event: V6MachineEvent }) =>
  isRuntimeEvent(event) && event.runtime.publicationState === 'blocked';

export const packageFailed = ({ event }: { event: V6MachineEvent }) =>
  isRuntimeEvent(event) && event.runtime.publicationState === 'failed';
