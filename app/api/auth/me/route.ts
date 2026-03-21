import { getUserById } from '../../_db'
import { jsonResponse } from '../../_shared'
import { getAuthenticatedUserId } from '../../../../src/lib/auth/session'

export async function GET(request: Request): Promise<Response> {
  const userId = await getAuthenticatedUserId(request)

  if (!userId) {
    return jsonResponse({
      authenticated: false
    })
  }

  const user = await getUserById(userId)

  if (!user) {
    return jsonResponse({
      authenticated: false
    })
  }

  return jsonResponse({
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email
    }
  })
}
