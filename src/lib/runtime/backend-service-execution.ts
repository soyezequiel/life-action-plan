import { resolvedExecutionContextSchema } from '../../shared/schemas'
import type { ChargeOperation } from '../../shared/types/lap-api'
import type { BillingPolicyDecision } from '../payments/billing-policy'
import type { ResolvedExecutionContext } from '../../shared/types/execution-context'
import { resolveBillingPolicy } from '../payments/billing-policy'

export interface ResolveBackendServiceExecutionInput {
  operation: ChargeOperation
  providerId: string
  modelId: string
  resolutionSource?: ResolvedExecutionContext['resolutionSource']
}

export interface ResolvedBackendServiceExecution {
  operation: ChargeOperation
  executionContext: ResolvedExecutionContext
  billingPolicy: BillingPolicyDecision
}

export function resolveBackendServiceExecution(
  input: ResolveBackendServiceExecutionInput
): ResolvedBackendServiceExecution {
  const executionContext = resolvedExecutionContextSchema.parse({
    mode: 'backend-local',
    resourceOwner: 'backend',
    executionTarget: 'backend-local',
    credentialSource: 'none',
    provider: {
      providerId: input.providerId.trim(),
      modelId: input.modelId.trim(),
      providerKind: 'local'
    },
    chargePolicy: 'charge',
    chargeReason: 'backend_resource',
    credentialId: null,
    canExecute: true,
    resolutionSource: input.resolutionSource ?? 'requested-mode',
    blockReasonCode: null,
    blockReasonDetail: null
  })

  return {
    operation: input.operation,
    executionContext,
    billingPolicy: resolveBillingPolicy({
      operation: input.operation,
      executionContext
    })
  }
}
