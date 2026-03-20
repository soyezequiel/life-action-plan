import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ENVELOPE_PREFIX = 'v1'
const IV_LENGTH_BYTES = 12
const TAG_LENGTH_BYTES = 16
const KEY_LENGTH_BYTES = 32

function getSecret(): string {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET?.trim()
    || process.env.DATABASE_URL?.trim()

  if (!secret) {
    throw new Error('API_KEY_ENCRYPTION_SECRET_NOT_SET')
  }

  return secret
}

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest().subarray(0, KEY_LENGTH_BYTES)
}

function encodePart(value: Buffer): string {
  return value.toString('base64url')
}

function decodePart(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

export function isApiKeyEncryptionConfigured(): boolean {
  return Boolean(process.env.API_KEY_ENCRYPTION_SECRET?.trim() || process.env.DATABASE_URL?.trim())
}

export function encryptApiKey(value: string): string {
  const trimmed = value.trim()

  if (!trimmed) {
    throw new Error('EMPTY_API_KEY')
  }

  const key = deriveKey(getSecret())
  const iv = randomBytes(IV_LENGTH_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(trimmed, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [ENVELOPE_PREFIX, encodePart(iv), encodePart(encrypted), encodePart(tag)].join('.')
}

export function decryptApiKey(value: string): string {
  const parts = value.split('.')

  if (parts.length !== 4 || parts[0] !== ENVELOPE_PREFIX) {
    throw new Error('INVALID_ENCRYPTED_API_KEY')
  }

  const key = deriveKey(getSecret())
  const iv = decodePart(parts[1])
  const encrypted = decodePart(parts[2])
  const tag = decodePart(parts[3])

  if (iv.length !== IV_LENGTH_BYTES || tag.length !== TAG_LENGTH_BYTES) {
    throw new Error('INVALID_ENCRYPTED_API_KEY')
  }

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
