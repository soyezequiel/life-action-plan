import { describe, expect, it } from 'vitest';

import type { GoalClassification } from '../../src/lib/domain/goal-taxonomy';
import type { HabitState } from '../../src/lib/domain/habit-state';
import { canSwap, preferEquivalenceSwaps, transferHabitStateForEquivalentSwap } from '../../src/lib/domain/equivalence';
import { runningCard } from '../../src/lib/domain/domain-knowledge/cards/running';
import type { TemplateInput, UserProfileV5 } from '../../src/lib/pipeline/v5/phase-io-v5';
import { buildTemplate } from '../../src/lib/pipeline/v5/template-builder';
import type { ActivityRequest } from '../../src/lib/scheduler/types';

const DEFAULT_PROFILE: UserProfileV5 = {
  freeHoursWeekday: 3,
  freeHoursWeekend: 4,
  energyLevel: 'medium',
  fixedCommitments: [],
  scheduleConstraints: [],
};

const RECURRENT_HABIT: GoalClassification = {
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
};

function makeActivity(overrides: Partial<ActivityRequest> & Pick<ActivityRequest, 'id' | 'label'>): ActivityRequest {
  return {
    equivalenceGroupId: `group-${overrides.id}`,
    durationMin: 45,
    frequencyPerWeek: 3,
    goalId: 'goal-equivalence',
    constraintTier: 'soft_strong',
    ...overrides,
  };
}

describe('equivalence helpers', () => {
  it('template builder propaga equivalenceGroupId desde las tareas base del dominio', () => {
    const input: TemplateInput = {
      roadmap: {
        phases: [{ name: 'Base aeróbica', durationWeeks: 2, focus_esAR: 'Sostener cardio liviano.' }],
        milestones: ['Completar la primera semana'],
      },
    };

    const template = buildTemplate(input, RECURRENT_HABIT, DEFAULT_PROFILE, runningCard);

    expect(template.activities).toHaveLength(1);
    expect(template.activities[0]?.equivalenceGroupId).toBe('cardio-outdoor-base');
  });

  it('canSwap solo habilita actividades del mismo grupo de equivalencia', () => {
    const running = makeActivity({
      id: 'run-easy',
      label: 'Correr suave',
      equivalenceGroupId: 'cardio-outdoor-base',
    });
    const bike = makeActivity({
      id: 'bike-easy',
      label: 'Bici suave',
      equivalenceGroupId: 'cardio-outdoor-base',
    });
    const strength = makeActivity({
      id: 'strength',
      label: 'Fuerza',
      equivalenceGroupId: 'gym-indoors',
    });

    expect(canSwap(running, bike)).toBe(true);
    expect(canSwap(running, strength)).toBe(false);
  });

  it('transfiere HabitState sin resetear nivel ni semanas al hacer swap equivalente', () => {
    const state: HabitState = {
      progressionKey: 'running-base',
      weeksActive: 6,
      level: 3,
      currentDose: {
        sessionsPerWeek: 3,
        minimumViable: {
          minutes: 20,
          description: 'Trote corto',
        },
      },
      protectedFromReset: true,
    };

    const transferred = transferHabitStateForEquivalentSwap(
      state,
      {
        id: 'run-easy',
        label: 'Correr suave',
        progressionKey: 'running-base',
        equivalenceGroupId: 'cardio-outdoor-base',
      },
      {
        id: 'bike-easy',
        label: 'Bici suave',
        progressionKey: 'bike-base',
        equivalenceGroupId: 'cardio-outdoor-base',
      },
    );

    expect(transferred.weeksActive).toBe(6);
    expect(transferred.level).toBe(3);
    expect(transferred.protectedFromReset).toBe(true);
    expect(transferred.progressionKey).toBe('bike-base');
  });

  it('prefiere swaps equivalentes antes de dejar actividades para replan completo', () => {
    const plan = preferEquivalenceSwaps(
      [
        makeActivity({
          id: 'run-base',
          label: 'Correr suave',
          equivalenceGroupId: 'cardio-outdoor-base',
          frequencyPerWeek: 3,
          durationMin: 40,
        }),
        makeActivity({
          id: 'strength',
          label: 'Fuerza',
          equivalenceGroupId: 'gym-indoors',
          frequencyPerWeek: 2,
          durationMin: 30,
        }),
      ],
      [
        makeActivity({
          id: 'bike-base',
          label: 'Bici suave',
          equivalenceGroupId: 'cardio-outdoor-base',
          frequencyPerWeek: 3,
          durationMin: 40,
        }),
        makeActivity({
          id: 'mobility',
          label: 'Movilidad',
          equivalenceGroupId: 'mobility-home',
          frequencyPerWeek: 2,
          durationMin: 20,
        }),
      ],
    );

    expect(plan.swaps).toEqual([
      expect.objectContaining({
        previousActivityId: 'run-base',
        nextActivityId: 'bike-base',
        equivalenceGroupId: 'cardio-outdoor-base',
        preservesFrequency: true,
        preservesDuration: true,
      }),
    ]);
    expect(plan.unmatchedPreviousActivityIds).toEqual(['strength']);
    expect(plan.unmatchedNextActivityIds).toEqual(['mobility']);
  });
});
