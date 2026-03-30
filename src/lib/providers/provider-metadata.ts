export type SupportedModelProvider = 'openai' | 'openrouter' | 'unknown'
export type SupportedCloudModelProvider = Extract<SupportedModelProvider, 'openai' | 'openrouter'>

export const DEFAULT_OPENAI_BUILD_MODEL = 'openai:gpt-4o-mini'
export const DEFAULT_CODEX_BUILD_MODEL = 'openai:gpt-5-codex'
export const DEFAULT_OPENROUTER_BUILD_MODEL = 'openrouter:openai/gpt-4o-mini'

function isBareOpenAIModelId(value: string): boolean {
  return /^(gpt-|o\d|chatgpt-)/i.test(value)
}

export function getDefaultBuildModelForProvider(providerId: SupportedModelProvider | string): string | null {
  const normalized = providerId.trim()

  if (normalized === 'openai') {
    return DEFAULT_OPENAI_BUILD_MODEL
  }

  if (normalized === 'openrouter') {
    return DEFAULT_OPENROUTER_BUILD_MODEL
  }

  return null
}

export function getModelProviderName(modelId: string | undefined | null): SupportedModelProvider {
  const normalized = modelId?.trim() || ''
  if (!normalized) {
    return 'unknown'
  }

  const colonIdx = normalized.indexOf(':')
  if (colonIdx < 0) {
    return isBareOpenAIModelId(normalized)
      ? 'openai'
      : 'unknown'
  }

  const providerName = normalized.slice(0, colonIdx)

  if (providerName === 'openai' || providerName === 'openrouter') {
    return providerName
  }

  return 'unknown'
}

export function isLocalModel(modelId: string | undefined | null): boolean {
  void modelId
  return false
}

export function isCloudModel(modelId: string | undefined | null): boolean {
  const providerName = getModelProviderName(modelId)
  return providerName === 'openai' || providerName === 'openrouter'
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
  void modelId
  return 'builder.provider_online'
}

export function getBuildRouteLabelKey(modelId: string | undefined | null, fallbackUsed = false): string {
  if (fallbackUsed) {
    return 'builder.route_fallback_done'
  }

  void modelId
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
