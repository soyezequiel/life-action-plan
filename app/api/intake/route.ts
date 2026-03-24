import { intakeRequestSchema } from '../_schemas'
import { apiErrorMessages, jsonResponse } from '../_shared'
import { resolveAuthenticatedUserId } from '../_user-settings'
import { processIntake } from '../../../src/lib/services'

export async function POST(request: Request): Promise<Response> {
  const bodyResult = intakeRequestSchema.safeParse(await request.json().catch(() => null))

  if (!bodyResult.success) {
    return jsonResponse({
      success: false,
      error: apiErrorMessages.invalidRequest()
    }, { status: 400 })
  }

  try {
    const userId = resolveAuthenticatedUserId(request)
    const { profileId } = await processIntake(bodyResult.data, userId ?? undefined)

    return jsonResponse({
      success: true,
      profileId
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse({
      success: false,
      error: message
    }, { status: 500 })
  }
}
