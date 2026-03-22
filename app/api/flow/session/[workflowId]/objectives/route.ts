import { getDeploymentMode } from '../../../../../../src/lib/env/deployment'
import { flowObjectivesRequestSchema } from '../../../../_schemas'
import { jsonResponse } from '../../../../_shared'
import { analyzeObjectives, createIntakeBlocks, reorderGoals } from '../../../../../../src/lib/flow/engine'
import { generateIntakeBlocksWithAgent } from '../../../../../../src/lib/flow/intake-agent'
import { resolvePlanBuildExecution } from '../../../../../../src/lib/runtime/build-execution'
import { createInstrumentedRuntime, getProvider, traceCollector } from '../../../../_domain'
import { resolveUserId } from '../../../../_user-settings'
import { loadOwnedWorkflow, notFoundResponse, persistWorkflowState, invalidRequestResponse } from '../../../_helpers'

interface RouteContext {
  params: Promise<{ workflowId: string }>
}

const INTAKE_AGENT_TIMEOUT_MS = 8000

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('FLOW_INTAKE_AGENT_TIMEOUT'))
        }, timeoutMs)
      })
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const parsed = flowObjectivesRequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return invalidRequestResponse()
  }

  const { workflowId } = await context.params
  const session = await loadOwnedWorkflow(request, workflowId)

  if (!session) {
    return notFoundResponse()
  }

  const baseGoals = parsed.data.goals ?? analyzeObjectives(parsed.data.objectives)
  const goals = parsed.data.orderedGoalIds.length > 0
    ? reorderGoals(baseGoals, parsed.data.orderedGoalIds)
    : baseGoals
  let intakeBlocks = createIntakeBlocks(goals, session.state.intakeAnswers)
  let intakeQuestionSource: 'llm' | 'fallback' = 'fallback'
  let intakeRationale: string | null = null
  const gateState = session.state.gate

  if (gateState?.provider) {
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
      userId: resolveUserId(request),
      backendCredentialId: gateState.backendCredentialId ?? undefined
    })

    if (execution.executionContext.canExecute && execution.runtime) {
      const traceId = traceCollector.startTrace('flow-intake-planner', execution.runtime.modelId, {
        workflowId,
        goalCount: goals.length,
        executionMode: execution.executionContext.mode,
        resourceOwner: execution.executionContext.resourceOwner
      })

      try {
        const runtime = getProvider(execution.runtime.modelId, {
          apiKey: execution.runtime.apiKey,
          baseURL: execution.runtime.baseURL
        })
        const instrumentedRuntime = createInstrumentedRuntime(
          runtime,
          traceId,
          'flow-intake-planner',
          execution.runtime.modelId
        )
        const generated = await withTimeout(
          generateIntakeBlocksWithAgent({
            runtime: instrumentedRuntime,
            goals,
            answers: session.state.intakeAnswers
          }),
          INTAKE_AGENT_TIMEOUT_MS
        )

        intakeBlocks = generated.blocks
        intakeQuestionSource = 'llm'
        intakeRationale = generated.rationale
        traceCollector.completeTrace(traceId)
      } catch (error) {
        traceCollector.failTrace(traceId, error)
      }
    }
  }

  const completedBlocks = intakeBlocks.filter((block) => block.completed)
  const currentStep = completedBlocks.length === intakeBlocks.length ? 'strategy' : 'intake'
  const checkpointCode = completedBlocks.length === intakeBlocks.length
    ? 'intake-completed'
    : intakeQuestionSource === 'llm'
      ? 'intake-questions-generated'
      : 'objectives-captured'
  const nextState = {
    ...session.state,
    goals,
    intakeBlocks
  }
  const nextSession = await persistWorkflowState({
    workflowId,
    state: nextState,
    currentStep,
    status: 'in_progress',
    checkpointCode,
    checkpointPayload: {
      goalCount: goals.length,
      intakeQuestionSource,
      intakeRationale,
      intakeKeys: intakeBlocks.flatMap((block) => block.questions.map((question) => question.key)),
      goals: goals.map((goal) => ({
        id: goal.id,
        priority: goal.priority
      }))
    }
  })

  return jsonResponse({
    success: true,
    session: nextSession
  })
}
