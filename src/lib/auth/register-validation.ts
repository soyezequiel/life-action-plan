import { extractEmailFromLoginIdentifier, normalizeLoginIdentifier } from './login-identifier'

const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/

export interface RegisterValidationResult {
  ok: boolean
  errorCode?: string
  normalizedIdentifier?: string
  normalizedEmail?: string | null
}

function getNormalizedEmailCandidate(identifier: string): string {
  return identifier.toLowerCase()
}

export function validateRegisterSubmission(identifierRaw: string, passwordRaw: string): RegisterValidationResult {
  const identifier = normalizeLoginIdentifier(identifierRaw)
  const password = passwordRaw

  if (!identifier) {
    return { ok: false, errorCode: 'ACCOUNT_IDENTIFIER_REQUIRED' }
  }

  if (identifier.length > 120) {
    return { ok: false, errorCode: 'ACCOUNT_IDENTIFIER_TOO_LONG' }
  }

  const normalizedEmail = extractEmailFromLoginIdentifier(identifier)

  if (identifier.includes('@') && !normalizedEmail) {
    return { ok: false, errorCode: 'ACCOUNT_EMAIL_INVALID' }
  }

  if (!normalizedEmail) {
    if (identifier.length < 3) {
      return { ok: false, errorCode: 'ACCOUNT_USERNAME_TOO_SHORT' }
    }

    if (identifier.length > 40) {
      return { ok: false, errorCode: 'ACCOUNT_USERNAME_TOO_LONG' }
    }

    if (!USERNAME_PATTERN.test(identifier)) {
      return { ok: false, errorCode: 'ACCOUNT_USERNAME_INVALID' }
    }
  }

  if (password.length < 10) {
    return { ok: false, errorCode: 'PASSWORD_TOO_SHORT' }
  }

  if (password.length > 128) {
    return { ok: false, errorCode: 'PASSWORD_TOO_LONG' }
  }

  if (!/[A-Za-z]/.test(password)) {
    return { ok: false, errorCode: 'PASSWORD_NEEDS_LETTER' }
  }

  if (!/\d/.test(password)) {
    return { ok: false, errorCode: 'PASSWORD_NEEDS_NUMBER' }
  }

  const comparableIdentifier = (normalizedEmail ?? identifier).toLowerCase()
  const identifierCore = comparableIdentifier.includes('@')
    ? comparableIdentifier.split('@')[0]!
    : comparableIdentifier

  if (
    identifierCore.length >= 3 &&
    password.toLowerCase().includes(identifierCore)
  ) {
    return { ok: false, errorCode: 'PASSWORD_TOO_SIMILAR' }
  }

  if (new Set(password.replace(/\s+/g, '').toLowerCase()).size < 3) {
    return { ok: false, errorCode: 'PASSWORD_TOO_SIMPLE' }
  }

  return {
    ok: true,
    normalizedIdentifier: identifier,
    normalizedEmail: normalizedEmail ?? (identifier.includes('@') ? getNormalizedEmailCandidate(identifier) : null)
  }
}
