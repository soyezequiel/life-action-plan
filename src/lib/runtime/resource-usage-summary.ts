import { resourceUsageSummarySchema } from '../../shared/schemas'
import type { ResolvedExecutionContext } from '../../shared/types/execution-context'
import type { ResourceUsageSummary } from '../../shared/types/resource-usage'
import type { BillingPolicyDecision } from '../payments/billing-policy'

function normalizeObject(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null
    } catch {
      return null
    }
  }

  return typeof value === 'object' ? value as Record<string, unknown> : null
}

export function summarizeResourceUsage(input: {
  executionContext: ResolvedExecutionContext
  billingPolicy: BillingPolicyDecision
}): ResourceUsageSummary {
  return resourceUsageSummarySchema.parse({
    mode: input.executionContext.mode,
    resourceOwner: input.executionContext.resourceOwner,
    executionTarget: input.executionContext.executionTarget,
    credentialSource: input.executionContext.credentialSource,
    chargePolicy: input.executionContext.chargePolicy,
    chargeReason: input.executionContext.chargeReason,
    chargeable: input.billingPolicy.chargeable,
    estimatedCostSats: input.billingPolicy.estimatedCostSats,
    billingReasonCode: input.billingPolicy.skipReasonCode,
    billingReasonDetail: input.billingPolicy.skipReasonDetail,
    canExecute: input.executionContext.canExecute,
    blockReasonCode: input.executionContext.blockReasonCode,
    blockReasonDetail: input.executionContext.blockReasonDetail,
    providerId: input.executionContext.provider.providerId,
    modelId: input.executionContext.provider.modelId
  })
}

export function extractResourceUsageFromMetadata(metadata: unknown): ResourceUsageSummary | null {
  const normalized = normalizeObject(metadata)

  if (!normalized) {
    return null
  }

  const directSummary = resourceUsageSummarySchema.safeParse(normalized.resourceUsage)
  if (directSummary.success) {
    return directSummary.data
  }

  const executionContext = (
    normalized.finalExecutionContext
    ?? normalized.requestedExecutionContext
    ?? normalized.executionContext
  ) as Record<string, unknown> | null
  const billingPolicy = normalized.billingPolicy as Record<string, unknown> | null

  if (!executionContext || !billingPolicy) {
    return null
  }

  try {
    return resourceUsageSummarySchema.parse({
      mode: executionContext.mode,
      resourceOwner: executionContext.resourceOwner,
      executionTarget: executionContext.executionTarget,
      credentialSource: executionContext.credentialSource,
      chargePolicy: executionContext.chargePolicy,
      chargeReason: executionContext.chargeReason,
      chargeable: billingPolicy.chargeable,
      estimatedCostSats: billingPolicy.estimatedCostSats,
      billingReasonCode: billingPolicy.skipReasonCode,
      billingReasonDetail: billingPolicy.skipReasonDetail,
      canExecute: executionContext.canExecute,
      blockReasonCode: executionContext.blockReasonCode,
      blockReasonDetail: executionContext.blockReasonDetail,
      providerId: (executionContext.provider as Record<string, unknown> | null)?.providerId,
      modelId: (executionContext.provider as Record<string, unknown> | null)?.modelId
    })
  } catch {
    return null
  }
}
