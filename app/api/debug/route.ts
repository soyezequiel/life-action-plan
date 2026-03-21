import { debugMutationRequestSchema } from '../_schemas'
import { clearDebugTraces, disableDebugPanel, enableDebugPanel, getDebugPanelStatus } from '../_debug-state'
import { apiErrorMessages, jsonResponse } from '../_shared'

export async function GET(): Promise<Response> {
  try {
    return jsonResponse(getDebugPanelStatus())
  } catch (error) {
    console.error('[LAP] GET /api/debug failed:', error instanceof Error ? error.message : error)
    return jsonResponse({ error: apiErrorMessages.invalidRequest() }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: apiErrorMessages.invalidRequest() }, { status: 400 })
  }

  const parsed = debugMutationRequestSchema.safeParse(body)

  if (!parsed.success) {
    return jsonResponse({ error: apiErrorMessages.invalidRequest() }, { status: 400 })
  }

  try {
    const payload = parsed.data as { action?: 'enable' | 'disable' | 'clear'; enabled?: boolean }

    if (payload.action) {
      if (payload.action === 'enable') {
        return jsonResponse(enableDebugPanel())
      }

      if (payload.action === 'disable') {
        return jsonResponse(disableDebugPanel())
      }

      return jsonResponse(clearDebugTraces())
    }

    return jsonResponse(payload.enabled ? enableDebugPanel() : disableDebugPanel())
  } catch (error) {
    console.error('[LAP] POST /api/debug failed:', error instanceof Error ? error.message : error)
    return jsonResponse({ error: apiErrorMessages.invalidRequest() }, { status: 500 })
  }
}
