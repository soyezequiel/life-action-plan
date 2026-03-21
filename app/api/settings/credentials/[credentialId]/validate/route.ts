import { validateCredentialConfiguration } from '../../../../../../src/lib/auth/credential-config'
import { apiErrorMessages, jsonResponse } from '../../../../_shared'
import { getCredentialConfiguration } from '../../../../../../src/lib/auth/credential-config'
import { resolveUserId } from '../../../../_user-settings'

interface CredentialRouteContext {
  params: Promise<{ credentialId: string }>
}

async function getCredentialId(context: CredentialRouteContext): Promise<string> {
  const params = await context.params
  return params.credentialId?.trim() || ''
}

export async function POST(request: Request, context: CredentialRouteContext): Promise<Response> {
  const credentialId = await getCredentialId(context)
  const userId = resolveUserId(request)

  if (!credentialId) {
    return jsonResponse({
      success: false,
      error: apiErrorMessages.invalidRequest()
    }, { status: 400 })
  }

  const credential = await getCredentialConfiguration(credentialId)

  if (!credential || (credential.owner === 'user' && credential.ownerId !== userId)) {
    return jsonResponse({
      success: false,
      error: 'CREDENTIAL_NOT_FOUND'
    }, { status: 404 })
  }

  const result = await validateCredentialConfiguration(credentialId)

  if (!result) {
    return jsonResponse({
      success: false,
      error: 'CREDENTIAL_NOT_FOUND'
    }, { status: 404 })
  }

  return jsonResponse({
    success: true,
    credential: result.credential,
    validation: result.validation,
    details: result.details
  })
}
