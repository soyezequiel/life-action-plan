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
import { DEFAULT_OPENAI_BUILD_MODEL } from '../../src/lib/providers/provider-metadata'
import { resolvePlanBuildExecution } from '../../src/lib/runtime/build-execution'

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

async function getPlanBuildChargeState() {
  const execution = await resolvePlanBuildExecution({
    modelId: DEFAULT_OPENAI_BUILD_MODEL,
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
    model: DEFAULT_OPENAI_BUILD_MODEL,
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

export async function getWalletStatus() {
  const canUseSecureStorage = canUseWalletSecretStorage()
  if (!canUseSecureStorage) {
    return toWalletStatus(null, {
      configured: false,
      connected: false,
      canUseSecureStorage: false,
      ...(await getPlanBuildChargeState())
    })
  }

  const connectionUrl = await loadWalletConnectionUrl()
  if (!connectionUrl) {
    return toWalletStatus(null, {
      configured: false,
      connected: false,
      canUseSecureStorage: true,
      ...(await getPlanBuildChargeState())
    })
  }

  let provider: ReturnType<typeof getPaymentProvider> | null = null

  try {
    provider = getPaymentProvider('nwc', { connectionUrl })
    const snapshot = await provider.getStatus()
    return toWalletStatus(snapshot, {
      configured: true,
      connected: true,
      ...(await getPlanBuildChargeState())
    })
  } catch {
    return toWalletStatus(null, {
      configured: true,
      connected: false,
      ...(await getPlanBuildChargeState())
    })
  } finally {
    provider?.close()
  }
}

export async function connectWallet(connectionUrl: string) {
  const canUseSecureStorage = canUseWalletSecretStorage()
  if (!canUseSecureStorage) {
    return {
      success: false,
      status: toWalletStatus(null, {
        configured: false,
        connected: false,
        canUseSecureStorage: false,
        ...(await getPlanBuildChargeState())
      }),
      error: 'SECURE_STORAGE_UNAVAILABLE'
    }
  }

  let provider: ReturnType<typeof getPaymentProvider> | null = null

  try {
    provider = getPaymentProvider('nwc', { connectionUrl })
    const snapshot = await provider.getStatus()
    await saveWalletConnectionUrl(connectionUrl)
    await trackEvent('WALLET_CONNECTED', {
      alias: snapshot.alias,
      network: snapshot.network
    })

    return {
      success: true,
      status: toWalletStatus(snapshot, {
        configured: true,
        connected: true,
        ...(await getPlanBuildChargeState())
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
        ...(await getPlanBuildChargeState())
      }),
      error: normalizedCode
    }
  } finally {
    provider?.close()
  }
}

export async function disconnectWallet() {
  await clearWalletConnectionUrl()
  await trackEvent('WALLET_DISCONNECTED')
  return { success: true }
}
