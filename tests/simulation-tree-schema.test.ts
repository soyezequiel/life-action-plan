import { describe, expect, it } from 'vitest'
import {
  simFindingSchema,
  simNodeSchema,
  simDisruptionSchema,
  simResponseSchema
} from '../src/shared/schemas/simulation-tree'

describe('simulation-tree schemas', () => {
  it('parsea un SimFinding valido', () => {
    const r = simFindingSchema.parse({
      id: 'f-1', severity: 'warning', message: 'Periodo sin cobertura.',
      nodeId: 'month-1', target: 'strategy', suggestedFix: null
    })
    expect(r.severity).toBe('warning')
    expect(r.target).toBe('strategy')
  })

  it('rechaza campo extra (strict)', () => {
    expect(() => simFindingSchema.parse({
      id: 'f-1', severity: 'info', message: 'ok', nodeId: 'month-1', extraField: true
    })).toThrow()
  })

  it('parsea SimNode con defaults', () => {
    const node = simNodeSchema.parse({
      id: 'month-1', parentId: 'year-1', granularity: 'month', label: 'Mes 1',
      period: { start: '2026-01-01', end: '2026-02-01' }, status: 'pending', version: 1,
      plannedHours: 40, actualHours: null, quality: null, disruptions: [], responses: [],
      findings: [], goalBreakdown: {}, childIds: [], incomingAdjustments: [],
      timeSlot: null, simulatedAt: null, simulatedWith: null
    })
    expect(node.granularity).toBe('month')
    expect(node.status).toBe('pending')
  })

  it('rechaza status invalido', () => {
    expect(() => simNodeSchema.parse({
      id: 'x', parentId: null, granularity: 'month', label: 'X',
      period: { start: '2026-01-01', end: '2026-02-01' }, status: 'unknown', version: 1,
      plannedHours: 0, actualHours: null, quality: null, disruptions: [], responses: [],
      findings: [], goalBreakdown: {}, childIds: [], incomingAdjustments: [],
      timeSlot: null, simulatedAt: null, simulatedWith: null
    })).toThrow()
  })

  it('parsea SimDisruption valido', () => {
    const d = simDisruptionSchema.parse({
      id: 'd-1', type: 'energy_drop', description: 'Bajo rendimiento.',
      impactHours: 3, affectedGoalIds: ['g-1']
    })
    expect(d.type).toBe('energy_drop')
  })

  it('parsea SimResponse valido', () => {
    const r = simResponseSchema.parse({
      id: 'r-1', action: 'absorb', description: 'Absorber.', hoursRecovered: 0, tradeoff: null
    })
    expect(r.action).toBe('absorb')
  })
})
