export type SupportedModelProvider = 'openai' | 'openrouter' | 'ollama' | 'unknown'
export type SupportedCloudModelProvider = Extract<SupportedModelProvider, 'openai' | 'openrouter'>

export const DEFAULT_OPENAI_BUILD_MODEL = 'openai:gpt-4o-mini'
export const DEFAULT_OPENROUTER_BUILD_MODEL = 'openrouter:openai/gpt-4o-mini'
export const DEFAULT_OLLAMA_BUILD_MODEL = 'ollama:qwen3:8b'

export function getDefaultBuildModelForProvider(providerId: SupportedModelProvider | string): string | null {
  const normalized = providerId.trim()

  if (normalized === 'openai') {
    return DEFAULT_OPENAI_BUILD_MODEL
  }

  if (normalized === 'openrouter') {
    return DEFAULT_OPENROUTER_BUILD_MODEL
  }

  if (normalized === 'ollama') {
    return DEFAULT_OLLAMA_BUILD_MODEL
  }

  return null
}

export function getModelProviderName(modelId: string | undefined | null): SupportedModelProvider {
  const normalized = modelId?.trim() || ''
  if (!normalized) {
    return 'unknown'
  }

  const colonIdx = normalized.indexOf(':')
  const providerName = colonIdx >= 0 ? normalized.slice(0, colonIdx) : 'openai'

  if (providerName === 'openai' || providerName === 'openrouter' || providerName === 'ollama') {
    return providerName
  }

  return 'unknown'
}

export function isLocalModel(modelId: string | undefined | null): boolean {
  return getModelProviderName(modelId) === 'ollama'
}

export function isCloudModel(modelId: string | undefined | null): boolean {
  const providerName = getModelProviderName(modelId)
  return providerName === 'openai' || providerName === 'openrouter'
}

export function supportsOllamaThinking(modelId: string | undefined | null): boolean {
  const normalized = modelId?.trim() || ''
  const modelName = normalized.startsWith('ollama:')
    ? normalized.slice('ollama:'.length)
    : normalized

  return /(qwen|deepseek|gpt-oss|qwq|r1)/i.test(modelName)
}

export function resolveBuildModel(requestedProvider: string | undefined | null): string {
  const normalized = requestedProvider?.trim() || ''

  if (!normalized) {
    return DEFAULT_OPENAI_BUILD_MODEL
  }

  const defaultModel = getDefaultBuildModelForProvider(normalized)

  if (defaultModel) {
    return defaultModel
  }

  return normalized
}

export function getProviderLabelKey(modelId: string | undefined | null): string {
  const providerName = getModelProviderName(modelId)

  if (providerName === 'ollama') {
    return 'builder.provider_local'
  }

  return 'builder.provider_online'
}

export function getBuildRouteLabelKey(modelId: string | undefined | null, fallbackUsed = false): string {
  if (fallbackUsed) {
    return 'builder.route_fallback_done'
  }

  const providerName = getModelProviderName(modelId)

  if (providerName === 'ollama') {
    return 'builder.route_local_done'
  }

  return 'builder.route_online_done'
}

export function getCloudApiKeyEnvName(modelId: string | undefined | null): 'OPENAI_API_KEY' | 'OPENROUTER_API_KEY' | null {
  const providerName = getModelProviderName(modelId)

  if (providerName === 'openrouter') {
    return 'OPENROUTER_API_KEY'
  }

  if (providerName === 'openai') {
    return 'OPENAI_API_KEY'
  }

  return null
}
