import { DateTime } from 'luxon';

import { mergeHabitStateForReplan, type HabitState } from '../../domain/habit-state';
import {
  V5PlanSchema,
  type OperationalBuffer,
  type OperationalDay,
  type SkeletonFrequency,
  type SkeletonPhase,
  type V5Detail,
  type V5Operational,
  type V5Plan,
  type V5Skeleton,
} from '../../domain/rolling-wave-plan';
import { SlackPolicySchema, type SlackPolicy } from '../../domain/slack-policy';
import type { FlexTaskItem, MetricItem, MilestoneItem, PlanItem, TimeEventItem } from '../../domain/plan-item';
import type {
  CoVeFinding,
  HardFinding,
  PackageInput,
  PlanPackage,
  SoftFinding,
  StrategicRoadmap,
} from './phase-io-v5';

const DETAIL_HORIZON_WEEKS = 2;
const SKELETON_HORIZON_WEEKS = 12;
const OPERATIONAL_HORIZON_DAYS = 7;
const DEFAULT_SLACK_POLICY = SlackPolicySchema.parse({
  weeklyTimeBufferMin: 120,
  maxChurnMovesPerWeek: 3,
  frozenHorizonDays: 2,
});

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function computeQualityScore(
  scheduleFillRate: number,
  hardFindings: HardFinding[],
  softFindings: SoftFinding[],
  coveFindings: CoVeFinding[],
): number {
  let score = Math.round(scheduleFillRate * 100);
  score -= hardFindings.filter((finding) => finding.severity === 'FAIL').length * 20;
  score -= softFindings.filter((finding) => finding.severity === 'WARN').length * 5;
  score -= coveFindings.filter((finding) => finding.severity === 'FAIL').length * 20;
  score -= coveFindings.filter((finding) => finding.severity === 'WARN').length * 5;
  return Math.max(0, Math.min(100, score));
}

function extractActivityId(event: TimeEventItem): string {
  const match = event.id.match(/^(.*)_s\d+(?:_.+)?$/);
  return match?.[1] ?? event.id;
}

function buildMilestones(
  roadmap: StrategicRoadmap | undefined,
  goalId: string,
  weekStartDate: string,
  timezone: string,
  createdAt: string,
): MilestoneItem[] {
  if (!roadmap) {
    return [];
  }

  const weekStart = DateTime.fromISO(weekStartDate, { zone: 'UTC' }).setZone(timezone).startOf('day');
  let accumulatedWeeks = 0;

  return roadmap.milestones.map((milestone, index) => {
    const phaseDuration = roadmap.phases[index]?.durationWeeks ?? 2;
    accumulatedWeeks += phaseDuration;
    return {
      id: `milestone-${index + 1}`,
      kind: 'milestone',
      title: milestone,
      notes: roadmap.phases[index]?.focus_esAR,
      status: 'draft',
      goalIds: [goalId],
      dueDate: weekStart.plus({ weeks: accumulatedWeeks }).toISODate() ?? weekStart.toISODate() ?? createdAt,
      createdAt,
      updatedAt: createdAt,
    };
  });
}

function buildBacklogItems(
  unscheduled: PackageInput['finalSchedule']['unscheduled'],
  goalId: string,
  createdAt: string,
): FlexTaskItem[] {
  return unscheduled.map((item, index) => ({
    id: `flex-${index + 1}-${item.activityId}`,
    kind: 'flex_task',
    title: `Resolver hueco para ${item.activityId}`,
    notes: `${item.reason}. ${item.suggestion_esAR}`,
    status: 'waiting',
    goalIds: [goalId],
    estimateMin: 30,
    createdAt,
    updatedAt: createdAt,
  }));
}

function buildMetricItems(
  qualityScore: number,
  eventCount: number,
  goalId: string,
  createdAt: string,
): MetricItem[] {
  return [
    {
      id: 'metric-plan-quality',
      kind: 'metric',
      title: 'Calidad del plan',
      status: 'active',
      goalIds: [goalId],
      metricKey: 'plan_quality_score',
      unit: 'puntos',
      direction: 'increase',
      target: {
        targetValue: Math.max(qualityScore, 85),
      },
      cadence: {
        freq: 'weekly',
        aggregation: 'last',
      },
      series: [
        {
          at: createdAt,
          value: qualityScore,
        },
      ],
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'metric-sessions-week',
      kind: 'metric',
      title: 'Sesiones completables por semana',
      status: 'active',
      goalIds: [goalId],
      metricKey: 'scheduled_sessions_per_week',
      unit: 'sesiones',
      direction: 'increase',
      target: {
        targetValue: Math.max(eventCount, 1),
      },
      cadence: {
        freq: 'weekly',
        aggregation: 'count',
      },
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

function buildImplementationIntentions(events: TimeEventItem[], timezone: string): string[] {
  const uniqueIntentions = new Map<string, string>();

  for (const event of events) {
    const start = DateTime.fromISO(event.startAt, { zone: 'UTC' }).setZone(timezone);
    const key = `${event.title}-${start.weekday}-${start.toFormat('HH:mm')}`;
    if (uniqueIntentions.has(key)) {
      continue;
    }

    uniqueIntentions.set(
      key,
      `Si llega ${start.setLocale('es').toFormat("cccc 'a las' HH:mm")}, entonces hago ${event.title} durante ${event.durationMin} minutos.`,
    );

    if (uniqueIntentions.size >= 4) {
      break;
    }
  }

  if (uniqueIntentions.size === 0) {
    uniqueIntentions.set(
      'fallback',
      'Si mi semana se complica, entonces reservo aunque sea un bloque corto para no cortar el envion.',
    );
  }

  return Array.from(uniqueIntentions.values());
}

function buildWarnings(
  input: PackageInput,
): string[] {
  const warnings = new Set<string>();

  if ((input.finalSchedule.unscheduled?.length ?? 0) > 0) {
    warnings.add('Hay actividades que no entraron en la semana y quedaron como pendientes.');
  }

  for (const finding of input.hardFindings ?? []) {
    warnings.add(finding.description);
  }

  for (const finding of input.coveFindings ?? []) {
    if (finding.severity === 'FAIL' || finding.severity === 'WARN') {
      warnings.add(finding.answer);
    }
  }

  if ((input.repairSummary?.patchesApplied.length ?? 0) > 0) {
    warnings.add('El plan tuvo reparaciones automaticas; conviene revisarlo rapido antes de arrancar.');
  }

  if (input.repairSummary?.status === 'fixed') {
    warnings.add('El plan pasó por una reparación automática y conviene revisarlo rápido antes de empezar.');
  }

  return Array.from(warnings);
}

function buildSummary(
  goalText: string | undefined,
  eventCount: number,
  roadmap: StrategicRoadmap | undefined,
  qualityScore: number,
  warningCount: number,
): string {
  const phasesText = roadmap?.phases.length
    ? ` Lo organizamos en ${roadmap.phases.length} etapas para que no quieras hacer todo de golpe.`
    : '';
  const warningsText = warningCount > 0
    ? ` Ojo: hay ${warningCount} advertencia${warningCount === 1 ? '' : 's'} para mirar con calma.`
    : '';

  return `Este plan convierte${goalText ? ` "${goalText}"` : ' tu objetivo'} en ${eventCount} bloques concretos para esta semana.${phasesText} El puntaje de calidad actual es ${qualityScore}/100.${warningsText}`;
}

function buildFrequencies(events: TimeEventItem[]): SkeletonFrequency[] {
  const grouped = new Map<string, SkeletonFrequency>();

  for (const event of events) {
    const activityId = extractActivityId(event);
    const existing = grouped.get(activityId);
    if (existing) {
      existing.sessionsPerWeek += 1;
      continue;
    }

    grouped.set(activityId, {
      activityId,
      title: event.title,
      sessionsPerWeek: 1,
      minutesPerSession: event.durationMin,
    });
  }

  return Array.from(grouped.values()).sort((left, right) => left.title.localeCompare(right.title));
}

function createFallbackPhase(
  goalIds: string[],
  goalText: string | undefined,
  weekStart: DateTime,
  frequencies: SkeletonFrequency[],
  milestoneIds: string[],
): SkeletonPhase {
  return {
    phaseId: 'phase-1',
    title: goalText ?? 'Plan base',
    startWeek: 1,
    endWeek: SKELETON_HORIZON_WEEKS,
    startDate: weekStart.toISODate() ?? '',
    endDate: weekStart.plus({ weeks: SKELETON_HORIZON_WEEKS }).minus({ days: 1 }).toISODate() ?? '',
    goalIds,
    objectives: [goalText ?? 'Sostener una progresion simple y util.'],
    frequencies,
    milestoneIds,
  };
}

function buildSkeleton(
  roadmap: StrategicRoadmap | undefined,
  goalIds: string[],
  goalText: string | undefined,
  weekStartDate: string,
  timezone: string,
  milestones: MilestoneItem[],
  events: TimeEventItem[],
): V5Skeleton {
  const weekStart = DateTime.fromISO(weekStartDate, { zone: 'UTC' }).setZone(timezone).startOf('day');
  const frequencies = buildFrequencies(events);

  if (!roadmap || roadmap.phases.length === 0) {
    return {
      horizonWeeks: 12,
      goalIds,
      phases: [createFallbackPhase(goalIds, goalText, weekStart, frequencies, milestones.map((item) => item.id))],
      milestones,
    };
  }

  const phases: SkeletonPhase[] = [];
  let cursorWeek = 1;

  for (let index = 0; index < roadmap.phases.length && cursorWeek <= SKELETON_HORIZON_WEEKS; index += 1) {
    const phase = roadmap.phases[index];
    const requestedDuration = Math.max(1, Math.min(phase.durationWeeks ?? 2, SKELETON_HORIZON_WEEKS));
    const lastPhase = index === roadmap.phases.length - 1;
    const endWeek = lastPhase
      ? SKELETON_HORIZON_WEEKS
      : Math.min(SKELETON_HORIZON_WEEKS, cursorWeek + requestedDuration - 1);
    const startDate = weekStart.plus({ weeks: cursorWeek - 1 }).toISODate() ?? '';
    const endDate = weekStart.plus({ weeks: endWeek }).minus({ days: 1 }).toISODate() ?? '';
    const milestoneIds = milestones
      .filter((milestone) => {
        const due = DateTime.fromISO(milestone.dueDate, { zone: timezone });
        return due >= weekStart.plus({ weeks: cursorWeek - 1 }) && due <= weekStart.plus({ weeks: endWeek }).minus({ days: 1 });
      })
      .map((milestone) => milestone.id);

    phases.push({
      phaseId: `phase-${index + 1}`,
      title: phase.name,
      startWeek: cursorWeek,
      endWeek,
      startDate,
      endDate,
      goalIds,
      objectives: [phase.focus_esAR],
      frequencies,
      milestoneIds,
    });

    cursorWeek = endWeek + 1;
  }

  if (phases.length === 0) {
    phases.push(createFallbackPhase(goalIds, goalText, weekStart, frequencies, milestones.map((item) => item.id)));
  }

  return {
    horizonWeeks: 12,
    goalIds,
    phases,
    milestones,
  };
}

function shiftEventByWeeks(event: TimeEventItem, weeks: number): TimeEventItem {
  if (weeks === 0) {
    return event;
  }

  const shiftedStart = DateTime.fromISO(event.startAt, { zone: 'UTC' }).plus({ weeks }).toISO() ?? event.startAt;
  return {
    ...event,
    id: `${event.id}-w${weeks + 1}`,
    startAt: shiftedStart,
  };
}

function buildDetail(events: TimeEventItem[], weekStartDate: string, timezone: string): V5Detail {
  const weekStart = DateTime.fromISO(weekStartDate, { zone: 'UTC' }).setZone(timezone).startOf('day');
  const weeks = Array.from({ length: DETAIL_HORIZON_WEEKS }, (_, index) => {
    const scheduledEvents = events
      .map((event) => shiftEventByWeeks(event, index))
      .sort((left, right) =>
        DateTime.fromISO(left.startAt, { zone: 'UTC' }).toMillis() -
        DateTime.fromISO(right.startAt, { zone: 'UTC' }).toMillis(),
      );

    return {
      weekIndex: index + 1,
      startDate: weekStart.plus({ weeks: index }).toISODate() ?? '',
      endDate: weekStart.plus({ weeks: index + 1 }).minus({ days: 1 }).toISODate() ?? '',
      scheduledEvents,
    };
  });

  return {
    horizonWeeks: DETAIL_HORIZON_WEEKS,
    startDate: weekStart.toISODate() ?? '',
    endDate: weekStart.plus({ weeks: DETAIL_HORIZON_WEEKS }).minus({ days: 1 }).toISODate() ?? '',
    scheduledEvents: weeks.flatMap((week) => week.scheduledEvents),
    weeks,
  };
}

function buildOperationalBuffers(
  events: TimeEventItem[],
  weekStartDate: string,
  timezone: string,
  slackPolicy: SlackPolicy,
): OperationalBuffer[] {
  const weekStart = DateTime.fromISO(weekStartDate, { zone: 'UTC' }).setZone(timezone).startOf('day');
  const buffers: OperationalBuffer[] = [];
  const candidateDays = Array.from({ length: OPERATIONAL_HORIZON_DAYS }, (_, index) => {
    const dayStart = weekStart.plus({ days: index });
    const date = dayStart.toISODate() ?? '';
    const dayEvents = events.filter((event) =>
      DateTime.fromISO(event.startAt, { zone: 'UTC' }).setZone(timezone).toISODate() === date,
    );

    return {
      index,
      dayStart,
      dayEvents,
    };
  });

  candidateDays.sort((left, right) => {
    const scheduledDelta = Number(right.dayEvents.length > 0) - Number(left.dayEvents.length > 0);
    return scheduledDelta !== 0 ? scheduledDelta : left.index - right.index;
  });

  const allocatedPerDay = new Map<number, number>();
  let remaining = slackPolicy.weeklyTimeBufferMin;

  while (remaining > 0 && candidateDays.length > 0) {
    const chunk = Math.min(30, remaining);
    const bucket = candidateDays[buffers.length % candidateDays.length];
    const currentAllocated = allocatedPerDay.get(bucket.index) ?? 0;
    const lastEventEnd = bucket.dayEvents.reduce((latest, event) => {
      const eventEnd = DateTime.fromISO(event.startAt, { zone: 'UTC' }).plus({ minutes: event.durationMin });
      const eventEndLocal = eventEnd.setZone(timezone);
      return eventEndLocal > latest ? eventEndLocal : latest;
    }, bucket.dayStart.plus({ hours: 18 }));
    const startAt = lastEventEnd.plus({ minutes: currentAllocated }).toUTC().toISO()
      ?? bucket.dayStart.toUTC().toISO()
      ?? '';

    buffers.push({
      id: `buffer-slack-${bucket.index + 1}-${Math.floor(currentAllocated / 30) + 1}`,
      startAt,
      durationMin: chunk,
      kind: 'slack',
      label: 'Margen libre para absorber imprevistos',
    });

    allocatedPerDay.set(bucket.index, currentAllocated + chunk);
    remaining -= chunk;
  }

  return buffers.sort((left, right) =>
    DateTime.fromISO(left.startAt, { zone: 'UTC' }).toMillis() -
    DateTime.fromISO(right.startAt, { zone: 'UTC' }).toMillis(),
  );
}

function buildOperationalDays(
  events: TimeEventItem[],
  buffers: OperationalBuffer[],
  weekStartDate: string,
  timezone: string,
): OperationalDay[] {
  const weekStart = DateTime.fromISO(weekStartDate, { zone: 'UTC' }).setZone(timezone).startOf('day');

  return Array.from({ length: OPERATIONAL_HORIZON_DAYS }, (_, index) => {
    const date = weekStart.plus({ days: index }).toISODate() ?? '';
    return {
      date,
      scheduledEvents: events.filter((event) =>
        DateTime.fromISO(event.startAt, { zone: 'UTC' }).setZone(timezone).toISODate() === date,
      ),
      buffers: buffers.filter((buffer) =>
        DateTime.fromISO(buffer.startAt, { zone: 'UTC' }).setZone(timezone).toISODate() === date,
      ),
    };
  });
}

function buildOperational(
  events: TimeEventItem[],
  weekStartDate: string,
  timezone: string,
  slackPolicy: SlackPolicy,
): V5Operational {
  const weekStart = DateTime.fromISO(weekStartDate, { zone: 'UTC' }).setZone(timezone).startOf('day');
  const buffers = buildOperationalBuffers(events, weekStartDate, timezone, slackPolicy);
  return {
    horizonDays: 7,
    startDate: weekStart.toISODate() ?? '',
    endDate: weekStart.plus({ days: OPERATIONAL_HORIZON_DAYS - 1 }).toISODate() ?? '',
    frozen: true,
    scheduledEvents: events,
    buffers,
    days: buildOperationalDays(events, buffers, weekStartDate, timezone),
    totalBufferMin: buffers.reduce((total, buffer) => total + buffer.durationMin, 0),
  };
}

function supportsHabitState(input: PackageInput): boolean {
  if (!input.classification) {
    return false;
  }

  if (input.classification.extractedSignals.isRecurring || input.classification.extractedSignals.requiresSkillProgression) {
    return true;
  }

  return input.classification.goalType === 'QUANT_TARGET_TRACKING' || input.classification.goalType === 'IDENTITY_EXPLORATION';
}

function buildMinimumViableMinutes(
  baseDurationMin: number,
  energyLevel: 'low' | 'medium' | 'high' | undefined,
): number {
  const factor = energyLevel === 'low'
    ? 0.25
    : energyLevel === 'high'
      ? 0.5
      : 1 / 3;
  return Math.max(5, Math.min(baseDurationMin, Math.ceil((baseDurationMin * factor) / 5) * 5));
}

function resolveHabitProgressionKeys(input: PackageInput): string[] {
  if ((input.habitProgressionKeys?.length ?? 0) > 0) {
    return Array.from(new Set(input.habitProgressionKeys));
  }

  const fallback = slugify(input.goalId ?? input.goalText ?? input.classification?.goalType ?? '');
  return fallback ? [fallback] : [];
}

function buildHabitStates(
  input: PackageInput,
  timeEvents: TimeEventItem[],
): HabitState[] {
  if (!supportsHabitState(input)) {
    return [];
  }

  const progressionKeys = resolveHabitProgressionKeys(input);
  if (progressionKeys.length === 0) {
    return [];
  }

  const shortestEvent = timeEvents.reduce<TimeEventItem | null>((shortest, event) => {
    if (!shortest || event.durationMin < shortest.durationMin) {
      return event;
    }
    return shortest;
  }, null);
  const baseDurationMin = shortestEvent?.durationMin ?? 30;
  const minimumViableMinutes = buildMinimumViableMinutes(baseDurationMin, input.profile?.energyLevel);
  const minimumViableDescription = shortestEvent
    ? `Version minima de ${shortestEvent.title}`
    : input.goalText
      ? `Version minima de ${input.goalText}`
      : 'Version minima para sostener el habito';
  const sessionsPerWeek = Math.max(timeEvents.length, 1);
  const previousByKey = new Map((input.currentHabitStates ?? []).map((state) => [state.progressionKey, state]));

  return progressionKeys.map((progressionKey) =>
    mergeHabitStateForReplan(
      {
        progressionKey,
        weeksActive: 0,
        level: 0,
        currentDose: {
          sessionsPerWeek,
          minimumViable: {
            minutes: minimumViableMinutes,
            description: minimumViableDescription,
          },
        },
        protectedFromReset: false,
      },
      previousByKey.get(progressionKey),
    ),
  );
}

function buildPlan(
  input: PackageInput,
  goalIds: string[],
  milestones: MilestoneItem[],
  timeEvents: TimeEventItem[],
  createdAt: string,
  updatedAt: string,
  weekStartDate: string,
  slackPolicy: SlackPolicy,
): V5Plan {
  return V5PlanSchema.parse({
    goalIds,
    timezone: input.timezone,
    createdAt,
    updatedAt,
    skeleton: buildSkeleton(input.roadmap, goalIds, input.goalText, weekStartDate, input.timezone, milestones, timeEvents),
    detail: buildDetail(timeEvents, weekStartDate, input.timezone),
    operational: buildOperational(timeEvents, weekStartDate, input.timezone, slackPolicy),
  });
}

export function packagePlan(input: PackageInput): PlanPackage {
  const createdAt = input.finalSchedule.events[0]?.createdAt ?? DateTime.utc().toISO() ?? '';
  const updatedAt = input.finalSchedule.events[0]?.updatedAt ?? createdAt;
  const goalId = input.goalId ?? input.finalSchedule.events[0]?.goalIds[0] ?? 'goal-v5';
  const goalIds = Array.from(new Set(input.finalSchedule.events.flatMap((event) => event.goalIds)));
  if (goalIds.length === 0) {
    goalIds.push(goalId);
  }
  const weekStartDate = input.weekStartDate ?? input.finalSchedule.events[0]?.startAt ?? createdAt;
  const hardFindings = input.hardFindings ?? [];
  const softFindings = input.softFindings ?? [];
  const coveFindings = input.coveFindings ?? [];
  const slackPolicy = SlackPolicySchema.parse(input.slackPolicy ?? DEFAULT_SLACK_POLICY);

  const timeEvents = [...input.finalSchedule.events].sort((left, right) =>
    DateTime.fromISO(left.startAt, { zone: 'UTC' }).toMillis() -
    DateTime.fromISO(right.startAt, { zone: 'UTC' }).toMillis(),
  );

  const qualityScore = computeQualityScore(input.finalSchedule.metrics.fillRate, hardFindings, softFindings, coveFindings);

  const implementationIntentions = buildImplementationIntentions(timeEvents, input.timezone);
  const warnings = buildWarnings(input);
  const milestones = buildMilestones(input.roadmap, goalId, weekStartDate, input.timezone, createdAt);
  const items: PlanItem[] = [
    ...timeEvents,
    ...milestones,
    ...buildBacklogItems(input.finalSchedule.unscheduled, goalId, createdAt),
    ...buildMetricItems(qualityScore, timeEvents.length, goalId, createdAt),
  ];
  const habitStates = buildHabitStates(input, timeEvents);
  const plan = buildPlan(input, goalIds, milestones, timeEvents, createdAt, updatedAt, weekStartDate, slackPolicy);

  return {
    plan,
    items,
    habitStates,
    slackPolicy,
    timezone: input.timezone,
    summary_esAR: buildSummary(input.goalText, timeEvents.length, input.roadmap, qualityScore, warnings.length),
    qualityScore,
    implementationIntentions,
    warnings,
    tradeoffs: input.finalSchedule.tradeoffs ?? [],
  };
}
