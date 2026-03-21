import type { ResourceUsageSummary } from '../../shared/types/resource-usage'

export function toResourceUsageTrackingPayload(
  usage: ResourceUsageSummary | null | undefined
): Record<string, unknown> {
  if (!usage) {
    return {}
  }

  return {
    executionMode: usage.mode,
    resourceOwner: usage.resourceOwner,
    executionTarget: usage.executionTarget,
    credentialSource: usage.credentialSource,
    chargePolicy: usage.chargePolicy,
    chargeReason: usage.chargeReason,
    chargeable: usage.chargeable,
    estimatedCostSats: usage.estimatedCostSats,
    billingReasonCode: usage.billingReasonCode,
    billingReasonDetail: usage.billingReasonDetail,
    canExecute: usage.canExecute,
    blockReasonCode: usage.blockReasonCode,
    blockReasonDetail: usage.blockReasonDetail,
    providerId: usage.providerId,
    modelId: usage.modelId
  }
}
