import bcrypt from 'bcryptjs'
import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../src/lib/auth/password'

describe('password hashing', () => {
  it('genera hashes Argon2id y los verifica correctamente', async () => {
    const password = 'clave-super-segura'
    const hash = await hashPassword(password)

    expect(hash.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword(password, hash)).toBe(true)
    expect(await verifyPassword('otra-clave', hash)).toBe(false)
  })

  it('mantiene compatibilidad con hashes bcrypt', async () => {
    const hash = await bcrypt.hash('clave-bcrypt', 10)

    expect(await verifyPassword('clave-bcrypt', hash)).toBe(true)
    expect(await verifyPassword('incorrecta', hash)).toBe(false)
  })
})
