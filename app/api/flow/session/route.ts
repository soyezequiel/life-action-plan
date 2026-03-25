import { flowSessionCreateRequestSchema } from '../../_schemas'
import { jsonResponse } from '../../_shared'
import { buildSessionResponse, ensureWorkflowSession, invalidRequestResponse } from '../_helpers'

export async function POST(request: Request): Promise<Response> {
  const parsed = flowSessionCreateRequestSchema.safeParse(await request.json().catch(() => ({})))

  if (!parsed.success) {
    return invalidRequestResponse()
  }

  const session = await ensureWorkflowSession(request, {
    workflowId: parsed.data.workflowId,
    sourceWorkflowId: parsed.data.sourceWorkflowId,
    intent: parsed.data.intent
  })
  return jsonResponse(await buildSessionResponse(session))
}
