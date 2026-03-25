import {
  canChargeOperation,
  chargeOperation,
  recordChargeResult,
  summarizeOperationCharge
} from '../payments/operation-charging'
import {
  createOperationCharge,
  trackEvent
} from '../db/db-helpers'
import { toOperationChargeSkipReason } from '../runtime/build-execution'
import type { 
  ChargeOperation, 
  OperationChargeSummary,
  OperationChargeRow,
  ChargeStatus
} from '../../shared/types/lap-api'
import type { ResourceUsageSummary } from '../../shared/types/resource-usage'
import type { BillingPolicyDecision } from '../payments/billing-policy'

export interface BillingLifecycleOptions {
  profileId: string
  planId?: string
  operation: ChargeOperation
  modelId: string
  userId?: string
  billingPolicy: BillingPolicyDecision
  resourceUsage: ResourceUsageSummary | null
  description: string
  metadata?: Record<string, unknown>
  onStartEvent?: string
  onSuccessEvent?: string
  onFailureEvent?: string
  extraEventData?: Record<string, unknown>
}

export interface BillingLifecycleResult<T> {
  result: T
  charge: OperationChargeSummary
}

export interface ActionResult<T> {
  data: T
  billingMetadata?: Record<string, unknown>
  finalModelId?: string
  finalCostUsd?: number
  finalCostSats?: number
}

export async function executeWithBilling<T>(
  options: BillingLifecycleOptions,
  action: (chargeRecord: OperationChargeRow) => Promise<ActionResult<T>>
): Promise<BillingLifecycleResult<T>> {
  const {
    profileId,
    planId,
    operation,
    modelId,
    userId,
    billingPolicy,
    resourceUsage,
    description,
    metadata = {},
    onStartEvent,
    onSuccessEvent,
    onFailureEvent,
    extraEventData = {}
  } = options

  // 1. Pre-charge decision
  const prechargeDecision = billingPolicy.chargeable
    ? await canChargeOperation({
        operation,
        model: modelId,
        userId,
        estimatedCostUsd: billingPolicy.estimatedCostUsd,
        estimatedCostSats: billingPolicy.estimatedCostSats,
        chargeable: true
      })
    : null

  const skipReason = billingPolicy.chargeable ? null : toOperationChargeSkipReason(billingPolicy)
  
  const initialChargeStatus: ChargeStatus = billingPolicy.chargeable
    ? prechargeDecision?.decision === 'chargeable' ? 'pending' : (prechargeDecision?.decision as any ?? 'skipped')
    : 'skipped'

  const initialReasonCode = billingPolicy.chargeable
    ? prechargeDecision?.decision === 'chargeable' ? null : (prechargeDecision?.reasonCode ?? null)
    : (skipReason?.reasonCode ?? null)

  const initialReasonDetail = billingPolicy.chargeable
    ? prechargeDecision?.decision === 'chargeable' ? null : (prechargeDecision?.reasonDetail ?? null)
    : (skipReason?.reasonDetail ?? null)

  // 2. Create charge record
  let chargeRecord = await createOperationCharge({
    profileId,
    planId,
    operation,
    model: modelId,
    status: initialChargeStatus,
    estimatedCostUsd: billingPolicy.estimatedCostUsd,
    estimatedCostSats: billingPolicy.estimatedCostSats,
    reasonCode: initialReasonCode,
    reasonDetail: initialReasonDetail,
    metadata: {
      ...metadata,
      requestedModelId: modelId,
      billingPolicy,
      resourceUsage
    }
  })

  // 3. Track start
  if (onStartEvent) {
    await trackEvent(onStartEvent as any, {
      profileId,
      planId,
      chargeId: chargeRecord.id,
      chargeDecision: initialChargeStatus,
      ...extraEventData
    })
  }

  // 4. Check block
  if (prechargeDecision?.decision === 'rejected') {
    if (onFailureEvent) {
      await trackEvent(onFailureEvent as any, {
        profileId,
        planId,
        chargeId: chargeRecord.id,
        reasonCode: prechargeDecision.reasonCode,
        reasonDetail: prechargeDecision.reasonDetail,
        ...extraEventData
      })
    }

    const error = new Error('OPERATION_CHARGE_REJECTED')
    ;(error as any).charge = summarizeOperationCharge(chargeRecord)
    throw error
  }

  try {
    // 5. Execute core action
    const actionResult = await action(chargeRecord)
    const { data: result, billingMetadata = {}, finalModelId, finalCostUsd, finalCostSats } = actionResult

    // 6. Settle charge
    if (chargeRecord.status === 'pending') {
      const chargeResult = await chargeOperation({
        operation,
        amountSats: chargeRecord.estimatedCostSats,
        userId,
        description
      })

      chargeRecord = await recordChargeResult(chargeRecord.id, {
        status: chargeResult.status,
        model: finalModelId ?? modelId,
        paymentProvider: chargeResult.paymentProvider,
        chargedSats: chargeResult.chargedSats,
        finalCostUsd: finalCostUsd ?? 0,
        finalCostSats: finalCostSats ?? 0,
        reasonCode: chargeResult.reasonCode,
        reasonDetail: chargeResult.reasonDetail,
        lightningInvoice: chargeResult.lightningInvoice,
        lightningPaymentHash: chargeResult.lightningPaymentHash,
        lightningPreimage: chargeResult.lightningPreimage,
        providerReference: chargeResult.providerReference,
        metadata: {
          ...(chargeRecord.metadata as any || {}),
          ...billingMetadata,
          chargeExecution: chargeResult
        }
      }) ?? chargeRecord

      if (chargeRecord.status !== 'paid') {
        if (onFailureEvent) {
           await trackEvent(onFailureEvent as any, {
             profileId,
             planId,
             chargeId: chargeRecord.id,
             reasonCode: chargeRecord.reasonCode,
             ...extraEventData
           })
        }
        const error = new Error('OPERATION_CHARGE_FAILED')
        ;(error as any).charge = summarizeOperationCharge(chargeRecord)
        throw error
      }
    } else {
        // Mark as skipped or update metadata if already resolved/skipped
        chargeRecord = await recordChargeResult(chargeRecord.id, {
            model: finalModelId ?? modelId,
            finalCostUsd: finalCostUsd ?? 0,
            finalCostSats: finalCostSats ?? 0,
            metadata: {
                ...(chargeRecord.metadata as any || {}),
                ...billingMetadata,
                skipReason: initialReasonCode
            }
        }) ?? chargeRecord
    }

    if (onSuccessEvent) {
      await trackEvent(onSuccessEvent as any, {
        profileId,
        planId,
        chargeId: chargeRecord.id,
        ...extraEventData
      })
    }

    return {
      result,
      charge: summarizeOperationCharge(chargeRecord)
    }

  } catch (error) {
    if (chargeRecord.status === 'pending') {
         chargeRecord = await recordChargeResult(chargeRecord.id, {
            status: 'failed',
            reasonCode: 'unknown_error',
            reasonDetail: error instanceof Error ? error.message : String(error)
         }) ?? chargeRecord
    }
    
    // Re-throw with charge info attached if not already there
    if (error instanceof Error && !('charge' in error)) {
        ;(error as any).charge = summarizeOperationCharge(chargeRecord)
    }
    
    throw error
  }
}
