import { streakQuerySchema } from '../_schemas'
import { getHabitStreak, getPlan, getProfile } from '../_db'
import { jsonResponse } from '../_shared'
import { getProfileTimezone, getTodayISO, parseStoredProfile } from '../_plan'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const parsed = streakQuerySchema.safeParse({
    planId: url.searchParams.get('planId')
  })

  if (!parsed.success) {
    return jsonResponse({
      current: 0,
      best: 0
    }, { status: 400 })
  }

  const planRow = await getPlan(parsed.data.planId)
  if (!planRow) {
    return jsonResponse({
      current: 0,
      best: 0
    })
  }

  const profileRow = await getProfile(planRow.profileId)
  const profile = profileRow ? parseStoredProfile(profileRow.data) : null
  const timezone = getProfileTimezone(profile)
  const todayISO = getTodayISO(timezone)

  return jsonResponse(await getHabitStreak(parsed.data.planId, todayISO))
}
