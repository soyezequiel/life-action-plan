import { getCodexAuthAvailability } from '../auth/codex-auth'
import {
  DEFAULT_CODEX_BUILD_MODEL,
  DEFAULT_OLLAMA_BUILD_MODEL,
  DEFAULT_OPENAI_BUILD_MODEL,
  DEFAULT_OPENROUTER_BUILD_MODEL,
  getModelProviderName
} from '../providers/provider-metadata'

export type RealRunnerAuthMode = 'api-key' | 'codex-oauth'

export interface RealRunnerRuntimeConfig {
  apiKey: string
  baseURL?: string
  thinkingMode?: 'enabled' | 'disabled'
  authMode?: RealRunnerAuthMode
}

export interface RealRunnerSelection {
  modelId: string
  runtimeConfig: RealRunnerRuntimeConfig
}

export interface RealRunnerSelectionOptions {
  cliModelId?: string
  env?: RealRunnerEnvironment
  thinkingMode?: 'enabled' | 'disabled'
}

const CODEX_BACKEND_BASE_URL = 'https://chatgpt.com/backend-api/codex'
const CODEX_OAUTH_PLACEHOLDER_KEY = 'chatgpt-oauth'

export interface RealRunnerEnvironment {
  LAP_V5_REAL_MODEL?: string
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  OPENROUTER_API_KEY?: string
  OPENROUTER_BASE_URL?: string
  OLLAMA_BASE_URL?: string
}

function normalizeRequestedModelId(modelId: string): string {
  const normalized = modelId.trim()
  const lowered = normalized.toLowerCase()

  if (lowered === 'codex' || lowered === 'codex-cloud' || lowered === 'gpt-5-codex') {
    return DEFAULT_CODEX_BUILD_MODEL
  }

  return normalized
}

function isCodexRequestedModel(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase()
  const colonIdx = normalized.indexOf(':')
  const providerName = colonIdx >= 0 ? normalized.slice(0, colonIdx) : 'openai'
  const modelName = colonIdx >= 0 ? normalized.slice(colonIdx + 1) : normalized

  return providerName === 'openai' && modelName.includes('codex')
}

function resolveDefaultModelId(env: RealRunnerEnvironment | undefined, codexAuthAvailable: boolean): string {
  if (codexAuthAvailable) {
    return DEFAULT_CODEX_BUILD_MODEL
  }

  if (env?.OPENAI_API_KEY?.trim()) {
    return DEFAULT_OPENAI_BUILD_MODEL
  }

  if (env?.OPENROUTER_API_KEY?.trim()) {
    return DEFAULT_OPENROUTER_BUILD_MODEL
  }

  return DEFAULT_OLLAMA_BUILD_MODEL
}

function resolveRuntimeConfig(
  modelId: string,
  env: RealRunnerEnvironment | undefined,
  thinkingMode: 'enabled' | 'disabled' | undefined,
  codexAuthAvailable: boolean
): RealRunnerRuntimeConfig {
  const providerName = getModelProviderName(modelId)

  if (providerName === 'openai') {
    if (isCodexRequestedModel(modelId)) {
      if (!codexAuthAvailable) {
        throw new Error(
          'La sesion local de Codex no esta disponible. Inicia sesion con Codex para usar este modelo.'
        )
      }

      return {
        apiKey: CODEX_OAUTH_PLACEHOLDER_KEY,
        baseURL: CODEX_BACKEND_BASE_URL,
        thinkingMode,
        authMode: 'codex-oauth'
      }
    }

    const apiKey = env?.OPENAI_API_KEY?.trim() || ''
    if (!apiKey) {
      throw new Error(`OPENAI_API_KEY is required to run ${modelId}.`)
    }

    return {
      apiKey,
      baseURL: env?.OPENAI_BASE_URL?.trim() || undefined,
      thinkingMode
    }
  }

  if (providerName === 'openrouter') {
    const apiKey = env?.OPENROUTER_API_KEY?.trim() || ''
    if (!apiKey) {
      throw new Error(`OPENROUTER_API_KEY is required to run ${modelId}.`)
    }

    return {
      apiKey,
      baseURL: env?.OPENROUTER_BASE_URL?.trim() || undefined,
      thinkingMode
    }
  }

  if (providerName === 'ollama') {
    return {
      apiKey: '',
      baseURL: env?.OLLAMA_BASE_URL?.trim() || 'http://localhost:11434',
      thinkingMode
    }
  }

  throw new Error(`Unsupported provider for model "${modelId}".`)
}

export async function resolveRealRunnerSelection(
  options: RealRunnerSelectionOptions = {}
): Promise<RealRunnerSelection> {
  const env = (options.env ?? process.env) as RealRunnerEnvironment
  const codexAuthAvailability = await getCodexAuthAvailability()
  const explicitModelId = options.cliModelId?.trim() || env.LAP_V5_REAL_MODEL?.trim()
  const modelId = explicitModelId
    ? normalizeRequestedModelId(explicitModelId)
    : resolveDefaultModelId(env, codexAuthAvailability.available)

  return {
    modelId,
    runtimeConfig: resolveRuntimeConfig(modelId, env, options.thinkingMode, codexAuthAvailability.available)
  }
}
