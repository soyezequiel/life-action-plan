import {
  deleteUserAccountCascade,
  getUserById
} from '../../_db'
import { deleteAccountRequestSchema } from '../../_schemas'
import { apiErrorMessages, jsonResponse } from '../../_shared'
import {
  clearSessionCookie,
  destroyAllSessions,
  getAuthenticatedUserId
} from '../../../../src/lib/auth/session'

export async function POST(request: Request): Promise<Response> {
  const parsed = deleteAccountRequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      error: apiErrorMessages.invalidRequest()
    }, { status: 400 })
  }

  const userId = await getAuthenticatedUserId(request)

  if (!userId) {
    return jsonResponse({
      success: false,
      error: 'UNAUTHORIZED'
    }, { status: 401 })
  }

  const user = await getUserById(userId)

  if (!user) {
    return jsonResponse({
      success: false,
      error: 'UNAUTHORIZED'
    }, { status: 401 })
  }

  await destroyAllSessions(user.id)
  await deleteUserAccountCascade(user.id)

  const response = jsonResponse({
    success: true
  })

  clearSessionCookie(response)
  return response
}
