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

function toSats(valueMsats: number | null): number | undefined {
  return typeof valueMsats === 'number' ? Math.floor(valueMsats / 1000) : undefined
}

function toWalletStatus(
  snapshot: PaymentProviderStatus | null,
  options: {
    configured: boolean
    connected: boolean
    canUseSecureStorage?: boolean
    planBuildChargeSats?: number
    planBuildChargeReady?: boolean
    planBuildChargeReasonCode?: string | null
  }
) {
  return {
    configured: options.configured,
    connected: options.connected,
    canUseSecureStorage: options.canUseSecureStorage ?? canUseWalletSecretStorage(),
    alias: snapshot?.alias ?? undefined,
    balanceSats: toSats(snapshot?.balanceMsats ?? null),
    budgetSats: toSats(snapshot?.budgetTotalMsats ?? null),
    budgetUsedSats: toSats(snapshot?.budgetUsedMsats ?? null),
    planBuildChargeSats: options.planBuildChargeSats,
    planBuildChargeReady: options.planBuildChargeReady,
    planBuildChargeReasonCode: options.planBuildChargeReasonCode
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

async function getPlanBuildChargeState(userId?: string) {
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

export async function getWalletStatus(userId?: string) {
  const canUseSecureStorage = canUseWalletSecretStorage()
  if (!canUseSecureStorage) {
    return toWalletStatus(null, {
      configured: false,
      connected: false,
      canUseSecureStorage: false,
      ...(await getPlanBuildChargeState(userId))
    })
  }

  const connectionUrl = await loadWalletConnectionUrl(userId)
  if (!connectionUrl) {
    return toWalletStatus(null, {
      configured: false,
      connected: false,
      canUseSecureStorage: true,
      ...(await getPlanBuildChargeState(userId))
    })
  }

  let provider: ReturnType<typeof getPaymentProvider> | null = null

  try {
    provider = getPaymentProvider('nwc', { connectionUrl })
    const snapshot = await provider.getStatus()
    return toWalletStatus(snapshot, {
      configured: true,
      connected: true,
      ...(await getPlanBuildChargeState(userId))
    })
  } catch {
    return toWalletStatus(null, {
      configured: true,
      connected: false,
      ...(await getPlanBuildChargeState(userId))
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
        canUseSecureStorage: false,
        ...(await getPlanBuildChargeState(userId))
      }),
      error: 'SECURE_STORAGE_UNAVAILABLE'
    }
  }

  let provider: ReturnType<typeof getPaymentProvider> | null = null

  try {
    provider = getPaymentProvider('nwc', { connectionUrl })
    const snapshot = await provider.getStatus()
    await saveWalletConnectionUrl(connectionUrl, userId)
    await trackEvent('WALLET_CONNECTED', {
      alias: snapshot.alias,
      network: snapshot.network
    })

    return {
      success: true,
      status: toWalletStatus(snapshot, {
        configured: true,
        connected: true,
        ...(await getPlanBuildChargeState(userId))
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
        connected: false,
        ...(await getPlanBuildChargeState(userId))
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
