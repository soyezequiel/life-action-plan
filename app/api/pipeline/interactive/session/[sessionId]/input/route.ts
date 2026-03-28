import {
  interactiveSessionInputRequestSchema,
  interactiveSessionResponseSchema
} from '../../../../../_schemas'
import { jsonResponse } from '../../../../../_shared'
import {
  createInteractiveCoordinator,
  interactiveErrorResponse,
  interactiveInvalidRequestResponse,
  readInteractiveRequestBody
} from '../../../_helpers'

export const maxDuration = 60

interface RouteContext {
  params: Promise<{ sessionId: string }>
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { sessionId } = await context.params
  const parsed = interactiveSessionInputRequestSchema.safeParse(await readInteractiveRequestBody(request))

  if (!parsed.success) {
    return interactiveInvalidRequestResponse()
  }

  try {
    const coordinator = createInteractiveCoordinator(request)
    const response = await coordinator.applyUserInput(sessionId, parsed.data)
    return jsonResponse(interactiveSessionResponseSchema.parse(response))
  } catch (error) {
    return interactiveErrorResponse(error)
  }
}
