import { buildCalendarState } from '../../../../../../src/lib/flow/engine'
import { flowCalendarRequestSchema } from '../../../../_schemas'
import { jsonResponse } from '../../../../_shared'
import { invalidRequestResponse, loadOwnedWorkflow, notFoundResponse, persistWorkflowState } from '../../../_helpers'

interface RouteContext {
  params: Promise<{ workflowId: string }>
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const parsed = flowCalendarRequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return invalidRequestResponse()
  }

  const { workflowId } = await context.params
  const session = await loadOwnedWorkflow(request, workflowId)

  if (!session) {
    return notFoundResponse()
  }

  const calendar = buildCalendarState(
    parsed.data.grid,
    parsed.data.notes,
    parsed.data.icsText
  )!
  const nextState = {
    ...session.state,
    calendar
  }
  const nextSession = await persistWorkflowState({
    workflowId,
    state: nextState,
    currentStep: 'topdown',
    status: 'in_progress',
    checkpointCode: 'calendar-integrated',
    checkpointPayload: {
      importedIcs: calendar.importedIcs
    }
  })

  return jsonResponse({
    success: true,
    session: nextSession
  })
}
