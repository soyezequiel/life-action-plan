import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ENCRYPTION_PREFIX = 'v1'

function getEncryptionSeed(): string | null {
  return process.env.API_KEY_ENCRYPTION_SECRET?.trim()
    || process.env.DATABASE_URL?.trim()
    || null
}

function deriveKey(seed: string): Buffer {
  return createHash('sha256').update(seed, 'utf8').digest()
}

export function isSecretStorageAvailable(): boolean {
  return Boolean(getEncryptionSeed())
}

export function encryptSecret(value: string): string {
  const seed = getEncryptionSeed()
  if (!seed) {
    throw new Error('SECURE_STORAGE_UNAVAILABLE')
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(seed), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    ENCRYPTION_PREFIX,
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64')
  ].join(':')
}

export function decryptSecret(payload: string): string {
  const seed = getEncryptionSeed()
  if (!seed) {
    throw new Error('SECURE_STORAGE_UNAVAILABLE')
  }

  const [prefix, ivBase64, authTagBase64, encryptedBase64] = payload.split(':')
  if (
    prefix !== ENCRYPTION_PREFIX ||
    !ivBase64 ||
    !authTagBase64 ||
    !encryptedBase64
  ) {
    throw new Error('INVALID_SECRET_PAYLOAD')
  }

  const decipher = createDecipheriv('aes-256-gcm', deriveKey(seed), Buffer.from(ivBase64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'))

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final()
  ]).toString('utf8')
}
