import { describe, expect, it } from 'vitest'
import { worldAgentFallback } from '../src/lib/flow/agents/world-agent'
import type { SimNode } from '../src/shared/schemas/simulation-tree'

function n(id: string, h = 40): SimNode {
  return {
    id, parentId: 'y1', granularity: 'month', label: id,
    period: { start: '2026-01-01', end: '2026-02-01' },
    status: 'pending', version: 1, plannedHours: h, actualHours: null, quality: null,
    disruptions: [], responses: [], findings: [], goalBreakdown: {}, childIds: [],
    incomingAdjustments: [], timeSlot: null, simulatedAt: null, simulatedWith: null,
    actionLog: []
  }
}
const s: any = {
  title: '', summary: '', totalMonths: 6, estimatedWeeklyHours: 10, peakWeeklyHours: 10,
  phases: [{ id: 'p1', title: 'F', summary: '', startMonth: 1, endMonth: 6, goalIds: ['g1'], hoursPerWeek: 10, milestone: '', metrics: [], isSupportTrack: false, dependencies: [] }],
  conflicts: [], milestones: []
}

describe('world-agent fallback', () => {
  it('es determinista para el mismo nodeId', () => {
    const a = worldAgentFallback(n('month-1'), s)
    const b = worldAgentFallback(n('month-1'), s)
    expect(a.disruptions.length).toBe(b.disruptions.length)
    expect(a.difficultyScore).toBe(b.difficultyScore)
  })

  it('impactHours total nunca supera plannedHours', () => {
    for (const id of ['month-1', 'month-2', 'month-7', 'month-99']) {
      const out = worldAgentFallback(n(id, 40), s)
      const total = out.disruptions.reduce((acc, d) => acc + d.impactHours, 0)
      expect(total).toBeLessThanOrEqual(40)
    }
  })

  it('entre 0 y 4 disrupciones', () => {
    for (const id of ['month-1', 'month-3', 'month-5', 'month-10']) {
      const out = worldAgentFallback(n(id), s)
      expect(out.disruptions.length).toBeGreaterThanOrEqual(0)
      expect(out.disruptions.length).toBeLessThanOrEqual(4)
    }
  })

  it('environmentSummary no esta vacio', () => {
    expect(worldAgentFallback(n('month-2'), s).environmentSummary.length).toBeGreaterThan(0)
  })
})
