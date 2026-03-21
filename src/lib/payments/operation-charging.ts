import type {
  ChargeOperation,
  ChargeReasonCode,
  ChargeStatus,
  OperationChargeSummary,
  OperationChargeRow
} from '../../shared/types/lap-api'
import { updateOperationCharge } from '../db/db-helpers'
import { getPaymentProvider } from '../providers/payment-provider'
import type { PaymentProviderStatus } from '../providers/payment-provider'
import { extractResourceUsageFromMetadata } from '../runtime/resource-usage-summary'
import {
  canUseWalletSecretStorage,
  loadWalletConnectionUrl
} from './wallet-connection'
import {
  estimateChargeUsdFromSats,
  getEstimatedOperationChargeSats,
  supportsBillingOperation
} from './billing-policy'

const PAY_INVOICE_METHOD = 'pay_invoice'
const RECEIVER_NWC_URL_ENV = 'LAP_LIGHTNING_RECEIVER_NWC_URL'
const RECEIVER_INVOICE_EXPIRY_ENV = 'LAP_LIGHTNING_INVOICE_EXPIRY_SECONDS'

export interface OperationChargeQuote {
  operation: ChargeOperation
  model: string
  estimatedCostUsd: number
  estimatedCostSats: number
  chargeable: boolean
  reasonCode: ChargeReasonCode | null
}

export interface ChargeWalletSnapshot {
  alias: string | null
  balanceSats: number | null
  budgetTotalSats: number | null
  budgetUsedSats: number | null
  budgetRemainingSats: number | null
  methods: string[]
}

export interface CanChargeOperationInput {
  operation: ChargeOperation
  model: string
  estimatedCostUsd: number
  estimatedCostSats: number
  userId?: string
  chargeable?: boolean
  reasonCode?: ChargeReasonCode | null
  reasonDetail?: string | null
}

export interface ChargeDecision {
  decision: 'chargeable' | 'skipped' | 'rejected'
  operation: ChargeOperation
  estimatedCostUsd: number
  estimatedCostSats: number
  reasonCode: ChargeReasonCode | null
  reasonDetail: string | null
  paymentProvider: string | null
  wallet: ChargeWalletSnapshot | null
}

export interface ChargeOperationInput {
  operation: ChargeOperation
  amountSats: number
  description: string
  userId?: string
  invoiceExpirySeconds?: number
}

export interface ChargeExecutionResult {
  status: Extract<ChargeStatus, 'paid' | 'rejected' | 'skipped' | 'failed'>
  operation: ChargeOperation
  chargedSats: number
  paymentProvider: string | null
  lightningInvoice: string | null
  lightningPaymentHash: string | null
  lightningPreimage: string | null
  providerReference: string | null
  reasonCode: ChargeReasonCode | null
  reasonDetail: string | null
  wallet: ChargeWalletSnapshot | null
}

export interface RecordChargeResultInput {
  planId?: string | null
  model?: string | null
  paymentProvider?: string | null
  status?: ChargeStatus
  estimatedCostUsd?: number
  estimatedCostSats?: number
  finalCostUsd?: number
  finalCostSats?: number
  chargedSats?: number
  reasonCode?: ChargeReasonCode | null
  reasonDetail?: string | null
  lightningInvoice?: string | null
  lightningPaymentHash?: string | null
  lightningPreimage?: string | null
  providerReference?: string | null
  metadata?: string | Record<string, unknown> | Array<unknown> | null
}

interface NormalizedChargeError {
  status: Extract<ChargeStatus, 'rejected' | 'failed'>
  reasonCode: ChargeReasonCode
  reasonDetail: string
}

interface WalletValidationSuccess {
  ok: true
  connectionUrl: string
  wallet: ChargeWalletSnapshot
}

interface WalletValidationFailure {
  ok: false
  status: 'rejected'
  reasonCode: ChargeReasonCode
  reasonDetail: string
  wallet: ChargeWalletSnapshot | null
}

function toSats(valueMsats: number | null | undefined): number | null {
  return typeof valueMsats === 'number' ? Math.max(0, Math.floor(valueMsats / 1000)) : null
}

function toWalletSnapshot(status: PaymentProviderStatus): ChargeWalletSnapshot {
  const balanceSats = toSats(status.balanceMsats)
  const budgetTotalSats = toSats(status.budgetTotalMsats)
  const budgetUsedSats = toSats(status.budgetUsedMsats)
  const budgetRemainingSats = typeof budgetTotalSats === 'number'
    ? Math.max(budgetTotalSats - (budgetUsedSats ?? 0), 0)
    : null

  return {
    alias: status.alias,
    balanceSats,
    budgetTotalSats,
    budgetUsedSats,
    budgetRemainingSats,
    methods: status.methods
  }
}

function normalizeChargeAmount(amountSats: number): number {
  if (!Number.isFinite(amountSats)) {
    return 0
  }

  return Math.max(0, Math.ceil(amountSats))
}

function getReceiverConnectionUrl(): string | null {
  return process.env[RECEIVER_NWC_URL_ENV]?.trim() || null
}

function getReceiverInvoiceExpirySeconds(): number | undefined {
  const rawValue = process.env[RECEIVER_INVOICE_EXPIRY_ENV]?.trim()

  if (!rawValue) {
    return undefined
  }

  const parsed = Number.parseInt(rawValue, 10)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function normalizeChargeError(
  error: unknown,
  stage: 'wallet_status' | 'invoice_create' | 'payment'
): NormalizedChargeError {
  const reasonDetail = error instanceof Error ? error.message : 'Unknown error'
  const normalized = reasonDetail.toLowerCase()

  if (normalized.includes('budget') || normalized.includes('quota')) {
    return {
      status: 'rejected',
      reasonCode: 'insufficient_budget',
      reasonDetail
    }
  }

  if (normalized.includes('insufficient') || normalized.includes('balance')) {
    return {
      status: 'rejected',
      reasonCode: 'insufficient_balance',
      reasonDetail
    }
  }

  if (
    normalized.includes('not allowed') ||
    normalized.includes('permission') ||
    normalized.includes('forbidden')
  ) {
    return {
      status: 'rejected',
      reasonCode: 'payment_not_allowed',
      reasonDetail
    }
  }

  if (
    normalized.includes('relay') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('fetch failed') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('websocket') ||
    normalized.includes('connect')
  ) {
    return {
      status: stage === 'wallet_status' ? 'rejected' : 'failed',
      reasonCode: stage === 'wallet_status' ? 'wallet_connection_unavailable' : 'provider_unavailable',
      reasonDetail
    }
  }

  if (
    normalized.includes('secure_storage_unavailable') ||
    normalized.includes('invalid_secret_payload') ||
    normalized.includes('invalid_nwc_url') ||
    normalized.includes('no relay url')
  ) {
    return {
      status: stage === 'wallet_status' ? 'rejected' : 'failed',
      reasonCode: stage === 'wallet_status' ? 'wallet_connection_unavailable' : 'provider_unavailable',
      reasonDetail
    }
  }

  if (stage === 'invoice_create') {
    return {
      status: 'failed',
      reasonCode: 'invoice_creation_failed',
      reasonDetail
    }
  }

  if (stage === 'payment') {
    return {
      status: 'failed',
      reasonCode: 'payment_failed',
      reasonDetail
    }
  }

  return {
    status: 'rejected',
    reasonCode: 'wallet_connection_unavailable',
    reasonDetail
  }
}

function buildDecision(
  input: CanChargeOperationInput,
  decision: ChargeDecision['decision'],
  reasonCode: ChargeReasonCode | null,
  reasonDetail: string | null,
  wallet: ChargeWalletSnapshot | null
): ChargeDecision {
  return {
    decision,
    operation: input.operation,
    estimatedCostUsd: input.estimatedCostUsd,
    estimatedCostSats: normalizeChargeAmount(input.estimatedCostSats),
    reasonCode,
    reasonDetail,
    paymentProvider: decision === 'chargeable' ? 'nwc' : null,
    wallet
  }
}

function validateReceiverConfiguration():
  | { ok: true; connectionUrl: string }
  | { ok: false; reasonCode: ChargeReasonCode; reasonDetail: string } {
  const connectionUrl = getReceiverConnectionUrl()

  if (!connectionUrl) {
    return {
      ok: false,
      reasonCode: 'receiver_not_configured',
      reasonDetail: `${RECEIVER_NWC_URL_ENV} is not configured`
    }
  }

  try {
    const provider = getPaymentProvider('nwc', { connectionUrl })
    provider.close()

    return {
      ok: true,
      connectionUrl
    }
  } catch (error) {
    return {
      ok: false,
      reasonCode: 'receiver_not_configured',
      reasonDetail: error instanceof Error ? error.message : 'Invalid receiver configuration'
    }
  }
}

async function validateWalletForCharge(
  amountSats: number,
  userId?: string
): Promise<WalletValidationSuccess | WalletValidationFailure> {
  if (!canUseWalletSecretStorage()) {
    return {
      ok: false,
      status: 'rejected',
      reasonCode: 'wallet_connection_unavailable',
      reasonDetail: 'SECURE_STORAGE_UNAVAILABLE',
      wallet: null
    }
  }

  const connectionUrl = await loadWalletConnectionUrl(userId)

  if (!connectionUrl) {
    return {
      ok: false,
      status: 'rejected',
      reasonCode: 'wallet_not_connected',
      reasonDetail: 'WALLET_NOT_CONNECTED',
      wallet: null
    }
  }

  let provider: ReturnType<typeof getPaymentProvider> | null = null

  try {
    provider = getPaymentProvider('nwc', { connectionUrl })
    const status = await provider.getStatus()
    const wallet = toWalletSnapshot(status)

    if (!status.methods.includes(PAY_INVOICE_METHOD)) {
      return {
        ok: false,
        status: 'rejected',
        reasonCode: 'payment_not_allowed',
        reasonDetail: `Wallet does not allow ${PAY_INVOICE_METHOD}`,
        wallet
      }
    }

    if (typeof wallet.balanceSats === 'number' && wallet.balanceSats < amountSats) {
      return {
        ok: false,
        status: 'rejected',
        reasonCode: 'insufficient_balance',
        reasonDetail: 'INSUFFICIENT_BALANCE',
        wallet
      }
    }

    if (typeof wallet.budgetRemainingSats === 'number' && wallet.budgetRemainingSats < amountSats) {
      return {
        ok: false,
        status: 'rejected',
        reasonCode: 'insufficient_budget',
        reasonDetail: 'INSUFFICIENT_BUDGET',
        wallet
      }
    }

    return {
      ok: true,
      connectionUrl,
      wallet
    }
  } catch (error) {
    const normalized = normalizeChargeError(error, 'wallet_status')

    return {
      ok: false,
      status: 'rejected',
      reasonCode: normalized.reasonCode,
      reasonDetail: normalized.reasonDetail,
      wallet: null
    }
  } finally {
    provider?.close()
  }
}

export async function canChargeOperation(input: CanChargeOperationInput): Promise<ChargeDecision> {
  const hasExplicitChargeability = typeof input.chargeable === 'boolean'
  const estimatedCostSats = normalizeChargeAmount(input.estimatedCostSats)
  const quote = hasExplicitChargeability
    ? {
        operation: input.operation,
        model: input.model,
        estimatedCostUsd: input.estimatedCostUsd,
        estimatedCostSats,
        chargeable: input.chargeable ?? false,
        reasonCode: input.reasonCode ?? (input.chargeable ? null : 'operation_not_chargeable')
      }
    : quoteOperationCharge({
        operation: input.operation,
        model: input.model
      })

  if (!quote.chargeable) {
    return buildDecision(
      {
        ...input,
        estimatedCostSats: quote.estimatedCostSats,
        estimatedCostUsd: quote.estimatedCostUsd
      },
      'skipped',
      quote.reasonCode,
      input.reasonDetail ?? 'OPERATION_NOT_CHARGEABLE',
      null
    )
  }

  const receiver = validateReceiverConfiguration()

  if (!receiver.ok) {
    return buildDecision(input, 'rejected', receiver.reasonCode, receiver.reasonDetail, null)
  }

  const walletValidation = await validateWalletForCharge(quote.estimatedCostSats, input.userId)

  if (!walletValidation.ok) {
    return buildDecision(
      {
        ...input,
        estimatedCostSats: quote.estimatedCostSats,
        estimatedCostUsd: quote.estimatedCostUsd
      },
      'rejected',
      walletValidation.reasonCode,
      walletValidation.reasonDetail,
      walletValidation.wallet
    )
  }

  return buildDecision(
    {
      ...input,
      estimatedCostSats: quote.estimatedCostSats,
      estimatedCostUsd: quote.estimatedCostUsd
    },
    'chargeable',
    null,
    null,
    walletValidation.wallet
  )
}

export function quoteOperationCharge(input: Pick<CanChargeOperationInput, 'operation' | 'model'>): OperationChargeQuote {
  if (!supportsBillingOperation(input.operation)) {
    return {
      operation: input.operation,
      model: input.model,
      estimatedCostUsd: 0,
      estimatedCostSats: 0,
      chargeable: false,
      reasonCode: 'operation_not_chargeable'
    }
  }

  const estimatedCostSats = getEstimatedOperationChargeSats(input.operation)

  if (estimatedCostSats <= 0) {
    return {
      operation: input.operation,
      model: input.model,
      estimatedCostUsd: 0,
      estimatedCostSats: 0,
      chargeable: false,
      reasonCode: 'operation_not_chargeable'
    }
  }

  return {
    operation: input.operation,
    model: input.model,
    estimatedCostUsd: estimateChargeUsdFromSats(estimatedCostSats),
    estimatedCostSats,
    chargeable: true,
    reasonCode: null
  }
}

export async function chargeOperation(input: ChargeOperationInput): Promise<ChargeExecutionResult> {
  if (!supportsBillingOperation(input.operation)) {
    return {
      status: 'skipped',
      operation: input.operation,
      chargedSats: 0,
      paymentProvider: null,
      lightningInvoice: null,
      lightningPaymentHash: null,
      lightningPreimage: null,
      providerReference: null,
      reasonCode: 'operation_not_chargeable',
      reasonDetail: 'OPERATION_NOT_CHARGEABLE',
      wallet: null
    }
  }

  const amountSats = normalizeChargeAmount(input.amountSats)

  if (amountSats <= 0) {
    return {
      status: 'skipped',
      operation: input.operation,
      chargedSats: 0,
      paymentProvider: null,
      lightningInvoice: null,
      lightningPaymentHash: null,
      lightningPreimage: null,
      providerReference: null,
      reasonCode: 'operation_not_chargeable',
      reasonDetail: 'ZERO_OR_NEGATIVE_AMOUNT',
      wallet: null
    }
  }

  const receiver = validateReceiverConfiguration()

  if (!receiver.ok) {
    return {
      status: 'rejected',
      operation: input.operation,
      chargedSats: 0,
      paymentProvider: null,
      lightningInvoice: null,
      lightningPaymentHash: null,
      lightningPreimage: null,
      providerReference: null,
      reasonCode: receiver.reasonCode,
      reasonDetail: receiver.reasonDetail,
      wallet: null
    }
  }

  const walletValidation = await validateWalletForCharge(amountSats, input.userId)

  if (!walletValidation.ok) {
    return {
      status: walletValidation.status,
      operation: input.operation,
      chargedSats: 0,
      paymentProvider: null,
      lightningInvoice: null,
      lightningPaymentHash: null,
      lightningPreimage: null,
      providerReference: null,
      reasonCode: walletValidation.reasonCode,
      reasonDetail: walletValidation.reasonDetail,
      wallet: walletValidation.wallet
    }
  }

  let receiverProvider: ReturnType<typeof getPaymentProvider> | null = null
  let payerProvider: ReturnType<typeof getPaymentProvider> | null = null

  try {
    receiverProvider = getPaymentProvider('nwc', { connectionUrl: receiver.connectionUrl })

    const invoice = await receiverProvider.createInvoice({
      amountSats,
      description: input.description,
      expirySeconds: input.invoiceExpirySeconds ?? getReceiverInvoiceExpirySeconds()
    })

    payerProvider = getPaymentProvider('nwc', { connectionUrl: walletValidation.connectionUrl })

    const payment = await payerProvider.payInvoice({
      invoice: invoice.paymentRequest
    })

    return {
      status: 'paid',
      operation: input.operation,
      chargedSats: amountSats,
      paymentProvider: 'nwc',
      lightningInvoice: invoice.paymentRequest,
      lightningPaymentHash: invoice.paymentHash,
      lightningPreimage: payment.preimage,
      providerReference: invoice.paymentHash,
      reasonCode: null,
      reasonDetail: null,
      wallet: walletValidation.wallet
    }
  } catch (error) {
    const normalized = normalizeChargeError(
      error,
      receiverProvider && !payerProvider ? 'invoice_create' : 'payment'
    )

    return {
      status: normalized.status,
      operation: input.operation,
      chargedSats: 0,
      paymentProvider: null,
      lightningInvoice: null,
      lightningPaymentHash: null,
      lightningPreimage: null,
      providerReference: null,
      reasonCode: normalized.reasonCode,
      reasonDetail: normalized.reasonDetail,
      wallet: walletValidation.wallet
    }
  } finally {
    receiverProvider?.close()
    payerProvider?.close()
  }
}

export async function recordChargeResult(
  chargeId: string,
  input: RecordChargeResultInput
): Promise<OperationChargeRow | null> {
  return updateOperationCharge(chargeId, {
    planId: input.planId,
    model: input.model,
    paymentProvider: input.paymentProvider,
    status: input.status,
    estimatedCostUsd: input.estimatedCostUsd,
    estimatedCostSats: input.estimatedCostSats,
    finalCostUsd: input.finalCostUsd,
    finalCostSats: input.finalCostSats,
    chargedSats: input.chargedSats,
    reasonCode: input.reasonCode,
    reasonDetail: input.reasonDetail,
    lightningInvoice: input.lightningInvoice,
    lightningPaymentHash: input.lightningPaymentHash,
    lightningPreimage: input.lightningPreimage,
    providerReference: input.providerReference,
    metadata: input.metadata
  })
}

export function summarizeOperationCharge(charge: OperationChargeRow): OperationChargeSummary {
  return {
    chargeId: charge.id,
    status: charge.status,
    estimatedCostUsd: charge.estimatedCostUsd,
    estimatedCostSats: charge.estimatedCostSats,
    finalCostUsd: charge.finalCostUsd,
    finalCostSats: charge.finalCostSats,
    chargedSats: charge.chargedSats,
    reasonCode: charge.reasonCode,
    reasonDetail: charge.reasonDetail,
    paymentProvider: charge.paymentProvider,
    resourceUsage: extractResourceUsageFromMetadata(charge.metadata)
  }
}
