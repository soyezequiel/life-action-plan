import { traceCollector } from '../../_domain'
import { jsonResponse } from '../../_shared'

export async function GET(): Promise<Response> {
  try {
    return jsonResponse({
      traces: traceCollector.getSnapshot()
    })
  } catch (error) {
    console.error('[LAP] GET /api/debug/snapshot failed:', error instanceof Error ? error.message : error)
    return jsonResponse({ traces: [], error: 'snapshot_failed' }, { status: 500 })
  }
}

