import type { PaymentProviderStatus } from '../../src/lib/providers/payment-provider'
import { canChargeOperation, getPaymentProvider } from './_domain'
import { trackEvent } from './_db'
import {
  canUseWalletSecretStorage,
  clearWalletConnectionUrl,
  loadWalletConnectionUrl,
  saveWalletConnectionUrl
} from '../../src/lib/payments/wallet-connection'
import { normalizeWalletConnectionError } from '../../src/lib/payments/wallet-errors'
import {
  DEFAULT_OPENAI_BUILD_MODEL,
  getDefaultBuildModelForProvider
} from '../../src/lib/providers/provider-metadata'
import { resolvePlanBuildExecution } from '../../src/lib/runtime/build-execution'
import {
  DEFAULT_BACKEND_OWNER_ID,
  listCredentialConfigurations
} from '../../src/lib/auth/credential-config'
import type { WalletBuildQuote, WalletStatus } from '../../src/shared/types/lap-api'

const WALLET_STATUS_TIMEOUT_MS = 6_500

function toSats(valueMsats: number | null): number | undefined {
  return typeof valueMsats === 'number' ? Math.floor(valueMsats / 1000) : undefined
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
      })
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

function toWalletStatus(
  snapshot: PaymentProviderStatus | null,
  options: {
    configured: boolean
    connected: boolean
    canUseSecureStorage?: boolean
  }
): WalletStatus {
  return {
    configured: options.configured,
    connected: options.connected,
    canUseSecureStorage: options.canUseSecureStorage ?? canUseWalletSecretStorage(),
    alias: snapshot?.alias ?? undefined,
    balanceSats: toSats(snapshot?.balanceMsats ?? null),
    budgetSats: toSats(snapshot?.budgetTotalMsats ?? null),
    budgetUsedSats: toSats(snapshot?.budgetUsedMsats ?? null)
  }
}

async function resolveBackendChargeModel(): Promise<string> {
  const credentials = await listCredentialConfigurations({
    owner: 'backend',
    ownerId: DEFAULT_BACKEND_OWNER_ID,
    secretType: 'api-key',
    status: 'active'
  })
  const credential = credentials
    .filter((record) => record.providerId === 'openai' || record.providerId === 'openrouter')
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.label.localeCompare(right.label))[0]

  return getDefaultBuildModelForProvider(credential?.providerId ?? '') ?? DEFAULT_OPENAI_BUILD_MODEL
}

export async function getWalletBuildQuote(userId?: string): Promise<WalletBuildQuote> {
  const modelId = await resolveBackendChargeModel()
  const execution = await resolvePlanBuildExecution({
    modelId,
    requestedMode: 'backend-cloud'
  })

  if (!execution.billingPolicy.chargeable) {
    return {
      planBuildChargeSats: execution.billingPolicy.estimatedCostSats,
      planBuildChargeReady: false,
      planBuildChargeReasonCode: execution.billingPolicy.skipReasonCode
    }
  }

  const decision = await canChargeOperation({
    operation: 'plan_build',
    model: modelId,
    userId,
    estimatedCostUsd: execution.billingPolicy.estimatedCostUsd,
    estimatedCostSats: execution.billingPolicy.estimatedCostSats,
    chargeable: true
  })

  return {
    planBuildChargeSats: execution.billingPolicy.estimatedCostSats,
    planBuildChargeReady: decision.decision === 'chargeable',
    planBuildChargeReasonCode: decision.decision === 'chargeable' ? null : decision.reasonCode
  }
}

export async function getWalletStatus(userId?: string): Promise<WalletStatus> {
  const canUseSecureStorage = canUseWalletSecretStorage()
  if (!canUseSecureStorage) {
    return toWalletStatus(null, {
      configured: false,
      connected: false,
      canUseSecureStorage: false
    })
  }

  const connectionUrl = await loadWalletConnectionUrl(userId)
  if (!connectionUrl) {
    return toWalletStatus(null, {
      configured: false,
      connected: false,
      canUseSecureStorage: true
    })
  }

  let provider: ReturnType<typeof getPaymentProvider> | null = null

  try {
    provider = getPaymentProvider('nwc', { connectionUrl })
    const snapshot = await withTimeout(
      provider.getStatus(),
      WALLET_STATUS_TIMEOUT_MS,
      'WALLET_STATUS_TIMEOUT'
    )
    return toWalletStatus(snapshot, {
      configured: true,
      connected: true
    })
  } catch {
    return toWalletStatus(null, {
      configured: true,
      connected: false
    })
  } finally {
    provider?.close()
  }
}

export async function connectWallet(connectionUrl: string, userId?: string) {
  const canUseSecureStorage = canUseWalletSecretStorage()
  if (!canUseSecureStorage) {
    return {
      success: false,
      status: toWalletStatus(null, {
        configured: false,
        connected: false,
        canUseSecureStorage: false
      }),
      error: 'SECURE_STORAGE_UNAVAILABLE'
    }
  }

  let provider: ReturnType<typeof getPaymentProvider> | null = null

  try {
    provider = getPaymentProvider('nwc', { connectionUrl })
    const snapshot = await withTimeout(
      provider.getStatus({
        includeBalance: false,
        includeBudget: false
      }),
      WALLET_STATUS_TIMEOUT_MS,
      'WALLET_STATUS_TIMEOUT'
    )
    await saveWalletConnectionUrl(connectionUrl, userId)
    await trackEvent('WALLET_CONNECTED', {
      alias: snapshot.alias,
      network: snapshot.network
    })

    return {
      success: true,
      status: toWalletStatus(snapshot, {
        configured: true,
        connected: true
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const normalizedCode = normalizeWalletConnectionError(error)
    await trackEvent('ERROR_OCCURRED', { code: 'WALLET_CONNECT_FAILED', message, normalizedCode })

    return {
      success: false,
      status: toWalletStatus(null, {
        configured: false,
        connected: false
      }),
      error: normalizedCode
    }
  } finally {
    provider?.close()
  }
}

export async function disconnectWallet(userId?: string) {
  await clearWalletConnectionUrl(userId)
  await trackEvent('WALLET_DISCONNECTED')
  return { success: true }
}
