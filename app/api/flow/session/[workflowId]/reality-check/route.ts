import { resolveRealityCheck } from '../../../../../../src/lib/flow/engine'
import { flowRealityCheckRequestSchema } from '../../../../_schemas'
import { jsonResponse } from '../../../../_shared'
import {
  invalidRequestResponse,
  loadOwnedWorkflow,
  loadWorkflowProfile,
  notFoundResponse,
  persistWorkflowState
} from '../../../_helpers'

interface RouteContext {
  params: Promise<{ workflowId: string }>
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const parsed = flowRealityCheckRequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return invalidRequestResponse()
  }

  const { workflowId } = await context.params
  const session = await loadOwnedWorkflow(request, workflowId)

  if (!session) {
    return notFoundResponse()
  }

  const profile = await loadWorkflowProfile(session)
  const strategy = session.state.strategy

  if (!profile || !strategy) {
    return jsonResponse({
      success: false,
      error: 'FLOW_STRATEGY_REQUIRED'
    }, { status: 409 })
  }

  const resolved = resolveRealityCheck(strategy, profile, parsed.data.adjustment)
  const nextState = {
    ...session.state,
    strategy: resolved.strategy,
    realityCheck: resolved.result
  }
  const nextSession = await persistWorkflowState({
    workflowId,
    state: nextState,
    currentStep: resolved.result.status === 'ok' || parsed.data.adjustment !== 'keep'
      ? 'simulation'
      : 'reality-check',
    status: 'in_progress',
    checkpointCode: 'reality-check-completed',
    checkpointPayload: {
      status: resolved.result.status,
      adjustment: parsed.data.adjustment
    }
  })

  return jsonResponse({
    success: true,
    session: nextSession,
    realityCheck: resolved.result
  })
}
