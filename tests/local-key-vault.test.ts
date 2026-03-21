// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearStoredApiKeys,
  createStoredApiKey,
  decryptStoredApiKey,
  deleteStoredApiKey,
  listStoredApiKeys,
  replaceStoredApiKeys
} from '../src/lib/client/local-key-vault'

describe('local key vault', () => {
  beforeEach(() => {
    clearStoredApiKeys()
  })

  it('guarda y recupera una clave cifrada en localStorage', async () => {
    const record = await createStoredApiKey({
      provider: 'openai',
      alias: 'principal',
      value: 'sk-demo',
      protectionPassword: 'clave-local'
    })

    const stored = listStoredApiKeys()

    expect(stored).toHaveLength(1)
    expect(stored[0]?.encryptedValue).not.toBe('sk-demo')
    expect(await decryptStoredApiKey(record, 'clave-local')).toBe('sk-demo')
  })

  it('permite reemplazar y borrar registros', async () => {
    const first = await createStoredApiKey({
      provider: 'openrouter',
      alias: 'secundaria',
      value: 'sk-or-v1-demo',
      protectionPassword: 'clave-local'
    })

    replaceStoredApiKeys([first])
    expect(listStoredApiKeys()).toHaveLength(1)

    deleteStoredApiKey(first.id)
    expect(listStoredApiKeys()).toEqual([])
  })
})
