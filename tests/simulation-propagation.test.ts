import { describe, expect, it } from 'vitest'
import { propagateUp, propagateDown, propagateLateral, applyCorrections } from '../src/lib/flow/simulation-propagation'
import type { SimTree, SimNode } from '../src/shared/schemas/simulation-tree'

function node(id: string, o: Partial<SimNode> = {}): SimNode {
  return {
    id, parentId: null, granularity: 'month', label: id,
    period: { start: '2026-01-01', end: '2026-02-01' },
    status: 'pending', version: 1, plannedHours: 40, actualHours: null, quality: null,
    disruptions: [], responses: [], findings: [], goalBreakdown: {}, childIds: [],
    incomingAdjustments: [], timeSlot: null, simulatedAt: null, simulatedWith: null,
    actionLog: [],
    ...o
  }
}
function tree(nodes: SimNode[], rootId: string): SimTree {
  const m: Record<string, SimNode> = {}
  for (const n of nodes) m[n.id] = n
  return {
    id: 't', workflowId: 'w', rootNodeId: rootId, nodes: m,
    globalFindings: [], totalSimulations: 0, estimatedLlmCostSats: 0,
    version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    persona: null
  }
}
const s: any = { title: '', summary: '', totalMonths: 6, estimatedWeeklyHours: 10, phases: [], conflicts: [], milestones: [] }

describe('simulation-propagation', () => {
  it('propagateUp marca padre como affected si delta >10%', () => {
    const parent = node('p', { granularity: 'year', childIds: ['c'], plannedHours: 100, actualHours: 100, status: 'simulated' })
    const child = node('c', { parentId: 'p', status: 'simulated', plannedHours: 40, actualHours: 20 })
    const r = propagateUp(tree([parent, child], 'p'), 'c')
    expect(r.updatedTree.nodes['p']?.status).toBe('affected')
  })

  it('propagateDown marca hijos simulated como stale, pending intacto', () => {
    const parent = node('p', { granularity: 'year', childIds: ['c1', 'c2'], status: 'simulated' })
    const c1 = node('c1', { parentId: 'p', status: 'simulated' })
    const c2 = node('c2', { parentId: 'p', status: 'pending' })
    const r = propagateDown(tree([parent, c1, c2], 'p'), 'p')
    expect(r.updatedTree.nodes['c1']?.status).toBe('stale')
    expect(r.updatedTree.nodes['c2']?.status).toBe('pending')
  })

  it('propagateLateral no toca nodos locked', () => {
    const parent = node('p', { granularity: 'year', childIds: ['s1', 's2', 's3'] })
    const s1 = node('s1', { parentId: 'p', status: 'simulated' })
    const s2 = node('s2', { parentId: 'p', status: 'locked' })
    const s3 = node('s3', { parentId: 'p', status: 'pending' })
    const r = propagateLateral(tree([parent, s1, s2, s3], 'p'), 's1')
    expect(r.updatedTree.nodes['s2']?.status).toBe('locked')
  })

  it('applyCorrections target:strategy genera patch sin cambiar arbol', () => {
    const n = node('m1', { status: 'simulated', findings: [{ id: 'f1', severity: 'warning', message: 'X', nodeId: 'm1', target: 'strategy', suggestedFix: null }] })
    const r = applyCorrections(tree([n], 'm1'), [{ findingId: 'f1', action: 'apply' }], s)
    expect(r.strategyPatches.length).toBe(1)
    expect(r.tree.nodes['m1']?.status).toBe('simulated')
  })

  it('applyCorrections target:tree marca nodo stale', () => {
    const n = node('m1', { status: 'simulated', findings: [{ id: 'f2', severity: 'warning', message: 'Y', nodeId: 'm1', target: 'tree', suggestedFix: null }] })
    const r = applyCorrections(tree([n], 'm1'), [{ findingId: 'f2', action: 'apply' }], s)
    expect(r.tree.nodes['m1']?.status).toBe('stale')
  })

  it('applyCorrections action:dismiss no toca nada', () => {
    const n = node('m1', { status: 'simulated' })
    const r = applyCorrections(tree([n], 'm1'), [{ findingId: 'f-x', action: 'dismiss' }], s)
    expect(r.strategyPatches.length).toBe(0)
    expect(r.tree.nodes['m1']?.status).toBe('simulated')
  })
})
