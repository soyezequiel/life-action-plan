import { DateTime } from 'luxon'
import type { FlowSession } from '../../shared/schemas/flow'
import type { SimTree, SimNode } from '../../shared/schemas/simulation-tree'
import type {
  SimExportBundle,
  SimExportEdge,
  SimExportAgentLog,
  SimExportPrompt,
  SimExportTimelineEntry,
  SimExportSummary
} from '../../shared/schemas/simulation-export'

export interface SimExportInput {
  session: FlowSession
  tree: SimTree
}

function nowIso(): string {
  return DateTime.utc().toISO() ?? '2026-01-01T00:00:00.000Z'
}

/**
 * Sanitize profile: strip sensitive fields, keep only what's useful for analysis.
 */
function sanitizeProfile(session: FlowSession): Record<string, unknown> | null {
  const profile = session.state as Record<string, unknown>
  // The profile lives in the intake data, not directly.
  // We reconstruct a lightweight version from the session goals and strategy context.
  const goals = session.state.goals
  if (!goals || goals.length === 0) return null

  return {
    goalsCount: goals.length,
    totalHoursPerWeek: goals.reduce((sum, g) => sum + g.hoursPerWeek, 0),
    maxHorizonMonths: Math.max(...goals.map((g) => g.horizonMonths)),
    categories: [...new Set(goals.map((g) => g.category))]
  }
}

/**
 * Derive edges from parentId relationships.
 */
function buildEdges(nodes: Record<string, SimNode>): SimExportEdge[] {
  const edges: SimExportEdge[] = []
  for (const node of Object.values(nodes)) {
    if (node.parentId) {
      edges.push({ source: node.parentId, target: node.id })
    }
  }
  return edges
}

/**
 * Consolidate all actionLogs from all nodes, sorted chronologically.
 */
function buildAgentLogs(nodes: Record<string, SimNode>): SimExportAgentLog[] {
  const logs: SimExportAgentLog[] = []

  for (const node of Object.values(nodes)) {
    if (!node.actionLog || node.actionLog.length === 0) continue

    for (const entry of node.actionLog) {
      logs.push({
        nodeId: node.id,
        nodeLabel: node.label,
        step: entry.step,
        phase: entry.phase,
        agentRole: entry.agentRole,
        content: entry.content,
        toolUsed: entry.toolUsed,
        durationMs: entry.durationMs,
        timestamp: entry.timestamp
      })
    }
  }

  return logs.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

/**
 * Build prompt reconstructions for simulated nodes.
 * Uses the same format as the actual agents but without calling LLM.
 */
function buildPromptReconstructions(
  nodes: Record<string, SimNode>,
  session: FlowSession
): SimExportPrompt[] {
  const prompts: SimExportPrompt[] = []
  const goals = session.state.goals
  const strategy = session.state.strategy

  for (const node of Object.values(nodes)) {
    if (node.simulatedWith !== 'dual-agent') continue

    const goalBreakdownText = Object.entries(node.goalBreakdown)
      .map(([id, entry]) =>
        `${id}: planned=${entry.plannedHours}h, required=${entry.requiredHours}h`
      )
      .join('\n')

    // World agent prompt reconstruction
    const nodeMonthIndex = node.id.startsWith('month-')
      ? Number.parseInt(node.id.replace('month-', ''), 10)
      : null

    const activeGoals = nodeMonthIndex && strategy
      ? strategy.phases
          .filter((p) => p.startMonth <= nodeMonthIndex && p.endMonth >= nodeMonthIndex)
          .map((p) => {
            const goalNames = p.goalIds
              .map((id) => goals.find((g) => g.id === id)?.text ?? id)
              .join(', ')
            return `- ${p.title}: ${goalNames} (${p.hoursPerWeek}h/semana)`
          })
          .join('\n')
      : 'No determinable.'

    const planned = node.plannedHours
    const highImpact = `${(planned * 0.15).toFixed(1)}-${(planned * 0.25).toFixed(1)}`
    const medImpact = `${(planned * 0.05).toFixed(1)}-${(planned * 0.15).toFixed(1)}`
    const lowImpact = `${(planned * 0.01).toFixed(1)}-${(planned * 0.05).toFixed(1)}`

    prompts.push({
      nodeId: node.id,
      agentRole: 'mundo',
      systemPrompt: [
        `Sos el simulador de entorno de LAP.`,
        `Periodo: ${node.label} (${node.period.start} a ${node.period.end}).`,
        `Horas planificadas: ${planned}h.`,
        `OBJETIVOS ACTIVOS:\n${activeGoals || 'Ninguno.'}`,
        `ESCALA: ALTA=${highImpact}h, MEDIA=${medImpact}h, BAJA=${lowImpact}h`
      ].join('\n'),
      userPrompt: `Generá las disrupciones para el periodo ${node.label}.`
    })

    // User agent prompt reconstruction
    const prioritiesText = goals
      .sort((a, b) => a.priority - b.priority)
      .map((g) => `Prioridad ${g.priority}: ${g.id}`)
      .join(', ')

    prompts.push({
      nodeId: node.id,
      agentRole: 'yo',
      systemPrompt: [
        `Sos el simulador de decisiones del usuario en LAP.`,
        `Prioridades: ${prioritiesText}`,
        `Periodo: ${node.label} (${node.period.start} a ${node.period.end}).`,
        `Horas planificadas: ${planned}h.`,
        `Disrupciones: ${node.disruptions.length}.`,
        `Desglose por objetivo:\n${goalBreakdownText}`
      ].join('\n'),
      userPrompt: `PASO 3 — OBSERVE: Calculá el resultado final. Respondé SOLO JSON válido.`
    })
  }

  return prompts
}

/**
 * Build a flat chronological timeline of all nodes.
 */
function buildTimeline(nodes: Record<string, SimNode>): SimExportTimelineEntry[] {
  return Object.values(nodes)
    .sort((a, b) => a.period.start.localeCompare(b.period.start))
    .map((node) => ({
      nodeId: node.id,
      label: node.label,
      granularity: node.granularity,
      start: node.period.start,
      end: node.period.end,
      plannedHours: node.plannedHours,
      actualHours: node.actualHours,
      quality: node.quality,
      disruptionCount: node.disruptions.length,
      status: node.status
    }))
}

/**
 * Compute aggregate summary statistics.
 */
function buildSummary(tree: SimTree): SimExportSummary {
  const nodes = Object.values(tree.nodes)
  const simulatedNodes = nodes.filter((n) => n.status === 'simulated' || n.status === 'locked')
  const allFindings = [
    ...tree.globalFindings,
    ...nodes.flatMap((n) => n.findings)
  ]

  const qualityValues = simulatedNodes
    .map((n) => n.quality)
    .filter((q): q is number => q !== null)
  const averageQuality = qualityValues.length > 0
    ? Math.round((qualityValues.reduce((a, b) => a + b, 0) / qualityValues.length) * 10) / 10
    : null

  const totalPlanned = nodes.reduce((sum, n) => sum + n.plannedHours, 0)
  const totalActual = simulatedNodes.reduce((sum, n) => sum + (n.actualHours ?? 0), 0)

  return {
    totalNodes: nodes.length,
    simulatedNodes: simulatedNodes.length,
    totalFindings: allFindings.length,
    criticalFindings: allFindings.filter((f) => f.severity === 'critical').length,
    averageQuality,
    totalPlannedHours: Math.round(totalPlanned * 10) / 10,
    totalActualHours: Math.round(totalActual * 10) / 10,
    completionRatio: totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 1000) / 1000 : 0,
    llmCallsUsed: simulatedNodes.filter((n) => n.simulatedWith === 'dual-agent').length * 2,
    estimatedCostSats: tree.estimatedLlmCostSats
  }
}

/**
 * Build the complete export bundle from a flow session and its simulation tree.
 */
export function buildSimulationExportBundle(input: SimExportInput): SimExportBundle {
  const { session, tree } = input

  return {
    version: '1.0',
    exportedAt: nowIso(),
    workflow: {
      id: session.id,
      currentStep: session.currentStep,
      status: session.status
    },
    profile: sanitizeProfile(session),
    persona: tree.persona ? (tree.persona as unknown as Record<string, unknown>) : null,
    goals: session.state.goals.map((g) => ({
      id: g.id,
      text: g.text,
      category: g.category,
      effort: g.effort,
      isHabit: g.isHabit,
      priority: g.priority,
      horizonMonths: g.horizonMonths,
      hoursPerWeek: g.hoursPerWeek
    })),
    strategy: session.state.strategy
      ? (session.state.strategy as unknown as Record<string, unknown>)
      : null,
    realityCheck: session.state.realityCheck
      ? (session.state.realityCheck as unknown as Record<string, unknown>)
      : null,
    simulationTree: {
      meta: {
        id: tree.id,
        version: tree.version,
        totalSimulations: tree.totalSimulations,
        estimatedLlmCostSats: tree.estimatedLlmCostSats,
        createdAt: tree.createdAt,
        updatedAt: tree.updatedAt
      },
      globalFindings: tree.globalFindings.map((f) => ({ ...f } as Record<string, unknown>)),
      nodes: Object.fromEntries(
        Object.entries(tree.nodes).map(([id, node]) => [
          id,
          { ...node } as Record<string, unknown>
        ])
      ),
      edges: buildEdges(tree.nodes)
    },
    agentLogs: buildAgentLogs(tree.nodes),
    prompts: buildPromptReconstructions(tree.nodes, session),
    timeline: buildTimeline(tree.nodes),
    summary: buildSummary(tree)
  }
}

/**
 * Convert the timeline to CSV format with headers.
 */
export function buildTimelineCsv(timeline: SimExportTimelineEntry[]): string {
  const headers = [
    'nodeId', 'label', 'granularity', 'start', 'end',
    'plannedHours', 'actualHours', 'quality', 'disruptionCount', 'status'
  ]
  const rows = timeline.map((entry) =>
    [
      entry.nodeId,
      `"${entry.label}"`,
      entry.granularity,
      entry.start,
      entry.end,
      entry.plannedHours.toString(),
      entry.actualHours?.toString() ?? '',
      entry.quality?.toString() ?? '',
      entry.disruptionCount.toString(),
      entry.status
    ].join(',')
  )
  return [headers.join(','), ...rows].join('\n')
}
