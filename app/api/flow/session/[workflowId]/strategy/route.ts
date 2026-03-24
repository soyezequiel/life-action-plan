import { buildStrategicPlanRefined, resolveRealityCheck } from '../../../../../../src/lib/flow/engine'
import {
  loadOwnedWorkflow,
  loadWorkflowProfile,
  notFoundResponse,
  persistWorkflowState,
  resolveRuntimeForWorkflow
} from '../../../_helpers'
import { sseJsonResponse } from '../../../_sse'
import { generateStrategyWithAgent } from '../../../../../../src/lib/flow/agents/strategy-agent'

interface RouteContext {
  params: Promise<{ workflowId: string }>
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { workflowId } = await context.params
  const session = await loadOwnedWorkflow(request, workflowId)

  if (!session) {
    return notFoundResponse()
  }

  return sseJsonResponse(async ({ sendProgress, sendResult, close }) => {
    const profile = await loadWorkflowProfile(session)

    if (!profile) {
      sendResult({
        success: false,
        error: 'FLOW_PROFILE_REQUIRED'
      })
      close()
      return
    }

    sendProgress({
      workflowId,
      step: 'strategy',
      stage: 'analyzing',
      current: 1,
      total: 5,
      message: 'Ordenando objetivos y disponibilidad real.'
    })

    const fallbackStrategy = buildStrategicPlanRefined(session.state.goals, profile)
    const runtime = await resolveRuntimeForWorkflow(session)
    const strategy = await generateStrategyWithAgent(
      { runtime, goals: session.state.goals, profile, fallbackStrategy },
      (msg) => sendProgress({ ...msg, workflowId })
    )

    sendProgress({
      workflowId,
      step: 'strategy',
      stage: 'structuring',
      current: 3,
      total: 5,
      message: 'Armando fases, hitos y dependencias.'
    })

    const initialReality = resolveRealityCheck(strategy, profile, 'keep')

    sendProgress({
      workflowId,
      step: 'strategy',
      stage: 'reality-baseline',
      current: 4,
      total: 5,
      message: 'Contrastando la carga del plan contra tu semana real.'
    })

    sendProgress({
      workflowId,
      step: 'strategy',
      stage: 'drafting',
      current: 5,
      total: 6,
      message: 'Preparando la version que vas a revisar.'
    })

    const nextState = {
      ...session.state,
      strategy: initialReality.strategy,
      realityCheck: initialReality.result
    }
    const nextSession = await persistWorkflowState({
      workflowId,
      state: nextState,
      currentStep: 'reality-check',
      status: 'in_progress',
      profileId: session.profileId,
      checkpointCode: 'strategy-generated',
      checkpointPayload: {
        phaseCount: initialReality.strategy.phases.length,
        totalMonths: initialReality.strategy.totalMonths,
        realityStatus: initialReality.result.status
      }
    })

    sendProgress({
      workflowId,
      step: 'strategy',
      stage: 'saving',
      current: 6,
      total: 6,
      message: 'Guardando el checkpoint estrategico.'
    })
    sendResult({
      success: true,
      session: nextSession,
      strategy: initialReality.strategy,
      realityCheck: initialReality.result
    })
    close()
  })
}
