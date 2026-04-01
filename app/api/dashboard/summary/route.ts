import { buildDashboardSummary } from '@/src/lib/domain/dashboard-summary'
import { getPlan, getProgressByPlan } from '../../_db'
import { jsonResponse } from '../../_shared'
import { dashboardSummaryQuerySchema } from '../../_schemas'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const parsed = dashboardSummaryQuerySchema.safeParse({
    planId: url.searchParams.get('planId')
  })

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      error: 'Parametros invalidos o faltantes'
    }, { status: 400 })
  }

  try {
    const plan = await getPlan(parsed.data.planId)

    if (!plan) {
      return jsonResponse({
        success: false,
        error: 'Plan no encontrado'
      }, { status: 404 })
    }

    const progressRows = await getProgressByPlan(parsed.data.planId)
    return jsonResponse(await buildDashboardSummary({
      plan,
      progressRows
    }))
  } catch (error) {
    console.error('[API] Error fetching dashboard summary:', error)
    return jsonResponse({
      success: false,
      error: 'No pude cargar el resumen del panel'
    }, { status: 500 })
  }
}
