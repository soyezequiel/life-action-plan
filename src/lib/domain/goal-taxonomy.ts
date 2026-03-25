import { z } from 'zod';

export const GoalTypeSchema = z.enum([
  'RECURRENT_HABIT',
  'SKILL_ACQUISITION',
  'FINITE_PROJECT',
  'QUANT_TARGET_TRACKING',
  'IDENTITY_EXPLORATION',
  'RELATIONAL_EMOTIONAL',
  'HIGH_UNCERTAINTY_TRANSFORM'
]);
export type GoalType = z.infer<typeof GoalTypeSchema>;

export const GoalDomainRiskSchema = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH_HEALTH',
  'HIGH_FINANCE',
  'HIGH_LEGAL'
]);
export type GoalDomainRisk = z.infer<typeof GoalDomainRiskSchema>;

export const GoalSignalsSchema = z.object({
  isRecurring: z.boolean(),
  hasDeliverable: z.boolean(),
  hasNumericTarget: z.boolean(),
  requiresSkillProgression: z.boolean(),
  dependsOnThirdParties: z.boolean(),
  isOpenEnded: z.boolean(),
  isRelational: z.boolean(),
}).strict();
export type GoalSignals = z.infer<typeof GoalSignalsSchema>;

export const GoalClassificationSchema = z.object({
  goalType: GoalTypeSchema,
  confidence: z.number().min(0).max(1),
  risk: GoalDomainRiskSchema,
  extractedSignals: GoalSignalsSchema,
}).strict();
export type GoalClassification = z.infer<typeof GoalClassificationSchema>;
