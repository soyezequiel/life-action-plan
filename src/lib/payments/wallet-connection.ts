import { decryptSecret, encryptSecret, isSecretStorageAvailable } from '../auth/secret-storage'
import { DEFAULT_USER_ID, WALLET_SETTING_KEY } from '../auth/user-settings'
import { deleteUserSetting, getUserSetting, upsertUserSetting } from '../db/db-helpers'

export function canUseWalletSecretStorage(): boolean {
  return isSecretStorageAvailable()
}

function resolveWalletUserId(userId?: string): string {
  return userId?.trim() || DEFAULT_USER_ID
}

export async function loadWalletConnectionUrl(userId?: string): Promise<string | null> {
  const encrypted = await getUserSetting(resolveWalletUserId(userId), WALLET_SETTING_KEY)
  if (!encrypted) {
    return null
  }

  try {
    return decryptSecret(encrypted)
  } catch {
    return null
  }
}

export async function saveWalletConnectionUrl(connectionUrl: string, userId?: string): Promise<void> {
  await upsertUserSetting(resolveWalletUserId(userId), WALLET_SETTING_KEY, encryptSecret(connectionUrl))
}

export async function clearWalletConnectionUrl(userId?: string): Promise<void> {
  await deleteUserSetting(resolveWalletUserId(userId), WALLET_SETTING_KEY)
}
