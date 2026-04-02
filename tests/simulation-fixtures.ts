import type { SimDisruption, SimNode, SimTree } from '../src/shared/schemas/simulation-tree'

export function createSimNode(input: {
  id: string
  plannedHours?: number
  parentId?: string | null
  granularity?: SimNode['granularity']
  label?: string
  status?: SimNode['status']
}): SimNode {
  const plannedHours = input.plannedHours ?? 40

  return {
    id: input.id,
    parentId: input.parentId ?? 'y1',
    granularity: input.granularity ?? 'month',
    label: input.label ?? input.id,
    period: {
      start: '2026-01-01',
      end: '2026-02-01'
    },
    status: input.status ?? 'pending',
    version: 1,
    plannedHours,
    actualHours: null,
    quality: null,
    disruptions: [],
    responses: [],
    findings: [],
    goalBreakdown: {
      g1: {
        plannedHours: 20,
        requiredHours: 30,
        actualHours: null,
        status: 'on_track'
      }
    },
    childIds: [],
    incomingAdjustments: [],
    timeSlot: null,
    simulatedAt: null,
    simulatedWith: null,
    actionLog: []
  }
}

export function createSimDisruption(impactHours: number): SimDisruption {
  return {
    id: 'd1',
    type: 'energy_drop',
    description: 'Test',
    impactHours,
    affectedGoalIds: []
  }
}

export function createSimTreeStub(): Omit<SimTree, 'nodes' | 'globalFindings'> & {
  nodes: Record<string, SimNode>
  globalFindings: []
} {
  const rootNode = createSimNode({ id: 'month-1' })

  return {
    id: 'tree-1',
    workflowId: 'workflow-1',
    rootNodeId: rootNode.id,
    nodes: {
      [rootNode.id]: rootNode
    },
    globalFindings: [],
    totalSimulations: 0,
    estimatedLlmCostSats: 0,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    persona: null
  }
}
