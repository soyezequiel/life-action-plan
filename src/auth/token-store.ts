import { app, safeStorage } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { posix as pathPosix } from 'node:path'

export type SecureTokenId = 'wallet-nwc'

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/')
}

function getSecretsDirectory(): string {
  return pathPosix.join(toPosixPath(app.getPath('userData')), 'auth')
}

function getTokenPath(tokenId: SecureTokenId): string {
  return pathPosix.join(getSecretsDirectory(), `${tokenId}.bin`)
}

function ensureSecureStorage(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('SECURE_STORAGE_UNAVAILABLE')
  }
}

export function isSecureStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export async function saveSecureToken(tokenId: SecureTokenId, value: string): Promise<void> {
  ensureSecureStorage()

  const trimmedValue = value.trim()
  if (!trimmedValue) {
    throw new Error('EMPTY_SECRET')
  }

  await mkdir(getSecretsDirectory(), { recursive: true })
  await writeFile(getTokenPath(tokenId), safeStorage.encryptString(trimmedValue))
}

export async function loadSecureToken(tokenId: SecureTokenId): Promise<string | null> {
  ensureSecureStorage()

  try {
    const encryptedValue = await readFile(getTokenPath(tokenId))
    return safeStorage.decryptString(encryptedValue)
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null
    }

    throw error
  }
}

export async function clearSecureToken(tokenId: SecureTokenId): Promise<void> {
  await rm(getTokenPath(tokenId), { force: true })
}
