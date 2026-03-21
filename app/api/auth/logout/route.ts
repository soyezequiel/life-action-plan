import { jsonResponse } from '../../_shared'
import {
  clearSessionCookie,
  destroySessionFromRequest
} from '../../../../src/lib/auth/session'

export async function POST(request: Request): Promise<Response> {
  await destroySessionFromRequest(request)

  const response = jsonResponse({
    success: true
  })

  clearSessionCookie(response)
  return response
}
