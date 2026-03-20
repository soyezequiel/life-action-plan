import { afterEach, describe, expect, it, vi } from 'vitest'
import { toConfigErrorMessage } from '../src/shared/config-errors'

describe('toConfigErrorMessage', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('explicita DATABASE_URL en desarrollo', () => {
    vi.stubEnv('NODE_ENV', 'development')

    expect(toConfigErrorMessage('DATABASE_URL_NOT_SET')).toContain('DATABASE_URL')
  })

  it('usa el mensaje generico en produccion', () => {
    vi.stubEnv('NODE_ENV', 'production')

    const message = toConfigErrorMessage('DATABASE_URL_NOT_SET')

    expect(message).toBe('Hay una configuracion pendiente del lado del servidor. Revisala y volve a intentar.')
  })

  it('explicita el secreto de encriptacion en desarrollo', () => {
    vi.stubEnv('NODE_ENV', 'development')

    expect(toConfigErrorMessage('API_KEY_ENCRYPTION_SECRET_NOT_SET')).toContain('API_KEY_ENCRYPTION_SECRET')
  })
})
