import { planExportIcsRequestSchema } from '../../_schemas'
import { buildCalendarFileName, getProfileTimezone, parseStoredProfile } from '../../_plan'
import { generateIcsCalendar } from '../../_domain'
import { getPlan, getProfile, getProgressByPlan } from '../../_db'
import { apiErrorMessages, jsonResponse } from '../../_shared'

export async function POST(request: Request): Promise<Response> {
  const parsed = planExportIcsRequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      error: apiErrorMessages.invalidRequest()
    }, { status: 400 })
  }

  const planRow = await getPlan(parsed.data.planId)
  if (!planRow) {
    return jsonResponse({
      success: false,
      error: apiErrorMessages.planNotFound()
    })
  }

  let timezone = 'America/Argentina/Buenos_Aires'
  const profileRow = await getProfile(planRow.profileId)

  if (profileRow) {
    const profile = parseStoredProfile(profileRow.data)
    timezone = getProfileTimezone(profile)
  }

  const calendar = generateIcsCalendar({
    planName: planRow.nombre,
    timezone,
    rows: await getProgressByPlan(parsed.data.planId)
  })

  return new Response(calendar, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${buildCalendarFileName(planRow.nombre, timezone)}"`,
      'Cache-Control': 'no-store'
    }
  })
}
