import { getUserByLoginIdentifier } from '../../_db'
import { loginRequestSchema } from '../../_schemas'
import { apiErrorMessages, jsonResponse } from '../../_shared'
import { clearLoginGuard, getLoginGuardStatus, recordFailedLoginAttempt } from '../../../../src/lib/auth/login-guard'
import { toAuthConfigErrorResponse, toAuthRateLimitedResponse } from '../_shared'
import { verifyPassword } from '../../../../src/lib/auth/password'
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
    const parsed = loginRequestSchema.safeParse(await request.json().catch(() => null))

    if (!parsed.success) {
      return jsonResponse({
        authenticated: false,
        error: apiErrorMessages.invalidRequest()
      }, { status: 400 })
    }

    const identifier = parsed.data.username.trim()
    const guardStatus = await getLoginGuardStatus(request, identifier)

    if (guardStatus.blocked) {
      return toAuthRateLimitedResponse(guardStatus.retryAfterSeconds)
    }

    const user = await getUserByLoginIdentifier(identifier)

    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      const nextGuardStatus = await recordFailedLoginAttempt(request, identifier)

      if (nextGuardStatus.blocked) {
        return toAuthRateLimitedResponse(nextGuardStatus.retryAfterSeconds)
      }

      return jsonResponse({
        authenticated: false,
        error: 'INVALID_CREDENTIALS'
      }, { status: 401 })
    }

    const session = await createSession(user.id)
    await clearLoginGuard(request, identifier)
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
