import { DateTime } from 'luxon'
import { SignJWT } from 'jose/jwt/sign'
import { jwtVerify } from 'jose/jwt/verify'

export const SESSION_COOKIE_NAME = 'lap-session'
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

interface SessionTokenPayload {
  userId: string
  sessionId: string
  expiresAt: string
}

function getDevelopmentSessionFallback(): string | null {
  if (process.env.NODE_ENV === 'production') {
    return null
  }

  const fallbackSeed = process.env.API_KEY_ENCRYPTION_SECRET?.trim()
    || process.env.DATABASE_URL?.trim()
    || ''

  return fallbackSeed ? `dev-session:${fallbackSeed}` : null
}

function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET?.trim() || getDevelopmentSessionFallback()

  if (!secret) {
    throw new Error('SESSION_SECRET_NOT_SET')
  }

  return new TextEncoder().encode(secret)
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashSessionToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return toHex(new Uint8Array(digest))
}

export async function signSessionToken(input: SessionTokenPayload): Promise<string> {
  const expiresAt = DateTime.fromISO(input.expiresAt, { zone: 'utc' })

  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(input.userId)
    .setJti(input.sessionId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.toSeconds()))
    .sign(getSessionSecret())
}

export async function verifySessionToken(token: string): Promise<SessionTokenPayload | null> {
  try {
    const verified = await jwtVerify(token, getSessionSecret())
    const userId = typeof verified.payload.sub === 'string' ? verified.payload.sub.trim() : ''
    const sessionId = typeof verified.payload.jti === 'string' ? verified.payload.jti.trim() : ''
    const expiresAt = typeof verified.payload.exp === 'number'
      ? DateTime.fromSeconds(verified.payload.exp, { zone: 'utc' }).toISO()
      : null

    if (!userId || !sessionId || !expiresAt) {
      return null
    }

    return {
      userId,
      sessionId,
      expiresAt
    }
  } catch {
    return null
  }
}

export function readSessionTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') || ''
  const cookiePairs = cookieHeader.split(';')

  for (const pair of cookiePairs) {
    const [rawName, ...rawValueParts] = pair.trim().split('=')

    if (rawName !== SESSION_COOKIE_NAME) {
      continue
    }

    const value = rawValueParts.join('=').trim()
    return value ? decodeURIComponent(value) : null
  }

  return null
}

export function getSessionCookieExpiry(expiresAt?: string): Date {
  const resolved = expiresAt
    ? DateTime.fromISO(expiresAt, { zone: 'utc' })
    : DateTime.utc().plus({ seconds: SESSION_COOKIE_MAX_AGE_SECONDS })

  return resolved.toJSDate()
}
