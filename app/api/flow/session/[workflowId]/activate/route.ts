import { DateTime } from 'luxon'
import { buildPlanEventsFromFlow } from '../../../../../../src/lib/flow/engine'
import { createPlan, seedProgressFromEvents } from '../../../../_db'
import { buildPlanManifest, createUniquePlanSlug, getProfileTimezone } from '../../../../_plan'
import {
  loadOwnedWorkflow,
  loadWorkflowProfile,
  notFoundResponse,
  persistWorkflowState
} from '../../../_helpers'
import { sseJsonResponse } from '../../../_sse'

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
    const strategy = session.state.strategy

    if (!profile || !session.profileId || !strategy) {
      sendResult({ success: false, error: 'FLOW_PROFILE_REQUIRED' })
      close()
      return
    }

    sendProgress({
      workflowId,
      step: 'done',
      stage: 'creating-plan',
      current: 1,
      total: 3,
      message: 'Creando tu plan personalizado.'
    })

    const events = buildPlanEventsFromFlow({
      goals: session.state.goals,
      strategy,
      calendar: session.state.calendar,
      profile
    })
    const slug = await createUniquePlanSlug(strategy.title)
    const manifest = buildPlanManifest({
      nombre: strategy.title,
      fallbackUsed: false,
      modelId: 'lap:flow',
      tokensInput: 0,
      tokensOutput: 0,
      costUsd: 0,
      costSats: 0,
      charge: null
    })
    const planId = await createPlan(session.profileId, strategy.title, slug, manifest)

    sendProgress({
      workflowId,
      step: 'done',
      stage: 'seeding-progress',
      current: 2,
      total: 3,
      message: `Generando ${events.length} evento(s) de seguimiento.`
    })

    await seedProgressFromEvents(planId, events, getProfileTimezone(profile))

    const nextState = {
      ...session.state,
      activation: {
        activatedAt: DateTime.utc().toISO() ?? '2026-03-21T00:00:00.000Z',
        planId
      }
    }
    const nextSession = await persistWorkflowState({
      workflowId,
      state: nextState,
      currentStep: 'done',
      status: 'completed',
      planId,
      checkpointCode: 'flow-activated',
      checkpointPayload: {
        planId,
        eventCount: events.length
      }
    })

    sendProgress({
      workflowId,
      step: 'done',
      stage: 'done',
      current: 3,
      total: 3,
      message: 'Plan activado. ¡Todo listo!'
    })

    sendResult({
      success: true,
      session: nextSession,
      planId,
      profileId: session.profileId
    })

    close()
  })
}
