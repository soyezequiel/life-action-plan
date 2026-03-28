import {
  interactiveSessionDeleteResponseSchema,
  interactiveSessionResponseSchema
} from '../../../../_schemas'
import { jsonResponse } from '../../../../_shared'
import {
  createInteractiveCoordinator,
  interactiveErrorResponse
} from '../../_helpers'

interface RouteContext {
  params: Promise<{ sessionId: string }>
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { sessionId } = await context.params

  try {
    const coordinator = createInteractiveCoordinator(request)
    const response = await coordinator.getSession(sessionId)
    return jsonResponse(interactiveSessionResponseSchema.parse(response))
  } catch (error) {
    return interactiveErrorResponse(error)
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const { sessionId } = await context.params

  try {
    const coordinator = createInteractiveCoordinator(request)
    const response = await coordinator.deleteSession(sessionId)
    return jsonResponse(interactiveSessionDeleteResponseSchema.parse(response))
  } catch (error) {
    return interactiveErrorResponse(error)
  }
}
