// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  decryptBlob,
  deriveKeyFromPassword,
  encryptBlob,
  generateSalt
} from '../src/lib/client/client-crypto'

describe('client crypto', () => {
  it('cifra y descifra un blob con Web Crypto', async () => {
    const salt = generateSalt()
    const key = await deriveKeyFromPassword('clave-de-proteccion', salt)
    const encrypted = await encryptBlob('hola mundo', key)
    const decrypted = await decryptBlob(encrypted.iv, encrypted.ciphertext, key)

    expect(salt).toBeTruthy()
    expect(encrypted.iv).toBeTruthy()
    expect(encrypted.ciphertext).toBeTruthy()
    expect(decrypted).toBe('hola mundo')
  })
})
