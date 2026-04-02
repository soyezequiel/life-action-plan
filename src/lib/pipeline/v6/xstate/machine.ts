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
      meta: {
        visual: {
          hidden: true,
          orderHint: 0,
        },
      },
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
      meta: {
        visual: {
          labelKey: 'visualizer.phase.interpret',
          fallbackLabel: 'Interpretar meta',
          progressTarget: 10,
          agentName: 'goal-interpreter',
          orderHint: 10,
          visibleIn: ['standard', 'analyst'],
        },
      },
      on: {
        FORCE_PACKAGE: { target: 'package', actions: 'syncRuntime' },
        INTERPRET_COMPLETED: { target: 'clarify', actions: 'syncRuntime' },
        FAIL: { target: 'failed', actions: 'syncRuntime' },
      },
    },
    clarify: {
      meta: {
        visual: {
          labelKey: 'visualizer.phase.clarify',
          fallbackLabel: 'Clarificar',
          progressTarget: 25,
          agentName: 'clarifier',
          orderHint: 20,
          visibleIn: ['standard', 'analyst'],
        },
      },
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
      meta: {
        visual: {
          labelKey: 'visualizer.phase.paused_for_input',
          fallbackLabel: 'Esperando respuestas',
          progressTarget: 25,
          agentName: null,
          orderHint: 25,
          visibleIn: ['analyst'],
        },
      },
      on: {
        ANSWERS_SUBMITTED: { target: 'clarify', actions: 'syncRuntime' },
        INPUT_SKIPPED: { target: 'plan', actions: 'syncRuntime' },
        FORCE_PACKAGE: { target: 'package', actions: 'syncRuntime' },
        FAIL: { target: 'failed', actions: 'syncRuntime' },
      },
    },
    plan: {
      meta: {
        visual: {
          labelKey: 'visualizer.phase.plan',
          fallbackLabel: 'Planificar estrategia',
          progressTarget: 40,
          agentName: 'planner',
          orderHint: 30,
          visibleIn: ['standard', 'analyst'],
        },
      },
      on: {
        FORCE_PACKAGE: { target: 'package', actions: 'syncRuntime' },
        PLAN_COMPLETED: { target: 'check', actions: 'syncRuntime' },
        FAIL: { target: 'failed', actions: 'syncRuntime' },
      },
    },
    check: {
      meta: {
        visual: {
          labelKey: 'visualizer.phase.check',
          fallbackLabel: 'Verificar viabilidad',
          progressTarget: 50,
          agentName: 'feasibility-checker',
          orderHint: 40,
          visibleIn: ['standard', 'analyst'],
        },
      },
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
      meta: {
        visual: {
          labelKey: 'visualizer.phase.schedule',
          fallbackLabel: 'Armar agenda semanal',
          progressTarget: 65,
          agentName: 'scheduler',
          orderHint: 50,
          visibleIn: ['standard', 'analyst'],
        },
      },
      on: {
        FORCE_PACKAGE: { target: 'package', actions: 'syncRuntime' },
        SCHEDULE_COMPLETED: { target: 'critique', actions: 'syncRuntime' },
        FAIL: { target: 'failed', actions: 'syncRuntime' },
      },
    },
    critique: {
      meta: {
        visual: {
          labelKey: 'visualizer.phase.critique',
          fallbackLabel: 'Criticar el plan',
          progressTarget: 80,
          agentName: 'critic',
          orderHint: 60,
          visibleIn: ['standard', 'analyst'],
        },
      },
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
      meta: {
        visual: {
          labelKey: 'visualizer.phase.revise',
          fallbackLabel: 'Revisar y mejorar',
          progressTarget: 70,
          agentName: 'planner',
          orderHint: 70,
          visibleIn: ['standard', 'analyst'],
        },
      },
      on: {
        FORCE_PACKAGE: { target: 'package', actions: 'syncRuntime' },
        REVISE_COMPLETED: { target: 'critique', actions: 'syncRuntime' },
        FAIL: { target: 'failed', actions: 'syncRuntime' },
      },
    },
    package: {
      meta: {
        visual: {
          labelKey: 'visualizer.phase.package',
          fallbackLabel: 'Empaquetar resultado',
          progressTarget: 95,
          agentName: 'packager',
          orderHint: 80,
          visibleIn: ['standard', 'analyst'],
        },
      },
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
      meta: {
        visual: {
          labelKey: 'visualizer.phase.done',
          fallbackLabel: 'Listo',
          progressTarget: 100,
          agentName: null,
          orderHint: 90,
          visibleIn: ['standard', 'analyst'],
        },
      },
      type: 'final',
    },
    blocked: {
      meta: {
        visual: {
          labelKey: 'visualizer.phase.blocked',
          fallbackLabel: 'Bloqueado',
          progressTarget: 100,
          agentName: null,
          orderHint: 95,
          visibleIn: ['analyst'],
        },
      },
      type: 'final',
    },
    failed: {
      meta: {
        visual: {
          labelKey: 'visualizer.phase.failed',
          fallbackLabel: 'Fallo',
          progressTarget: 0,
          agentName: null,
          orderHint: 100,
          visibleIn: ['standard', 'analyst'],
        },
      },
      type: 'final',
    },
  },
});

export function createV6GenerationActor(input: V6MachineInput) {
  const actor = createActor(v6GenerationMachine, { input });
  actor.start();
  return actor;
}
