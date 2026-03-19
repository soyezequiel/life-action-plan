import { beforeEach, describe, expect, it, vi } from 'vitest'

const all = vi.fn()
const run = vi.fn()
const values = vi.fn(() => ({ run }))
const insert = vi.fn(() => ({ values }))
const where = vi.fn(() => ({ all }))
const from = vi.fn(() => ({ where }))
const select = vi.fn(() => ({ from }))

vi.mock('../src/main/db/connection', () => ({
  getDatabase: () => ({
    select,
    insert
  })
}))

import { estimateCostSats, getCostSummary, trackCost } from '../src/main/db/db-helpers'

describe('getCostSummary', () => {
  beforeEach(() => {
    all.mockReset()
    run.mockReset()
    values.mockClear()
    insert.mockClear()
    where.mockClear()
    from.mockClear()
    select.mockClear()
  })

  it('resume tokens y costo acumulado por plan', () => {
    all.mockReturnValue([
      { tokensInput: 1200, tokensOutput: 800, costUsd: 0.001 },
      { tokensInput: 300, tokensOutput: 200, costUsd: 0.0005 }
    ])

    expect(getCostSummary('plan-1')).toEqual({
      planId: 'plan-1',
      tokensInput: 1500,
      tokensOutput: 1000,
      costUsd: 0.0015,
      costSats: 2
    })
  })

  it('devuelve cero si no hay costos trackeados', () => {
    all.mockReturnValue([])

    expect(getCostSummary('plan-2')).toEqual({
      planId: 'plan-2',
      tokensInput: 0,
      tokensOutput: 0,
      costUsd: 0,
      costSats: 0
    })
  })

  it('trackea costo cero para modelos locales y conserva el insert', () => {
    const result = trackCost('plan-3', 'plan_build', 'ollama:qwen3:8b', 4000, 1200)

    expect(result).toEqual({ costUsd: 0, costSats: 0 })
    expect(insert).toHaveBeenCalled()
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      planId: 'plan-3',
      model: 'ollama:qwen3:8b',
      tokensInput: 4000,
      tokensOutput: 1200,
      costUsd: 0
    }))
  })

  it('redondea costos fraccionales hacia arriba al convertir a sats', () => {
    expect(estimateCostSats(0.0001)).toBe(1)
  })
})
