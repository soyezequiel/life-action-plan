import { toConfigErrorMessage } from '../../../../src/shared/config-errors'
import {
  listCredentialConfigurations,
  saveCredentialConfiguration
} from '../../../../src/lib/auth/credential-config'
import {
  credentialListQuerySchema,
  credentialSaveRequestSchema
} from '../../_schemas'
import { apiErrorMessages, jsonResponse } from '../../_shared'
import { resolveUserId } from '../../_user-settings'

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

export async function GET(request: Request): Promise<Response> {
  const parsed = credentialListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()))

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      error: apiErrorMessages.invalidRequest()
    }, { status: 400 })
  }

  const credentials = await listCredentialConfigurations({
    ...parsed.data,
    ownerId: parsed.data.owner === 'user'
      ? resolveUserId(request)
      : parsed.data.ownerId
  })

  return jsonResponse({
    success: true,
    credentials
  })
}

export async function POST(request: Request): Promise<Response> {
  const parsed = credentialSaveRequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      error: apiErrorMessages.invalidRequest()
    }, { status: 400 })
  }

  try {
    const credential = await saveCredentialConfiguration({
      ...parsed.data,
      ownerId: parsed.data.owner === 'user'
        ? resolveUserId(request)
        : parsed.data.ownerId
    })

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
