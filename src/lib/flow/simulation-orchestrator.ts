import { DateTime } from 'luxon'
import type { Perfil } from '../../shared/schemas/perfil'
import type {
  GoalDraft,
  RealityCheckResult,
  StrategicPlanDraft
} from '../../shared/schemas/flow'
import type {
  SimFinding,
  SimNode,
  SimActionLogEntry,
  SimStrategyPatch,
  SimTree
} from '../../shared/schemas/simulation-tree'
import type { SimPersona } from '../../shared/schemas/persona-profile'
import type { FlowTaskProgress } from '../../shared/types/flow-api'
import type { AgentRuntime } from '../runtime/types'
import { createInstrumentedRuntime } from '../../debug/instrumented-runtime'
import { traceCollector } from '../../debug/trace-collector'
import { runWorldAgent, worldAgentFallback } from './agents/world-agent'
import { runUserAgent, userAgentFallback } from './agents/user-agent'
import { buildPersonaWithAgent, buildPersonaFromRules } from './agents/persona-builder'
import { propagateUp, propagateLateral } from './simulation-propagation'

export interface SimulationOrchestratorInput {
  runtime: AgentRuntime | null
  traceId: string | null
  tree: SimTree
  targetNodeIds: string[]
  strategy: StrategicPlanDraft
  realityCheck: RealityCheckResult
  profile: Perfil
  goals: GoalDraft[]
  workflowId: string
  persona?: SimPersona | null
  onProgress: (progress: FlowTaskProgress) => void
}

export interface SimulationOrchestratorOutput {
  tree: SimTree
  simulatedNodes: SimNode[]
  findings: SimFinding[]
  strategyPatches: SimStrategyPatch[]
  totalLlmCalls: number
  totalTokens: number
}

const BATCH_SIZE = 3

function nowIso(): string {
  return DateTime.utc().toISO() ?? '2026-01-01T00:00:00.000Z'
}

async function simulateOneNode(params: {
  nodeId: string
  tree: SimTree
  runtime: AgentRuntime | null
  traceId: string | null
  strategy: StrategicPlanDraft
  realityCheck: RealityCheckResult
  profile: Perfil
  goals: GoalDraft[]
  persona: SimPersona | null
  workflowId: string
  modelId: string
  onProgress: (progress: FlowTaskProgress) => void
}): Promise<{ nodeId: string; node: SimNode; findings: SimFinding[]; tokens: number }> {
  const { nodeId, tree, runtime, traceId, strategy, realityCheck, profile, goals, persona, workflowId, modelId, onProgress } = params
  const node = tree.nodes[nodeId]
  if (!node) return { nodeId, node: tree.nodes[nodeId]!, findings: [], tokens: 0 }

  const totalTokens = 0

  onProgress({
    workflowId,
    step: 'simulation-tree',
    stage: 'preflight',
    current: 0,
    total: 3,
    message: `Revisando la base de ${node.label}.`,
    agentRole: 'orchestrator'
  })

  // Phase 1: deterministic pre-check
  const findings: SimFinding[] = []

  if (node.plannedHours <= 0) {
    findings.push({
      id: `f-empty-${nodeId}`,
      severity: 'warning',
      message: `${node.label} no tiene horas planificadas.`,
      nodeId,
      target: 'strategy',
      suggestedFix: 'Verificar que las fases del plan cubran este período.'
    })
  }

  // Phase 2: MUNDO agent
  onProgress({
    workflowId,
    step: 'simulation-tree',
    stage: 'world-agent',
    current: 1,
    total: 3,
    message: `El entorno está generando situaciones para ${node.label}.`,
    agentRole: 'mundo'
  })

  let worldOutput
  if (runtime) {
    const worldRuntime = createInstrumentedRuntime(
      runtime.newContext(),
      traceId,
      'sim-world-agent',
      modelId,
      null
    )
    try {
      worldOutput = await runWorldAgent({
        runtime: worldRuntime,
        node,
        strategy,
        profile,
        realityCheck,
        goals,
        persona
      })
    } catch (err) {
      console.warn(`[SIM_ORCHESTRATOR] World Agent failed for node ${node.label}, using fallback:`, err)
      worldOutput = worldAgentFallback(node, strategy)
    }
  } else {
    worldOutput = worldAgentFallback(node, strategy)
  }

  // Phase 3: YO agent
  onProgress({
    workflowId,
    step: 'simulation-tree',
    stage: 'user-agent',
    current: 2,
    total: 3,
    message: `Simulando tus decisiones frente a ${worldOutput.disruptions.length} evento(s) en ${node.label}.`,
    agentRole: 'yo'
  })

  const goalPriorities = goals.map((g) => ({ id: g.id, priority: g.priority }))

  let userOutput
  if (runtime) {
    const userRuntime = createInstrumentedRuntime(
      runtime.newContext(),
      traceId,
      'sim-user-agent',
      modelId,
      null
    )
    try {
      userOutput = await runUserAgent({
        runtime: userRuntime,
        node,
        disruptions: worldOutput.disruptions,
        strategy,
        profile,
        goalPriorities,
        persona,
        onProgress: (partial) => {
          onProgress({
            workflowId,
            step: 'simulation-tree',
            stage: partial.reactPhase ?? 'user-agent',
            current: 2,
            total: 3,
            message: partial.message ?? `Simulando decisiones en ${node.label}.`,
            agentRole: 'yo',
            nodeLabel: node.label,
            ...partial
          })
        }
      })
    } catch (err) {
      console.warn(`[SIM_ORCHESTRATOR] User Agent failed for node ${node.label}, using fallback:`, err)
      userOutput = userAgentFallback(node, worldOutput.disruptions)
    }
  } else {
    userOutput = userAgentFallback(node, worldOutput.disruptions)
  }

  findings.push(...userOutput.personalFindings)

  const simulatedNode: SimNode = {
    ...node,
    status: 'simulated',
    disruptions: worldOutput.disruptions,
    responses: userOutput.responses,
    actualHours: userOutput.actualHours,
    quality: userOutput.qualityScore,
    goalBreakdown: {
      ...node.goalBreakdown,
      ...userOutput.goalBreakdown
    },
    findings,
    actionLog: userOutput.actionLog ?? [],
    simulatedAt: nowIso(),
    simulatedWith: runtime ? 'dual-agent' : 'rules'
  }

  return { nodeId, node: simulatedNode, findings, tokens: totalTokens }
}

export async function runSimulationOrchestrator(
  input: SimulationOrchestratorInput
): Promise<SimulationOrchestratorOutput> {
  const { runtime, traceId, tree, targetNodeIds, strategy, realityCheck, profile, goals, workflowId, onProgress } = input

  const modelId = 'sim-orchestrator'
  let currentTree = tree
  const simulatedNodes: SimNode[] = []
  const allFindings: SimFinding[] = []
  const allStrategyPatches: SimStrategyPatch[] = []
  let totalLlmCalls = 0
  const totalTokens = 0

  // Generate persona if not provided
  let persona: SimPersona | null = input.persona ?? null
  if (!persona) {
    onProgress({
      workflowId,
      step: 'simulation-tree',
      stage: 'persona',
      current: 0,
      total: targetNodeIds.length,
      message: 'Construyendo perfil de personalidad simulado...',
      agentRole: 'orchestrator'
    })

    if (runtime) {
      persona = await buildPersonaWithAgent({ runtime: runtime.newContext(), profile, goals })
      totalLlmCalls += 1
    } else {
      persona = buildPersonaFromRules(profile, goals)
    }

    currentTree = { ...currentTree, persona }
  }

  const noLlm = !runtime
  if (noLlm) {
    onProgress({
      workflowId,
      step: 'simulation-tree',
      stage: 'no-llm',
      current: 0,
      total: targetNodeIds.length,
      message: 'Sin asistente disponible. Usando estimación heurística.',
      agentRole: 'orchestrator'
    })
  }

  const durations: number[] = []

  // Process in batches of BATCH_SIZE
  for (let batchStart = 0; batchStart < targetNodeIds.length; batchStart += BATCH_SIZE) {
    const batch = targetNodeIds.slice(batchStart, batchStart + BATCH_SIZE)
    const batchStartTime = Date.now()

    const batchResults = await Promise.allSettled(
      batch.map((nodeId, batchIndex) => {
        const current = batchStart + batchIndex + 1
        const total = targetNodeIds.length

        const estimatedRemainingMs = durations.length > 0
          ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * (total - current + 1))
          : undefined

        return simulateOneNode({
          nodeId,
          tree: currentTree,
          runtime,
          traceId,
          strategy,
          realityCheck,
          profile,
          goals,
          persona,
          workflowId,
          modelId,
          onProgress: (progress) => {
            onProgress({ ...progress, estimatedRemainingMs })
          }
        })
      })
    )

    const batchDuration = Date.now() - batchStartTime
    if (batch.length > 0) durations.push(batchDuration / batch.length)

    // Apply batch results and propagate
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        const { nodeId, node, findings } = result.value
        totalLlmCalls += runtime ? 2 : 0

        // Update tree with simulated node
        currentTree = {
          ...currentTree,
          nodes: { ...currentTree.nodes, [nodeId]: node }
        }

        simulatedNodes.push(node)
        allFindings.push(...findings)

        // Propagate up (recalculate parent numbers without LLM)
        onProgress({
          workflowId,
          step: 'simulation-tree',
          stage: 'propagation',
          current: batchStart + 1,
          total: targetNodeIds.length,
          message: 'Propagando cambios al resto del plan.',
          agentRole: 'orchestrator'
        })

        const upResult = propagateUp(currentTree, nodeId)
        const lateralResult = propagateLateral(upResult.updatedTree, nodeId)
        currentTree = lateralResult.updatedTree
      }
    }
  }

  // Increment tree version
  const finalTree: SimTree = {
    ...currentTree,
    totalSimulations: currentTree.totalSimulations + simulatedNodes.length,
    version: currentTree.version + 1,
    updatedAt: nowIso()
  }

  onProgress({
    workflowId,
    step: 'simulation-tree',
    stage: 'complete',
    current: targetNodeIds.length,
    total: targetNodeIds.length,
    message: `Simulación completada. ${simulatedNodes.length} período(s), ${allFindings.length} hallazgo(s).`,
    agentRole: 'orchestrator'
  })

  return {
    tree: finalTree,
    simulatedNodes,
    findings: allFindings,
    strategyPatches: allStrategyPatches,
    totalLlmCalls,
    totalTokens
  }
}

