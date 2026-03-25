import { buildPresentationDraft } from '../../../../../../src/lib/flow/engine'
import { jsonResponse } from '../../../../_shared'
import { loadOwnedWorkflow, notFoundResponse, persistWorkflowState, resolveRuntimeForWorkflow } from '../../../_helpers'
import { generatePresentationWithAgent } from '../../../../../../src/lib/flow/agents/presentation-agent'

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

  if (!strategy) {
    return jsonResponse({
      success: false,
      error: 'FLOW_STRATEGY_REQUIRED'
    }, { status: 409 })
  }

  const simulation = session.state.simulation
  const fallbackSimulation = simulation ?? {
    ranAt: new Date().toISOString(),
    finalStatus: 'PASS' as const,
    method: 'rules' as const,
    reviewSummary: 'Sin simulación ejecutada aún.',
    checkedAreas: ['Pendiente de simulación'],
    findings: [],
    iterations: [{ index: 0, status: 'PASS' as const, summary: 'Simulación omitida.', changes: [] }]
  }

  const fallback = buildPresentationDraft(strategy, fallbackSimulation)
  const presentation = session.state.presentation ?? await generatePresentationWithAgent({
    runtime: await resolveRuntimeForWorkflow(session),
    strategy,
    simulation: fallbackSimulation,
    fallback
  })

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
