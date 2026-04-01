import type {
  V6MachineRuntimeSnapshot,
} from '../types';

export type V6MachineRuntimeEvent = {
  runtime: V6MachineRuntimeSnapshot;
};

export type V6MachineEvent =
  | ({ type: 'FORCE_PACKAGE' } & V6MachineRuntimeEvent)
  | ({ type: 'ANSWERS_SUBMITTED' } & V6MachineRuntimeEvent)
  | ({ type: 'INPUT_SKIPPED' } & V6MachineRuntimeEvent)
  | ({ type: 'INTERPRET_COMPLETED' } & V6MachineRuntimeEvent)
  | ({ type: 'CLARIFY_COMPLETED' } & V6MachineRuntimeEvent)
  | ({ type: 'PLAN_COMPLETED' } & V6MachineRuntimeEvent)
  | ({ type: 'CHECK_COMPLETED' } & V6MachineRuntimeEvent)
  | ({ type: 'SCHEDULE_COMPLETED' } & V6MachineRuntimeEvent)
  | ({ type: 'CRITIQUE_COMPLETED' } & V6MachineRuntimeEvent)
  | ({ type: 'REVISE_COMPLETED' } & V6MachineRuntimeEvent)
  | ({ type: 'PACKAGE_COMPLETED' } & V6MachineRuntimeEvent)
  | ({ type: 'FAIL' } & V6MachineRuntimeEvent);
