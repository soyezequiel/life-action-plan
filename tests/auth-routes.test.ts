import { beforeEach, describe, expect, it, vi } from 'vitest'

const authStore = vi.hoisted(() => ({
  users: new Map<string, {
    id: string
    username: string
    email: string | null
    passwordHash: string
  }>(),
  currentUserId: null as string | null,
  createSessionMock: vi.fn(async (userId: string) => {
    authStore.currentUserId = userId
    return {
      token: `token-${userId}`,
      sessionId: `session-${userId}`,
      userId,
      expiresAt: '2026-04-20T00:00:00.000Z'
    }
  }),
  destroyAllSessionsMock: vi.fn(),
  destroySessionFromRequestMock: vi.fn(),
  clearSessionCookieMock: vi.fn((response: Response) => {
    response.headers.set('set-cookie', 'lap-session=; Max-Age=0; Path=/')
  }),
  applySessionCookieMock: vi.fn((response: Response, token: string) => {
    response.headers.set('set-cookie', `lap-session=${token}; Path=/; HttpOnly`)
  }),
  getLoginGuardStatusMock: vi.fn(async () => ({
    blocked: false,
    retryAfterSeconds: 0
  })),
  recordFailedLoginAttemptMock: vi.fn(async () => ({
    blocked: false,
    retryAfterSeconds: 0
  })),
  clearLoginGuardMock: vi.fn(async () => {})
}))

vi.mock('../app/api/_db', () => ({
  createUser: vi.fn(async (input: { username: string; email?: string | null; passwordHash: string }) => {
    const user = {
      id: `user-${authStore.users.size + 1}`,
      username: input.username,
      email: input.email ?? null,
      passwordHash: input.passwordHash
    }
    authStore.users.set(user.id, user)
    return {
      ...user,
      hashAlgorithm: 'argon2id',
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:00.000Z',
      deletedAt: null
    }
  }),
  getUserByUsername: vi.fn(async (username: string) => (
    Array.from(authStore.users.values()).find((user) => user.username === username) ?? null
  )),
  getUserByLoginIdentifier: vi.fn(async (identifier: string) => (
    Array.from(authStore.users.values()).find((user) => (
      user.username === identifier || user.email === identifier.toLowerCase()
    )) ?? null
  )),
  getUserById: vi.fn(async (id: string) => authStore.users.get(id) ?? null),
  deleteUserAccountCascade: vi.fn(async (userId: string) => {
    authStore.users.delete(userId)
  })
}))

vi.mock('../src/lib/auth/password', () => ({
  hashPassword: vi.fn(async (plain: string) => `hashed:${plain}`),
  verifyPassword: vi.fn(async (plain: string, hash: string) => hash === `hashed:${plain}`)
}))

vi.mock('../src/lib/auth/session', () => ({
  createSession: authStore.createSessionMock,
  getAuthenticatedUserId: vi.fn(async () => authStore.currentUserId),
  destroyAllSessions: authStore.destroyAllSessionsMock,
  destroySessionFromRequest: authStore.destroySessionFromRequestMock,
  applySessionCookie: authStore.applySessionCookieMock,
  clearSessionCookie: authStore.clearSessionCookieMock
}))

vi.mock('../src/lib/auth/login-guard', () => ({
  getLoginGuardStatus: authStore.getLoginGuardStatusMock,
  recordFailedLoginAttempt: authStore.recordFailedLoginAttemptMock,
  clearLoginGuard: authStore.clearLoginGuardMock
}))

import { POST as register } from '../app/api/auth/register/route'
import { POST as login } from '../app/api/auth/login/route'
import { POST as logout } from '../app/api/auth/logout/route'
import { GET as me } from '../app/api/auth/me/route'
import { POST as deleteAccount } from '../app/api/auth/delete-account/route'

describe('auth routes', () => {
  beforeEach(() => {
    authStore.users.clear()
    authStore.currentUserId = null
    authStore.createSessionMock.mockReset()
    authStore.createSessionMock.mockImplementation(async (userId: string) => {
      authStore.currentUserId = userId
      return {
        token: `token-${userId}`,
        sessionId: `session-${userId}`,
        userId,
        expiresAt: '2026-04-20T00:00:00.000Z'
      }
    })
    authStore.destroyAllSessionsMock.mockReset()
    authStore.destroySessionFromRequestMock.mockReset()
    authStore.applySessionCookieMock.mockClear()
    authStore.clearSessionCookieMock.mockClear()
    authStore.getLoginGuardStatusMock.mockReset()
    authStore.getLoginGuardStatusMock.mockResolvedValue({
      blocked: false,
      retryAfterSeconds: 0
    })
    authStore.recordFailedLoginAttemptMock.mockReset()
    authStore.recordFailedLoginAttemptMock.mockResolvedValue({
      blocked: false,
      retryAfterSeconds: 0
    })
    authStore.clearLoginGuardMock.mockReset()
    authStore.clearLoginGuardMock.mockResolvedValue(undefined)
  })

  it('register crea cuenta y devuelve sesion iniciada', async () => {
    const response = await register(new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'sofia',
        password: 'contrasena1234'
      })
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      authenticated: true,
      user: expect.objectContaining({
        username: 'sofia'
      })
    })
    expect(response.headers.get('set-cookie')).toContain('lap-session=token-user-1')
  })

  it('register rechaza una clave que no cumple los requisitos', async () => {
    const response = await register(new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'sofia',
        password: 'corta12'
      })
    }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      authenticated: false,
      error: 'PASSWORD_TOO_SHORT'
    })
  })

  it('register rechaza una cuenta repetida por usuario o correo', async () => {
    authStore.users.set('user-1', {
      id: 'user-1',
      username: 'ana@gmail.com',
      email: 'ana@gmail.com',
      passwordHash: 'hashed:segura123'
    })

    const response = await register(new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'ana@gmail.com',
        password: 'otra123456'
      })
    }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({
      authenticated: false,
      error: 'ACCOUNT_ALREADY_EXISTS'
    })
  })

  it('login valida la contraseña, acepta correo y responde 401 cuando no coincide', async () => {
    authStore.users.set('user-9', {
      id: 'user-9',
      username: 'ana',
      email: 'ana@gmail.com',
      passwordHash: 'hashed:secreta1'
    })

    const success = await login(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'ana@gmail.com',
        password: 'secreta1'
      })
    }))

    expect(success.status).toBe(200)
    expect(authStore.clearLoginGuardMock).toHaveBeenCalledWith(expect.any(Request), 'ana@gmail.com')

    const failure = await login(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'nadie@gmail.com',
        password: 'incorrecta'
      })
    }))

    expect(failure.status).toBe(401)
    expect(authStore.recordFailedLoginAttemptMock).toHaveBeenCalledWith(expect.any(Request), 'nadie@gmail.com')
  })

  it('me informa si hay una cuenta autenticada', async () => {
    authStore.users.set('user-10', {
      id: 'user-10',
      username: 'maria',
      email: null,
      passwordHash: 'hashed:clave1234'
    })
    authStore.currentUserId = 'user-10'

    const response = await me(new Request('http://localhost/api/auth/me'))
    const body = await response.json()

    expect(body).toEqual({
      authenticated: true,
      user: expect.objectContaining({
        id: 'user-10',
        username: 'maria'
      })
    })
  })

  it('logout destruye la sesion y limpia la cookie', async () => {
    const response = await logout(new Request('http://localhost/api/auth/logout', {
      method: 'POST'
    }))
    const body = await response.json()

    expect(authStore.destroySessionFromRequestMock).toHaveBeenCalled()
    expect(authStore.clearSessionCookieMock).toHaveBeenCalled()
    expect(body).toEqual({ success: true })
  })

  it('delete-account borra la cuenta autenticada', async () => {
    authStore.users.set('user-11', {
      id: 'user-11',
      username: 'tomas',
      email: null,
      passwordHash: 'hashed:segura123'
    })
    authStore.currentUserId = 'user-11'

    const response = await deleteAccount(new Request('http://localhost/api/auth/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirmation: 'ELIMINAR'
      })
    }))
    const body = await response.json()

    expect(authStore.destroyAllSessionsMock).toHaveBeenCalledWith('user-11')
    expect(body).toEqual({ success: true })
    expect(authStore.users.has('user-11')).toBe(false)
  })

  it('devuelve 503 si falta la configuracion de sesiones', async () => {
    authStore.users.set('user-12', {
      id: 'user-12',
      username: 'laura',
      email: null,
      passwordHash: 'hashed:segura123'
    })
    authStore.createSessionMock.mockRejectedValueOnce(new Error('SESSION_SECRET_NOT_SET'))

    const response = await login(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'laura',
        password: 'segura123'
      })
    }))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toEqual({
      authenticated: false,
      error: expect.stringContaining('SESSION_SECRET')
    })
  })

  it('devuelve 429 cuando hay demasiados intentos seguidos', async () => {
    authStore.getLoginGuardStatusMock.mockResolvedValueOnce({
      blocked: true,
      retryAfterSeconds: 120
    })

    const response = await login(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'ana@gmail.com',
        password: 'incorrecta'
      })
    }))
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('120')
    expect(body).toEqual({
      authenticated: false,
      error: 'AUTH_RATE_LIMITED'
    })
  })
})
