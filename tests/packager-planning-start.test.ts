import { describe, expect, it } from 'vitest';

import { packagePlan } from '../src/lib/pipeline/shared/packager';

describe('packagePlan planningStartAt', () => {
  it('anchors visible plan dates to planningStartAt instead of the technical week start', () => {
    const pkg = packagePlan({
      goalText: 'Practicar guitarra sin esperar al proximo lunes',
      goalId: 'goal-guitar',
      timezone: 'America/Argentina/Buenos_Aires',
      planningStartAt: '2026-04-01T03:00:00.000Z',
      weekStartDate: '2026-03-30T03:00:00.000Z',
      classification: {
        goalType: 'SKILL_ACQUISITION',
        confidence: 0.82,
        risk: 'LOW',
        extractedSignals: {
          isRecurring: false,
          hasDeliverable: false,
          hasNumericTarget: false,
          requiresSkillProgression: true,
          dependsOnThirdParties: false,
          isOpenEnded: false,
          isRelational: false,
        },
      },
      profile: {
        freeHoursWeekday: 2,
        freeHoursWeekend: 4,
        energyLevel: 'medium',
        fixedCommitments: [],
        scheduleConstraints: [],
      },
      roadmap: {
        phases: [
          {
            name: 'Base',
            durationWeeks: 2,
            focus_esAR: 'Practicar 30 minutos por bloque.',
          },
        ],
        milestones: ['Cerrar dos semanas seguidas'],
      },
      finalSchedule: {
        events: [
          {
            id: 'guitar-session-1',
            kind: 'time_event',
            title: 'Practica de guitarra',
            status: 'active',
            goalIds: ['goal-guitar'],
            startAt: '2026-04-01T22:00:00.000Z',
            durationMin: 45,
            rigidity: 'soft',
            createdAt: '2026-04-01T03:00:00.000Z',
            updatedAt: '2026-04-01T03:00:00.000Z',
          },
        ],
        unscheduled: [],
        metrics: {
          fillRate: 1,
          solverTimeMs: 5,
          solverStatus: 'optimal',
        },
      },
    });

    expect(pkg.plan.skeleton.phases[0]?.startDate).toBe('2026-04-01');
    expect(pkg.plan.detail.startDate).toBe('2026-04-01');
    expect(pkg.plan.operational.startDate).toBe('2026-04-01');
    expect(pkg.plan.operational.days[0]?.date).toBe('2026-04-01');
    expect(pkg.plan.skeleton.milestones[0]?.dueDate).toBe('2026-04-15');
  });
});
