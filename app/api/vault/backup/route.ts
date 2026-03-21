import {
  getEncryptedKeyVaultByUserId,
  upsertEncryptedKeyVault
} from '../../_db'
import { vaultBackupRequestSchema } from '../../_schemas'
import { apiErrorMessages, jsonResponse } from '../../_shared'
import { getAuthenticatedUserId } from '../../../../src/lib/auth/session'

export async function GET(request: Request): Promise<Response> {
  const userId = await getAuthenticatedUserId(request)

  if (!userId) {
    return jsonResponse({
      success: false,
      error: 'UNAUTHORIZED'
    }, { status: 401 })
  }

  const backup = await getEncryptedKeyVaultByUserId(userId)

  return jsonResponse({
    success: true,
    backup: backup
      ? {
          encryptedBlob: backup.encryptedBlob,
          salt: backup.salt,
          updatedAt: backup.updatedAt
        }
      : null
  })
}

export async function POST(request: Request): Promise<Response> {
  const userId = await getAuthenticatedUserId(request)

  if (!userId) {
    return jsonResponse({
      success: false,
      error: 'UNAUTHORIZED'
    }, { status: 401 })
  }

  const parsed = vaultBackupRequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      error: apiErrorMessages.invalidRequest()
    }, { status: 400 })
  }

  const backup = await upsertEncryptedKeyVault({
    userId,
    encryptedBlob: parsed.data.encryptedBlob,
    salt: parsed.data.salt
  })

  return jsonResponse({
    success: true,
    backup: {
      encryptedBlob: backup.encryptedBlob,
      salt: backup.salt,
      updatedAt: backup.updatedAt
    }
  })
}
