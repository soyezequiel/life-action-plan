import { buildTopDownState } from '../../../../../../src/lib/flow/engine'
import { flowTopDownRequestSchema } from '../../../../_schemas'
import { loadOwnedWorkflow, notFoundResponse, persistWorkflowState, invalidRequestResponse, resolveRuntimeForWorkflow } from '../../../_helpers'
import { sseJsonResponse } from '../../../_sse'
import { generateTopDownWithAgent } from '../../../../../../src/lib/flow/agents/topdown-agent'

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

    const topdownFallback = buildTopDownState(strategy, session.state.topdown, parsed.data.action)!
    
    sendProgress({
      workflowId,
      step: 'topdown',
      stage: 'drafting',
      current: 2,
      total: 3,
      message: 'Preparando la muestra del siguiente nivel con el agente.'
    })

    const runtime = await resolveRuntimeForWorkflow(session)
    const currentTargetLevel = topdownFallback.levels[topdownFallback.currentLevelIndex]!
    
    // Only use LLM to expand the currently focused level
    const enrichedLevel = await generateTopDownWithAgent({
      runtime,
      strategy,
      levelAction: parsed.data.action ?? 'generate',
      requiredLevel: currentTargetLevel.level,
      fallback: currentTargetLevel
    })

    topdownFallback.levels[topdownFallback.currentLevelIndex] = enrichedLevel

    const nextState = {
      ...session.state,
      topdown: topdownFallback
    }
    const nextSession = await persistWorkflowState({
      workflowId,
      state: nextState,
      currentStep: topdownFallback.levels.every((level) => level.confirmed) ? 'activation' : 'topdown',
      status: 'in_progress',
      checkpointCode: `topdown-level-${topdownFallback.currentLevelIndex + 1}`,
      checkpointPayload: {
        action: parsed.data.action,
        currentLevelIndex: topdownFallback.currentLevelIndex
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
      levels: topdownFallback.levels
    })
    close()
  })
}
