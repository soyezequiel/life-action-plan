import { buildProfileFromFlow, createIntakeBlocks } from '../../../../../../src/lib/flow/engine'
import { markIntakeBlocksComplete } from '../../../../../../src/lib/flow/intake-agent'
import { flowIntakeRequestSchema } from '../../../../_schemas'
import {
  createProfile,
  updateProfile
} from '../../../../_db'
import { jsonResponse } from '../../../../_shared'
import { resolveAuthenticatedUserId } from '../../../../_user-settings'
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
  try {
    const parsed = flowIntakeRequestSchema.safeParse(await request.json().catch(() => null))

    if (!parsed.success) {
      return invalidRequestResponse()
    }

    const { workflowId } = await context.params
    const session = await loadOwnedWorkflow(request, workflowId)

    if (!session) {
      return notFoundResponse()
    }

    const answers = {
      ...session.state.intakeAnswers,
      ...parsed.data.answers
    }
    const goals = session.state.goals
    const intakeBlocks = session.state.intakeBlocks.length > 0
      ? markIntakeBlocksComplete(session.state.intakeBlocks, answers)
      : createIntakeBlocks(goals, answers)
    const profile = buildProfileFromFlow(goals, answers, await loadWorkflowProfile(session))
    let profileId = session.profileId

    if (profileId) {
      await updateProfile(profileId, JSON.stringify(profile))
    } else {
      profileId = await createProfile(JSON.stringify(profile), resolveAuthenticatedUserId(request))
    }

    const completedBlocks = intakeBlocks.filter((block) => block.completed)
    const isAutoSave = parsed.data.isAutoSave ?? false
    let currentStep: 'intake' | 'strategy' = 'intake'

    if (!isAutoSave && completedBlocks.length === intakeBlocks.length) {
      currentStep = 'strategy'
    }

    const checkpointCode = completedBlocks.length === intakeBlocks.length
      ? 'intake-completed'
      : `intake-${completedBlocks[completedBlocks.length - 1]?.id ?? 'autosave'}`
    const nextState = {
      ...session.state,
      intakeAnswers: answers,
      intakeBlocks
    }
    const nextSession = await persistWorkflowState({
      workflowId,
      state: nextState,
      currentStep,
      status: 'in_progress',
      profileId,
      checkpointCode,
      checkpointPayload: {
        answeredCount: Object.keys(answers).length,
        completedBlocks: completedBlocks.map((block) => block.id)
      }
    })

    return jsonResponse({
      success: true,
      session: nextSession,
      profileId
    })
  } catch (error) {
    console.error('FLOW_INTAKE_FAILED', error)

    return jsonResponse({
      success: false,
      error: 'FLOW_INTAKE_FAILED'
    }, { status: 500 })
  }
}
