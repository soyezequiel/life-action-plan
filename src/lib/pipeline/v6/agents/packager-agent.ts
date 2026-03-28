import { DateTime } from 'luxon';

import type { GoalClassification } from '../../../domain/goal-taxonomy';
import { packagePlan } from '../../shared/packager';
import type { PackageInput } from '../../shared/phase-io';
import type {
  OrchestratorContext,
  PlanPackage,
  ReasoningEntry,
  SchedulerOutput,
  V6Agent,
} from '../types';

export interface PackagerInput {
  context: OrchestratorContext
  scratchpad: ReasoningEntry[]
}

function buildClassification(context: OrchestratorContext): GoalClassification | undefined {
  if (!context.interpretation) {
    return undefined;
  }

  return {
    goalType: context.interpretation.goalType,
    confidence: context.interpretation.confidence,
    risk: context.interpretation.riskFlags[0] ?? 'LOW',
    extractedSignals: {
      isRecurring: context.interpretation.goalType === 'RECURRENT_HABIT',
      hasDeliverable: context.interpretation.goalType === 'FINITE_PROJECT',
      hasNumericTarget: context.interpretation.goalType === 'QUANT_TARGET_TRACKING',
      requiresSkillProgression: context.interpretation.goalType === 'SKILL_ACQUISITION',
      dependsOnThirdParties: context.interpretation.goalType === 'HIGH_UNCERTAINTY_TRANSFORM',
      isOpenEnded: context.interpretation.goalType === 'IDENTITY_EXPLORATION',
      isRelational: context.interpretation.goalType === 'RELATIONAL_EMOTIONAL',
    },
  };
}

function nextWeekStartDate(): string {
  const today = DateTime.utc().startOf('day');
  const nextMonday = today.weekday === 1
    ? today
    : today.plus({ weeks: 1 }).startOf('week');

  return nextMonday.toISO() ?? '2026-03-30T00:00:00.000Z';
}

function inferTimezone(context: OrchestratorContext): string {
  return context.finalPackage?.timezone ?? 'UTC';
}

function buildEmptySchedule(): SchedulerOutput {
  return {
    events: [],
    unscheduled: [],
    metrics: {
      fillRate: 0,
      solverTimeMs: 0,
      solverStatus: 'not_run',
    },
  };
}

function buildPackageInput(context: OrchestratorContext): PackageInput {
  const scheduleResult = context.scheduleResult ?? buildEmptySchedule();
  const weekStartDate = scheduleResult.events[0]?.startAt ?? nextWeekStartDate();

  return {
    finalSchedule: scheduleResult,
    classification: buildClassification(context),
    roadmap: context.strategicDraft ?? undefined,
    goalText: context.goalText,
    goalId: scheduleResult.events[0]?.goalIds[0] ?? 'goal-v6',
    weekStartDate,
    profile: context.userProfile ?? undefined,
    timezone: inferTimezone(context),
  };
}

function packageWithTrace(input: PackagerInput): PlanPackage {
  const packagedPlan = packagePlan(buildPackageInput(input.context));
  return Object.assign(packagedPlan, {
    reasoningTrace: input.scratchpad,
  } satisfies Pick<PlanPackage, 'reasoningTrace'>);
}

export const packagerAgent: V6Agent<PackagerInput, PlanPackage> = {
  name: 'packager',

  async execute(input: PackagerInput): Promise<PlanPackage> {
    return packageWithTrace(input);
  },

  fallback(input: PackagerInput): PlanPackage {
    return packageWithTrace(input);
  },
};
