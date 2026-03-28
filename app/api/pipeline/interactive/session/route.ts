import {
  interactiveSessionCreateRequestSchema,
  interactiveSessionResponseSchema
} from '../../../_schemas'
import { jsonResponse } from '../../../_shared'
import {
  createInteractiveCoordinator,
  interactiveErrorResponse,
  interactiveInvalidRequestResponse,
  readInteractiveRequestBody
} from '../_helpers'

export const maxDuration = 60

export async function POST(request: Request): Promise<Response> {
  const parsed = interactiveSessionCreateRequestSchema.safeParse(await readInteractiveRequestBody(request))

  if (!parsed.success) {
    return interactiveInvalidRequestResponse()
  }

  try {
    const coordinator = createInteractiveCoordinator(request)
    const response = await coordinator.createSession(parsed.data)
    return jsonResponse(interactiveSessionResponseSchema.parse(response))
  } catch (error) {
    return interactiveErrorResponse(error)
  }
}
