import { buildPresentationDraft } from '../../../../../../src/lib/flow/engine'
import { jsonResponse } from '../../../../_shared'
import { loadOwnedWorkflow, notFoundResponse, persistWorkflowState } from '../../../_helpers'

interface RouteContext {
  params: Promise<{ workflowId: string }>
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { workflowId } = await context.params
  const session = await loadOwnedWorkflow(request, workflowId)

  if (!session) {
    return notFoundResponse()
  }

  const strategy = session.state.strategy
  const simulation = session.state.simulation

  if (!strategy || !simulation) {
    return jsonResponse({
      success: false,
      error: 'FLOW_SIMULATION_REQUIRED'
    }, { status: 409 })
  }

  const presentation = session.state.presentation ?? buildPresentationDraft(strategy, simulation)
  const nextState = {
    ...session.state,
    presentation
  }
  const nextSession = await persistWorkflowState({
    workflowId,
    state: nextState,
    currentStep: 'presentation',
    status: 'in_progress',
    checkpointCode: 'presentation-generated',
    checkpointPayload: {
      timelineItems: presentation.timeline.length,
      feedbackRounds: presentation.feedbackRounds
    }
  })

  return jsonResponse({
    success: true,
    session: nextSession,
    presentation
  })
}
