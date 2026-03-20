import { traceCollector } from '../../_domain'
import { jsonResponse } from '../../_shared'

export async function GET(): Promise<Response> {
  return jsonResponse({
    traces: traceCollector.getSnapshot()
  })
}

