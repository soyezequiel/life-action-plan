import { describe, expect, it, vi } from 'vitest'
import { buildSimulationExportBundle, buildTimelineCsv } from '../src/lib/flow/simulation-export-builder'
import { simExportBundleSchema } from '../src/shared/schemas/simulation-export'
import { initializeSimTree } from '../src/lib/flow/simulation-tree-builder'
import type { FlowSession } from '../src/shared/schemas/flow'
import type { SimTree, SimNode } from '../src/shared/schemas/simulation-tree'

const strategy = {
  title: 'Test Plan', summary: 'A plan', totalMonths: 3, estimatedWeeklyHours: 10,
  phases: [{ id: 'p1', title: 'Phase 1', summary: 'S', startMonth: 1, endMonth: 3, goalIds: ['g1'], hoursPerWeek: 10, milestone: 'M', metrics: [], dependencies: [] }],
  conflicts: [], milestones: []
} as any

const goals = [{
  id: 'g1', text: 'Learn TypeScript', category: 'educacion' as const, effort: 'medio' as const,
  horizonMonths: 3, hoursPerWeek: 10, priority: 1, isHabit: false, needsClarification: false
}]

const rc = { status: 'ok' as const, availableHours: 10, neededHours: 10, summary: 'OK', recommendations: [], adjustmentsApplied: [] } as any

const profile = {
  participantes: [{
    datosPersonales: { nombre: 'T', narrativaPersonal: 'D', rangoEtario: '25-34', localidad: 'BA' },
    calendario: { horasLibresEstimadas: { diasLaborales: 2, diasDescanso: 4 }, bloqueosSemanales: [], eventosProximos: [], diasNoDisponibles: [] },
    patronesEnergia: { cronotipo: 'intermedio' as const, nivelEnergiaTipico: 'medio' as const, tendencias: [] },
    problemasActuales: [],
    motivacion: { nivelGeneral: 7, tendencias: [] },
    dependientes: [],
    condicionesSalud: [],
    patronesConocidos: { tendencias: [], diaTipicoBueno: '', diaTipicoMalo: '' }
  }]
} as any

function makeSession(tree: SimTree): FlowSession {
  return {
    id: 'wf-test',
    userId: null,
    profileId: null,
    planId: null,
    status: 'in_progress',
    currentStep: 'simulation',
    lastCheckpointCode: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    state: {
      gate: null,
      goals,
      intakeBlocks: [],
      intakeAnswers: {},
      strategy,
      realityCheck: rc,
      simulation: null,
      presentation: null,
      calendar: null,
      topdown: null,
      activation: { activatedAt: null, planId: null },
      resume: { changeSummary: null, patchSummary: null, askedAt: null },
      simulationTreeId: tree.id
    }
  }
}

function simulateNode(node: SimNode): SimNode {
  return {
    ...node,
    status: 'simulated',
    actualHours: node.plannedHours * 0.85,
    quality: 82,
    disruptions: [{
      id: 'd-1', type: 'energy_drop', description: 'Cansancio',
      impactHours: 2, affectedGoalIds: ['g1']
    }],
    responses: [{
      id: 'r-1', action: 'absorb', description: 'Absorber',
      hoursRecovered: 0, tradeoff: null
    }],
    simulatedAt: '2026-01-15T10:00:00.000Z',
    simulatedWith: 'dual-agent',
    actionLog: [{
      step: 1, timestamp: '2026-01-15T10:00:00.000Z', phase: 'reason' as const,
      agentRole: 'yo' as const, content: 'Reasoning about disruptions...',
      toolUsed: null, durationMs: 1200
    }]
  }
}

describe('simulation-export-builder', () => {
  it('builds a valid export bundle from session + tree', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const tree = initializeSimTree({ workflowId: 'wf-test', strategy, realityCheck: rc, profile, goals })
      const session = makeSession(tree)
      const bundle = buildSimulationExportBundle({ session, tree })

      const result = simExportBundleSchema.safeParse(bundle)
      expect(result.success).toBe(true)
      expect(bundle.version).toBe('1.0')
      expect(bundle.workflow.id).toBe('wf-test')
    } finally { vi.useRealTimers() }
  })

  it('edges are derived correctly from parentId', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const tree = initializeSimTree({ workflowId: 'wf-test', strategy, realityCheck: rc, profile, goals })
      const session = makeSession(tree)
      const bundle = buildSimulationExportBundle({ session, tree })

      // Every node with parentId should produce an edge
      const nodesWithParent = Object.values(tree.nodes).filter((n) => n.parentId)
      expect(bundle.simulationTree.edges.length).toBe(nodesWithParent.length)
    } finally { vi.useRealTimers() }
  })

  it('agent logs are consolidated and sorted chronologically', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      let tree = initializeSimTree({ workflowId: 'wf-test', strategy, realityCheck: rc, profile, goals })
      const monthIds = Object.values(tree.nodes).filter((n) => n.granularity === 'month').map((n) => n.id)

      // Simulate two months with action logs
      for (const mId of monthIds.slice(0, 2)) {
        tree = { ...tree, nodes: { ...tree.nodes, [mId]: simulateNode(tree.nodes[mId]!) } }
      }

      const session = makeSession(tree)
      const bundle = buildSimulationExportBundle({ session, tree })

      expect(bundle.agentLogs.length).toBe(2) // 1 log entry per simulated node
      // Verify sorted
      for (let i = 1; i < bundle.agentLogs.length; i++) {
        expect(bundle.agentLogs[i]!.timestamp >= bundle.agentLogs[i - 1]!.timestamp).toBe(true)
      }
    } finally { vi.useRealTimers() }
  })

  it('timeline is ordered by period start', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const tree = initializeSimTree({ workflowId: 'wf-test', strategy, realityCheck: rc, profile, goals })
      const session = makeSession(tree)
      const bundle = buildSimulationExportBundle({ session, tree })

      for (let i = 1; i < bundle.timeline.length; i++) {
        expect(bundle.timeline[i]!.start >= bundle.timeline[i - 1]!.start).toBe(true)
      }
    } finally { vi.useRealTimers() }
  })

  it('summary has correct aggregate numbers', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      let tree = initializeSimTree({ workflowId: 'wf-test', strategy, realityCheck: rc, profile, goals })
      const monthId = Object.values(tree.nodes).find((n) => n.granularity === 'month')!.id
      tree = { ...tree, nodes: { ...tree.nodes, [monthId]: simulateNode(tree.nodes[monthId]!) } }

      const session = makeSession(tree)
      const bundle = buildSimulationExportBundle({ session, tree })

      expect(bundle.summary.simulatedNodes).toBe(1)
      expect(bundle.summary.averageQuality).toBe(82)
      expect(bundle.summary.completionRatio).toBeGreaterThan(0)
      expect(bundle.summary.completionRatio).toBeLessThanOrEqual(1)
    } finally { vi.useRealTimers() }
  })

  it('summary totals stay consistent with the simulated node data', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      let tree = initializeSimTree({ workflowId: 'wf-test', strategy, realityCheck: rc, profile, goals })
      const monthIds = Object.values(tree.nodes).filter((n) => n.granularity === 'month').map((n) => n.id)

      for (const monthId of monthIds.slice(0, 2)) {
        tree = { ...tree, nodes: { ...tree.nodes, [monthId]: simulateNode(tree.nodes[monthId]!) } }
      }

      const session = makeSession(tree)
      const bundle = buildSimulationExportBundle({ session, tree })
      const simulatedNodes = Object.values(tree.nodes).filter((n) => n.status === 'simulated' || n.status === 'locked')
      const totalPlanned = Object.values(tree.nodes).reduce((sum, node) => sum + node.plannedHours, 0)
      const totalActual = simulatedNodes.reduce((sum, node) => sum + (node.actualHours ?? 0), 0)
      const expectedAverage = Math.round((simulatedNodes.reduce((sum, node) => sum + (node.quality ?? 0), 0) / simulatedNodes.length) * 10) / 10

      expect(bundle.summary.simulatedNodes).toBe(simulatedNodes.length)
      expect(bundle.summary.totalPlannedHours).toBe(Math.round(totalPlanned * 10) / 10)
      expect(bundle.summary.totalActualHours).toBe(Math.round(totalActual * 10) / 10)
      expect(bundle.summary.completionRatio).toBe(Math.round((totalActual / totalPlanned) * 1000) / 1000)
      expect(bundle.summary.averageQuality).toBe(expectedAverage)
    } finally { vi.useRealTimers() }
  })

  it('sanitized profile does NOT include sensitive data', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const tree = initializeSimTree({ workflowId: 'wf-test', strategy, realityCheck: rc, profile, goals })
      const session = makeSession(tree)
      const bundle = buildSimulationExportBundle({ session, tree })

      // Profile should only have aggregate info
      expect(bundle.profile).not.toBeNull()
      const profileKeys = Object.keys(bundle.profile!)
      expect(profileKeys).not.toContain('ubicacion')
      expect(profileKeys).not.toContain('condicionesSalud')
      expect(profileKeys).not.toContain('apiKey')
      expect(profileKeys).toContain('goalsCount')
    } finally { vi.useRealTimers() }
  })

  it('buildTimelineCsv produces valid CSV', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const tree = initializeSimTree({ workflowId: 'wf-test', strategy, realityCheck: rc, profile, goals })
      const session = makeSession(tree)
      const bundle = buildSimulationExportBundle({ session, tree })
      const csv = buildTimelineCsv(bundle.timeline)

      const lines = csv.split('\n')
      expect(lines[0]).toBe('nodeId,label,granularity,start,end,plannedHours,actualHours,quality,disruptionCount,status')
      expect(lines.length).toBeGreaterThan(1) // header + at least 1 data row
    } finally { vi.useRealTimers() }
  })
})
