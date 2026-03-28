import { DateTime } from 'luxon';

import { extractFirstJsonObject } from '../../../flow/agents/llm-json-parser';
import type { GoalClassification, GoalType } from '../../../domain/goal-taxonomy';
import { solveSchedule } from '../../../scheduler/solver';
import type {
  ActivityRequest,
  AvailabilityWindow,
  BlockedSlot,
  SchedulerInput as MilpSchedulerInput,
} from '../../../scheduler/types';
import type { AgentRuntime } from '../../../runtime/types';
import { buildTemplate } from '../../shared/template-builder';
import type { V6Agent, StrategicDraft, UserProfileV5, DomainKnowledgeCard, SchedulerOutput } from '../types';

export interface SchedulerInput {
  strategicDraft: StrategicDraft
  userProfile: UserProfileV5
  availability: AvailabilityWindow[]
  blocked: BlockedSlot[]
  domainCard: DomainKnowledgeCard | null
}

export interface ScheduleResult {
  solverOutput: SchedulerOutput
  tradeoffs: string[]
  qualityScore: number
  unscheduledCount: number
}

const scheduleCache = new Map<string, ScheduleResult>();

function inferGoalType(
  strategicDraft: StrategicDraft,
  domainCard: DomainKnowledgeCard | null,
): GoalType {
  if (domainCard?.progression?.levels.length) {
    return 'SKILL_ACQUISITION';
  }

  if (domainCard?.goalTypeCompatibility.includes('RECURRENT_HABIT') && strategicDraft.phases.length <= 1) {
    return 'RECURRENT_HABIT';
  }

  if (strategicDraft.milestones.length === 0 && strategicDraft.phases.length <= 1) {
    return 'IDENTITY_EXPLORATION';
  }

  return 'FINITE_PROJECT';
}

function buildSyntheticClassification(
  strategicDraft: StrategicDraft,
  domainCard: DomainKnowledgeCard | null,
): GoalClassification {
  const goalType = inferGoalType(strategicDraft, domainCard);

  return {
    goalType,
    confidence: 0.5,
    risk: 'LOW',
    extractedSignals: {
      isRecurring: goalType === 'RECURRENT_HABIT',
      hasDeliverable: goalType === 'FINITE_PROJECT',
      hasNumericTarget: goalType === 'QUANT_TARGET_TRACKING',
      requiresSkillProgression: goalType === 'SKILL_ACQUISITION',
      dependsOnThirdParties: goalType === 'HIGH_UNCERTAINTY_TRANSFORM',
      isOpenEnded: goalType === 'IDENTITY_EXPLORATION',
      isRelational: goalType === 'RELATIONAL_EMOTIONAL',
    },
  };
}

function inferGoalText(strategicDraft: StrategicDraft): string {
  return strategicDraft.milestones[0]
    ?? strategicDraft.phases[0]?.focus_esAR
    ?? strategicDraft.phases[0]?.name
    ?? 'Objetivo principal';
}

function nextWeekStartDate(): string {
  const today = DateTime.utc().startOf('day');
  const nextMonday = today.weekday === 1
    ? today
    : today.plus({ weeks: 1 }).startOf('week');

  return nextMonday.toISO() ?? '2026-03-30T00:00:00.000Z';
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function computeQualityScore(solverOutput: SchedulerOutput): number {
  const statusPenalty = solverOutput.metrics.solverStatus === 'optimal'
    ? 0
    : solverOutput.metrics.solverStatus === 'feasible'
      ? 5
      : 15;

  return clampScore(Math.round(solverOutput.metrics.fillRate * 100) - statusPenalty);
}

function serializeInput(input: SchedulerInput): string {
  return JSON.stringify(input);
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTradeoffs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(
    value
      .map((item) => normalizeText(item))
      .filter((item) => item.length > 0),
  )).slice(0, 3);
}

function summarizeConstraints(domainCard: DomainKnowledgeCard | null): string {
  if (!domainCard || domainCard.constraints.length === 0) {
    return 'Sin constraints de dominio adicionales.';
  }

  return domainCard.constraints
    .slice(0, 4)
    .map((constraint) => `- [${constraint.severity}] ${constraint.description}`)
    .join('\n');
}

function buildActivityRequests(
  strategicDraft: StrategicDraft,
  userProfile: UserProfileV5,
  domainCard: DomainKnowledgeCard | null,
): ActivityRequest[] {
  const syntheticClassification = buildSyntheticClassification(strategicDraft, domainCard);
  const template = buildTemplate(
    {
      goalText: inferGoalText(strategicDraft),
      roadmap: strategicDraft,
    },
    syntheticClassification,
    userProfile,
    domainCard ?? undefined,
  );

  return template.activities.map((activity, index) => ({
    ...activity,
    goalId: activity.goalId || `goal-v6-${index + 1}`,
  }));
}

function buildSolverInput(input: SchedulerInput): MilpSchedulerInput {
  return {
    activities: buildActivityRequests(input.strategicDraft, input.userProfile, input.domainCard),
    availability: input.availability,
    blocked: input.blocked,
    preferences: [],
    timezone: 'UTC',
    weekStartDate: nextWeekStartDate(),
  };
}

async function runSolver(input: SchedulerInput): Promise<ScheduleResult> {
  const solverOutput = await solveSchedule(buildSolverInput(input));

  return {
    solverOutput,
    tradeoffs: [],
    qualityScore: computeQualityScore(solverOutput),
    unscheduledCount: solverOutput.unscheduled.length,
  };
}

function buildUnavailableResult(input: SchedulerInput): ScheduleResult {
  try {
    const unscheduled = buildActivityRequests(input.strategicDraft, input.userProfile, input.domainCard)
      .map((activity) => ({
        activityId: activity.id,
        reason: 'scheduler unavailable',
        suggestion_esAR: `Revisar la disponibilidad para ${activity.label}.`,
      }));

    return {
      solverOutput: {
        events: [],
        unscheduled,
        metrics: {
          fillRate: 0,
          solverTimeMs: 0,
          solverStatus: 'fallback_unavailable',
        },
      },
      tradeoffs: [],
      qualityScore: 0,
      unscheduledCount: unscheduled.length,
    };
  } catch {
    return {
      solverOutput: {
        events: [],
        unscheduled: [],
        metrics: {
          fillRate: 0,
          solverTimeMs: 0,
          solverStatus: 'fallback_unavailable',
        },
      },
      tradeoffs: [],
      qualityScore: 0,
      unscheduledCount: 0,
    };
  }
}

async function explainTradeoffs(
  runtime: AgentRuntime,
  input: SchedulerInput,
  solverOutput: SchedulerOutput,
): Promise<string[]> {
  const response = await runtime.chat([{
    role: 'user',
    content: [
      'Explica tradeoffs de agenda en espanol simple y concreto.',
      'No expliques el solver ni detalles tecnicos.',
      'Responde SOLO con JSON: {"tradeoffs":["..."]}',
      'Maximo 3 items y menos de 200 tokens en total.',
      '',
      'Roadmap:',
      JSON.stringify(input.strategicDraft, null, 2),
      '',
      `Perfil: ${input.userProfile.freeHoursWeekday}h L-V, ${input.userProfile.freeHoursWeekend}h finde, energia ${input.userProfile.energyLevel}.`,
      '',
      'Restricciones de dominio:',
      summarizeConstraints(input.domainCard),
      '',
      'Actividades no calendarizadas:',
      solverOutput.unscheduled
        .map((item, index) => `${index + 1}. ${item.activityId}: ${item.reason}. ${item.suggestion_esAR}`)
        .join('\n'),
    ].join('\n'),
  }]);

  try {
    const raw = extractFirstJsonObject(response.content);
    const parsed = JSON.parse(raw) as { tradeoffs?: unknown };
    return normalizeTradeoffs(parsed.tradeoffs);
  } catch {
    return normalizeTradeoffs(
      response.content
        .split('\n')
        .map((line) => line.replace(/^[\-\d\.\s]+/, '').trim())
        .filter((line) => line.length > 0),
    );
  }
}

export const schedulerAgent: V6Agent<SchedulerInput, ScheduleResult> = {
  name: 'scheduler',

  async execute(input: SchedulerInput, runtime: AgentRuntime): Promise<ScheduleResult> {
    const deterministicResult = await runSolver(input);
    scheduleCache.set(serializeInput(input), deterministicResult);

    if (deterministicResult.unscheduledCount === 0) {
      return deterministicResult;
    }

    try {
      const tradeoffs = await explainTradeoffs(runtime, input, deterministicResult.solverOutput);
      const enrichedResult: ScheduleResult = {
        ...deterministicResult,
        tradeoffs,
      };
      scheduleCache.set(serializeInput(input), enrichedResult);
      return enrichedResult;
    } catch {
      return deterministicResult;
    }
  },

  fallback(input: SchedulerInput): ScheduleResult {
    return scheduleCache.get(serializeInput(input)) ?? buildUnavailableResult(input);
  },
};
