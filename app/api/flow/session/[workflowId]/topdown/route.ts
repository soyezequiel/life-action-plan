import { buildTopDownState } from '../../../../../../src/lib/flow/engine'
import { flowTopDownRequestSchema } from '../../../../_schemas'
import { loadOwnedWorkflow, notFoundResponse, persistWorkflowState, invalidRequestResponse } from '../../../_helpers'
import { sseJsonResponse } from '../../../_sse'

interface RouteContext {
  params: Promise<{ workflowId: string }>
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const parsed = flowTopDownRequestSchema.safeParse(await request.json().catch(() => null))

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

    if (!strategy) {
      sendResult({
        success: false,
        error: 'FLOW_STRATEGY_REQUIRED'
      })
      close()
      return
    }

    sendProgress({
      workflowId,
      step: 'topdown',
      stage: 'levels',
      current: 1,
      total: 3,
      message: 'Calculando niveles del plan según la duración.'
    })

    const topdown = buildTopDownState(strategy, session.state.topdown, parsed.data.action)!

    sendProgress({
      workflowId,
      step: 'topdown',
      stage: 'drafting',
      current: 2,
      total: 3,
      message: 'Preparando la muestra del siguiente nivel.'
    })

    const nextState = {
      ...session.state,
      topdown
    }
    const nextSession = await persistWorkflowState({
      workflowId,
      state: nextState,
      currentStep: topdown.levels.every((level) => level.confirmed) ? 'activation' : 'topdown',
      status: 'in_progress',
      checkpointCode: `topdown-level-${topdown.currentLevelIndex + 1}`,
      checkpointPayload: {
        action: parsed.data.action,
        currentLevelIndex: topdown.currentLevelIndex
      }
    })

    sendProgress({
      workflowId,
      step: 'topdown',
      stage: 'saving',
      current: 3,
      total: 3,
      message: 'Guardando el avance top-down.'
    })
    sendResult({
      success: true,
      session: nextSession,
      levels: topdown.levels
    })
    close()
  })
}
