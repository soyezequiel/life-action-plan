import { DateTime } from 'luxon'
import { buildPlanEventsFromFlow } from '../../../../../../src/lib/flow/engine'
import { createPlan, seedProgressFromEvents } from '../../../../_db'
import { jsonResponse } from '../../../../_shared'
import { buildPlanManifest, createUniquePlanSlug, getProfileTimezone } from '../../../../_plan'
import {
  loadOwnedWorkflow,
  loadWorkflowProfile,
  notFoundResponse,
  persistWorkflowState
} from '../../../_helpers'

interface RouteContext {
  params: Promise<{ workflowId: string }>
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { workflowId } = await context.params
  const session = await loadOwnedWorkflow(request, workflowId)

  if (!session) {
    return notFoundResponse()
  }

  const profile = await loadWorkflowProfile(session)
  const strategy = session.state.strategy

  if (!profile || !session.profileId || !strategy) {
    return jsonResponse({
      success: false,
      error: 'FLOW_PROFILE_REQUIRED'
    }, { status: 409 })
  }

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

  return jsonResponse({
    success: true,
    session: nextSession,
    planId,
    profileId: session.profileId
  })
}
