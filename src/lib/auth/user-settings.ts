export const DEFAULT_USER_ID = 'local-user'
export const WALLET_SETTING_KEY = 'wallet-nwc'
export const API_KEY_SETTING_KEY = 'openai-api-key'
export const OPENROUTER_API_KEY_SETTING_KEY = 'openrouter-api-key'

export type CloudApiKeyProvider = 'openai' | 'openrouter'

export function getApiKeySettingKey(provider: CloudApiKeyProvider = 'openai'): string {
  return provider === 'openrouter' ? OPENROUTER_API_KEY_SETTING_KEY : API_KEY_SETTING_KEY
}
