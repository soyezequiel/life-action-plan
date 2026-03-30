import { beforeEach, describe, expect, it, vi } from 'vitest'

const values = vi.fn(() => ({}))
const insert = vi.fn(() => ({ values }))
const where = vi.fn()
const from = vi.fn(() => ({ where }))
const select = vi.fn(() => ({ from }))

vi.mock('../src/lib/db/connection', () => ({
  getDatabase: () => ({
    select,
    insert
  })
}))

import { estimateCostSats, getCostSummary, trackCost } from '../src/lib/db/db-helpers'

const backendCloudUsage = {
  mode: 'backend-cloud',
  resourceOwner: 'backend',
  executionTarget: 'cloud',
  credentialSource: 'backend-stored',
  chargePolicy: 'charge',
  chargeReason: 'backend_resource',
  chargeable: true,
  estimatedCostSats: 5,
  billingReasonCode: null,
  billingReasonDetail: null,
  canExecute: true,
  blockReasonCode: null,
  blockReasonDetail: null,
  providerId: 'openai',
  modelId: 'openai:gpt-4o-mini'
} as const

describe('getCostSummary', () => {
  beforeEach(() => {
    values.mockClear()
    insert.mockClear()
    where.mockReset()
    from.mockClear()
    select.mockClear()
  })

  it('resume tokens y costo acumulado por plan', async () => {
    where
      .mockResolvedValueOnce([
        { operation: 'plan_build', tokensInput: 1200, tokensOutput: 800, costUsd: 0.001 },
        { operation: 'plan_simulate', tokensInput: 300, tokensOutput: 200, costUsd: 0.0005 }
      ])
      .mockResolvedValueOnce([
        {
          id: 'charge-1',
          operation: 'plan_build',
          status: 'paid',
          estimatedCostUsd: 0.005,
          estimatedCostSats: 5,
          finalCostUsd: 0.001,
          finalCostSats: 1,
          chargedSats: 5,
          reasonCode: null,
          reasonDetail: null,
          paymentProvider: 'nwc',
          updatedAt: '2026-03-20T10:00:00.000Z',
          metadata: {
            resourceUsage: backendCloudUsage
          }
        }
      ])

    await expect(getCostSummary('plan-1')).resolves.toEqual({
      planId: 'plan-1',
      tokensInput: 1500,
      tokensOutput: 1000,
      costUsd: 0.0015,
      costSats: 2,
      chargedSats: 5,
      operations: [
        {
          operation: 'plan_build',
          count: 1,
          costUsd: 0.001,
          costSats: 1,
          estimatedChargeSats: 5,
          chargedSats: 5,
          latestChargeStatus: 'paid',
          latestChargeReasonCode: null
        },
        {
          operation: 'plan_simulate',
          count: 1,
          costUsd: 0.0005,
          costSats: 1,
          estimatedChargeSats: 0,
          chargedSats: 0,
          latestChargeStatus: null,
          latestChargeReasonCode: null
        }
      ],
      latestCharge: {
        chargeId: 'charge-1',
        status: 'paid',
        estimatedCostUsd: 0.005,
        estimatedCostSats: 5,
        finalCostUsd: 0.001,
        finalCostSats: 1,
        chargedSats: 5,
        reasonCode: null,
        reasonDetail: null,
        paymentProvider: 'nwc',
        resourceUsage: backendCloudUsage
      }
    })
  })

  it('devuelve cero si no hay costos trackeados', async () => {
    where
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    await expect(getCostSummary('plan-2')).resolves.toEqual({
      planId: 'plan-2',
      tokensInput: 0,
      tokensOutput: 0,
      costUsd: 0,
      costSats: 0,
      chargedSats: 0,
      operations: [],
      latestCharge: null
    })
  })

  it('trackea costo cero para modelos gratuitos y conserva el insert', async () => {
    const result = await trackCost('plan-3', 'plan_build', 'openai:gpt-4o-mini', 4000, 1200, 'charge-1')

    expect(result).toEqual({ costUsd: 0, costSats: 0 })
    expect(insert).toHaveBeenCalled()
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      chargeId: 'charge-1',
      planId: 'plan-3',
      model: 'openai:gpt-4o-mini',
      tokensInput: 4000,
      tokensOutput: 1200,
      costUsd: 0
    }))
  })

  it('trackea costo estimado para el modelo default de OpenRouter', async () => {
    const result = await trackCost('plan-4', 'plan_build', 'openrouter:openai/gpt-4o-mini', 4000, 1200, 'charge-2')

    expect(result.costUsd).toBeGreaterThan(0)
    expect(result.costSats).toBeGreaterThan(0)
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      chargeId: 'charge-2',
      planId: 'plan-4',
      model: 'openrouter:openai/gpt-4o-mini',
      tokensInput: 4000,
      tokensOutput: 1200
    }))
  })

  it('redondea costos fraccionales hacia arriba al convertir a sats', () => {
    expect(estimateCostSats(0.0001)).toBe(1)
  })
})
