import {
  DEFAULT_BACKEND_OWNER_ID,
  listCredentialConfigurations
} from '../../../../src/lib/auth/credential-config'
import { DEFAULT_CREDENTIAL_LABEL } from '../../../../src/shared/schemas'
import { getDefaultBuildModelForProvider } from '../../../../src/lib/providers/provider-metadata'
import { jsonResponse } from '../../_shared'

function getProviderDisplayName(providerId: string): string {
  if (providerId === 'openrouter') {
    return 'OpenRouter'
  }

  if (providerId === 'openai') {
    return 'OpenAI'
  }

  return providerId
}

export async function GET(): Promise<Response> {
  const credentials = await listCredentialConfigurations({
    owner: 'backend',
    ownerId: DEFAULT_BACKEND_OWNER_ID,
    secretType: 'api-key',
    status: 'active'
  })
  const modelMap = new Map<string, { providerId: string; modelId: string; displayName: string }>()

  for (const credential of credentials) {
    const modelId = getDefaultBuildModelForProvider(credential.providerId)

    if (!modelId || modelMap.has(modelId)) {
      continue
    }

    const providerName = getProviderDisplayName(credential.providerId)
    const displayName = credential.label === DEFAULT_CREDENTIAL_LABEL
      ? providerName
      : `${providerName} - ${credential.label}`

    modelMap.set(modelId, {
      providerId: credential.providerId,
      modelId,
      displayName
    })
  }

  return jsonResponse({
    success: true,
    models: Array.from(modelMap.values())
  })
}
