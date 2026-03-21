import { getLatestProfileIdForUser } from '../../_db'
import { jsonResponse } from '../../_shared'
import { resolveAuthenticatedUserId } from '../../_user-settings'

export async function GET(request: Request): Promise<Response> {
  return jsonResponse(await getLatestProfileIdForUser(resolveAuthenticatedUserId(request)))
}
