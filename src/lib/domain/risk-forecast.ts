import { z } from 'zod';

import { AdherenceScoreSchema, type AdherenceScore } from './adherence-model';
import { HabitStateSchema, isHabitProtectedFromReset, type HabitState } from './habit-state';

export const RiskForecastSchema = z.enum(['SAFE', 'AT_RISK', 'CRITICAL']);
export type RiskForecast = z.infer<typeof RiskForecastSchema>;

export const RiskForecastConfigSchema = z.object({
  safeMeanProbabilityThreshold: z.number().min(0).max(1).default(0.7),
  safeWeeksActiveThreshold: z.number().int().min(0).default(2),
  recentDropThreshold: z.number().min(0).max(1).default(0.3),
  criticalFailureStreakThreshold: z.number().int().min(1).default(6),
}).strict();
export type RiskForecastConfig = z.infer<typeof RiskForecastConfigSchema>;
export type RiskForecastConfigInput = z.input<typeof RiskForecastConfigSchema>;

function hasStrongRecentDrop(score: AdherenceScore, threshold: number): boolean {
  return score.trend === 'DECAYING' || score.recentDropMagnitude >= threshold;
}

export function forecastRisk(
  adherenceScore: AdherenceScore,
  habitState: HabitState,
  config?: RiskForecastConfigInput,
): RiskForecast {
  const parsedScore = AdherenceScoreSchema.parse(adherenceScore);
  const parsedHabitState = HabitStateSchema.parse(habitState);
  const parsedConfig = RiskForecastConfigSchema.parse(config ?? {});

  if (parsedScore.consecutiveFailures >= parsedConfig.criticalFailureStreakThreshold) {
    return 'CRITICAL';
  }

  if (hasStrongRecentDrop(parsedScore, parsedConfig.recentDropThreshold)) {
    return 'AT_RISK';
  }

  const sustainedHabit =
    parsedHabitState.weeksActive >= parsedConfig.safeWeeksActiveThreshold ||
    isHabitProtectedFromReset(parsedHabitState);

  if (parsedScore.meanProbability > parsedConfig.safeMeanProbabilityThreshold && sustainedHabit) {
    return 'SAFE';
  }

  return 'AT_RISK';
}
