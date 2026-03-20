import { progressToggleRequestSchema } from '../../_schemas'
import { toggleProgress, trackEvent } from '../../_db'
import { jsonResponse } from '../../_shared'

export async function POST(request: Request): Promise<Response> {
  const parsed = progressToggleRequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      completado: false
    }, { status: 400 })
  }

  const completado = await toggleProgress(parsed.data.progressId)
  await trackEvent('PROGRESS_TOGGLED', {
    progressId: parsed.data.progressId,
    completado
  })

  return jsonResponse({
    success: true,
    completado
  })
}
