import { intakeRequestSchema } from '../_schemas'
import { intakeExpressToProfile } from '../_domain'
import { createProfile, setSetting, trackEvent } from '../_db'
import { jsonResponse } from '../_shared'

export async function POST(request: Request): Promise<Response> {
  const bodyResult = intakeRequestSchema.safeParse(await request.json().catch(() => null))

  if (!bodyResult.success) {
    return jsonResponse({
      success: false,
      error: 'Datos invalidos en la solicitud.'
    }, { status: 400 })
  }

  try {
    const profile = intakeExpressToProfile(bodyResult.data as Parameters<typeof intakeExpressToProfile>[0])
    const profileId = await createProfile(JSON.stringify(profile))
    await setSetting('lastProfileId', profileId)
    await trackEvent('INTAKE_COMPLETED', { profileId, mode: 'express' })

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
