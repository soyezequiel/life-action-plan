import { DateTime } from 'luxon'
import {
  deleteAuthLoginGuard,
  getAuthLoginGuard,
  upsertAuthLoginGuard
} from '../db/db-helpers'
import { normalizeLoginIdentifier } from './login-identifier'

type LoginGuardScope = 'identifier' | 'ip'

interface LoginGuardStatus {
  blocked: boolean
  retryAfterSeconds: number
}

const WINDOW_MINUTES = 15
const LOCK_MINUTES = 15
const IDENTIFIER_ATTEMPT_LIMIT = 5
const IP_ATTEMPT_LIMIT = 12

function nowUtc(): DateTime {
  return DateTime.utc()
}

function normalizeClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const realIp = request.headers.get('x-real-ip')?.trim()
  const connectingIp = request.headers.get('cf-connecting-ip')?.trim()

  return forwardedFor || realIp || connectingIp || 'unknown'
}

async function hashGuardKey(scope: LoginGuardScope, value: string): Promise<string> {
  const payload = `${scope}:${value}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function getGuardEntries(request: Request, identifier: string) {
  const normalizedIdentifier = normalizeLoginIdentifier(identifier)
  const clientIp = normalizeClientIp(request)

  return Promise.all([
    {
      scope: 'identifier' as const,
      value: normalizedIdentifier,
      limit: IDENTIFIER_ATTEMPT_LIMIT,
      keyHash: await hashGuardKey('identifier', normalizedIdentifier)
    },
    {
      scope: 'ip' as const,
      value: clientIp,
      limit: IP_ATTEMPT_LIMIT,
      keyHash: await hashGuardKey('ip', clientIp)
    }
  ])
}

function getRetryAfterSeconds(blockedUntil: string): number {
  return Math.max(
    1,
    Math.ceil(DateTime.fromISO(blockedUntil, { zone: 'utc' }).diff(nowUtc(), 'seconds').seconds)
  )
}

export async function getLoginGuardStatus(request: Request, identifier: string): Promise<LoginGuardStatus> {
  const entries = await getGuardEntries(request, identifier)

  for (const entry of entries) {
    const guard = await getAuthLoginGuard(entry.scope, entry.keyHash)

    if (guard?.blockedUntil && DateTime.fromISO(guard.blockedUntil, { zone: 'utc' }).toMillis() > nowUtc().toMillis()) {
      return {
        blocked: true,
        retryAfterSeconds: getRetryAfterSeconds(guard.blockedUntil)
      }
    }
  }

  return {
    blocked: false,
    retryAfterSeconds: 0
  }
}

export async function recordFailedLoginAttempt(request: Request, identifier: string): Promise<LoginGuardStatus> {
  const entries = await getGuardEntries(request, identifier)
  const currentTime = nowUtc()
  let retryAfterSeconds = 0

  for (const entry of entries) {
    const guard = await getAuthLoginGuard(entry.scope, entry.keyHash)

    if (guard?.blockedUntil && DateTime.fromISO(guard.blockedUntil, { zone: 'utc' }).toMillis() > currentTime.toMillis()) {
      retryAfterSeconds = Math.max(retryAfterSeconds, getRetryAfterSeconds(guard.blockedUntil))
      continue
    }

    const windowStartedAt = guard?.windowStartedAt
      ? DateTime.fromISO(guard.windowStartedAt, { zone: 'utc' })
      : null
    const windowIsActive = Boolean(windowStartedAt && windowStartedAt.plus({ minutes: WINDOW_MINUTES }).toMillis() > currentTime.toMillis())
    const nextAttempts = windowIsActive ? (guard?.attempts ?? 0) + 1 : 1
    const nextWindowStartedAt = windowIsActive ? windowStartedAt!.toISO()! : currentTime.toISO()!
    const blockedUntil = nextAttempts >= entry.limit
      ? currentTime.plus({ minutes: LOCK_MINUTES }).toISO()!
      : null

    await upsertAuthLoginGuard({
      scope: entry.scope,
      keyHash: entry.keyHash,
      attempts: nextAttempts,
      windowStartedAt: nextWindowStartedAt,
      lastAttemptAt: currentTime.toISO()!,
      blockedUntil
    })

    if (blockedUntil) {
      retryAfterSeconds = Math.max(retryAfterSeconds, getRetryAfterSeconds(blockedUntil))
    }
  }

  return {
    blocked: retryAfterSeconds > 0,
    retryAfterSeconds
  }
}

export async function clearLoginGuard(request: Request, identifier: string): Promise<void> {
  const entries = await getGuardEntries(request, identifier)

  await Promise.all(entries.map((entry) => deleteAuthLoginGuard(entry.scope, entry.keyHash)))
}
