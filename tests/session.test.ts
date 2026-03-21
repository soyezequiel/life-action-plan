import { DateTime } from 'luxon'
import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionStore = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string
    userId: string
    tokenHash: string
    expiresAt: string
    createdAt: string
  }>
}))

vi.mock('../src/lib/db/db-helpers', () => ({
  createSessionRecord: vi.fn(async (input: {
    id: string
    userId: string
    tokenHash: string
    expiresAt: string
  }) => {
    const row = {
      ...input,
      createdAt: DateTime.utc().toISO()!
    }
    sessionStore.rows.push(row)
    return row
  }),
  getSessionRecordByTokenHash: vi.fn(async (tokenHash: string) => (
    sessionStore.rows.find((row) => row.tokenHash === tokenHash) ?? null
  )),
  deleteSessionRecordByTokenHash: vi.fn(async (tokenHash: string) => {
    sessionStore.rows = sessionStore.rows.filter((row) => row.tokenHash !== tokenHash)
  }),
  deleteSessionRecordsByUserId: vi.fn(async (userId: string) => {
    sessionStore.rows = sessionStore.rows.filter((row) => row.userId !== userId)
  })
}))

import {
  applySessionCookie,
  clearSessionCookie,
  createSession,
  destroyAllSessions,
  destroySession,
  validateSession
} from '../src/lib/auth/session'

describe('session helpers', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const env = process.env as Record<string, string | undefined>

  beforeEach(() => {
    process.env.SESSION_SECRET = 'session-secret-de-prueba-que-tiene-largo'
    env.NODE_ENV = originalNodeEnv
    sessionStore.rows = []
  })

  it('crea, valida y destruye una sesion', async () => {
    const session = await createSession('user-1')
    const validated = await validateSession(session.token)

    expect(session.token).toBeTruthy()
    expect(validated).toEqual(expect.objectContaining({
      sessionId: session.sessionId,
      userId: 'user-1'
    }))
    expect(validated).toBeTruthy()
    expect(DateTime.fromISO(validated!.expiresAt, { zone: 'utc' }).toSeconds()).toBe(
      Math.floor(DateTime.fromISO(session.expiresAt, { zone: 'utc' }).toSeconds())
    )

    await destroySession(session.token)

    expect(await validateSession(session.token)).toBeNull()
  })

  it('revoca todas las sesiones del usuario', async () => {
    const first = await createSession('user-2')
    const second = await createSession('user-2')

    await destroyAllSessions('user-2')

    expect(await validateSession(first.token)).toBeNull()
    expect(await validateSession(second.token)).toBeNull()
  })

  it('rechaza una sesion vencida aunque el token sea valido', async () => {
    const session = await createSession('user-3')

    sessionStore.rows[0] = {
      ...sessionStore.rows[0]!,
      expiresAt: DateTime.utc().minus({ minutes: 1 }).toISO()!
    }

    expect(await validateSession(session.token)).toBeNull()
  })

  it('usa un respaldo local cuando falta SESSION_SECRET fuera de produccion', async () => {
    delete process.env.SESSION_SECRET
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/lap'

    const session = await createSession('user-4')
    const validated = await validateSession(session.token)

    expect(session.token).toBeTruthy()
    expect(validated?.userId).toBe('user-4')
  })

  it('usa cookies no seguras en desarrollo local', () => {
    env.NODE_ENV = 'development'
    const response = NextResponse.json({ ok: true })

    applySessionCookie(response, 'token-local')

    expect(response.headers.get('set-cookie')).toContain('lap-session=token-local')
    expect(response.headers.get('set-cookie')).not.toContain('Secure')
  })

  it('usa cookies seguras en produccion y al limpiar la sesion', () => {
    env.NODE_ENV = 'production'
    const response = NextResponse.json({ ok: true })

    applySessionCookie(response, 'token-prod')
    expect(response.headers.get('set-cookie')).toContain('Secure')

    const clearResponse = NextResponse.json({ ok: true })
    clearSessionCookie(clearResponse)
    expect(clearResponse.headers.get('set-cookie')).toContain('Secure')
  })
})
