import type { PaymentProviderStatus } from '../../src/lib/providers/payment-provider'
import { getPaymentProvider } from './_domain'
import { decryptSecret, encryptSecret, isSecretStorageAvailable } from './_auth'
import { deleteUserSetting, getUserSetting, trackEvent, upsertUserSetting } from './_db'
import { DEFAULT_USER_ID, WALLET_SETTING_KEY } from './_user-settings'

function toSats(valueMsats: number | null): number | undefined {
  return typeof valueMsats === 'number' ? Math.floor(valueMsats / 1000) : undefined
}

function toWalletStatus(
  snapshot: PaymentProviderStatus | null,
  options: { configured: boolean; connected: boolean; canUseSecureStorage?: boolean }
) {
  return {
    configured: options.configured,
    connected: options.connected,
    canUseSecureStorage: options.canUseSecureStorage ?? isSecretStorageAvailable(),
    alias: snapshot?.alias ?? undefined,
    balanceSats: toSats(snapshot?.balanceMsats ?? null),
    budgetSats: toSats(snapshot?.budgetTotalMsats ?? null),
    budgetUsedSats: toSats(snapshot?.budgetUsedMsats ?? null)
  }
}

async function loadWalletConnectionUrl(): Promise<string | null> {
  const encrypted = await getUserSetting(DEFAULT_USER_ID, WALLET_SETTING_KEY)
  if (!encrypted) {
    return null
  }

  try {
    return decryptSecret(encrypted)
  } catch {
    return null
  }
}

async function saveWalletConnectionUrl(connectionUrl: string): Promise<void> {
  await upsertUserSetting(DEFAULT_USER_ID, WALLET_SETTING_KEY, encryptSecret(connectionUrl))
}

async function clearWalletConnectionUrl(): Promise<void> {
  await deleteUserSetting(DEFAULT_USER_ID, WALLET_SETTING_KEY)
}

export async function getWalletStatus() {
  const canUseSecureStorage = isSecretStorageAvailable()
  if (!canUseSecureStorage) {
    return toWalletStatus(null, {
      configured: false,
      connected: false,
      canUseSecureStorage: false
    })
  }

  const connectionUrl = await loadWalletConnectionUrl()
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
    const snapshot = await provider.getStatus()
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

export async function connectWallet(connectionUrl: string) {
  const canUseSecureStorage = isSecretStorageAvailable()
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
        connected: true
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    await trackEvent('ERROR_OCCURRED', { code: 'WALLET_CONNECT_FAILED', message })

    return {
      success: false,
      status: toWalletStatus(null, {
        configured: false,
        connected: false
      }),
      error: message
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
