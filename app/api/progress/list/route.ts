import { getProgressByPlanAndDate } from '../../_db'
import { jsonResponse } from '../../_shared'
import { progressListQuerySchema } from '../../_schemas'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const parsed = progressListQuerySchema.safeParse({
    planId: url.searchParams.get('planId'),
    fecha: url.searchParams.get('fecha')
  })

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      error: 'Faltan parametros obligatorios'
    }, { status: 400 })
  }

  return jsonResponse(await getProgressByPlanAndDate(parsed.data.planId, parsed.data.fecha))
}
