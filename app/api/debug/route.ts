import { debugMutationRequestSchema } from '../_schemas'
import { disableDebugPanel, enableDebugPanel, getDebugPanelStatus } from '../_debug-state'
import { jsonResponse } from '../_shared'

export async function GET(): Promise<Response> {
  return jsonResponse(getDebugPanelStatus())
}

export async function POST(request: Request): Promise<Response> {
  const parsed = debugMutationRequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return jsonResponse({
      enabled: false,
      panelVisible: false
    }, { status: 400 })
  }

  const payload = parsed.data as { action?: 'enable' | 'disable'; enabled?: boolean }

  if (payload.action) {
    return jsonResponse(payload.action === 'enable' ? enableDebugPanel() : disableDebugPanel())
  }

  return jsonResponse(payload.enabled ? enableDebugPanel() : disableDebugPanel())
}
