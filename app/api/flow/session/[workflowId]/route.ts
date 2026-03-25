import { jsonResponse } from '../../../_shared'
import { buildSessionResponse, loadOwnedWorkflow, notFoundResponse } from '../../_helpers'

interface RouteContext {
  params: Promise<{ workflowId: string }>
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { workflowId } = await context.params
  const session = await loadOwnedWorkflow(request, workflowId)

  if (!session) {
    return notFoundResponse()
  }

  return jsonResponse(await buildSessionResponse(session))
}
