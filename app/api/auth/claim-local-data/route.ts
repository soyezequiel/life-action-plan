import { claimAnonymousLocalData, claimAnonymousWorkflowData } from '../../_db'
import { claimLocalDataRequestSchema } from '../../_schemas'
import { apiErrorMessages, jsonResponse } from '../../_shared'
import { getAuthenticatedUserId } from '../../../../src/lib/auth/session'

export async function POST(request: Request): Promise<Response> {
  const userId = await getAuthenticatedUserId(request)

  if (!userId) {
    return jsonResponse({
      success: false,
      error: 'UNAUTHORIZED'
    }, { status: 401 })
  }

  const parsed = claimLocalDataRequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      error: apiErrorMessages.invalidRequest()
    }, { status: 400 })
  }

  const claimed = await claimAnonymousLocalData(userId, parsed.data.localProfileId)

  if (claimed && parsed.data.localWorkflowId) {
    await claimAnonymousWorkflowData(userId, parsed.data.localWorkflowId)
  }

  if (!claimed) {
    return jsonResponse({
      success: false,
      error: 'LOCAL_PROFILE_NOT_FOUND'
    }, { status: 404 })
  }

  return jsonResponse({
    success: true,
    profileId: parsed.data.localProfileId,
    workflowId: parsed.data.localWorkflowId ?? null
  })
}
