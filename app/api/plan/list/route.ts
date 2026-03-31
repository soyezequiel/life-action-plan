import { planListQuerySchema } from '../../_schemas'
import { getPlansByProfile } from '../../_db'
import { jsonResponse } from '../../_shared'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const parsed = planListQuerySchema.safeParse({
    profileId: url.searchParams.get('profileId')
  })

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      error: 'Falta profileId'
    }, { status: 400 })
  }

  return jsonResponse(await getPlansByProfile(parsed.data.profileId))
}
