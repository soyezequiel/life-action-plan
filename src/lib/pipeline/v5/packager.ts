import { DateTime } from 'luxon';

import type {
  CoVeFinding,
  HardFinding,
  PackageInput,
  PlanPackage,
  SoftFinding,
  StrategicRoadmap,
} from './phase-io-v5';
import type { FlexTaskItem, MetricItem, MilestoneItem, PlanItem, TimeEventItem } from '../../domain/plan-item';

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

function buildMilestones(
  roadmap: StrategicRoadmap | undefined,
  goalId: string,
  weekStartDate: string,
  createdAt: string,
): MilestoneItem[] {
  if (!roadmap) {
    return [];
  }

  const weekStart = DateTime.fromISO(weekStartDate, { zone: 'UTC' });
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

function buildImplementationIntentions(events: TimeEventItem[]): string[] {
  const uniqueIntentions = new Map<string, string>();

  for (const event of events) {
    const start = DateTime.fromISO(event.startAt, { zone: 'UTC' });
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
  qualityScore: number,
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

  if (qualityScore < 70) {
    warnings.add('El plan es usable, pero viene con compromisos reales entre carga, descanso y disponibilidad.');
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

export function packagePlan(input: PackageInput): PlanPackage {
  const createdAt = input.finalSchedule.events[0]?.createdAt ?? DateTime.utc().toISO() ?? '';
  const goalId = input.goalId ?? input.finalSchedule.events[0]?.goalIds[0] ?? 'goal-v5';
  const weekStartDate = input.weekStartDate ?? input.finalSchedule.events[0]?.startAt ?? createdAt;
  const hardFindings = input.hardFindings ?? [];
  const softFindings = input.softFindings ?? [];
  const coveFindings = input.coveFindings ?? [];

  const timeEvents = [...input.finalSchedule.events].sort((left, right) =>
    DateTime.fromISO(left.startAt, { zone: 'UTC' }).toMillis() -
    DateTime.fromISO(right.startAt, { zone: 'UTC' }).toMillis(),
  );

  const qualityScore = input.repairSummary?.scoreAfter ??
    computeQualityScore(input.finalSchedule.metrics.fillRate, hardFindings, softFindings, coveFindings);

  const implementationIntentions = buildImplementationIntentions(timeEvents);
  const warnings = buildWarnings(input, qualityScore);

  const items: PlanItem[] = [
    ...timeEvents,
    ...buildMilestones(input.roadmap, goalId, weekStartDate, createdAt),
    ...buildBacklogItems(input.finalSchedule.unscheduled, goalId, createdAt),
    ...buildMetricItems(qualityScore, timeEvents.length, goalId, createdAt),
  ];

  return {
    items,
    summary_esAR: buildSummary(input.goalText, timeEvents.length, input.roadmap, qualityScore, warnings.length),
    qualityScore,
    implementationIntentions,
    warnings,
  };
}
