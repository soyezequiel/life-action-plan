import { describe, expect, it, vi } from 'vitest'

vi.mock('../app/api/_db', () => ({
  getPlanBySlug: vi.fn()
}))

import { buildPlanManifest, createSimulationManifest } from '../app/api/_plan'
import type { OperationChargeSummary, PlanSimulationSnapshot } from '../src/shared/types/lap-api'

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

const skippedUserUsage = {
  mode: 'user-cloud',
  resourceOwner: 'user',
  executionTarget: 'cloud',
  credentialSource: 'user-supplied',
  chargePolicy: 'skip',
  chargeReason: 'user_resource',
  chargeable: false,
  estimatedCostSats: 5,
  billingReasonCode: 'user_resource',
  billingReasonDetail: 'RESOURCE_OWNER_USER',
  canExecute: true,
  blockReasonCode: null,
  blockReasonDetail: null,
  providerId: 'openrouter',
  modelId: 'openrouter:openai/gpt-4o-mini'
} as const

function makeCharge(overrides: Partial<OperationChargeSummary> = {}): OperationChargeSummary {
  return {
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
    resourceUsage: backendCloudUsage,
    ...overrides
  }
}

function makeSimulation(overrides: Partial<PlanSimulationSnapshot> = {}): PlanSimulationSnapshot {
  return {
    ranAt: '2026-03-21T00:00:00.000Z',
    mode: 'interactive',
    periodLabel: 'Semana actual',
    summary: {
      overallStatus: 'PASS',
      pass: 3,
      warn: 0,
      fail: 0,
      missing: 0
    },
    findings: [],
    ...overrides
  }
}

describe('plan manifest traceability', () => {
  it('guarda resourceUsage dentro de ultimoCobro en el manifest del build', () => {
    const manifest = JSON.parse(buildPlanManifest({
      nombre: 'Plan trazable',
      fallbackUsed: false,
      modelId: 'openai:gpt-4o-mini',
      tokensInput: 1200,
      tokensOutput: 800,
      costUsd: 0.001,
      costSats: 1,
      charge: makeCharge()
    })) as Record<string, unknown>

    expect(manifest.ultimoCobro).toEqual(expect.objectContaining({
      chargeId: 'charge-1',
      resourceUsage: backendCloudUsage
    }))
  })

  it('preserva la traza anterior si simulate no recibe un charge nuevo', () => {
    const manifest = buildPlanManifest({
      nombre: 'Plan trazable',
      fallbackUsed: false,
      modelId: 'openai:gpt-4o-mini',
      tokensInput: 1200,
      tokensOutput: 800,
      costUsd: 0.001,
      costSats: 1,
      charge: makeCharge()
    })

    const updatedManifest = JSON.parse(createSimulationManifest(
      manifest,
      makeSimulation(),
      'America/Argentina/Buenos_Aires'
    )) as Record<string, unknown>

    expect(updatedManifest.ultimoCobro).toEqual(expect.objectContaining({
      chargeId: 'charge-1',
      resourceUsage: backendCloudUsage
    }))
  })

  it('reemplaza ultimoCobro con la traza nueva cuando simulate recibe otro charge', () => {
    const manifest = buildPlanManifest({
      nombre: 'Plan trazable',
      fallbackUsed: false,
      modelId: 'openai:gpt-4o-mini',
      tokensInput: 1200,
      tokensOutput: 800,
      costUsd: 0.001,
      costSats: 1,
      charge: makeCharge()
    })

    const updatedManifest = JSON.parse(createSimulationManifest(
      manifest,
      makeSimulation(),
      'America/Argentina/Buenos_Aires',
      makeCharge({
        chargeId: 'charge-2',
        status: 'skipped',
        chargedSats: 0,
        reasonCode: 'user_resource',
        reasonDetail: 'RESOURCE_OWNER_USER',
        resourceUsage: skippedUserUsage
      })
    )) as Record<string, unknown>

    expect(updatedManifest.ultimoCobro).toEqual(expect.objectContaining({
      chargeId: 'charge-2',
      resourceUsage: skippedUserUsage
    }))
  })
})
