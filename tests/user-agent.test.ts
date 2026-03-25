import { describe, expect, it } from 'vitest'
import { userAgentFallback } from '../src/lib/flow/agents/user-agent'
import type { SimNode, SimDisruption } from '../src/shared/schemas/simulation-tree'

function n(h = 40): SimNode {
  return {
    id: 'month-1', parentId: 'y1', granularity: 'month', label: 'Mes 1',
    period: { start: '2026-01-01', end: '2026-02-01' },
    status: 'pending', version: 1, plannedHours: h, actualHours: null, quality: null,
    disruptions: [], responses: [], findings: [],
    goalBreakdown: { 'g1': { plannedHours: 20, requiredHours: 30, actualHours: null, status: 'on_track' } },
    childIds: [], incomingAdjustments: [], timeSlot: null, simulatedAt: null, simulatedWith: null,
    actionLog: []
  }
}
function dis(h: number): SimDisruption {
  return { id: 'd1', type: 'energy_drop', description: 'Test', impactHours: h, affectedGoalIds: [] }
}

describe('user-agent fallback', () => {
  it('actualHours <= plannedHours', () => {
    expect(userAgentFallback(n(40), [dis(5)]).actualHours).toBeLessThanOrEqual(40)
  })

  it('disrupcion masiva → actualHours = 0', () => {
    expect(userAgentFallback(n(40), [dis(100)]).actualHours).toBe(0)
  })

  it('sin disrupciones → actualHours = plannedHours y calidad = 100', () => {
    const r = userAgentFallback(n(40), [])
    expect(r.actualHours).toBe(40)
    expect(r.qualityScore).toBe(100)
  })

  it('goalBreakdown refleja impacto proporcional', () => {
    const r = userAgentFallback(n(40), [dis(20)])
    expect(r.goalBreakdown['g1']?.actualHours).toBeCloseTo(10, 0)
  })

  it('status behind si actualHours < requiredHours', () => {
    expect(userAgentFallback(n(40), [dis(20)]).goalBreakdown['g1']?.status).toBe('behind')
  })
})
