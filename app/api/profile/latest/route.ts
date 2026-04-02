import { getLatestProfileIdForUser, getLatestProfileIdWithPlans } from '../../_db'
import { jsonResponse } from '../../_shared'
import { resolveAuthenticatedUserId } from '../../_user-settings'
import { isCodexDebugMode } from '../../../../src/lib/dev/codex-debug'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const latestProfileId = await getLatestProfileIdForUser(resolveAuthenticatedUserId(request))

  if (latestProfileId || !isCodexDebugMode()) {
    return jsonResponse(latestProfileId)
  }

  return jsonResponse(await getLatestProfileIdWithPlans())
}
