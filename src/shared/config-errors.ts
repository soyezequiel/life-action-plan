import { t } from '../i18n'

function isDevelopmentEnvironment(): boolean {
  return process.env.NODE_ENV !== 'production'
}

function toDevelopmentConfigErrorMessage(envName: string): string {
  return t('errors.dev_missing_env', { name: envName })
}

export function toConfigErrorMessage(rawMessage: string): string | null {
  const normalized = rawMessage.toLowerCase()

  if (normalized.includes('database_url_not_set')) {
    return isDevelopmentEnvironment()
      ? toDevelopmentConfigErrorMessage('DATABASE_URL')
      : t('errors.service_unavailable')
  }

  if (
    normalized.includes('api_key_encryption_secret_not_set') ||
    normalized.includes('api key encryption is not configured') ||
    normalized.includes('secure_storage_unavailable')
  ) {
    return isDevelopmentEnvironment()
      ? toDevelopmentConfigErrorMessage('API_KEY_ENCRYPTION_SECRET')
      : t('errors.service_unavailable')
  }

  return null
}
