import type { ChargeOperation } from '../../shared/types/lap-api'
import type { ResolvedExecutionContext } from '../../shared/types/execution-context'

const PLAN_BUILD_CHARGE_SATS_ENV = 'LAP_PLAN_BUILD_CHARGE_SATS'
const SUPPORTED_BILLING_OPERATIONS = new Set<ChargeOperation>(['plan_build', 'plan_simulate'])
const SATS_PER_USD = 1000

export type BillingEstimateStrategy = 'fixed_plan_build_sats' | 'none'
export type BillingSkipReasonCode = 'user_resource' | 'internal_tooling' | 'operation_not_chargeable' | 'execution_blocked'

export interface BillingPolicyDecision {
  operation: ChargeOperation
  executionMode: ResolvedExecutionContext['mode']
  resourceOwner: ResolvedExecutionContext['resourceOwner']
  executionTarget: ResolvedExecutionContext['executionTarget']
  chargePolicy: ResolvedExecutionContext['chargePolicy']
  chargeReason: ResolvedExecutionContext['chargeReason']
  billableOperation: boolean
  estimatedAmountStrategy: BillingEstimateStrategy
  estimatedCostUsd: number
  estimatedCostSats: number
  chargeable: boolean
  skipReasonCode: BillingSkipReasonCode | null
  skipReasonDetail: string | null
}

function normalizeChargeAmount(amountSats: number): number {
  if (!Number.isFinite(amountSats)) {
    return 0
  }

  return Math.max(0, Math.ceil(amountSats))
}

export function supportsBillingOperation(operation: ChargeOperation): boolean {
  return SUPPORTED_BILLING_OPERATIONS.has(operation)
}

export function getBillingEstimateStrategy(operation: ChargeOperation): BillingEstimateStrategy {
  if (operation === 'plan_build') {
    return 'fixed_plan_build_sats'
  }

  return 'none'
}

export function getConfiguredPlanBuildChargeSats(): number {
  const rawValue = process.env[PLAN_BUILD_CHARGE_SATS_ENV]?.trim()

  if (!rawValue) {
    return 5
  }

  const parsed = Number.parseInt(rawValue, 10)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5
}

export function estimateChargeUsdFromSats(amountSats: number): number {
  const normalizedAmount = normalizeChargeAmount(amountSats)

  if (normalizedAmount <= 0) {
    return 0
  }

  return Number((normalizedAmount / SATS_PER_USD).toFixed(8))
}

export function getEstimatedOperationChargeSats(operation: ChargeOperation): number {
  const strategy = getBillingEstimateStrategy(operation)

  if (strategy === 'fixed_plan_build_sats') {
    return getConfiguredPlanBuildChargeSats()
  }

  return 0
}

export function resolveBillingPolicy(input: {
  operation: ChargeOperation
  executionContext: ResolvedExecutionContext
}): BillingPolicyDecision {
  const billableOperation = supportsBillingOperation(input.operation)
  const estimatedAmountStrategy = getBillingEstimateStrategy(input.operation)
  const estimatedCostSats = billableOperation
    ? getEstimatedOperationChargeSats(input.operation)
    : 0
  const estimatedCostUsd = estimateChargeUsdFromSats(estimatedCostSats)

  if (!input.executionContext.canExecute) {
    return {
      operation: input.operation,
      executionMode: input.executionContext.mode,
      resourceOwner: input.executionContext.resourceOwner,
      executionTarget: input.executionContext.executionTarget,
      chargePolicy: input.executionContext.chargePolicy,
      chargeReason: input.executionContext.chargeReason,
      billableOperation,
      estimatedAmountStrategy,
      estimatedCostUsd,
      estimatedCostSats,
      chargeable: false,
      skipReasonCode: 'execution_blocked',
      skipReasonDetail: input.executionContext.blockReasonDetail
        || input.executionContext.blockReasonCode
        || 'EXECUTION_BLOCKED'
    }
  }

  if (input.executionContext.chargePolicy === 'skip') {
    const skipReasonCode = input.executionContext.chargeReason === 'user_resource'
      ? 'user_resource'
      : 'internal_tooling'
    const skipReasonDetail = input.executionContext.chargeReason === 'user_resource'
      ? 'RESOURCE_OWNER_USER'
      : 'INTERNAL_TOOLING_MODE'

    return {
      operation: input.operation,
      executionMode: input.executionContext.mode,
      resourceOwner: input.executionContext.resourceOwner,
      executionTarget: input.executionContext.executionTarget,
      chargePolicy: input.executionContext.chargePolicy,
      chargeReason: input.executionContext.chargeReason,
      billableOperation,
      estimatedAmountStrategy,
      estimatedCostUsd,
      estimatedCostSats,
      chargeable: false,
      skipReasonCode,
      skipReasonDetail
    }
  }

  if (input.executionContext.executionTarget !== 'cloud') {
    return {
      operation: input.operation,
      executionMode: input.executionContext.mode,
      resourceOwner: input.executionContext.resourceOwner,
      executionTarget: input.executionContext.executionTarget,
      chargePolicy: input.executionContext.chargePolicy,
      chargeReason: input.executionContext.chargeReason,
      billableOperation,
      estimatedAmountStrategy,
      estimatedCostUsd,
      estimatedCostSats,
      chargeable: false,
      skipReasonCode: 'operation_not_chargeable',
      skipReasonDetail: 'LOCAL_EXECUTION_NO_CHARGE'
    }
  }

  if (!billableOperation || estimatedCostSats <= 0) {
    return {
      operation: input.operation,
      executionMode: input.executionContext.mode,
      resourceOwner: input.executionContext.resourceOwner,
      executionTarget: input.executionContext.executionTarget,
      chargePolicy: input.executionContext.chargePolicy,
      chargeReason: input.executionContext.chargeReason,
      billableOperation,
      estimatedAmountStrategy,
      estimatedCostUsd,
      estimatedCostSats,
      chargeable: false,
      skipReasonCode: 'operation_not_chargeable',
      skipReasonDetail: estimatedCostSats <= 0 ? 'NO_ESTIMATE_STRATEGY' : 'OPERATION_NOT_BILLABLE'
    }
  }

  return {
    operation: input.operation,
    executionMode: input.executionContext.mode,
    resourceOwner: input.executionContext.resourceOwner,
    executionTarget: input.executionContext.executionTarget,
    chargePolicy: input.executionContext.chargePolicy,
    chargeReason: input.executionContext.chargeReason,
    billableOperation,
    estimatedAmountStrategy,
    estimatedCostUsd,
    estimatedCostSats,
    chargeable: true,
    skipReasonCode: null,
    skipReasonDetail: null
  }
}
