import { perfilSchema, type Perfil } from '../../../src/shared/schemas/perfil'
import { createIntakeBlocks } from '../../../src/lib/flow/engine'
import { markIntakeBlocksComplete } from '../../../src/lib/flow/intake-agent'
import type { FlowSession, FlowState, FlowStep, FlowStatus } from '../../../src/shared/types/flow'
import type { AgentRuntime } from '../../../src/lib/runtime/types'
import {
  claimAnonymousWorkflowData,
  createPlanWorkflow,
  createPlanWorkflowCheckpoint,
  getLatestPlanWorkflowIdForUser,
  getPlanWorkflow,
  getProfile,
  listPlanWorkflowCheckpoints,
  updatePlanWorkflow
} from '../_db'
import { apiErrorMessages, jsonResponse } from '../_shared'
import { resolveAuthenticatedUserId } from '../_user-settings'
import { getDeploymentMode } from '../../../src/lib/env/deployment'
import { resolvePlanBuildExecution } from '../../../src/lib/runtime/build-execution'
import { getProvider } from '../../../src/lib/providers/provider-factory'
import { createInstrumentedRuntime } from '../../../src/debug/instrumented-runtime'
import { traceCollector } from '../../../src/debug/trace-collector'

type FlowSessionEntryIntent = 'default' | 'redo-profile' | 'change-objectives' | 'restart-flow'

function parseProfile(data: string | null | undefined): Perfil | null {
  if (!data) {
    return null
  }

  try {
    const parsed = perfilSchema.safeParse(JSON.parse(data))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function intakeSignature(state: FlowState): string {
  return JSON.stringify(
    state.intakeBlocks.map((block) => ({
      id: block.id,
      completed: block.completed,
      questions: block.questions.map((question) => ({
        id: question.id,
        key: question.key,
        type: question.type,
        min: question.min ?? null,
        max: question.max ?? null,
        step: question.step ?? null,
        unit: question.unit ?? null
      }))
    }))
  )
}

function buildPlanningResetState(source: FlowSession): FlowState {
  return {
    ...source.state,
    intakeBlocks: createIntakeBlocks(source.state.goals, {}),
    intakeAnswers: {},
    strategy: null,
    realityCheck: null,
    simulation: null,
    presentation: null,
    calendar: null,
    topdown: null,
    activation: {
      activatedAt: null,
      planId: null
    },
    resume: {
      changeSummary: null,
      patchSummary: null,
      askedAt: null
    },
    simulationTreeId: null
  }
}

function resolveEntryStep(source: FlowSession | null, intent: FlowSessionEntryIntent): FlowStep {
  if (intent === 'restart-flow') {
    return 'gate'
  }

  if (!source) {
    return 'gate'
  }

  if (intent === 'change-objectives') {
    return source.state.gate?.ready ? 'objectives' : 'gate'
  }

  if (source.state.goals.length > 0) {
    return 'intake'
  }

  return source.state.gate?.ready ? 'objectives' : 'gate'
}

async function loadWorkflowForUser(userId: string | null, workflowId?: string | null): Promise<FlowSession | null> {
  const requestedId = workflowId?.trim() || ''

  if (!requestedId) {
    return null
  }

  const existing = await getPlanWorkflow(requestedId)

  if (existing && existing.userId === userId) {
    return syncWorkflowSessionShape(existing)
  }

  if (existing && !existing.userId && !userId) {
    return syncWorkflowSessionShape(existing)
  }

  if (existing && !existing.userId && userId) {
    await claimAnonymousWorkflowData(userId, existing.id)
    return syncWorkflowSessionShape((await getPlanWorkflow(existing.id)) ?? existing)
  }

  return null
}

async function loadLatestWorkflowForUser(userId: string | null): Promise<FlowSession | null> {
  const latestId = await getLatestPlanWorkflowIdForUser(userId)
  return latestId ? getPlanWorkflow(latestId) : null
}

async function createEntryIntentSession(
  source: FlowSession | null,
  userId: string | null,
  intent: Exclude<FlowSessionEntryIntent, 'default'>
): Promise<FlowSession> {
  const currentStep = resolveEntryStep(source, intent)
  const checkpointCode = `${intent}-started`
  const nextSession = await createPlanWorkflow({
    userId,
    profileId: intent === 'restart-flow' ? null : source?.profileId ?? null,
    status: currentStep === 'gate' ? 'draft' : 'in_progress',
    currentStep,
    state: intent === 'restart-flow'
      ? undefined
      : source
        ? buildPlanningResetState(source)
        : undefined,
    lastCheckpointCode: checkpointCode
  })

  await createPlanWorkflowCheckpoint(nextSession.id, currentStep, checkpointCode, {
    sourceWorkflowId: source?.id ?? null,
    goalCount: source?.state.goals.length ?? 0
  })

  return nextSession
}

async function syncWorkflowSessionShape(session: FlowSession): Promise<FlowSession> {
  if (session.state.goals.length === 0) {
    return session
  }

  const nextIntakeBlocks = session.state.intakeBlocks.length > 0
    ? markIntakeBlocksComplete(session.state.intakeBlocks, session.state.intakeAnswers)
    : createIntakeBlocks(session.state.goals, session.state.intakeAnswers)
  const nextState = {
    ...session.state,
    intakeBlocks: nextIntakeBlocks
  }

  if (intakeSignature(session.state) === intakeSignature(nextState)) {
    return session
  }

  return (await updatePlanWorkflow(session.id, { state: nextState })) ?? session
}

export async function ensureWorkflowSession(
  request: Request,
  input: {
    workflowId?: string | null
    sourceWorkflowId?: string | null
    intent?: FlowSessionEntryIntent
  } = {}
): Promise<FlowSession> {
  const userId = resolveAuthenticatedUserId(request)
  const requestedId = input.workflowId?.trim() || ''
  const sourceWorkflowId = input.sourceWorkflowId?.trim() || ''
  const intent = input.intent ?? 'default'

  if (intent !== 'default') {
    const sourceSession = await loadWorkflowForUser(userId, sourceWorkflowId || requestedId)
      ?? await loadLatestWorkflowForUser(userId)

    return createEntryIntentSession(
      sourceSession ? await syncWorkflowSessionShape(sourceSession) : null,
      userId,
      intent
    )
  }

  const requestedSession = await loadWorkflowForUser(userId, requestedId)

  if (requestedSession) {
    return requestedSession
  }

  const latest = await loadLatestWorkflowForUser(userId)

  if (latest && latest.status !== 'completed') {
    return syncWorkflowSessionShape(latest)
  }

  return createPlanWorkflow({
    userId,
    status: 'draft',
    currentStep: 'gate'
  })
}

export async function loadOwnedWorkflow(request: Request, workflowId: string): Promise<FlowSession | null> {
  const session = await getPlanWorkflow(workflowId)
  const userId = resolveAuthenticatedUserId(request)

  if (!session) {
    return null
  }

  if (session.userId) {
    return session.userId === userId ? syncWorkflowSessionShape(session) : null
  }

  return userId ? null : syncWorkflowSessionShape(session)
}

export async function loadWorkflowProfile(session: FlowSession): Promise<Perfil | null> {
  if (!session.profileId) {
    return null
  }

  const profileRow = await getProfile(session.profileId)
  return profileRow ? parseProfile(profileRow.data) : null
}

export async function persistWorkflowState(params: {
  workflowId: string
  state: FlowState
  currentStep: FlowStep
  status?: FlowStatus
  profileId?: string | null
  planId?: string | null
  checkpointCode: string
  checkpointPayload?: Record<string, unknown>
}): Promise<FlowSession | null> {
  const nextSession = await updatePlanWorkflow(params.workflowId, {
    state: params.state,
    currentStep: params.currentStep,
    status: params.status,
    profileId: typeof params.profileId === 'undefined' ? undefined : params.profileId,
    planId: typeof params.planId === 'undefined' ? undefined : params.planId,
    lastCheckpointCode: params.checkpointCode
  })

  await createPlanWorkflowCheckpoint(
    params.workflowId,
    params.currentStep,
    params.checkpointCode,
    params.checkpointPayload ?? {}
  )

  return nextSession
}

export async function buildSessionResponse(session: FlowSession) {
  return {
    success: true,
    session,
    checkpoints: await listPlanWorkflowCheckpoints(session.id)
  }
}

export function invalidRequestResponse() {
  return jsonResponse({
    success: false,
    error: apiErrorMessages.invalidRequest()
  }, { status: 400 })
}

export function notFoundResponse() {
  return jsonResponse({
    success: false,
    error: 'FLOW_SESSION_NOT_FOUND'
  }, { status: 404 })
}

export async function resolveRuntimeForWorkflow(session: FlowSession): Promise<AgentRuntime> {
  const gateState = session.state.gate

  if (!gateState?.provider) {
    throw new Error('FLOW_GATE_PROVIDER_REQUIRED')
  }

  const requestedMode = gateState.llmMode === 'local'
    ? 'backend-local'
    : gateState.llmMode === 'own'
      ? 'user-cloud'
      : gateState.llmMode === 'codex'
        ? 'codex-cloud'
        : 'backend-cloud'

  const execution = await resolvePlanBuildExecution({
    modelId: gateState.provider,
    deploymentMode: getDeploymentMode(),
    requestedMode,
    userId: session.userId ?? undefined,
    backendCredentialId: gateState.backendCredentialId ?? undefined
  })

  if (!execution.executionContext.canExecute || !execution.runtime) {
    throw new Error('FLOW_LLM_EXECUTION_UNAVAILABLE')
  }

  const traceId = traceCollector.startTrace('flow-agent', execution.runtime.modelId, {
    workflowId: session.id,
    executionMode: execution.executionContext.mode,
    resourceOwner: execution.executionContext.resourceOwner
  })

  const baseRuntime = getProvider(execution.runtime.modelId, {
    apiKey: execution.runtime.apiKey,
    baseURL: execution.runtime.baseURL
  })

  return createInstrumentedRuntime(
    baseRuntime,
    traceId,
    'flow-agent',
    execution.runtime.modelId
  )
}
