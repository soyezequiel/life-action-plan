import {
  findCredentialConfiguration,
  saveCredentialConfiguration,
  updateCredentialConfiguration
} from '../../../../src/lib/auth/credential-config'
import { isSecretStorageAvailable } from '../../../../src/lib/auth/secret-storage'
import { toConfigErrorMessage } from '../../../../src/shared/config-errors'
import { apiKeySaveRequestSchema } from '../../_schemas'
import { apiErrorMessages, jsonResponse } from '../../_shared'
import { getApiKeySettingKey, resolveUserId, type CloudApiKeyProvider } from '../../_user-settings'

function getRequestedProvider(request: Request): CloudApiKeyProvider {
  const rawProvider = new URL(request.url).searchParams.get('provider')?.trim()
  return rawProvider === 'openrouter' ? 'openrouter' : 'openai'
}

export async function GET(request: Request): Promise<Response> {
  const provider = getRequestedProvider(request)
  const userId = resolveUserId(request)
  const storedCredential = await findCredentialConfiguration({
    owner: 'user',
    ownerId: userId,
    providerId: provider,
    secretType: 'api-key',
    label: getApiKeySettingKey(provider)
  })

  return jsonResponse({
    provider,
    configured: storedCredential?.status === 'active' && isSecretStorageAvailable()
  })
}

export async function POST(request: Request): Promise<Response> {
  const parsed = apiKeySaveRequestSchema.safeParse(await request.json().catch(() => null))
  const userId = resolveUserId(request)

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      configured: false,
      error: apiErrorMessages.invalidRequest()
    }, { status: 400 })
  }

  if (!isSecretStorageAvailable()) {
    return jsonResponse({
      success: false,
      configured: false,
      error: toConfigErrorMessage('API_KEY_ENCRYPTION_SECRET_NOT_SET') ?? 'API_KEY_ENCRYPTION_SECRET_NOT_SET'
    }, { status: 503 })
  }

  await saveCredentialConfiguration({
    owner: 'user',
    ownerId: userId,
    providerId: parsed.data.provider,
    secretType: 'api-key',
    label: getApiKeySettingKey(parsed.data.provider),
    secretValue: parsed.data.apiKey,
    status: 'active'
  })

  return jsonResponse({
    success: true,
    provider: parsed.data.provider,
    configured: true
  })
}

export async function DELETE(request: Request): Promise<Response> {
  const provider = getRequestedProvider(request)
  const userId = resolveUserId(request)
  const existing = await findCredentialConfiguration({
    owner: 'user',
    ownerId: userId,
    providerId: provider,
    secretType: 'api-key',
    label: getApiKeySettingKey(provider)
  })

  if (existing) {
    await updateCredentialConfiguration(existing.id, {
      status: 'inactive'
    })
  }

  return jsonResponse({
    success: true,
    provider,
    configured: false
  })
}
