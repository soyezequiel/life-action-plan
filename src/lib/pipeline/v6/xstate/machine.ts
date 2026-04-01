import { assign, createActor, setup } from 'xstate';

import type {
  V6MachineRuntimeSnapshot,
  V6MachineStateValue,
} from '../types';

import { buildRuntimePatch } from './actions';
import type { V6MachineEvent } from './events';
import {
  checkCanSchedule,
  checkNeedsReplan,
  clarifyCanAdvance,
  clarifyNeedsInput,
  critiqueApproved,
  critiqueNeedsClarify,
  critiqueNeedsRevision,
  packageBlocked,
  packageFailed,
  startsAt,
} from './guards';

export interface V6MachineContext extends V6MachineRuntimeSnapshot {
  restoredStateValue: V6MachineStateValue;
}

export interface V6MachineInput {
  restoredStateValue: V6MachineStateValue;
  runtime: V6MachineRuntimeSnapshot;
}

export const v6GenerationMachine = setup({
  types: {
    context: {} as V6MachineContext,
    events: {} as V6MachineEvent,
    input: {} as V6MachineInput,
  },
  actions: {
    syncRuntime: assign(({ event }) => buildRuntimePatch(event as V6MachineEvent)),
  },
  guards: {
    startsAtBoot: startsAt('boot'),
    startsAtInterpret: startsAt('interpret'),
    startsAtClarify: startsAt('clarify'),
    startsAtPaused: startsAt('paused_for_input'),
    startsAtPlan: startsAt('plan'),
    startsAtCheck: startsAt('check'),
    startsAtSchedule: startsAt('schedule'),
    startsAtCritique: startsAt('critique'),
    startsAtRevise: startsAt('revise'),
    startsAtPackage: startsAt('package'),
    startsAtDone: startsAt('done'),
    startsAtBlocked: startsAt('blocked'),
    startsAtFailed: startsAt('failed'),
    clarifyCanAdvance,
    clarifyNeedsInput,
    checkCanSchedule,
    checkNeedsReplan,
    critiqueApproved,
    critiqueNeedsRevision,
    critiqueNeedsClarify,
    packageBlocked,
    packageFailed,
  },
}).createMachine({
  id: 'v6-generation',
  initial: 'boot',
  context: ({ input }) => ({
    restoredStateValue: input.restoredStateValue,
    ...input.runtime,
  }),
  states: {
    boot: {
      always: [
        { guard: 'startsAtPaused', target: 'paused_for_input' },
        { guard: 'startsAtPlan', target: 'plan' },
        { guard: 'startsAtCheck', target: 'check' },
        { guard: 'startsAtSchedule', target: 'schedule' },
        { guard: 'startsAtCritique', target: 'critique' },
        { guard: 'startsAtRevise', target: 'revise' },
        { guard: 'startsAtPackage', target: 'package' },
        { guard: 'startsAtDone', target: 'done' },
        { guard: 'startsAtBlocked', target: 'blocked' },
        { guard: 'startsAtFailed', target: 'failed' },
        { guard: 'startsAtClarify', target: 'clarify' },
        { target: 'interpret' },
      ],
    },
    interpret: {
      on: {
        FORCE_PACKAGE: { target: 'package', actions: 'syncRuntime' },
        INTERPRET_COMPLETED: { target: 'clarify', actions: 'syncRuntime' },
        FAIL: { target: 'failed', actions: 'syncRuntime' },
      },
    },
    clarify: {
      on: {
        FORCE_PACKAGE: { target: 'package', actions: 'syncRuntime' },
        CLARIFY_COMPLETED: [
          { guard: 'clarifyCanAdvance', target: 'plan', actions: 'syncRuntime' },
          { guard: 'clarifyNeedsInput', target: 'paused_for_input', actions: 'syncRuntime' },
          { target: 'clarify', actions: 'syncRuntime' },
        ],
        FAIL: { target: 'failed', actions: 'syncRuntime' },
      },
    },
    paused_for_input: {
      on: {
        ANSWERS_SUBMITTED: { target: 'clarify', actions: 'syncRuntime' },
        INPUT_SKIPPED: { target: 'plan', actions: 'syncRuntime' },
        FORCE_PACKAGE: { target: 'package', actions: 'syncRuntime' },
        FAIL: { target: 'failed', actions: 'syncRuntime' },
      },
    },
    plan: {
      on: {
        FORCE_PACKAGE: { target: 'package', actions: 'syncRuntime' },
        PLAN_COMPLETED: { target: 'check', actions: 'syncRuntime' },
        FAIL: { target: 'failed', actions: 'syncRuntime' },
      },
    },
    check: {
      on: {
        FORCE_PACKAGE: { target: 'package', actions: 'syncRuntime' },
        CHECK_COMPLETED: [
          { guard: 'checkCanSchedule', target: 'schedule', actions: 'syncRuntime' },
          { guard: 'checkNeedsReplan', target: 'plan', actions: 'syncRuntime' },
          { target: 'package', actions: 'syncRuntime' },
        ],
        FAIL: { target: 'failed', actions: 'syncRuntime' },
      },
    },
    schedule: {
      on: {
        FORCE_PACKAGE: { target: 'package', actions: 'syncRuntime' },
        SCHEDULE_COMPLETED: { target: 'critique', actions: 'syncRuntime' },
        FAIL: { target: 'failed', actions: 'syncRuntime' },
      },
    },
    critique: {
      on: {
        FORCE_PACKAGE: { target: 'package', actions: 'syncRuntime' },
        CRITIQUE_COMPLETED: [
          { guard: 'critiqueApproved', target: 'package', actions: 'syncRuntime' },
          { guard: 'critiqueNeedsRevision', target: 'revise', actions: 'syncRuntime' },
          { guard: 'critiqueNeedsClarify', target: 'clarify', actions: 'syncRuntime' },
          { target: 'package', actions: 'syncRuntime' },
        ],
        FAIL: { target: 'failed', actions: 'syncRuntime' },
      },
    },
    revise: {
      on: {
        FORCE_PACKAGE: { target: 'package', actions: 'syncRuntime' },
        REVISE_COMPLETED: { target: 'critique', actions: 'syncRuntime' },
        FAIL: { target: 'failed', actions: 'syncRuntime' },
      },
    },
    package: {
      on: {
        PACKAGE_COMPLETED: [
          { guard: 'packageBlocked', target: 'blocked', actions: 'syncRuntime' },
          { guard: 'packageFailed', target: 'failed', actions: 'syncRuntime' },
          { target: 'done', actions: 'syncRuntime' },
        ],
        FAIL: { target: 'failed', actions: 'syncRuntime' },
      },
    },
    done: {
      type: 'final',
    },
    blocked: {
      type: 'final',
    },
    failed: {
      type: 'final',
    },
  },
});

export function createV6GenerationActor(input: V6MachineInput) {
  const actor = createActor(v6GenerationMachine, { input });
  actor.start();
  return actor;
}
