import { z } from 'zod';

export const AdherenceTrackingDaySchema = z.union([z.literal(0), z.literal(1)]);
export type AdherenceTrackingDay = z.infer<typeof AdherenceTrackingDaySchema>;

export const AdherenceTrackingSchema = z.array(AdherenceTrackingDaySchema);
export type AdherenceTracking = z.infer<typeof AdherenceTrackingSchema>;

export const AdherenceTrendSchema = z.enum(['STABLE', 'DECAYING']);
export type AdherenceTrend = z.infer<typeof AdherenceTrendSchema>;

export const AdherenceModelConfigSchema = z.object({
  priorsSuccess: z.number().positive().default(1),
  priorsFail: z.number().positive().default(1),
  trendWindowDays: z.number().int().min(1).default(3),
  decayThreshold: z.number().min(0).max(1).default(0.25),
}).strict();
export type AdherenceModelConfig = z.infer<typeof AdherenceModelConfigSchema>;
export type AdherenceModelConfigInput = z.input<typeof AdherenceModelConfigSchema>;

export const AdherenceScoreSchema = z.object({
  alpha: z.number().positive(),
  beta: z.number().positive(),
  meanProbability: z.number().min(0).max(1),
  trend: AdherenceTrendSchema,
  observationCount: z.number().int().min(0),
  successCount: z.number().int().min(0),
  failureCount: z.number().int().min(0),
  recentWindowDays: z.number().int().min(0),
  recentSuccessRate: z.number().min(0).max(1),
  baselineSuccessRate: z.number().min(0).max(1),
  recentDropMagnitude: z.number().min(0).max(1),
  consecutiveFailures: z.number().int().min(0),
}).strict();
export type AdherenceScore = z.infer<typeof AdherenceScoreSchema>;

function computeRate(values: AdherenceTracking): number {
  if (values.length === 0) {
    return 0;
  }

  const successes = values.reduce<number>((total, day) => total + day, 0);
  return successes / values.length;
}

function countConsecutiveFailures(values: AdherenceTracking): number {
  let failures = 0;

  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== 0) {
      break;
    }

    failures += 1;
  }

  return failures;
}

export function calculateAdherence(
  tracking: AdherenceTracking,
  config?: AdherenceModelConfigInput,
): AdherenceScore {
  const parsedTracking = AdherenceTrackingSchema.parse(tracking);
  const parsedConfig = AdherenceModelConfigSchema.parse(config ?? {});

  const successCount = parsedTracking.reduce<number>((total, day) => total + day, 0);
  const failureCount = parsedTracking.length - successCount;
  const alpha = parsedConfig.priorsSuccess + successCount;
  const beta = parsedConfig.priorsFail + failureCount;
  const meanProbability = alpha / (alpha + beta);

  const recentWindowDays = Math.min(parsedConfig.trendWindowDays, parsedTracking.length);
  const recentWindow = parsedTracking.slice(-recentWindowDays);
  const previousWindow = parsedTracking.slice(0, Math.max(0, parsedTracking.length - recentWindowDays));

  const recentSuccessRate = recentWindowDays > 0 ? computeRate(recentWindow) : meanProbability;
  const baselineSuccessRate =
    previousWindow.length >= parsedConfig.trendWindowDays
      ? computeRate(previousWindow)
      : recentSuccessRate;
  const recentDropMagnitude = Math.max(0, baselineSuccessRate - recentSuccessRate);

  return AdherenceScoreSchema.parse({
    alpha,
    beta,
    meanProbability,
    trend: recentDropMagnitude >= parsedConfig.decayThreshold ? 'DECAYING' : 'STABLE',
    observationCount: parsedTracking.length,
    successCount,
    failureCount,
    recentWindowDays,
    recentSuccessRate,
    baselineSuccessRate,
    recentDropMagnitude,
    consecutiveFailures: countConsecutiveFailures(parsedTracking),
  });
}
