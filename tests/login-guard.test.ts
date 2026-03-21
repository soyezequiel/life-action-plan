import { DateTime } from 'luxon'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const guardStore = vi.hoisted(() => ({
  rows: new Map<string, {
    id: string
    scope: string
    keyHash: string
    attempts: number
    windowStartedAt: string
    lastAttemptAt: string
    blockedUntil: string | null
    createdAt: string
    updatedAt: string
  }>()
}))

vi.mock('../src/lib/db/db-helpers', () => ({
  getAuthLoginGuard: vi.fn(async (scope: string, keyHash: string) => (
    guardStore.rows.get(`${scope}:${keyHash}`) ?? null
  )),
  upsertAuthLoginGuard: vi.fn(async (input: {
    scope: string
    keyHash: string
    attempts: number
    windowStartedAt: string
    lastAttemptAt: string
    blockedUntil?: string | null
  }) => {
    const key = `${input.scope}:${input.keyHash}`
    const existing = guardStore.rows.get(key)
    const timestamp = DateTime.utc().toISO()!
    const row = {
      id: existing?.id ?? crypto.randomUUID(),
      scope: input.scope,
      keyHash: input.keyHash,
      attempts: input.attempts,
      windowStartedAt: input.windowStartedAt,
      lastAttemptAt: input.lastAttemptAt,
      blockedUntil: input.blockedUntil ?? null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    }
    guardStore.rows.set(key, row)
    return row
  }),
  deleteAuthLoginGuard: vi.fn(async (scope: string, keyHash: string) => {
    guardStore.rows.delete(`${scope}:${keyHash}`)
  })
}))

import {
  clearLoginGuard,
  getLoginGuardStatus,
  recordFailedLoginAttempt
} from '../src/lib/auth/login-guard'

describe('login guard', () => {
  beforeEach(() => {
    guardStore.rows.clear()
  })

  it('bloquea despues de varios intentos fallidos seguidos', async () => {
    const request = new Request('http://localhost/api/auth/login', {
      headers: {
        'x-forwarded-for': '127.0.0.1'
      }
    })

    for (let index = 0; index < 4; index += 1) {
      const result = await recordFailedLoginAttempt(request, 'ana@gmail.com')
      expect(result.blocked).toBe(false)
    }

    const blocked = await recordFailedLoginAttempt(request, 'ana@gmail.com')
    const status = await getLoginGuardStatus(request, 'ana@gmail.com')

    expect(blocked.blocked).toBe(true)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
    expect(status.blocked).toBe(true)
  })

  it('limpia el bloqueo despues de un acceso valido', async () => {
    const request = new Request('http://localhost/api/auth/login', {
      headers: {
        'x-forwarded-for': '127.0.0.1'
      }
    })

    for (let index = 0; index < 5; index += 1) {
      await recordFailedLoginAttempt(request, 'ana@gmail.com')
    }

    await clearLoginGuard(request, 'ana@gmail.com')

    const status = await getLoginGuardStatus(request, 'ana@gmail.com')
    expect(status.blocked).toBe(false)
  })
})
