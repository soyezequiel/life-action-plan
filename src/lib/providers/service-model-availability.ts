import {
  DEFAULT_BACKEND_OWNER_ID,
  ensureBackendEnvCredentialConfiguration,
  listCredentialConfigurations,
  validateCredentialConfiguration
} from '../auth/credential-config'
import { canUseLocalOllama, getDeploymentMode } from '../env/deployment'
import { DEFAULT_CREDENTIAL_LABEL } from '../../shared/schemas'
import { getDefaultBuildModelForProvider } from './provider-metadata'

const OLLAMA_REQUEST_TIMEOUT_MS = 3_000
const CLOUD_PROVIDER_IDS = ['openai', 'openrouter'] as const
const DEFAULT_OLLAMA_MODEL_NAME = 'qwen3:8b'

export interface ServiceModelAvailabilityOption {
  providerId: string
  modelId: string
  displayName: string
}

interface OllamaTagsResponse {
  models?: Array<{
    name?: string
    model?: string
  }>
}

function getProviderDisplayName(providerId: string): string {
  if (providerId === 'openrouter') {
    return 'OpenRouter'
  }

  if (providerId === 'ollama') {
    return 'Ollama'
  }

  return 'OpenAI'
}

function normalizeOllamaBaseUrl(baseURL?: string): string {
  const trimmed = (baseURL || 'http://localhost:11434').trim().replace(/\/+$/g, '')
  return trimmed.endsWith('/v1') ? trimmed.slice(0, -3) : trimmed
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function listValidatedCloudServiceModels(): Promise<ServiceModelAvailabilityOption[]> {
  await Promise.allSettled(CLOUD_PROVIDER_IDS.map(async (providerId) => {
    await ensureBackendEnvCredentialConfiguration({
      providerId
    })
  }))

  const credentials = await listCredentialConfigurations({
    owner: 'backend',
    ownerId: DEFAULT_BACKEND_OWNER_ID,
    secretType: 'api-key',
    status: 'active'
  })
  const options = new Map<string, ServiceModelAvailabilityOption>()
  const sortedCredentials = credentials
    .filter((credential) => CLOUD_PROVIDER_IDS.includes(credential.providerId as (typeof CLOUD_PROVIDER_IDS)[number]))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.label.localeCompare(right.label))

  for (const credential of sortedCredentials) {
    const modelId = getDefaultBuildModelForProvider(credential.providerId)

    if (!modelId || options.has(modelId)) {
      continue
    }

    const validation = await validateCredentialConfiguration(credential.id)

    if (!validation || validation.validation.validationError || validation.credential.status !== 'active') {
      continue
    }

    const providerName = getProviderDisplayName(credential.providerId)
    const displayName = credential.label === DEFAULT_CREDENTIAL_LABEL
      ? providerName
      : `${providerName} - ${credential.label}`

    options.set(modelId, {
      providerId: credential.providerId,
      modelId,
      displayName
    })
  }

  return CLOUD_PROVIDER_IDS.flatMap((providerId) => {
    const modelId = getDefaultBuildModelForProvider(providerId)
    return modelId && options.has(modelId)
      ? [options.get(modelId)!]
      : []
  })
}

async function listAvailableOllamaServiceModels(): Promise<ServiceModelAvailabilityOption[]> {
  if (!canUseLocalOllama(getDeploymentMode())) {
    return []
  }

  try {
    const baseUrl = normalizeOllamaBaseUrl(process.env.OLLAMA_BASE_URL)
    const response = await fetchWithTimeout(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    }, OLLAMA_REQUEST_TIMEOUT_MS)

    if (!response.ok) {
      return []
    }

    const payload = await response.json().catch(() => null) as OllamaTagsResponse | null
    const modelNames = Array.from(new Set((payload?.models ?? [])
      .map((entry) => entry.name?.trim() || entry.model?.trim() || '')
      .filter(Boolean)))
      .sort((left, right) => {
        if (left === DEFAULT_OLLAMA_MODEL_NAME) {
          return -1
        }

        if (right === DEFAULT_OLLAMA_MODEL_NAME) {
          return 1
        }

        return left.localeCompare(right)
      })

    if (modelNames.length === 0) {
      return []
    }

    const showModelName = modelNames.length > 1

    return modelNames.map((modelName) => ({
      providerId: 'ollama',
      modelId: `ollama:${modelName}`,
      displayName: showModelName ? `Ollama - ${modelName}` : 'Ollama'
    }))
  } catch {
    return []
  }
}

export async function listAvailableServiceModels(): Promise<ServiceModelAvailabilityOption[]> {
  const [cloudModels, ollamaModels] = await Promise.all([
    listValidatedCloudServiceModels(),
    listAvailableOllamaServiceModels()
  ])

  return [...cloudModels, ...ollamaModels]
}
