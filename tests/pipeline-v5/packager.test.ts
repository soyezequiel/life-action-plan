import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import { packagePlan } from '../../src/lib/pipeline/v5/packager';
import type { PackageInput } from '../../src/lib/pipeline/v5/phase-io-v5';

describe('packagePlan', () => {
  it('arma un paquete con plan rolling-wave, HabitState inicial y buffers de slack', () => {
    const createdAt = '2026-03-30T00:00:00.000Z';
    const input: PackageInput = {
      goalText: 'Correr 3 veces por semana',
      goalId: 'goal-1',
      weekStartDate: '2026-03-30T00:00:00Z',
      classification: {
        goalType: 'RECURRENT_HABIT',
        confidence: 0.9,
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
      habitProgressionKeys: ['running'],
      currentHabitStates: [
        {
          progressionKey: 'running',
          weeksActive: 4,
          level: 2,
          currentDose: {
            sessionsPerWeek: 2,
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
          { name: 'Base aeróbica', durationWeeks: 2, focus_esAR: 'Sostener frecuencia sin lesionarse.' },
          { name: 'Consolidación', durationWeeks: 2, focus_esAR: 'Subir el volumen con calma.' },
        ],
        milestones: ['Completar 2 semanas estables', 'Sostener las 3 sesiones'],
      },
      finalSchedule: {
        events: [
          {
            id: 'run-easy_s4_abcd1234',
            kind: 'time_event',
            title: 'Carrera fácil',
            status: 'active',
            goalIds: ['goal-1'],
            startAt: '2026-03-30T18:00:00.000Z',
            durationMin: 40,
            rigidity: 'soft',
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: 'run-easy_s20_efgh5678',
            kind: 'time_event',
            title: 'Carrera fácil',
            status: 'active',
            goalIds: ['goal-1'],
            startAt: '2026-04-01T18:00:00.000Z',
            durationMin: 40,
            rigidity: 'soft',
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: 'run-easy_s36_ijkl9012',
            kind: 'time_event',
            title: 'Carrera fácil',
            status: 'active',
            goalIds: ['goal-1'],
            startAt: '2026-04-03T18:00:00.000Z',
            durationMin: 40,
            rigidity: 'soft',
            createdAt,
            updatedAt: createdAt,
          },
        ],
        unscheduled: [
          {
            activityId: 'strength_auxiliary',
            reason: 'scheduled 0 of 1 sessions',
            suggestion_esAR: 'Mover una hora del finde para fuerza auxiliar.',
          },
        ],
        tradeoffs: [],
        metrics: {
          fillRate: 0.75,
          solverTimeMs: 12,
          solverStatus: 'feasible',
        },
      },
      hardFindings: [],
      softFindings: [
        {
          code: 'SV-LATE-DEEPWORK',
          severity: 'WARN',
          suggestion_esAR: 'No dejes lo mas pesado para muy tarde.',
        },
      ],
      coveFindings: [
        {
          question: 'Hay espacio para fuerza?',
          answer: 'No todo entra en la semana actual.',
          severity: 'WARN',
        },
      ],
    };

    const result = packagePlan(input);

    expect(result.plan.skeleton.horizonWeeks).toBe(12);
    expect(result.plan.detail.horizonWeeks).toBe(2);
    expect(result.plan.operational.horizonDays).toBe(7);
    expect(result.plan.detail.weeks).toHaveLength(2);
    expect(result.plan.operational.frozen).toBe(true);
    expect(result.plan.operational.totalBufferMin).toBe(90);
    expect(result.plan.operational.buffers).toHaveLength(3);
    expect(result.slackPolicy.weeklyTimeBufferMin).toBe(90);
    expect(result.habitStates).toEqual([
      expect.objectContaining({
        progressionKey: 'running',
        weeksActive: 4,
        level: 2,
        protectedFromReset: true,
      }),
    ]);
    expect(result.habitStates[0]?.currentDose.sessionsPerWeek).toBe(3);
    expect(result.summary_esAR).toContain('Correr 3 veces por semana');
    expect(result.implementationIntentions[0]).toContain('entonces hago Carrera fácil');
    expect(result.warnings).toContain('Hay actividades que no entraron en la semana y quedaron como pendientes.');
    expect(result.items.some((item) => item.kind === 'time_event')).toBe(true);
    expect(result.items.some((item) => item.kind === 'milestone')).toBe(true);
    expect(result.items.some((item) => item.kind === 'flex_task')).toBe(true);
    expect(result.items.some((item) => item.kind === 'metric')).toBe(true);

    const milestone = result.plan.skeleton.milestones[0];
    expect(milestone?.dueDate).toBe(
      DateTime.fromISO('2026-03-30T00:00:00Z', { zone: 'UTC' }).plus({ weeks: 2 }).toISODate(),
    );
  });
});
