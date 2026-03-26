import { describe, expect, it } from 'vitest';

import {
  calculateAdherence,
  type AdherenceTracking,
} from '../../src/lib/domain/adherence-model';
import { forecastRisk } from '../../src/lib/domain/risk-forecast';
import { packagePlan } from '../../src/lib/pipeline/v5/packager';
import { generateAdaptiveResponse } from '../../src/lib/pipeline/v5/adaptive';
import type {
  AdaptiveActivityLog,
  PackageInput,
  PlanPackage,
} from '../../src/lib/pipeline/v5/phase-io-v5';

const CREATED_AT = '2026-03-30T00:00:00.000Z';
const WEEK_START = '2026-03-30T00:00:00Z';
const TIMEZONE = 'UTC';
const GOAL_ID = 'goal-adaptive';
const ACTIVITY_ID = 'running';
const PROGRESSION_KEY = 'running';
const PLANNED_MINUTES = 40;
const LOG_DATES = [
  '2026-03-30',
  '2026-03-31',
  '2026-04-01',
  '2026-04-02',
  '2026-04-03',
  '2026-04-04',
  '2026-04-05',
] as const;

function makePlanPackage(): PlanPackage {
  const input: PackageInput = {
    goalText: 'Correr 3 veces por semana',
    goalId: GOAL_ID,
    timezone: TIMEZONE,
    weekStartDate: WEEK_START,
    classification: {
      goalType: 'RECURRENT_HABIT',
      confidence: 0.92,
      risk: 'LOW',
      extractedSignals: {
        isRecurring: true,
        hasDeliverable: false,
        hasNumericTarget: false,
        requiresSkillProgression: false,
        dependsOnThirdParties: false,
        isOpenEnded: false,
        isRelational: false,
      },
    },
    profile: {
      freeHoursWeekday: 3,
      freeHoursWeekend: 4,
      energyLevel: 'medium',
      fixedCommitments: [],
      scheduleConstraints: [],
    },
    habitProgressionKeys: [PROGRESSION_KEY],
    currentHabitStates: [
      {
        progressionKey: PROGRESSION_KEY,
        weeksActive: 4,
        level: 2,
        currentDose: {
          sessionsPerWeek: 3,
          minimumViable: {
            minutes: 15,
            description: 'Trote corto',
          },
        },
        protectedFromReset: true,
      },
    ],
    slackPolicy: {
      weeklyTimeBufferMin: 90,
      maxChurnMovesPerWeek: 3,
      frozenHorizonDays: 2,
    },
    roadmap: {
      phases: [
        {
          name: 'Base aeróbica',
          durationWeeks: 4,
          focus_esAR: 'Sostener una rutina simple sin perder aire.',
        },
      ],
      milestones: ['Completar una semana estable de running'],
    },
    finalSchedule: {
      events: [
        {
          id: 'running_s4_abcd1234',
          kind: 'time_event',
          title: 'Running suave',
          status: 'active',
          goalIds: [GOAL_ID],
          startAt: '2026-03-30T18:00:00.000Z',
          durationMin: PLANNED_MINUTES,
          rigidity: 'soft',
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        },
        {
          id: 'running_s20_efgh5678',
          kind: 'time_event',
          title: 'Running suave',
          status: 'active',
          goalIds: [GOAL_ID],
          startAt: '2026-04-01T18:00:00.000Z',
          durationMin: PLANNED_MINUTES,
          rigidity: 'soft',
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        },
        {
          id: 'running_s36_ijkl9012',
          kind: 'time_event',
          title: 'Running suave',
          status: 'active',
          goalIds: [GOAL_ID],
          startAt: '2026-04-03T18:00:00.000Z',
          durationMin: PLANNED_MINUTES,
          rigidity: 'soft',
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        },
      ],
      unscheduled: [],
      tradeoffs: [],
      metrics: {
        fillRate: 1,
        solverTimeMs: 8,
        solverStatus: 'optimal',
      },
    },
    hardFindings: [],
    softFindings: [],
    coveFindings: [],
  };

  return packagePlan(input);
}

function buildActivityLogs(tracking: AdherenceTracking): AdaptiveActivityLog[] {
  return tracking.map((value, index) => ({
    progressionKey: PROGRESSION_KEY,
    activityId: ACTIVITY_ID,
    occurredAt: `${LOG_DATES[index]}T07:00:00.000Z`,
    scheduledStartAt: `${LOG_DATES[index]}T07:00:00.000Z`,
    plannedMinutes: PLANNED_MINUTES,
    completedMinutes: value === 1 ? PLANNED_MINUTES : 0,
    outcome: value === 1 ? 'SUCCESS' : 'MISSED',
  }));
}

async function evaluateScenario(tracking: AdherenceTracking) {
  const planPackage = makePlanPackage();
  const habitState = planPackage.habitStates[0];

  if (!habitState) {
    throw new Error('Expected packagePlan to create a HabitState for recurring habits');
  }

  const adherence = calculateAdherence(tracking);
  const risk = forecastRisk(adherence, habitState);
  const adaptive = await generateAdaptiveResponse({
    package: planPackage,
    activityLogs: buildActivityLogs(tracking),
  });

  return {
    planPackage,
    habitState,
    adherence,
    risk,
    adaptive,
  };
}

describe('generateAdaptiveResponse', () => {
  it('Healthy Streak: mantiene SAFE y absorbe un tropiezo aislado', async () => {
    const { risk, adaptive } = await evaluateScenario([1, 1, 0, 1, 1, 1, 1]);

    expect(risk).toBe('SAFE');
    expect(adaptive.overallRisk).toBe('SAFE');
    expect(adaptive.mode).toBe('ABSORB');
    expect(adaptive.dispatch.rerunFromPhase).toBe('schedule');
    expect(adaptive.dispatch.relaxSoftConstraints).toBe(false);
    expect(adaptive.dispatch.maxChurnMoves).toBeLessThanOrEqual(2);
    expect(adaptive.dispatch.activityAdjustments).toEqual([]);
    expect(adaptive.assessments[0]).toEqual(
      expect.objectContaining({
        risk: 'SAFE',
        failureCount: 1,
        banalOverlap: false,
      }),
    );
  });

  it('Burnout Riesgoso: pasa a AT_RISK y habilita PARTIAL_REPAIR con MVH', async () => {
    const { planPackage, risk, adaptive } = await evaluateScenario([1, 1, 1, 1, 0, 0, 0]);
    const minimumViable = planPackage.habitStates[0]?.currentDose.minimumViable;
    const sessionMetric = planPackage.items.find(
      (item) => item.kind === 'metric' && item.metricKey === 'scheduled_sessions_per_week',
    );

    expect(sessionMetric).toBeDefined();
    expect(risk).toBe('AT_RISK');
    expect(adaptive.overallRisk).toBe('AT_RISK');
    expect(adaptive.mode).toBe('PARTIAL_REPAIR');
    expect(adaptive.dispatch.rerunFromPhase).toBe('schedule');
    expect(adaptive.dispatch.relaxSoftConstraints).toBe(true);
    expect(adaptive.dispatch.activityAdjustments).toEqual([
      expect.objectContaining({
        activityId: ACTIVITY_ID,
        originalDurationMin: PLANNED_MINUTES,
        suggestedDurationMin: minimumViable?.minutes,
        minimumViableMinutes: minimumViable?.minutes,
        minimumViableDescription: minimumViable?.description,
        relaxConstraintTierTo: 'soft_weak',
        countsMinimumViableAsSuccess: true,
      }),
    ]);
    expect(adaptive.recommendations.join(' ')).toContain(`${minimumViable?.minutes} min`);
    expect(adaptive.assessments[0]).toEqual(
      expect.objectContaining({
        risk: 'AT_RISK',
        failureCount: 3,
        partialCount: 0,
      }),
    );
  });

  it('Ghosting Completo: detecta CRITICAL y ordena REBASE', async () => {
    const { adherence, risk, adaptive } = await evaluateScenario([0, 0, 0, 0, 0, 0, 0]);

    expect(adherence.consecutiveFailures).toBe(7);
    expect(risk).toBe('CRITICAL');
    expect(adaptive.overallRisk).toBe('CRITICAL');
    expect(adaptive.mode).toBe('REBASE');
    expect(adaptive.dispatch).toEqual(
      expect.objectContaining({
        rerunFromPhase: 'strategy',
        preserveSkeleton: false,
        preserveHabitState: true,
        allowSlackRecovery: false,
        relaxSoftConstraints: false,
        maxChurnMoves: 0,
      }),
    );
    expect(adaptive.dispatch.phasesToRun).toEqual(
      expect.arrayContaining([
        'strategy',
        'template',
        'schedule',
        'hardValidate',
        'softValidate',
        'coveVerify',
        'repair',
        'package',
      ]),
    );
    expect(adaptive.dispatch.activityAdjustments).toEqual([]);
    expect(adaptive.assessments[0]).toEqual(
      expect.objectContaining({
        risk: 'CRITICAL',
        failureCount: 7,
      }),
    );
  });
});
