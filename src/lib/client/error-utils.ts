import { t } from '../../i18n'
import { toConfigErrorMessage } from '../../shared/config-errors'

function parseErrorPayload(rawValue: string): string {
  const trimmed = rawValue.trim()

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return trimmed
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      error?: unknown
      message?: unknown
    }

    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.error.trim()
    }

    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim()
    }
  } catch {
    // Keep the original text when the payload is not valid JSON.
  }

  return trimmed
}

export function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return parseErrorPayload(error)
  }

  if (error instanceof Error) {
    return parseErrorPayload(error.message)
  }

  return 'Unknown error'
}

export function toUserFacingErrorMessage(error: unknown, fallbackKey = 'errors.generic'): string {
  const message = extractErrorMessage(error)
  const normalized = message.toLowerCase()

  if (
    message.startsWith('El asistente ') ||
    message.startsWith('No pude ') ||
    message === 'Perfil no encontrado'
  ) {
    return message
  }

  if (
    normalized.includes('account_already_exists') ||
    normalized.includes('username_already_exists')
  ) {
    return t('auth.account_exists')
  }

  if (normalized.includes('invalid_credentials')) {
    return t('auth.invalid_credentials')
  }

  if (normalized.includes('auth_rate_limited')) {
    return t('auth.too_many_attempts')
  }

  if (normalized.includes('account_identifier_required')) {
    return t('auth.identifier_required')
  }

  if (normalized.includes('account_identifier_too_long')) {
    return t('auth.identifier_too_long')
  }

  if (normalized.includes('account_email_invalid')) {
    return t('auth.email_invalid')
  }

  if (normalized.includes('account_username_too_short')) {
    return t('auth.username_too_short')
  }

  if (normalized.includes('account_username_too_long')) {
    return t('auth.username_too_long')
  }

  if (normalized.includes('account_username_invalid')) {
    return t('auth.username_invalid')
  }

  if (normalized.includes('password_too_short')) {
    return t('auth.password_too_short')
  }

  if (normalized.includes('password_too_long')) {
    return t('auth.password_too_long')
  }

  if (normalized.includes('password_needs_letter')) {
    return t('auth.password_needs_letter')
  }

  if (normalized.includes('password_needs_number')) {
    return t('auth.password_needs_number')
  }

  if (normalized.includes('password_too_similar')) {
    return t('auth.password_too_similar')
  }

  if (normalized.includes('password_too_simple')) {
    return t('auth.password_too_simple')
  }

  if (
    normalized.includes('api key') ||
    normalized.includes('unauthorized') ||
    normalized.includes('authentication') ||
    normalized.includes('401') ||
    normalized.includes('403')
  ) {
    return t('errors.no_api_key')
  }

  if (
    normalized.includes('budget') ||
    normalized.includes('quota') ||
    normalized.includes('insufficient')
  ) {
    return t('errors.budget_exceeded')
  }

  if (
    normalized.includes('wallet_nwc_info_unavailable') ||
    normalized.includes('unsupported_nwc_version') ||
    (normalized.includes('no info event') && normalized.includes('13194'))
  ) {
    return t('settings.wallet_error_nwc_incompatible')
  }

  if (normalized.includes('invalid_nwc_url')) {
    return t('settings.wallet_error_invalid_url')
  }

  if (
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('tardo demasiado') ||
    normalized.includes('tard')
  ) {
    return t('errors.request_timeout')
  }

  if (
    normalized.includes('fetch failed') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('econnrefused') ||
    normalized.includes('enotfound') ||
    normalized.includes('networkerror') ||
    normalized.includes('network socket') ||
    normalized.includes('connection refused')
  ) {
    return t('errors.network_unavailable')
  }

  const configErrorMessage = toConfigErrorMessage(message)
  if (configErrorMessage) {
    return configErrorMessage
  }

  if (
    normalized.includes('plan_not_found') ||
    normalized.includes('profile_not_found')
  ) {
    return t(fallbackKey)
  }

  if (!message || message === 'Unknown error' || /^[A-Z0-9_:-]+$/.test(message)) {
    return t(fallbackKey)
  }

  return message
}
