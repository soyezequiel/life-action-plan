import { decryptSecret, encryptSecret, isSecretStorageAvailable } from '../auth/secret-storage'
import { DEFAULT_USER_ID, WALLET_SETTING_KEY } from '../auth/user-settings'
import { deleteUserSetting, getUserSetting, upsertUserSetting } from '../db/db-helpers'

export function canUseWalletSecretStorage(): boolean {
  return isSecretStorageAvailable()
}

export async function loadWalletConnectionUrl(): Promise<string | null> {
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

export async function saveWalletConnectionUrl(connectionUrl: string): Promise<void> {
  await upsertUserSetting(DEFAULT_USER_ID, WALLET_SETTING_KEY, encryptSecret(connectionUrl))
}

export async function clearWalletConnectionUrl(): Promise<void> {
  await deleteUserSetting(DEFAULT_USER_ID, WALLET_SETTING_KEY)
}
