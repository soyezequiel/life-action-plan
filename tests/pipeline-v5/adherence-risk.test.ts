import { describe, expect, it } from 'vitest';

import { calculateAdherence } from '../../src/lib/domain/adherence-model';
import type { HabitState } from '../../src/lib/domain/habit-state';
import { forecastRisk } from '../../src/lib/domain/risk-forecast';

function makeHabitState(overrides: Partial<HabitState> = {}): HabitState {
  return {
    progressionKey: 'running-base',
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
    ...overrides,
  };
}

describe('adherence and risk forecast', () => {
  it('calcula alpha, beta y meanProbability con priors Beta-Bernoulli simples', () => {
    const score = calculateAdherence([1, 1, 0, 1]);

    expect(score.alpha).toBe(4);
    expect(score.beta).toBe(2);
    expect(score.meanProbability).toBeCloseTo(4 / 6, 5);
    expect(score.trend).toBe('STABLE');
    expect(score.consecutiveFailures).toBe(0);
  });

  it('marca tendencia DECAYING cuando los ultimos 3 dias caen fuerte contra la base previa', () => {
    const score = calculateAdherence([1, 1, 1, 1, 1, 0, 0, 0]);

    expect(score.trend).toBe('DECAYING');
    expect(score.recentWindowDays).toBe(3);
    expect(score.baselineSuccessRate).toBe(1);
    expect(score.recentSuccessRate).toBe(0);
    expect(score.recentDropMagnitude).toBe(1);
  });

  it('devuelve SAFE cuando la adherencia es alta y el habito ya sobrevivio varias semanas', () => {
    const risk = forecastRisk(
      calculateAdherence([1, 1, 1, 1, 1, 1, 1]),
      makeHabitState({ weeksActive: 5, level: 3, protectedFromReset: true }),
    );

    expect(risk).toBe('SAFE');
  });

  it('devuelve AT_RISK cuando la probabilidad cae fuerte en los ultimos 3 dias', () => {
    const risk = forecastRisk(
      calculateAdherence([1, 1, 1, 1, 1, 0, 0, 0]),
      makeHabitState({ weeksActive: 3, level: 2 }),
    );

    expect(risk).toBe('AT_RISK');
  });

  it('devuelve CRITICAL con seis fallos consecutivos al final del tracking', () => {
    const risk = forecastRisk(
      calculateAdherence([1, 1, 1, 0, 0, 0, 0, 0, 0]),
      makeHabitState({ weeksActive: 6, level: 3 }),
    );

    expect(risk).toBe('CRITICAL');
  });
});
