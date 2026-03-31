import { getWeeklyProgressSummary } from '../../_db'
import { jsonResponse } from '../../_shared'
import { progressSummaryQuerySchema } from '../../_schemas'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const planId = url.searchParams.get('planId')
  const days = url.searchParams.get('days')

  const parsed = progressSummaryQuerySchema.safeParse({
    planId,
    days: days ?? undefined
  })

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      error: 'Parametros invalidos o faltantes'
    }, { status: 400 })
  }

  try {
    const summary = await getWeeklyProgressSummary(parsed.data.planId, parsed.data.days)
    return jsonResponse(summary)
  } catch (error) {
    console.error('[API] Error fetching progress summary:', error)
    return jsonResponse({
      success: false,
      error: 'Error interno al obtener el resumen de progreso'
    }, { status: 500 })
  }
}
