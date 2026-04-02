import { describe, expect, it } from 'vitest'
import { userAgentFallback } from '../src/lib/flow/agents/user-agent'
import { createSimDisruption, createSimNode } from './simulation-fixtures'

describe('user-agent fallback', () => {
  it('actualHours <= plannedHours', () => {
    expect(userAgentFallback(createSimNode({ id: 'month-1', plannedHours: 40 }), [createSimDisruption(5)]).actualHours).toBeLessThanOrEqual(40)
  })

  it('disrupcion masiva -> actualHours = 0', () => {
    expect(userAgentFallback(createSimNode({ id: 'month-1', plannedHours: 40 }), [createSimDisruption(100)]).actualHours).toBe(0)
  })

  it('sin disrupciones -> actualHours = plannedHours y calidad = 100', () => {
    const r = userAgentFallback(createSimNode({ id: 'month-1', plannedHours: 40 }), [])
    expect(r.actualHours).toBe(40)
    expect(r.qualityScore).toBe(100)
  })

  it('goalBreakdown refleja impacto proporcional', () => {
    const r = userAgentFallback(createSimNode({ id: 'month-1', plannedHours: 40 }), [createSimDisruption(20)])
    expect(r.goalBreakdown['g1']?.actualHours).toBeCloseTo(10, 0)
  })

  it('status behind si actualHours < requiredHours', () => {
    expect(userAgentFallback(createSimNode({ id: 'month-1', plannedHours: 40 }), [createSimDisruption(20)]).goalBreakdown['g1']?.status).toBe('behind')
  })
})
