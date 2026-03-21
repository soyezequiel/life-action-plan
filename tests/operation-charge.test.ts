import { beforeEach, describe, expect, it, vi } from 'vitest'

const insertValues = vi.fn(async () => ({}))
const insert = vi.fn(() => ({ values: insertValues }))
const selectWhere = vi.fn()
const selectFrom = vi.fn(() => ({ where: selectWhere }))
const select = vi.fn(() => ({ from: selectFrom }))
const updateWhere = vi.fn(async () => ({}))
const updateSet = vi.fn(() => ({ where: updateWhere }))
const update = vi.fn(() => ({ set: updateSet }))

vi.mock('../src/lib/db/connection', () => ({
  getDatabase: () => ({
    insert,
    select,
    update
  })
}))

import {
  createOperationCharge,
  getOperationCharge,
  listOperationChargesByPlan,
  updateOperationCharge
} from '../src/lib/db/db-helpers'

describe('operation charge helpers', () => {
  beforeEach(() => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('charge-1')
    insertValues.mockClear()
    insert.mockClear()
    selectWhere.mockReset()
    selectFrom.mockClear()
    select.mockClear()
    updateWhere.mockClear()
    updateSet.mockClear()
    update.mockClear()
  })

  it('crea un cobro pendiente con montos estimados y metadata serializada', async () => {
    const result = await createOperationCharge({
      profileId: 'profile-1',
      operation: 'plan_build',
      model: 'openai:gpt-4o-mini',
      estimatedCostUsd: 0.001,
      estimatedCostSats: 2,
      metadata: {
        source: 'test'
      }
    })

    expect(insert).toHaveBeenCalled()
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      id: 'charge-1',
      profileId: 'profile-1',
      operation: 'plan_build',
      model: 'openai:gpt-4o-mini',
      status: 'pending',
      estimatedCostUsd: 0.001,
      estimatedCostSats: 2,
      finalCostUsd: 0,
      finalCostSats: 0,
      chargedSats: 0,
      metadata: {
        source: 'test'
      },
      resolvedAt: null
    }))
    expect(result).toEqual(expect.objectContaining({
      id: 'charge-1',
      profileId: 'profile-1',
      planId: null,
      operation: 'plan_build',
      model: 'openai:gpt-4o-mini',
      paymentProvider: null,
      status: 'pending',
      estimatedCostUsd: 0.001,
      estimatedCostSats: 2,
      finalCostUsd: 0,
      finalCostSats: 0,
      chargedSats: 0,
      metadata: JSON.stringify({ source: 'test' }),
      resolvedAt: null
    }))
  })

  it('actualiza un cobro resuelto y conserva referencias Lightning', async () => {
    selectWhere.mockResolvedValueOnce([
      {
        id: 'charge-1',
        profileId: 'profile-1',
        planId: 'plan-1',
        operation: 'plan_build',
        model: 'openai:gpt-4o-mini',
        paymentProvider: 'nwc',
        status: 'paid',
        estimatedCostUsd: 0.001,
        estimatedCostSats: 2,
        finalCostUsd: 0.0012,
        finalCostSats: 2,
        chargedSats: 2,
        reasonCode: null,
        reasonDetail: null,
        lightningInvoice: 'lnbc1...',
        lightningPaymentHash: 'hash-1',
        lightningPreimage: 'preimage-1',
        providerReference: 'hash-1',
        metadata: {
          chargePath: 'nwc'
        },
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T10:01:00.000Z',
        resolvedAt: '2026-03-20T10:01:00.000Z'
      }
    ])

    const result = await updateOperationCharge('charge-1', {
      planId: 'plan-1',
      paymentProvider: 'nwc',
      status: 'paid',
      finalCostUsd: 0.0012,
      finalCostSats: 2,
      chargedSats: 2,
      lightningInvoice: 'lnbc1...',
      lightningPaymentHash: 'hash-1',
      lightningPreimage: 'preimage-1',
      providerReference: 'hash-1',
      metadata: {
        chargePath: 'nwc'
      }
    })

    expect(update).toHaveBeenCalled()
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      planId: 'plan-1',
      paymentProvider: 'nwc',
      status: 'paid',
      finalCostUsd: 0.0012,
      finalCostSats: 2,
      chargedSats: 2,
      lightningInvoice: 'lnbc1...',
      lightningPaymentHash: 'hash-1',
      lightningPreimage: 'preimage-1',
      providerReference: 'hash-1',
      metadata: {
        chargePath: 'nwc'
      },
      resolvedAt: expect.any(String)
    }))
    expect(result).toEqual(expect.objectContaining({
      id: 'charge-1',
      planId: 'plan-1',
      status: 'paid',
      chargedSats: 2,
      lightningPaymentHash: 'hash-1',
      providerReference: 'hash-1',
      metadata: JSON.stringify({ chargePath: 'nwc' }),
      resolvedAt: '2026-03-20T10:01:00.000Z'
    }))
  })

  it('lista cobros por plan con estados y razones normalizadas', async () => {
    selectWhere.mockResolvedValueOnce([
      {
        id: 'charge-1',
        profileId: 'profile-1',
        planId: 'plan-1',
        operation: 'plan_build',
        model: 'openai:gpt-4o-mini',
        paymentProvider: 'nwc',
        status: 'rejected',
        estimatedCostUsd: 0.001,
        estimatedCostSats: 2,
        finalCostUsd: 0,
        finalCostSats: 0,
        chargedSats: 0,
        reasonCode: 'insufficient_budget',
        reasonDetail: 'No alcanza el presupuesto actual',
        lightningInvoice: null,
        lightningPaymentHash: null,
        lightningPreimage: null,
        providerReference: null,
        metadata: null,
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T10:00:30.000Z',
        resolvedAt: '2026-03-20T10:00:30.000Z'
      },
      {
        id: 'charge-2',
        profileId: 'profile-1',
        planId: 'plan-1',
        operation: 'plan_simulate',
        model: 'ollama:qwen3:8b',
        paymentProvider: null,
        status: 'skipped',
        estimatedCostUsd: 0,
        estimatedCostSats: 0,
        finalCostUsd: 0,
        finalCostSats: 0,
        chargedSats: 0,
        reasonCode: 'free_local_operation',
        reasonDetail: 'Operacion resuelta localmente',
        lightningInvoice: null,
        lightningPaymentHash: null,
        lightningPreimage: null,
        providerReference: null,
        metadata: null,
        createdAt: '2026-03-20T10:02:00.000Z',
        updatedAt: '2026-03-20T10:02:05.000Z',
        resolvedAt: '2026-03-20T10:02:05.000Z'
      }
    ])

    await expect(listOperationChargesByPlan('plan-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'charge-1',
        operation: 'plan_build',
        status: 'rejected',
        reasonCode: 'insufficient_budget',
        reasonDetail: 'No alcanza el presupuesto actual'
      }),
      expect.objectContaining({
        id: 'charge-2',
        operation: 'plan_simulate',
        status: 'skipped',
        reasonCode: 'free_local_operation',
        reasonDetail: 'Operacion resuelta localmente'
      })
    ])
  })

  it('devuelve un cobro puntual por id cuando existe', async () => {
    selectWhere.mockResolvedValueOnce([
      {
        id: 'charge-1',
        profileId: 'profile-1',
        planId: null,
        operation: 'plan_build',
        model: 'openai:gpt-4o-mini',
        paymentProvider: null,
        status: 'pending',
        estimatedCostUsd: 0.001,
        estimatedCostSats: 2,
        finalCostUsd: 0,
        finalCostSats: 0,
        chargedSats: 0,
        reasonCode: null,
        reasonDetail: null,
        lightningInvoice: null,
        lightningPaymentHash: null,
        lightningPreimage: null,
        providerReference: null,
        metadata: null,
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T10:00:00.000Z',
        resolvedAt: null
      }
    ])

    await expect(getOperationCharge('charge-1')).resolves.toEqual(expect.objectContaining({
      id: 'charge-1',
      status: 'pending'
    }))
  })
})
