import { describe, expect, it } from 'vitest'
import { worldAgentFallback } from '../src/lib/flow/agents/world-agent'
import { createSimNode, createSimTreeStub } from './simulation-fixtures'

const strategy = {
  title: '',
  summary: '',
  totalMonths: 6,
  estimatedWeeklyHours: 10,
  peakWeeklyHours: 10,
  phases: [{
    id: 'p1',
    title: 'F',
    summary: '',
    startMonth: 1,
    endMonth: 6,
    goalIds: ['g1'],
    hoursPerWeek: 10,
    milestone: '',
    metrics: [],
    isSupportTrack: false,
    dependencies: []
  }],
  conflicts: [],
  milestones: []
}

describe('world-agent fallback', () => {
  it('es determinista para el mismo nodeId', () => {
    const a = worldAgentFallback(createSimNode({ id: 'month-1' }), strategy)
    const b = worldAgentFallback(createSimNode({ id: 'month-1' }), strategy)
    expect(a.disruptions.length).toBe(b.disruptions.length)
    expect(a.difficultyScore).toBe(b.difficultyScore)
  })

  it('impactHours total nunca supera plannedHours', () => {
    for (const id of ['month-1', 'month-2', 'month-7', 'month-99']) {
      const out = worldAgentFallback(createSimNode({ id, plannedHours: 40 }), strategy)
      const total = out.disruptions.reduce((acc, d) => acc + d.impactHours, 0)
      expect(total).toBeLessThanOrEqual(40)
    }
  })

  it('entre 0 y 4 disrupciones', () => {
    for (const id of ['month-1', 'month-3', 'month-5', 'month-10']) {
      const out = worldAgentFallback(createSimNode({ id }), strategy)
      expect(out.disruptions.length).toBeGreaterThanOrEqual(0)
      expect(out.disruptions.length).toBeLessThanOrEqual(4)
    }
  })

  it('environmentSummary no esta vacio', () => {
    expect(worldAgentFallback(createSimNode({ id: 'month-2' }), strategy).environmentSummary.length).toBeGreaterThan(0)
  })

  it('puede convivir con un tree stub canonico', () => {
    const tree = createSimTreeStub()

    expect(tree.nodes[tree.rootNodeId]).toBeDefined()
    expect(worldAgentFallback(tree.nodes[tree.rootNodeId], strategy).disruptions.length).toBeGreaterThanOrEqual(0)
  })
})
