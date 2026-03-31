import { costQuerySchema } from '../_schemas'
import { getCostSummary } from '../_db'
import { jsonResponse } from '../_shared'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const parsed = costQuerySchema.safeParse({
    planId: url.searchParams.get('planId')
  })

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      error: 'Falta planId'
    }, { status: 400 })
  }

  return jsonResponse(await getCostSummary(parsed.data.planId))
}
