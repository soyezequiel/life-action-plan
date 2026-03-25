import { applyResumePatch } from '../../../../../../src/lib/flow/engine'
import { flowResumePatchRequestSchema } from '../../../../_schemas'
import { updateProfile } from '../../../../_db'
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
  const parsed = flowResumePatchRequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return invalidRequestResponse()
  }

  const { workflowId } = await context.params
  const session = await loadOwnedWorkflow(request, workflowId)

  if (!session) {
    return notFoundResponse()
  }

  const profile = await loadWorkflowProfile(session)
  const resolved = applyResumePatch(profile, session.state, parsed.data.changeSummary)

  if (resolved.profile && session.profileId) {
    await updateProfile(session.profileId, JSON.stringify(resolved.profile))
  }

  const stateToSave = resolved.strategyRebuilt
    ? { ...resolved.state, simulationTreeId: null }
    : resolved.state

  const nextSession = await persistWorkflowState({
    workflowId,
    state: stateToSave,
    currentStep: resolved.strategyRebuilt
      ? 'reality-check'
      : session.currentStep === 'done'
        ? 'presentation'
        : session.currentStep,
    status: session.status === 'completed' ? 'in_progress' : session.status,
    checkpointCode: 'flow-resumed',
    checkpointPayload: {
      patchSummary: resolved.patchSummary,
      strategyRebuilt: resolved.strategyRebuilt
    }
  })

  return jsonResponse({
    success: true,
    session: nextSession,
    patchSummary: resolved.patchSummary
  })
}
