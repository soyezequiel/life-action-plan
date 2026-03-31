import { getProgressByPlan, getProgressByPlanAndDate } from '../../_db'
import { jsonResponse } from '../../_shared'
import { progressListQuerySchema } from '../../_schemas'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const fecha = url.searchParams.get('fecha')
  const parsed = progressListQuerySchema.safeParse({
    planId: url.searchParams.get('planId'),
    fecha: fecha ?? undefined
  })

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      error: 'Faltan parametros obligatorios'
    }, { status: 400 })
  }

  if (parsed.data.fecha) {
    return jsonResponse(await getProgressByPlanAndDate(parsed.data.planId, parsed.data.fecha))
  }

  return jsonResponse(await getProgressByPlan(parsed.data.planId))
}
