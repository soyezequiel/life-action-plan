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
import { formatMinutesAsTime } from '../../shared/scheduling-context';
import { buildTemplate } from '../../shared/template-builder';
import type {
  V6Agent,
  StrategicDraft,
  UserProfileV5,
  DomainKnowledgeCard,
  SchedulerOutput,
} from '../types';
import type { TimeEventItem } from '../../../domain/plan-item';

export interface SchedulerInput {
  strategicDraft: StrategicDraft
  userProfile: UserProfileV5
  timezone: string
  planningStartAt: string
  weekStartDate: string
  availability: AvailabilityWindow[]
  blocked: BlockedSlot[]
  domainCard: DomainKnowledgeCard | null
}

export interface ScheduleResult {
  solverOutput: SchedulerOutput
  tradeoffs: string[]
  qualityScore: number
  unscheduledCount: number
  timezone: string
  planningStartAt: string
  weekStartDate: string
}

const scheduleCache = new Map<string, ScheduleResult>();
const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

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

function buildPreAnchorBlockedSlots(input: SchedulerInput): BlockedSlot[] {
  const weekStartLocal = DateTime.fromISO(input.weekStartDate, { zone: 'utc' }).setZone(input.timezone).startOf('day');
  const planningStartLocal = DateTime.fromISO(input.planningStartAt, { zone: 'utc' }).setZone(input.timezone);

  if (!weekStartLocal.isValid || !planningStartLocal.isValid || planningStartLocal <= weekStartLocal) {
    return [];
  }

  const dayOffset = Math.floor(planningStartLocal.startOf('day').diff(weekStartLocal, 'days').days);
  if (dayOffset < 0) {
    return [];
  }

  const blocked: BlockedSlot[] = [];

  for (let index = 0; index < Math.min(dayOffset, DAY_NAMES.length); index += 1) {
    blocked.push({
      day: DAY_NAMES[index],
      startTime: '00:00',
      endTime: '24:00',
      reason: 'Antes de la fecha de inicio',
    });
  }

  if (dayOffset < DAY_NAMES.length) {
    const startOfAnchorDay = planningStartLocal.startOf('day');
    const minutesIntoDay = Math.max(
      0,
      Math.min(24 * 60, Math.floor(planningStartLocal.diff(startOfAnchorDay, 'minutes').minutes)),
    );

    if (minutesIntoDay > 0) {
      blocked.push({
        day: DAY_NAMES[dayOffset],
        startTime: '00:00',
        endTime: formatMinutesAsTime(minutesIntoDay),
        reason: 'Antes de la fecha de inicio',
      });
    }
  }

  return blocked;
}

function buildSolverInput(input: SchedulerInput): MilpSchedulerInput {
  return {
    activities: buildActivityRequests(input.strategicDraft, input.userProfile, input.domainCard),
    availability: input.availability,
    blocked: [
      ...input.blocked,
      ...buildPreAnchorBlockedSlots(input),
    ],
    preferences: [],
    timezone: input.timezone,
    weekStartDate: input.weekStartDate,
  };
}

function buildResultMetadata(input: SchedulerInput) {
  return {
    timezone: input.timezone,
    planningStartAt: input.planningStartAt,
    weekStartDate: input.weekStartDate,
  };
}

async function runSolver(input: SchedulerInput): Promise<ScheduleResult> {
  const solverOutput = await solveSchedule(buildSolverInput(input));

  return {
    solverOutput,
    tradeoffs: [],
    qualityScore: computeQualityScore(solverOutput),
    unscheduledCount: solverOutput.unscheduled.length,
    ...buildResultMetadata(input),
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
      ...buildResultMetadata(input),
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
      ...buildResultMetadata(input),
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

function validateFallbackEvents(
  parsedEvents: Array<Record<string, unknown>>,
  activityList: ActivityRequest[],
  input: SchedulerInput,
): { events: TimeEventItem[]; rejected: Array<{ activityId: string; reason: string; suggestion_esAR: string }> } {
  const now = DateTime.utc().toISO() ?? '2026-03-30T00:00:00.000Z';
  const planningStart = DateTime.fromISO(input.planningStartAt, { zone: 'utc' });
  const events: TimeEventItem[] = [];
  const rejected = new Map<string, { activityId: string; reason: string; suggestion_esAR: string }>();

  for (const item of parsedEvents) {
    const activityId = typeof item.activityId === 'string' ? item.activityId : null;
    const startAt = typeof item.startAt === 'string' ? item.startAt : null;
    if (!activityId || !startAt) {
      continue;
    }

    const start = DateTime.fromISO(startAt, { zone: 'utc' });
    if (!start.isValid || start < planningStart) {
      rejected.set(activityId, {
        activityId,
        reason: 'conflicto_bloqueo',
        suggestion_esAR: 'El plan no puede arrancar antes de la fecha de inicio elegida.',
      });
      continue;
    }

    const activity = activityList.find((candidate) => candidate.id === activityId);
    events.push({
      id: `${activityId}_llm_${Math.random().toString(36).substring(2, 7)}`,
      kind: 'time_event',
      title: activity?.label || 'Actividad',
      status: 'active',
      goalIds: activity ? [activity.goalId] : [],
      startAt,
      durationMin: typeof item.durationMin === 'number' ? item.durationMin : (activity?.durationMin || 60),
      rigidity: (activity?.constraintTier === 'hard' ? 'hard' : 'soft') as 'hard' | 'soft',
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    events,
    rejected: Array.from(rejected.values()),
  };
}

async function llmScheduleFallback(
  runtime: AgentRuntime,
  input: SchedulerInput,
): Promise<ScheduleResult> {
  const startPos = Date.now();
  const activityList = buildActivityRequests(input.strategicDraft, input.userProfile, input.domainCard);

  const response = await runtime.chat([{
    role: 'system',
    content: `Eres un experto en gestion del tiempo y optimizacion de calendarios. Tu objetivo es convertir un roadmap estrategico en una rutina ejecutable para un usuario con disponibilidad limitada.

Identifica los bloques de mayor impacto y asegurate de que queden agendados.

REGLAS DE AGENDAMIENTO:
1. Si el tiempo no alcanza, descarta actividades soft_weak antes que soft_strong.
2. No dejes huecos inutiles de menos de 15 minutos si puedes agrupar bloques.
3. No agendes sesiones irreales para la disponibilidad dada.
4. Devuelve un JSON con "events" y "unscheduled". Si algo queda fuera, explica el motivo en "suggestion_esAR".

FORMATO DE SALIDA:
{
  "events": [{"activityId": "id", "startAt": "ISO8601 (UTC)", "durationMin": 60}],
  "unscheduled": [{"activityId": "id", "reason": "exceso_carga|conflicto_bloqueo", "suggestion_esAR": "sugerencia concreta"}]
}

Restricciones adicionales:
- Fecha de inicio tecnica de la semana: ${input.weekStartDate}.
- Zona horaria local del usuario: ${input.timezone}.
- No agendes nada antes de ${input.planningStartAt}.
- No solapes actividades.
- Respeta la duracion minima de cada actividad solicitada.`,
  }, {
    role: 'user',
    content: `DATOS DE ENTRADA:
- Disponibilidad:
${input.availability.map((value) => `- ${value.day}: ${value.startTime} a ${value.endTime}`).join('\n')}
- Bloqueos:
${input.blocked.map((value) => `- ${value.day}: ${value.startTime} a ${value.endTime}`).join('\n')}
- Actividades:
${activityList.map((activity) => `- ${activity.label} (${activity.id}): ${activity.frequencyPerWeek} veces/semana, ${activity.durationMin} min, tier: ${activity.constraintTier}`).join('\n')}
- Perfil: ${input.userProfile.freeHoursWeekday}h/dia L-V, ${input.userProfile.freeHoursWeekend}h finde, energia: ${input.userProfile.energyLevel}.`,
  }]);

  try {
    const raw = extractFirstJsonObject(response.content);
    const parsed = JSON.parse(raw) as { events?: Array<Record<string, unknown>>; unscheduled?: Array<{ activityId: string; reason: string; suggestion_esAR: string }> };
    const validated = validateFallbackEvents(parsed.events ?? [], activityList, input);
    const unscheduled = [
      ...(Array.isArray(parsed.unscheduled) ? parsed.unscheduled : []),
      ...validated.rejected,
    ];
    const totalRequested = activityList.reduce((accumulator, activity) => accumulator + activity.frequencyPerWeek, 0);
    const fillRate = totalRequested > 0 ? validated.events.length / totalRequested : 1;

    return {
      solverOutput: {
        events: validated.events,
        unscheduled,
        metrics: {
          fillRate,
          solverTimeMs: Date.now() - startPos,
          solverStatus: 'llm_fallback',
        },
      },
      tradeoffs: [],
      qualityScore: clampScore(Math.round(fillRate * 100)),
      unscheduledCount: unscheduled.length,
      ...buildResultMetadata(input),
    };
  } catch (error) {
    console.error('[Scheduler] LLM fallback failed:', error);
    return buildUnavailableResult(input);
  }
}

export const schedulerAgent: V6Agent<SchedulerInput, ScheduleResult> = {
  name: 'scheduler',

  async execute(input: SchedulerInput, runtime: AgentRuntime): Promise<ScheduleResult> {
    try {
      const deterministicResult = await runSolver(input);

      if (
        deterministicResult.solverOutput.metrics.solverStatus === 'fallback_unavailable'
        || deterministicResult.solverOutput.metrics.fillRate < 0.05
      ) {
        console.log('[Scheduler] Solver insuficiente, activando LLM fallback...');
        return await llmScheduleFallback(runtime, input);
      }

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
    } catch (error) {
      console.error('[Scheduler] Excepcion en execute, intentando LLM fallback...', error);
      return await llmScheduleFallback(runtime, input);
    }
  },

  fallback(input: SchedulerInput): ScheduleResult {
    return scheduleCache.get(serializeInput(input)) ?? buildUnavailableResult(input);
  },
};
