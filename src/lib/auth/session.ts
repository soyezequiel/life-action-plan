import { DateTime } from 'luxon'
import type { NextResponse } from 'next/server'
import {
  createSessionRecord,
  deleteSessionRecordByTokenHash,
  deleteSessionRecordsByUserId,
  getSessionRecordByTokenHash
} from '../db/db-helpers'
import {
  getSessionCookieExpiry,
  hashSessionToken,
  readSessionTokenFromRequest,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  signSessionToken,
  verifySessionToken
} from './session-token'

export { SESSION_COOKIE_MAX_AGE_SECONDS, SESSION_COOKIE_NAME }

interface SessionResult {
  sessionId: string
  userId: string
  expiresAt: string
}

function getSessionExpiresAt(): string {
  return DateTime.utc().plus({ days: 30 }).toISO()!
}

function shouldUseSecureCookies(): boolean {
  return process.env.NODE_ENV === 'production'
}

export async function createSession(userId: string): Promise<SessionResult & { token: string }> {
  const sessionId = crypto.randomUUID()
  const expiresAt = getSessionExpiresAt()
  const token = await signSessionToken({
    userId,
    sessionId,
    expiresAt
  })

  await createSessionRecord({
    id: sessionId,
    userId,
    tokenHash: await hashSessionToken(token),
    expiresAt
  })

  return {
    token,
    sessionId,
    userId,
    expiresAt
  }
}

export async function validateSession(token: string): Promise<SessionResult | null> {
  const claims = await verifySessionToken(token)

  if (!claims) {
    return null
  }

  const tokenHash = await hashSessionToken(token)
  const sessionRecord = await getSessionRecordByTokenHash(tokenHash)

  if (
    !sessionRecord ||
    sessionRecord.id !== claims.sessionId ||
    sessionRecord.userId !== claims.userId ||
    DateTime.fromISO(sessionRecord.expiresAt, { zone: 'utc' }).toMillis() <= DateTime.utc().toMillis()
  ) {
    return null
  }

  return {
    sessionId: claims.sessionId,
    userId: claims.userId,
    expiresAt: claims.expiresAt
  }
}

export async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  const token = readSessionTokenFromRequest(request)

  if (!token) {
    return null
  }

  const session = await validateSession(token)
  return session?.userId ?? null
}

export async function destroySession(token: string): Promise<void> {
  await deleteSessionRecordByTokenHash(await hashSessionToken(token))
}

export async function destroySessionFromRequest(request: Request): Promise<void> {
  const token = readSessionTokenFromRequest(request)

  if (!token) {
    return
  }

  await destroySession(token)
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await deleteSessionRecordsByUserId(userId)
}

export function applySessionCookie(response: NextResponse, token: string, expiresAt?: string): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookies(),
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    expires: getSessionCookieExpiry(expiresAt)
  })
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookies(),
    path: '/',
    maxAge: 0,
    expires: DateTime.fromSeconds(0, { zone: 'utc' }).toJSDate()
  })
}
