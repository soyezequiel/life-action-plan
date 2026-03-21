import { toConfigErrorMessage } from '../../../../../src/shared/config-errors'
import {
  getCredentialConfiguration,
  updateCredentialConfiguration
} from '../../../../../src/lib/auth/credential-config'
import { credentialUpdateRequestSchema } from '../../../_schemas'
import { apiErrorMessages, jsonResponse } from '../../../_shared'
import { resolveUserId } from '../../../_user-settings'

interface CredentialRouteContext {
  params: Promise<{ credentialId: string }>
}

async function getCredentialId(context: CredentialRouteContext): Promise<string> {
  const params = await context.params
  return params.credentialId?.trim() || ''
}

function toRouteErrorResponse(error: unknown): Response | null {
  const message = error instanceof Error ? error.message : 'Unknown error'
  const configError = toConfigErrorMessage(message)

  if (configError) {
    return jsonResponse({
      success: false,
      error: configError
    }, { status: 503 })
  }

  return null
}

function canAccessCredential(credential: { owner: string; ownerId: string }, userId: string): boolean {
  return credential.owner === 'backend' || credential.ownerId === userId
}

export async function GET(request: Request, context: CredentialRouteContext): Promise<Response> {
  const credentialId = await getCredentialId(context)
  const userId = resolveUserId(request)

  if (!credentialId) {
    return jsonResponse({
      success: false,
      error: apiErrorMessages.invalidRequest()
    }, { status: 400 })
  }

  const credential = await getCredentialConfiguration(credentialId)

  if (!credential) {
    return jsonResponse({
      success: false,
      error: 'CREDENTIAL_NOT_FOUND'
    }, { status: 404 })
  }

  if (!canAccessCredential(credential, userId)) {
    return jsonResponse({
      success: false,
      error: 'CREDENTIAL_NOT_FOUND'
    }, { status: 404 })
  }

  return jsonResponse({
    success: true,
    credential
  })
}

export async function PATCH(request: Request, context: CredentialRouteContext): Promise<Response> {
  const credentialId = await getCredentialId(context)
  const parsed = credentialUpdateRequestSchema.safeParse(await request.json().catch(() => null))
  const userId = resolveUserId(request)

  if (!credentialId || !parsed.success) {
    return jsonResponse({
      success: false,
      error: apiErrorMessages.invalidRequest()
    }, { status: 400 })
  }

  try {
    const existingCredential = await getCredentialConfiguration(credentialId)

    if (!existingCredential || !canAccessCredential(existingCredential, userId)) {
      return jsonResponse({
        success: false,
        error: 'CREDENTIAL_NOT_FOUND'
      }, { status: 404 })
    }

    const credential = await updateCredentialConfiguration(credentialId, parsed.data)

    if (!credential) {
      return jsonResponse({
        success: false,
        error: 'CREDENTIAL_NOT_FOUND'
      }, { status: 404 })
    }

    return jsonResponse({
      success: true,
      credential
    })
  } catch (error) {
    const routeError = toRouteErrorResponse(error)

    if (routeError) {
      return routeError
    }

    throw error
  }
}
