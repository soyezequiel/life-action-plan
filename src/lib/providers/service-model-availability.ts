import {
  DEFAULT_BACKEND_OWNER_ID,
  ensureBackendEnvCredentialConfiguration,
  listCredentialConfigurations,
  validateCredentialConfiguration
} from '../auth/credential-config'
import { DEFAULT_CREDENTIAL_LABEL } from '../../shared/schemas'
import { getDefaultBuildModelForProvider } from './provider-metadata'

const CLOUD_PROVIDER_IDS = ['openai', 'openrouter'] as const

export interface ServiceModelAvailabilityOption {
  providerId: string
  modelId: string
  displayName: string
}

function getProviderDisplayName(providerId: string): string {
  if (providerId === 'openrouter') {
    return 'OpenRouter'
  }

  return 'OpenAI'
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

export async function listAvailableServiceModels(): Promise<ServiceModelAvailabilityOption[]> {
  return listValidatedCloudServiceModels()
}
