import { z } from 'zod'
import {
  chargePolicySchema,
  chargeReasonSchema,
  credentialSourceSchema,
  executionBlockReasonSchema,
  executionModeSchema,
  executionTargetSchema,
  resourceOwnerSchema
} from './execution-context'

export const billingReasonCodeSchema = z.enum([
  'user_resource',
  'execution_blocked',
  'operation_not_chargeable'
])

export const resourceUsageSummarySchema = z.object({
  mode: executionModeSchema,
  resourceOwner: resourceOwnerSchema,
  executionTarget: executionTargetSchema,
  credentialSource: credentialSourceSchema,
  chargePolicy: chargePolicySchema,
  chargeReason: chargeReasonSchema,
  chargeable: z.boolean(),
  estimatedCostSats: z.number().int().nonnegative(),
  billingReasonCode: billingReasonCodeSchema.nullable(),
  billingReasonDetail: z.string().trim().min(1).nullable(),
  canExecute: z.boolean(),
  blockReasonCode: executionBlockReasonSchema.nullable(),
  blockReasonDetail: z.string().trim().min(1).nullable(),
  providerId: z.string().trim().min(1),
  modelId: z.string().trim().min(1)
}).strict()

export type BillingReasonCode = z.infer<typeof billingReasonCodeSchema>
export type ResourceUsageSummary = z.infer<typeof resourceUsageSummarySchema>
