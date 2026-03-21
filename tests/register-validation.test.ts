import { describe, expect, it } from 'vitest'
import { validateRegisterSubmission } from '../src/lib/auth/register-validation'

describe('register validation', () => {
  it('acepta un correo bien formado con una clave suficiente', () => {
    const result = validateRegisterSubmission('soynaranja@gmail.com', 'ClaveSegura123')

    expect(result).toEqual({
      ok: true,
      normalizedIdentifier: 'soynaranja@gmail.com',
      normalizedEmail: 'soynaranja@gmail.com'
    })
  })

  it('rechaza un correo mal escrito', () => {
    expect(validateRegisterSubmission('soynaranja@gmail', 'ClaveSegura123')).toEqual({
      ok: false,
      errorCode: 'ACCOUNT_EMAIL_INVALID'
    })
  })

  it('rechaza un usuario con caracteres no permitidos', () => {
    expect(validateRegisterSubmission('soy naranja', 'ClaveSegura123')).toEqual({
      ok: false,
      errorCode: 'ACCOUNT_USERNAME_INVALID'
    })
  })

  it('rechaza una clave corta', () => {
    expect(validateRegisterSubmission('soynaranja', 'corta12')).toEqual({
      ok: false,
      errorCode: 'PASSWORD_TOO_SHORT'
    })
  })

  it('rechaza una clave sin numeros', () => {
    expect(validateRegisterSubmission('soynaranja', 'SoloLetrasLargas')).toEqual({
      ok: false,
      errorCode: 'PASSWORD_NEEDS_NUMBER'
    })
  })

  it('rechaza una clave demasiado parecida al identificador', () => {
    expect(validateRegisterSubmission('soynaranja', 'soynaranja123')).toEqual({
      ok: false,
      errorCode: 'PASSWORD_TOO_SIMILAR'
    })
  })
})
