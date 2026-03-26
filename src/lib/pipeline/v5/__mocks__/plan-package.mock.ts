import { DateTime } from 'luxon';

import type { TimeEventItem, MilestoneItem, MetricItem, PlanItem } from '../../../domain/plan-item';
import { generateAdaptiveResponse } from '../adaptive';
import { packagePlan } from '../packager';
import type {
  AdaptiveActivityLog,
  AdaptiveOutput,
  PackageInput,
  PlanPackage,
} from '../phase-io-v5';

const MOCK_WEEK_START = '2026-03-30T03:00:00Z';
const MOCK_TIMEZONE = 'America/Argentina/Buenos_Aires';
const CREATED_AT = '2026-03-30T00:00:00.000Z';
const GOAL_RUNNING = 'goal-running';
const GOAL_GUITAR = 'goal-guitar';
const GOAL_ENGLISH = 'goal-english';

const cachedPackages = new Map<string, PlanPackage>();
const cachedAdaptive = new Map<string, Promise<AdaptiveOutput>>();

function makeTimeEvent(input: {
  id: string;
  title: string;
  goalIds: string[];
  startAt: string;
  durationMin: number;
  rigidity?: 'hard' | 'soft';
}): TimeEventItem {
  return {
    id: input.id,
    kind: 'time_event',
    title: input.title,
    status: 'active',
    goalIds: input.goalIds,
    startAt: input.startAt,
    durationMin: input.durationMin,
    rigidity: input.rigidity ?? 'soft',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function createBasePackage(planId: string): PlanPackage {
  const input: PackageInput = {
    goalText: 'Correr, practicar guitarra y sostener ingles sin desbordar la semana',
    goalId: planId,
    timezone: MOCK_TIMEZONE,
    weekStartDate: MOCK_WEEK_START,
    classification: {
      goalType: 'RECURRENT_HABIT',
      confidence: 0.91,
      risk: 'LOW',
      extractedSignals: {
        isRecurring: true,
        hasDeliverable: false,
        hasNumericTarget: false,
        requiresSkillProgression: true,
        dependsOnThirdParties: false,
        isOpenEnded: false,
        isRelational: false,
      },
    },
    profile: {
      freeHoursWeekday: 3,
      freeHoursWeekend: 5,
      energyLevel: 'medium',
      fixedCommitments: ['Trabajo de 9 a 18'],
      scheduleConstraints: ['Evitar trasnochar'],
    },
    habitProgressionKeys: ['running', 'guitarra'],
    currentHabitStates: [
      {
        progressionKey: 'running',
        weeksActive: 6,
        level: 3,
        currentDose: {
          sessionsPerWeek: 4,
          minimumViable: {
            minutes: 15,
            description: '15 min de trote suave',
          },
        },
        protectedFromReset: true,
      },
      {
        progressionKey: 'guitarra',
        weeksActive: 3,
        level: 2,
        currentDose: {
          sessionsPerWeek: 3,
          minimumViable: {
            minutes: 10,
            description: '10 min con acordes faciles',
          },
        },
        protectedFromReset: true,
      },
    ],
    slackPolicy: {
      weeklyTimeBufferMin: 120,
      maxChurnMovesPerWeek: 3,
      frozenHorizonDays: 2,
    },
    roadmap: {
      phases: [
        {
          name: 'Base de energia',
          durationWeeks: 4,
          focus_esAR: 'Sostener la semana con bloques cortos y repetibles.',
        },
        {
          name: 'Consolidacion',
          durationWeeks: 4,
          focus_esAR: 'Aumentar constancia sin sumar mas ruido.',
        },
        {
          name: 'Despegue',
          durationWeeks: 4,
          focus_esAR: 'Cerrar la etapa con ritmo parejo y margen de recuperacion.',
        },
      ],
      milestones: [
        'Cerrar dos semanas seguidas con aire',
        'Llegar a una semana con running y guitarra estables',
        'Mantener ingles sin pelearle al cansancio',
      ],
    },
    finalSchedule: {
      events: [
        makeTimeEvent({
          id: 'run-easy_s01',
          title: 'Running suave',
          goalIds: [GOAL_RUNNING],
          startAt: '2026-03-30T07:00:00.000Z',
          durationMin: 40,
        }),
        makeTimeEvent({
          id: 'guitar-practice_s02',
          title: 'Practica de guitarra',
          goalIds: [GOAL_GUITAR],
          startAt: '2026-03-30T19:00:00.000Z',
          durationMin: 45,
        }),
        makeTimeEvent({
          id: 'english-focus_s03',
          title: 'Ingles conversado',
          goalIds: [GOAL_ENGLISH],
          startAt: '2026-03-31T20:00:00.000Z',
          durationMin: 35,
        }),
        makeTimeEvent({
          id: 'run-intervals_s04',
          title: 'Running con cambios de ritmo',
          goalIds: [GOAL_RUNNING],
          startAt: '2026-04-01T07:00:00.000Z',
          durationMin: 45,
        }),
        makeTimeEvent({
          id: 'guitar-practice_s05',
          title: 'Practica de guitarra',
          goalIds: [GOAL_GUITAR],
          startAt: '2026-04-01T19:30:00.000Z',
          durationMin: 40,
        }),
        makeTimeEvent({
          id: 'english-review_s06',
          title: 'Repaso de ingles',
          goalIds: [GOAL_ENGLISH],
          startAt: '2026-04-02T19:30:00.000Z',
          durationMin: 30,
        }),
        makeTimeEvent({
          id: 'run-easy_s07',
          title: 'Running suave',
          goalIds: [GOAL_RUNNING],
          startAt: '2026-04-03T07:15:00.000Z',
          durationMin: 40,
        }),
        makeTimeEvent({
          id: 'guitar-repertoire_s08',
          title: 'Repertorio en guitarra',
          goalIds: [GOAL_GUITAR],
          startAt: '2026-04-04T10:30:00.000Z',
          durationMin: 50,
        }),
        makeTimeEvent({
          id: 'run-long_s09',
          title: 'Running largo',
          goalIds: [GOAL_RUNNING],
          startAt: '2026-04-05T09:30:00.000Z',
          durationMin: 60,
        }),
        makeTimeEvent({
          id: 'english-reflection_s10',
          title: 'Ingles con audio corto',
          goalIds: [GOAL_ENGLISH],
          startAt: '2026-04-05T18:00:00.000Z',
          durationMin: 30,
        }),
      ],
      unscheduled: [],
      tradeoffs: [
        {
          planA: {
            description_esAR: 'Mantener las 4 sesiones de running y dejar ingles mas liviano esta semana.',
          },
          planB: {
            description_esAR: 'Bajar running a 3 sesiones y sostener una practica corta de ingles el viernes.',
          },
          question_esAR: 'Preferis priorizar el running completo o repartir mejor la energia con ingles?',
        },
      ],
      metrics: {
        fillRate: 0.92,
        solverTimeMs: 18,
        solverStatus: 'optimal',
      },
    },
    hardFindings: [],
    softFindings: [
      {
        code: 'SV-LATE-DEEPWORK',
        severity: 'WARN',
        suggestion_esAR: 'El jueves conviene dejar una noche mas liviana para llegar mejor al cierre de semana.',
      },
    ],
    coveFindings: [
      {
        code: 'COVE-DISTRIBUTION',
        question: 'Hay demasiado peso en los ultimos dias?',
        answer: 'El cierre de semana necesita un poco mas de aire para no sentirse pesado.',
        severity: 'WARN',
        groundedByFacts: true,
        supportingFacts: ['maxSessionsPerDay=2'],
      },
    ],
  };

  const pkg = packagePlan(input);
  const milestones = pkg.plan.skeleton.milestones.map((milestone, index) => ({
    ...milestone,
    status: index === 0 ? 'done' : index === 1 ? 'active' : 'waiting',
  })) as MilestoneItem[];
  const items = pkg.items.map((item) => {
    if (item.kind !== 'milestone') {
      return item;
    }

    const milestone = milestones.find((candidate) => candidate.id === item.id);
    return milestone ?? item;
  });
  const metricOverrides = new Map<string, MetricItem>([
    [
      'metric-plan-quality',
      {
        id: 'metric-plan-quality',
        kind: 'metric',
        title: 'Calidad del plan',
        status: 'active',
        goalIds: [planId],
        metricKey: 'plan_quality_score',
        unit: 'puntos',
        direction: 'increase',
        target: { targetValue: 85 },
        series: [
          { at: CREATED_AT, value: 78 },
        ],
        cadence: {
          freq: 'weekly',
          aggregation: 'last',
        },
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
    ],
    [
      'metric-sessions-week',
      {
        id: 'metric-sessions-week',
        kind: 'metric',
        title: 'Sesiones completables por semana',
        status: 'active',
        goalIds: [planId],
        metricKey: 'scheduled_sessions_per_week',
        unit: 'sesiones',
        direction: 'increase',
        target: { targetValue: 10 },
        series: [
          { at: CREATED_AT, value: 8 },
        ],
        cadence: {
          freq: 'weekly',
          aggregation: 'count',
        },
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
    ],
  ]);
  const normalizedItems = items.map((item) => {
    if (item.kind !== 'metric') {
      return item;
    }

    return metricOverrides.get(item.id) ?? item;
  });

  return {
    ...pkg,
    items: normalizedItems as PlanItem[],
    habitStates: [
      {
        progressionKey: 'running',
        weeksActive: 6,
        level: 3,
        currentDose: {
          sessionsPerWeek: 4,
          minimumViable: {
            minutes: 15,
            description: '15 min de trote suave',
          },
        },
        protectedFromReset: true,
      },
      {
        progressionKey: 'guitarra',
        weeksActive: 3,
        level: 2,
        currentDose: {
          sessionsPerWeek: 3,
          minimumViable: {
            minutes: 10,
            description: '10 min con acordes faciles',
          },
        },
        protectedFromReset: true,
      },
    ],
    plan: {
      ...pkg.plan,
      goalIds: [GOAL_RUNNING, GOAL_GUITAR, GOAL_ENGLISH],
      skeleton: {
        ...pkg.plan.skeleton,
        goalIds: [GOAL_RUNNING, GOAL_GUITAR, GOAL_ENGLISH],
        milestones,
      },
    },
    summary_esAR: 'Tu semana ya tiene un ritmo claro para correr, practicar guitarra y sostener ingles sin vivir apagando incendios.',
    warnings: [
      ...pkg.warnings,
      'Hay una decision pendiente para repartir mejor la energia entre running e ingles.',
    ],
    tradeoffs: input.finalSchedule.tradeoffs ?? [],
  };
}

function buildActivityLogs(): AdaptiveActivityLog[] {
  const start = DateTime.fromISO(MOCK_WEEK_START, { zone: 'UTC' }).startOf('day');
  const runningPattern = [1, 1, 1, 1, 1, 1, 0] as const;
  const guitarPattern = [1, 1, 1, 1, 0, 0, 0] as const;

  const runningLogs = runningPattern.map((value, index) => {
    const day = start.plus({ days: index });
    return {
      progressionKey: 'running',
      activityId: index === 5 ? 'run-long' : 'run-easy',
      occurredAt: day.set({ hour: 7, minute: 0 }).toISO() ?? CREATED_AT,
      scheduledStartAt: day.set({ hour: 7, minute: 0 }).toISO() ?? CREATED_AT,
      plannedMinutes: value === 1 ? 40 : 40,
      completedMinutes: value === 1 ? 40 : 0,
      outcome: value === 1 ? 'SUCCESS' : 'MISSED',
    } satisfies AdaptiveActivityLog;
  });
  const guitarLogs = guitarPattern.map((value, index) => {
    const day = start.plus({ days: index });
    return {
      progressionKey: 'guitarra',
      activityId: index >= 4 ? 'guitar-practice' : 'guitar-repertoire',
      occurredAt: day.set({ hour: 19, minute: 0 }).toISO() ?? CREATED_AT,
      scheduledStartAt: day.set({ hour: 19, minute: 0 }).toISO() ?? CREATED_AT,
      plannedMinutes: 40,
      completedMinutes: value === 1 ? 40 : 0,
      outcome: value === 1 ? 'SUCCESS' : 'MISSED',
    } satisfies AdaptiveActivityLog;
  });

  return [...runningLogs, ...guitarLogs];
}

function stripTradeoffs(pkg: PlanPackage): PlanPackage {
  const { tradeoffs, ...rest } = pkg;
  void tradeoffs;
  return rest;
}

export function getPlanPackageMock(planId = 'plan-v5-mock'): PlanPackage {
  const cached = cachedPackages.get(planId);
  if (cached) {
    return cached;
  }

  const pkg = createBasePackage(planId);
  cachedPackages.set(planId, pkg);
  return pkg;
}

export async function getAdaptiveOutputMock(planId = 'plan-v5-mock'): Promise<AdaptiveOutput> {
  const cached = cachedAdaptive.get(planId);
  if (cached) {
    return cached;
  }

  const next = generateAdaptiveResponse({
    package: stripTradeoffs(getPlanPackageMock(planId)),
    activityLogs: buildActivityLogs(),
    anchorAt: DateTime.fromISO(MOCK_WEEK_START, { zone: 'UTC' }).plus({ days: 6, hours: 21 }).toISO() ?? CREATED_AT,
  });
  cachedAdaptive.set(planId, next);
  return next;
}
