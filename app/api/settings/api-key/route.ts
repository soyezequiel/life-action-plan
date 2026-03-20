import { encryptApiKey, isApiKeyEncryptionConfigured } from '../../../../src/lib/auth/api-key-auth'
import { toConfigErrorMessage } from '../../../../src/shared/config-errors'
import { deleteUserSetting, getUserSetting, upsertUserSetting } from '../../_db'
import { apiKeySaveRequestSchema } from '../../_schemas'
import { apiErrorMessages, jsonResponse } from '../../_shared'
import { API_KEY_SETTING_KEY, DEFAULT_USER_ID } from '../../_user-settings'

export async function GET(): Promise<Response> {
  const storedValue = await getUserSetting(DEFAULT_USER_ID, API_KEY_SETTING_KEY)

  return jsonResponse({
    configured: Boolean(storedValue) && isApiKeyEncryptionConfigured()
  })
}

export async function POST(request: Request): Promise<Response> {
  const parsed = apiKeySaveRequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      configured: false,
      error: apiErrorMessages.invalidRequest()
    }, { status: 400 })
  }

  if (!isApiKeyEncryptionConfigured()) {
    return jsonResponse({
      success: false,
      configured: false,
      error: toConfigErrorMessage('API_KEY_ENCRYPTION_SECRET_NOT_SET') ?? 'API_KEY_ENCRYPTION_SECRET_NOT_SET'
    }, { status: 503 })
  }

  await upsertUserSetting(DEFAULT_USER_ID, API_KEY_SETTING_KEY, encryptApiKey(parsed.data.apiKey))

  return jsonResponse({
    success: true,
    configured: true
  })
}

export async function DELETE(): Promise<Response> {
  await deleteUserSetting(DEFAULT_USER_ID, API_KEY_SETTING_KEY)

  return jsonResponse({
    success: true,
    configured: false
  })
}
