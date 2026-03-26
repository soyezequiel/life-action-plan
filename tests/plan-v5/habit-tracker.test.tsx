// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { HabitState } from '../../src/lib/domain/habit-state';
import type { AdaptiveAssessment } from '../../src/lib/pipeline/v5/phase-io-v5';
import { t } from '../../src/i18n';
import { HabitTracker } from '../../components/plan-v5/HabitTracker';

function createHabitState(input: Partial<HabitState> & Pick<HabitState, 'progressionKey'>): HabitState {
  return {
    progressionKey: input.progressionKey,
    weeksActive: input.weeksActive ?? 4,
    level: input.level ?? 2,
    currentDose: input.currentDose ?? {
      sessionsPerWeek: 4,
      minimumViable: {
        minutes: 10,
        description: '10 min suaves',
      },
    },
    protectedFromReset: input.protectedFromReset ?? true,
  };
}

function createAssessment(
  progressionKey: string,
  risk: AdaptiveAssessment['risk'],
  meanProbability: number,
): AdaptiveAssessment {
  return {
    progressionKey,
    activityIds: [`${progressionKey}-1`],
    habitState: createHabitState({ progressionKey }),
    adherence: {
      alpha: 3,
      beta: 2,
      meanProbability,
      trend: risk === 'SAFE' ? 'STABLE' : 'DECAYING',
      observationCount: 4,
      successCount: risk === 'CRITICAL' ? 1 : 3,
      failureCount: risk === 'CRITICAL' ? 3 : 1,
      recentWindowDays: 3,
      recentSuccessRate: meanProbability,
      baselineSuccessRate: 0.8,
      recentDropMagnitude: risk === 'SAFE' ? 0.1 : 0.4,
      consecutiveFailures: risk === 'CRITICAL' ? 3 : 1,
    },
    risk,
    logCount: 4,
    failureCount: risk === 'CRITICAL' ? 3 : 1,
    partialCount: 0,
    overlapMinutes: 0,
    banalOverlap: false,
  };
}

describe('HabitTracker', () => {
  it('asigna tonos correctos y mantiene copy de recuperacion sin lenguaje de fracaso', () => {
    const safeState = createHabitState({ progressionKey: 'running', weeksActive: 6, level: 3 });
    const warningState = createHabitState({ progressionKey: 'guitarra', weeksActive: 3 });
    const dangerState = createHabitState({ progressionKey: 'ingles', weeksActive: 2 });

    const { container } = render(
      <HabitTracker
        habitStates={[safeState, warningState, dangerState]}
        assessments={[
          createAssessment('running', 'SAFE', 0.82),
          createAssessment('guitarra', 'AT_RISK', 0.52),
          createAssessment('ingles', 'CRITICAL', 0.22),
        ]}
      />,
    );

    const cards = screen.getAllByText(/Nivel /i).map((node) => node.closest('article'));

    expect(cards[0]?.getAttribute('data-tone')).toBe('safe');
    expect(cards[1]?.getAttribute('data-tone')).toBe('warning');
    expect(cards[2]?.getAttribute('data-tone')).toBe('danger');

    expect(screen.getByText(t('planV5.habits.safe'))).toBeTruthy();
    expect(screen.getAllByText(t('planV5.habits.lapseBanner')).length).toBe(2);
    expect(screen.getByText(t('planV5.habits.protected', { weeks: 2 }))).toBeTruthy();

    const text = container.textContent?.toLowerCase() ?? '';
    expect(text.includes('fallaste')).toBe(false);
    expect(text.includes('no cumpliste')).toBe(false);
    expect(text.includes('fracaso')).toBe(false);
  });
});
