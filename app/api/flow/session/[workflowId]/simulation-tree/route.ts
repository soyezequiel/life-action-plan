import { getDeploymentMode } from '../../../../../../src/lib/env/deployment'
import { getSimulationTree, upsertSimulationTree } from '../../../../../../src/lib/db/db-helpers'
import { initializeSimTree, expandNodeChildren } from '../../../../../../src/lib/flow/simulation-tree-builder'
import { applyCorrections } from '../../../../../../src/lib/flow/simulation-propagation'
import { runSimulationOrchestrator } from '../../../../../../src/lib/flow/simulation-orchestrator'
import { resolvePlanBuildExecution } from '../../../../../../src/lib/runtime/build-execution'
import { createInstrumentedRuntime, getProvider, traceCollector } from '../../../../_domain'
import { resolveUserId } from '../../../../_user-settings'
import {
  loadOwnedWorkflow,
  loadWorkflowProfile,
  notFoundResponse,
  persistWorkflowState
} from '../../../_helpers'
import { sseJsonResponse } from '../../../_sse'
import { jsonResponse } from '../../../../_shared'
import type { FlowSimulationTreeRequest } from '../../../../../../src/shared/types/flow-api'
import type { SimTree } from '../../../../../../src/shared/schemas/simulation-tree'

interface RouteContext {
  params: Promise<{ workflowId: string }>
}

async function resolveRuntime(request: Request, session: { state: { gate?: { provider?: string; llmMode?: string; backendCredentialId?: string | null } | null } }) {
  const gateState = session.state.gate
  if (!gateState?.provider) return null

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

  if (!execution.executionContext.canExecute || !execution.runtime) return null

  return {
    runtime: getProvider(execution.runtime.modelId, {
      apiKey: execution.runtime.apiKey,
      baseURL: execution.runtime.baseURL
    }),
    modelId: execution.runtime.modelId
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { workflowId } = await context.params
  const session = await loadOwnedWorkflow(request, workflowId)

  if (!session) {
    return notFoundResponse()
  }

  const body = await request.json() as FlowSimulationTreeRequest
  const { action } = body

  const strategy = session.state.strategy
  const realityCheck = session.state.realityCheck

  if (!strategy || !realityCheck) {
    return jsonResponse({ success: false, error: 'FLOW_REALITY_CHECK_REQUIRED' }, { status: 409 })
  }

  // ── JSON actions (no SSE) ─────────────────────────────────────────────────

  if (action === 'initialize') {
    const profile = await loadWorkflowProfile(session)
    if (!profile) {
      return jsonResponse({ success: false, error: 'FLOW_PROFILE_REQUIRED' }, { status: 409 })
    }

    const existingTree = await getSimulationTree(workflowId)
    if (existingTree) {
      return jsonResponse({ success: true, session, tree: existingTree })
    }

    const tree = initializeSimTree({
      workflowId,
      strategy,
      realityCheck,
      profile,
      goals: session.state.goals
    })

    await upsertSimulationTree(workflowId, tree, 0)

    const nextState = { ...session.state, simulationTreeId: workflowId }
    const nextSession = await persistWorkflowState({
      workflowId,
      state: nextState,
      currentStep: session.currentStep,
      checkpointCode: 'sim-tree-initialized',
      checkpointPayload: { nodeCount: Object.keys(tree.nodes).length }
    })

    return jsonResponse({ success: true, session: nextSession, tree })
  }

  if (action === 'expand-node') {
    const { nodeId, treeVersion } = body
    if (!nodeId) {
      return jsonResponse({ success: false, error: 'MISSING_NODE_ID' }, { status: 400 })
    }

    const existing = await getSimulationTree(workflowId)
    if (!existing) {
      return jsonResponse({ success: false, error: 'SIM_TREE_NOT_FOUND' }, { status: 404 })
    }

    if (treeVersion !== undefined && treeVersion !== existing.version) {
      return jsonResponse({ success: false, error: 'SIM_TREE_VERSION_CONFLICT' }, { status: 409 })
    }

    const profile = await loadWorkflowProfile(session)
    if (!profile) {
      return jsonResponse({ success: false, error: 'FLOW_PROFILE_REQUIRED' }, { status: 409 })
    }

    const updatedTree = expandNodeChildren(existing, nodeId, {
      strategy,
      profile,
      goals: session.state.goals
    })

    await upsertSimulationTree(workflowId, updatedTree, existing.version)

    return jsonResponse({ success: true, tree: updatedTree })
  }

  if (action === 'lock-node') {
    const { nodeId, treeVersion } = body
    if (!nodeId) {
      return jsonResponse({ success: false, error: 'MISSING_NODE_ID' }, { status: 400 })
    }

    const existing = await getSimulationTree(workflowId)
    if (!existing) {
      return jsonResponse({ success: false, error: 'SIM_TREE_NOT_FOUND' }, { status: 404 })
    }

    if (treeVersion !== undefined && treeVersion !== existing.version) {
      return jsonResponse({ success: false, error: 'SIM_TREE_VERSION_CONFLICT' }, { status: 409 })
    }

    const node = existing.nodes[nodeId]
    if (!node) {
      return jsonResponse({ success: false, error: 'NODE_NOT_FOUND' }, { status: 404 })
    }

    const newStatus: SimTree['nodes'][string]['status'] = node.status === 'locked' ? 'simulated' : 'locked'
    const updatedTree: SimTree = {
      ...existing,
      nodes: {
        ...existing.nodes,
        [nodeId]: { ...node, status: newStatus }
      },
      version: existing.version + 1
    }

    await upsertSimulationTree(workflowId, updatedTree, existing.version)

    return jsonResponse({ success: true, tree: updatedTree })
  }

  // ── SSE actions ───────────────────────────────────────────────────────────

  if (action === 'simulate-node') {
    const { nodeId, treeVersion } = body
    if (!nodeId) {
      return jsonResponse({ success: false, error: 'MISSING_NODE_ID' }, { status: 400 })
    }

    return sseJsonResponse(async ({ sendProgress, sendResult, close }) => {
      const existing = await getSimulationTree(workflowId)
      if (!existing) {
        sendResult({ success: false, error: 'SIM_TREE_NOT_FOUND' })
        close()
        return
      }

      if (treeVersion !== undefined && treeVersion !== existing.version) {
        sendResult({ success: false, error: 'SIM_TREE_VERSION_CONFLICT' })
        close()
        return
      }

      const profile = await loadWorkflowProfile(session)
      if (!profile) {
        sendResult({ success: false, error: 'FLOW_PROFILE_REQUIRED' })
        close()
        return
      }

      const runtimeConfig = await resolveRuntime(request, session)

      const traceId = runtimeConfig
        ? traceCollector.startTrace('flow-simulation-tree', runtimeConfig.modelId, { workflowId, nodeId })
        : null

      try {
        const runtime = runtimeConfig
          ? createInstrumentedRuntime(runtimeConfig.runtime, traceId, 'flow-simulation-tree', runtimeConfig.modelId)
          : null

        const result = await runSimulationOrchestrator({
          runtime,
          traceId,
          tree: existing,
          targetNodeIds: [nodeId],
          strategy,
          realityCheck,
          profile,
          goals: session.state.goals,
          workflowId,
          onProgress: (progress) => sendProgress(progress)
        })

        await upsertSimulationTree(workflowId, result.tree, existing.version)

        if (traceId) traceCollector.completeTrace(traceId)

        sendResult({
          success: true,
          tree: result.tree,
          simulatedNodes: result.simulatedNodes,
          findings: result.findings,
          strategyPatches: result.strategyPatches
        })
      } catch (error) {
        console.error('[SIMULATION_ERROR] in simulate-node:', error)
        if (traceId) traceCollector.failTrace(traceId, error as Error)
        sendResult({ success: false, error: 'SIMULATION_FAILED' })
      }

      close()
    })
  }

  if (action === 'simulate-range') {
    const { rangeStart, rangeEnd, treeVersion } = body

    return sseJsonResponse(async ({ sendProgress, sendResult, close }) => {
      const existing = await getSimulationTree(workflowId)
      if (!existing) {
        sendResult({ success: false, error: 'SIM_TREE_NOT_FOUND' })
        close()
        return
      }

      if (treeVersion !== undefined && treeVersion !== existing.version) {
        sendResult({ success: false, error: 'SIM_TREE_VERSION_CONFLICT' })
        close()
        return
      }

      const profile = await loadWorkflowProfile(session)
      if (!profile) {
        sendResult({ success: false, error: 'FLOW_PROFILE_REQUIRED' })
        close()
        return
      }

      // Determine target nodes: all pending/stale/affected month nodes in range
      const allMonthNodes = Object.values(existing.nodes).filter(
        (n) => n.granularity === 'month' && n.status !== 'locked'
      )

      const targetNodes = allMonthNodes.filter((n) => {
        if (rangeStart && n.period.start < rangeStart) return false
        if (rangeEnd && n.period.end > rangeEnd) return false
        return true
      })

      const targetNodeIds = targetNodes.map((n) => n.id)

      if (targetNodeIds.length === 0) {
        sendResult({ success: true, tree: existing, simulatedNodes: [], findings: [], strategyPatches: [] })
        close()
        return
      }

      const runtimeConfig = await resolveRuntime(request, session)

      const traceId = runtimeConfig
        ? traceCollector.startTrace('flow-simulation-tree', runtimeConfig.modelId, {
            workflowId,
            nodeCount: targetNodeIds.length
          })
        : null

      try {
        const runtime = runtimeConfig
          ? createInstrumentedRuntime(runtimeConfig.runtime, traceId, 'flow-simulation-tree', runtimeConfig.modelId)
          : null

        const result = await runSimulationOrchestrator({
          runtime,
          traceId,
          tree: existing,
          targetNodeIds,
          strategy,
          realityCheck,
          profile,
          goals: session.state.goals,
          workflowId,
          onProgress: (progress) => sendProgress(progress)
        })

        await upsertSimulationTree(workflowId, result.tree, existing.version)

        if (traceId) traceCollector.completeTrace(traceId)

        sendResult({
          success: true,
          tree: result.tree,
          simulatedNodes: result.simulatedNodes,
          findings: result.findings,
          strategyPatches: result.strategyPatches
        })
      } catch (error) {
        console.error('[SIMULATION_ERROR] in simulate-range:', error)
        if (traceId) traceCollector.failTrace(traceId, error as Error)
        sendResult({ success: false, error: 'SIMULATION_FAILED' })
      }

      close()
    })
  }

  if (action === 'apply-corrections') {
    const { corrections, treeVersion } = body
    if (!corrections || corrections.length === 0) {
      return jsonResponse({ success: false, error: 'MISSING_CORRECTIONS' }, { status: 400 })
    }

    return sseJsonResponse(async ({ sendProgress, sendResult, close }) => {
      const existing = await getSimulationTree(workflowId)
      if (!existing) {
        sendResult({ success: false, error: 'SIM_TREE_NOT_FOUND' })
        close()
        return
      }

      if (treeVersion !== undefined && treeVersion !== existing.version) {
        sendResult({ success: false, error: 'SIM_TREE_VERSION_CONFLICT' })
        close()
        return
      }

      sendProgress({
        workflowId,
        step: 'simulation-tree',
        stage: 'applying-corrections',
        current: 1,
        total: 2,
        message: 'Aplicando correcciones al árbol de simulación.',
        agentRole: 'orchestrator'
      })

      const correctionResult = applyCorrections(existing, corrections, strategy)

      const updatedTree: SimTree = {
        ...correctionResult.tree,
        version: existing.version + 1
      }

      await upsertSimulationTree(workflowId, updatedTree, existing.version)

      sendProgress({
        workflowId,
        step: 'simulation-tree',
        stage: 'complete',
        current: 2,
        total: 2,
        message: `Correcciones aplicadas. ${correctionResult.strategyPatches.length} parche(s) de estrategia generado(s).`,
        agentRole: 'orchestrator'
      })

      sendResult({
        success: true,
        tree: updatedTree,
        strategyPatches: correctionResult.strategyPatches
      })

      close()
    })
  }

  return jsonResponse({ success: false, error: 'UNKNOWN_ACTION' }, { status: 400 })
}
