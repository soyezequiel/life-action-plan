import { describe, expect, it } from 'vitest'
import { simExportBundleSchema } from '../src/shared/schemas/simulation-export'

function minimalBundle() {
  return {
    version: '1.0' as const,
    exportedAt: '2026-03-23T18:00:00.000Z',
    workflow: { id: 'wf-1', currentStep: 'simulation', status: 'in_progress' },
    profile: null,
    persona: null,
    goals: [],
    strategy: null,
    realityCheck: null,
    simulationTree: {
      meta: {
        id: 'tree-1',
        version: 1,
        totalSimulations: 0,
        estimatedLlmCostSats: 0,
        createdAt: '2026-03-23T18:00:00.000Z',
        updatedAt: '2026-03-23T18:00:00.000Z'
      },
      globalFindings: [],
      nodes: {},
      edges: []
    },
    agentLogs: [],
    prompts: [],
    timeline: [],
    summary: {
      totalNodes: 0,
      simulatedNodes: 0,
      totalFindings: 0,
      criticalFindings: 0,
      averageQuality: null,
      totalPlannedHours: 0,
      totalActualHours: 0,
      completionRatio: 0,
      llmCallsUsed: 0,
      estimatedCostSats: 0
    }
  }
}

describe('simulation-export-schema', () => {
  it('bundle mínimo parsea correctamente', () => {
    const result = simExportBundleSchema.safeParse(minimalBundle())
    expect(result.success).toBe(true)
  })

  it('bundle completo con nodos y logs parsea', () => {
    const bundle = {
      ...minimalBundle(),
      simulationTree: {
        ...minimalBundle().simulationTree,
        nodes: {
          'plan-1': { id: 'plan-1', granularity: 'plan' },
          'month-1': { id: 'month-1', parentId: 'plan-1', granularity: 'month' }
        },
        edges: [{ source: 'plan-1', target: 'month-1' }]
      },
      agentLogs: [{
        nodeId: 'month-1',
        nodeLabel: 'marzo 2026',
        step: 1,
        phase: 'reason' as const,
        agentRole: 'yo' as const,
        content: 'Analizando disrupciones...',
        toolUsed: null,
        durationMs: 1200,
        timestamp: '2026-03-23T18:00:01.000Z'
      }],
      timeline: [{
        nodeId: 'month-1',
        label: 'marzo 2026',
        granularity: 'month',
        start: '2026-03-01',
        end: '2026-04-01',
        plannedHours: 43.5,
        actualHours: 38.2,
        quality: 82,
        disruptionCount: 2,
        status: 'simulated'
      }],
      summary: {
        ...minimalBundle().summary,
        totalNodes: 2,
        simulatedNodes: 1,
        averageQuality: 82,
        totalPlannedHours: 43.5,
        totalActualHours: 38.2,
        completionRatio: 0.878
      }
    }
    const result = simExportBundleSchema.safeParse(bundle)
    expect(result.success).toBe(true)
  })

  it('.strict() rechaza campos extra en el bundle', () => {
    const bundle = { ...minimalBundle(), extraField: 'bad' }
    const result = simExportBundleSchema.safeParse(bundle)
    expect(result.success).toBe(false)
  })

  it('version solo acepta 1.0', () => {
    const bundle = { ...minimalBundle(), version: '2.0' }
    const result = simExportBundleSchema.safeParse(bundle)
    expect(result.success).toBe(false)
  })

  it('.strict() rechaza campos extra en edges', () => {
    const bundle = {
      ...minimalBundle(),
      simulationTree: {
        ...minimalBundle().simulationTree,
        edges: [{ source: 'a', target: 'b', extra: true }]
      }
    }
    const result = simExportBundleSchema.safeParse(bundle)
    expect(result.success).toBe(false)
  })

  it('.strict() rechaza campos extra en summary', () => {
    const bundle = {
      ...minimalBundle(),
      summary: { ...minimalBundle().summary, extraStat: 42 }
    }
    const result = simExportBundleSchema.safeParse(bundle)
    expect(result.success).toBe(false)
  })
})
