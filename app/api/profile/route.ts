import { profileQuerySchema } from '../_schemas'
import { getProfile } from '../_db'
import { jsonResponse } from '../_shared'
import { parseStoredProfile } from '../_plan'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const parsed = profileQuerySchema.safeParse({
    profileId: url.searchParams.get('profileId')
  })

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      error: 'Falta profileId'
    }, { status: 400 })
  }

  const row = await getProfile(parsed.data.profileId)
  return jsonResponse(row ? parseStoredProfile(row.data) : null)
}
