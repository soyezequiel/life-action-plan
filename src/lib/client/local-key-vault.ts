'use client'

import { DateTime } from 'luxon'
import { z } from 'zod'
import { decryptBlob, deriveKeyFromPassword, encryptBlob, generateSalt } from './client-crypto'

export const LOCAL_KEY_VAULT_STORAGE_KEY = 'lap.keys.v1'

const storedApiKeySchema = z.object({
  id: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  alias: z.string().trim().min(1),
  encryptedValue: z.string().trim().min(1),
  iv: z.string().trim().min(1),
  salt: z.string().trim().min(1),
  createdAt: z.string().trim().min(1)
}).strict()

const storedApiKeyListSchema = z.array(storedApiKeySchema)

export type StoredApiKey = z.infer<typeof storedApiKeySchema>

interface CreateStoredApiKeyInput {
  provider: string
  alias: string
  value: string
  protectionPassword: string
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readRawVault(): string {
  if (!canUseLocalStorage()) {
    return '[]'
  }

  return window.localStorage.getItem(LOCAL_KEY_VAULT_STORAGE_KEY) ?? '[]'
}

function writeVault(records: StoredApiKey[]): void {
  if (!canUseLocalStorage()) {
    return
  }

  window.localStorage.setItem(LOCAL_KEY_VAULT_STORAGE_KEY, JSON.stringify(records))
}

export function listStoredApiKeys(): StoredApiKey[] {
  const rawVault = readRawVault()
  let payload: unknown = []

  try {
    payload = JSON.parse(rawVault)
  } catch {
    payload = []
  }

  const parsed = storedApiKeyListSchema.safeParse(payload)
  return parsed.success ? parsed.data : []
}

export function replaceStoredApiKeys(records: StoredApiKey[]): void {
  writeVault(storedApiKeyListSchema.parse(records))
}

export function clearStoredApiKeys(): void {
  if (!canUseLocalStorage()) {
    return
  }

  window.localStorage.removeItem(LOCAL_KEY_VAULT_STORAGE_KEY)
}

export async function createStoredApiKey(input: CreateStoredApiKeyInput): Promise<StoredApiKey> {
  const salt = generateSalt()
  const key = await deriveKeyFromPassword(input.protectionPassword, salt)
  const encrypted = await encryptBlob(input.value, key)
  const nextRecord: StoredApiKey = {
    id: crypto.randomUUID(),
    provider: input.provider.trim(),
    alias: input.alias.trim(),
    encryptedValue: encrypted.ciphertext,
    iv: encrypted.iv,
    salt,
    createdAt: DateTime.utc().toISO()!
  }
  const existing = listStoredApiKeys()

  writeVault([...existing, nextRecord])
  return nextRecord
}

export async function decryptStoredApiKey(record: StoredApiKey, protectionPassword: string): Promise<string> {
  const key = await deriveKeyFromPassword(protectionPassword, record.salt)
  return decryptBlob(record.iv, record.encryptedValue, key)
}

export function deleteStoredApiKey(id: string): void {
  writeVault(listStoredApiKeys().filter((record) => record.id !== id))
}
