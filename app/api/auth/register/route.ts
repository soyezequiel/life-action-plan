import { createUser, getUserByLoginIdentifier } from '../../_db'
import { registerRequestSchema } from '../../_schemas'
import { apiErrorMessages, jsonResponse } from '../../_shared'
import { toAuthConfigErrorResponse } from '../_shared'
import { hashPassword } from '../../../../src/lib/auth/password'
import { validateRegisterSubmission } from '../../../../src/lib/auth/register-validation'
import { applySessionCookie, createSession } from '../../../../src/lib/auth/session'

function toPublicUser(user: { id: string; username: string; email: string | null }) {
  return {
    id: user.id,
    username: user.username,
    email: user.email
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = registerRequestSchema.safeParse(await request.json().catch(() => null))

    if (!parsed.success) {
      return jsonResponse({
        authenticated: false,
        error: apiErrorMessages.invalidRequest()
      }, { status: 400 })
    }

    const validation = validateRegisterSubmission(parsed.data.username, parsed.data.password)

    if (!validation.ok) {
      return jsonResponse({
        authenticated: false,
        error: validation.errorCode
      }, { status: 400 })
    }

    const username = validation.normalizedIdentifier!
    const existingUser = await getUserByLoginIdentifier(username)

    if (existingUser) {
      return jsonResponse({
        authenticated: false,
        error: 'ACCOUNT_ALREADY_EXISTS'
      }, { status: 409 })
    }

    const user = await createUser({
      username,
      email: validation.normalizedEmail ?? null,
      passwordHash: await hashPassword(parsed.data.password)
    })
    const session = await createSession(user.id)
    const response = jsonResponse({
      authenticated: true,
      user: toPublicUser(user)
    })

    applySessionCookie(response, session.token, session.expiresAt)
    return response
  } catch (error) {
    const configErrorResponse = toAuthConfigErrorResponse(error)

    if (configErrorResponse) {
      return configErrorResponse
    }

    throw error
  }
}
