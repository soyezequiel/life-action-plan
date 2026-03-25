import { getDeploymentMode } from '../../../../../../src/lib/env/deployment'
import { runStrategicSimulation } from '../../../../../../src/lib/flow/engine'
import { generateSimulationReviewWithAgent } from '../../../../../../src/lib/flow/simulation-agent'
import { initializeSimTree } from '../../../../../../src/lib/flow/simulation-tree-builder'
import { upsertSimulationTree } from '../../../../../../src/lib/db/db-helpers'
import { resolvePlanBuildExecution } from '../../../../../../src/lib/runtime/build-execution'
import { createInstrumentedRuntime, getProvider, traceCollector } from '../../../../_domain'
import { resolveUserId } from '../../../../_user-settings'
import { loadOwnedWorkflow, loadWorkflowProfile, notFoundResponse, persistWorkflowState } from '../../../_helpers'
import { sseJsonResponse } from '../../../_sse'

interface RouteContext {
  params: Promise<{ workflowId: string }>
}

const SIMULATION_REVIEW_TIMEOUT_MS = 10_000

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('FLOW_SIMULATION_REVIEW_TIMEOUT'))
        }, timeoutMs)
      })
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

function uniqueStrings(values: string[], limit = 8): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit)
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { workflowId } = await context.params
  const session = await loadOwnedWorkflow(request, workflowId)

  if (!session) {
    return notFoundResponse()
  }

  return sseJsonResponse(async ({ sendProgress, sendResult, close }) => {
    const strategy = session.state.strategy
    const realityCheck = session.state.realityCheck

    if (!strategy || !realityCheck) {
      sendResult({
        success: false,
        error: 'FLOW_REALITY_CHECK_REQUIRED'
      })
      close()
      return
    }

    sendProgress({
      workflowId,
      step: 'simulation',
      stage: 'preflight',
      current: 1,
      total: 5,
      message: 'Preparando la corrida y revisando que la base del plan este consistente.'
    })

    const deterministicSimulation = runStrategicSimulation(strategy, realityCheck, session.state.goals)

    sendProgress({
      workflowId,
      step: 'simulation',
      stage: 'rules',
      current: 2,
      total: 5,
      message: 'Probando carga semanal, dependencias y margen de aire con chequeos estructurales.'
    })

    deterministicSimulation.iterations.forEach((iteration, index) => {
      sendProgress({
        workflowId,
        step: 'simulation',
        stage: `iteration-${iteration.index}`,
        current: 3,
        total: 5,
        message: `${iteration.summary} (${index + 1}/${deterministicSimulation.iterations.length})`
      })
    })

    let simulation = deterministicSimulation
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
        sendProgress({
          workflowId,
          step: 'simulation',
          stage: 'llm-review',
          current: 4,
          total: 5,
          message: 'Sumando una revision del asistente para explicar mejor que se puso a prueba.'
        })

        const traceId = traceCollector.startTrace('flow-simulation-review', execution.runtime.modelId, {
          workflowId,
          phaseCount: strategy.phases.length,
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
            'flow-simulation-review',
            execution.runtime.modelId
          )
          const review = await withTimeout(
            generateSimulationReviewWithAgent({
              runtime: instrumentedRuntime,
              strategy,
              realityCheck,
              deterministicSimulation
            }),
            SIMULATION_REVIEW_TIMEOUT_MS
          )

          simulation = {
            ...deterministicSimulation,
            method: 'hybrid-llm',
            reviewSummary: review.reviewSummary,
            checkedAreas: uniqueStrings([
              ...deterministicSimulation.checkedAreas,
              ...review.checkedAreas
            ], 6),
            findings: uniqueStrings([
              ...deterministicSimulation.findings,
              ...review.extraFindings
            ])
          }
          traceCollector.completeTrace(traceId)
        } catch (error) {
          traceCollector.failTrace(traceId, error)
        }
      }
    }

    // Initialize simulation tree (best-effort: don't fail if tree init fails)
    let simulationTreeId: string | null = session.state.simulationTreeId ?? null
    try {
      const profile = await loadWorkflowProfile(session)
      if (profile) {
        const tree = initializeSimTree({
          workflowId,
          strategy,
          realityCheck,
          profile,
          goals: session.state.goals
        })
        await upsertSimulationTree(workflowId, tree, 0)
        simulationTreeId = workflowId
      }
    } catch {
      // Non-fatal: flat simulation still proceeds
    }

    const nextState = {
      ...session.state,
      simulation,
      simulationTreeId
    }
    const nextSession = await persistWorkflowState({
      workflowId,
      state: nextState,
      currentStep: 'simulation',
      status: 'in_progress',
      checkpointCode: `simulation-iteration-${simulation.iterations.length}`,
      checkpointPayload: {
        finalStatus: simulation.finalStatus,
        iterations: simulation.iterations.length,
        method: simulation.method
      }
    })

    sendProgress({
      workflowId,
      step: 'simulation',
      stage: 'saving',
      current: 5,
      total: 5,
      message: 'Guardando la simulacion para que puedas revisarla antes de pasar al mapa visual.'
    })
    sendResult({
      success: true,
      session: nextSession,
      simulation
    })
    close()
  })
}
