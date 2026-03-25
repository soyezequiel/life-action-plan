import { applyPresentationFeedback, buildPresentationDraft } from '../../../../../../../src/lib/flow/engine'
import { flowPresentationRequestSchema } from '../../../../../_schemas'
import { loadOwnedWorkflow, notFoundResponse, persistWorkflowState, invalidRequestResponse } from '../../../../_helpers'
import { sseJsonResponse } from '../../../../_sse'

interface RouteContext {
  params: Promise<{ workflowId: string }>
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const parsed = flowPresentationRequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return invalidRequestResponse()
  }

  const { workflowId } = await context.params
  const session = await loadOwnedWorkflow(request, workflowId)

  if (!session) {
    return notFoundResponse()
  }

  return sseJsonResponse(async ({ sendProgress, sendResult, close }) => {
    const strategy = session.state.strategy
    const simulation = session.state.simulation

    if (!strategy || !simulation) {
      sendResult({
        success: false,
        error: 'FLOW_SIMULATION_REQUIRED'
      })
      close()
      return
    }

    const basePresentation = session.state.presentation ?? buildPresentationDraft(strategy, simulation)

    sendProgress({
      workflowId,
      step: 'presentation',
      stage: 'feedback',
      current: 1,
      total: 3,
      message: 'Aplicando tus ajustes al mapa visual.'
    })

    const presentation = applyPresentationFeedback(
      basePresentation,
      parsed.data.feedback,
      parsed.data.edits,
      parsed.data.accept
    )

    sendProgress({
      workflowId,
      step: 'presentation',
      stage: 'rebuilding',
      current: 2,
      total: 3,
      message: presentation.accepted
        ? 'Marcando el plan como aceptado.'
        : 'Reconstruyendo la presentación con tu feedback.'
    })

    const nextState = {
      ...session.state,
      presentation
    }
    const nextSession = await persistWorkflowState({
      workflowId,
      state: nextState,
      currentStep: presentation.accepted ? 'calendar' : 'presentation',
      status: 'in_progress',
      checkpointCode: presentation.accepted ? 'plan-accepted' : `presentation-feedback-${presentation.feedbackRounds}`,
      checkpointPayload: {
        accepted: presentation.accepted,
        feedbackRounds: presentation.feedbackRounds
      }
    })

    sendProgress({
      workflowId,
      step: 'presentation',
      stage: 'saving',
      current: 3,
      total: 3,
      message: 'Guardando esta versión visual.'
    })
    sendResult({
      success: true,
      session: nextSession,
      presentation
    })
    close()
  })
}
