import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  decryptApiKeyMock: vi.fn(() => ''),
  canUseLocalOllamaMock: vi.fn(() => true),
  getDeploymentModeMock: vi.fn(() => 'local'),
  canChargeOperationMock: vi.fn(),
  chargeOperationMock: vi.fn(),
  createInstrumentedRuntimeMock: vi.fn(() => ({})),
  buildWithOllamaFallbackMock: vi.fn(),
  generatePlanMock: vi.fn(),
  getProviderMock: vi.fn(() => ({})),
  quoteOperationChargeMock: vi.fn(),
  recordChargeResultMock: vi.fn(),
  summarizeOperationChargeMock: vi.fn(),
  startTraceMock: vi.fn(() => 'trace-1'),
  completeTraceMock: vi.fn(),
  failTraceMock: vi.fn(),
  createOperationChargeMock: vi.fn(),
  createPlanMock: vi.fn(),
  estimateCostSatsMock: vi.fn(),
  estimateCostUsdMock: vi.fn(),
  seedProgressFromEventsMock: vi.fn(),
  trackCostMock: vi.fn(),
  trackEventMock: vi.fn(),
  getProfileMock: vi.fn(),
  getUserSettingMock: vi.fn(),
  buildPlanManifestMock: vi.fn(() => '{"manifest":true}'),
  createUniquePlanSlugMock: vi.fn(() => 'plan-de-prueba'),
  getProfileTimezoneMock: vi.fn(() => 'America/Argentina/Buenos_Aires'),
  parseStoredProfileMock: vi.fn(() => ({
    participantes: [{ datosPersonales: { ubicacion: { zonaHoraria: 'America/Argentina/Buenos_Aires' } } }]
  })),
  toChargeErrorMessageMock: vi.fn(() => 'Cobro bloqueado'),
  toPlanBuildErrorMessageMock: vi.fn(() => 'Build error')
}))

vi.mock('../src/lib/auth/api-key-auth', () => ({
  decryptApiKey: mocks.decryptApiKeyMock
}))

vi.mock('../src/lib/env/deployment', () => ({
  canUseLocalOllama: mocks.canUseLocalOllamaMock,
  getDeploymentMode: mocks.getDeploymentModeMock
}))

vi.mock('../app/api/_domain', () => ({
  canChargeOperation: mocks.canChargeOperationMock,
  chargeOperation: mocks.chargeOperationMock,
  createInstrumentedRuntime: mocks.createInstrumentedRuntimeMock,
  buildWithOllamaFallback: mocks.buildWithOllamaFallbackMock,
  generatePlan: mocks.generatePlanMock,
  getProvider: mocks.getProviderMock,
  quoteOperationCharge: mocks.quoteOperationChargeMock,
  recordChargeResult: mocks.recordChargeResultMock,
  summarizeOperationCharge: mocks.summarizeOperationChargeMock,
  traceCollector: {
    startTrace: mocks.startTraceMock,
    completeTrace: mocks.completeTraceMock,
    failTrace: mocks.failTraceMock
  }
}))

vi.mock('../app/api/_db', () => ({
  createOperationCharge: mocks.createOperationChargeMock,
  createPlan: mocks.createPlanMock,
  estimateCostSats: mocks.estimateCostSatsMock,
  estimateCostUsd: mocks.estimateCostUsdMock,
  seedProgressFromEvents: mocks.seedProgressFromEventsMock,
  trackCost: mocks.trackCostMock,
  trackEvent: mocks.trackEventMock,
  getProfile: mocks.getProfileMock,
  getUserSetting: mocks.getUserSettingMock
}))

vi.mock('../app/api/_plan', () => ({
  buildPlanManifest: mocks.buildPlanManifestMock,
  createUniquePlanSlug: mocks.createUniquePlanSlugMock,
  getProfileTimezone: mocks.getProfileTimezoneMock,
  parseStoredProfile: mocks.parseStoredProfileMock,
  toChargeErrorMessage: mocks.toChargeErrorMessageMock,
  toPlanBuildErrorMessage: mocks.toPlanBuildErrorMessageMock
}))

import { POST } from '../app/api/plan/build/route'

function buildRequestBody(overrides?: Record<string, unknown>): string {
  return JSON.stringify({
    profileId: '11111111-1111-4111-8111-111111111111',
    apiKey: '',
    provider: 'openai:gpt-4o-mini',
    ...overrides
  })
}

function extractResultPayload(streamText: string): Record<string, unknown> {
  const lines = streamText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.startsWith('data:'))
    .map((line) => JSON.parse(line.slice(5).trim()) as Record<string, unknown>)

  const resultPayload = [...lines].reverse().find((line: Record<string, unknown>) => line.type === 'result')

  if (!resultPayload || typeof resultPayload.result !== 'object' || !resultPayload.result) {
    throw new Error('Missing result payload')
  }

  return resultPayload.result as Record<string, unknown>
}

describe('plan build charge route', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => {
      if (typeof mock === 'function' && 'mockReset' in mock) {
        mock.mockReset()
      }
    })

    mocks.canUseLocalOllamaMock.mockReturnValue(true)
    mocks.getDeploymentModeMock.mockReturnValue('local')
    mocks.getProfileMock.mockResolvedValue({
      id: 'profile-1',
      data: '{"profile":true}'
    })
    mocks.getUserSettingMock.mockResolvedValue(undefined)
    mocks.buildPlanManifestMock.mockReturnValue('{"manifest":true}')
    mocks.createUniquePlanSlugMock.mockResolvedValue('plan-de-prueba')
    mocks.getProfileTimezoneMock.mockReturnValue('America/Argentina/Buenos_Aires')
    mocks.parseStoredProfileMock.mockReturnValue({
      participantes: [{ datosPersonales: { ubicacion: { zonaHoraria: 'America/Argentina/Buenos_Aires' } } }]
    })
    mocks.toChargeErrorMessageMock.mockReturnValue('Cobro bloqueado')
    mocks.toPlanBuildErrorMessageMock.mockReturnValue('Build error')
    mocks.quoteOperationChargeMock.mockReturnValue({
      operation: 'plan_build',
      model: 'openai:gpt-4o-mini',
      estimatedCostUsd: 0.005,
      estimatedCostSats: 5,
      chargeable: true,
      reasonCode: null
    })
    mocks.summarizeOperationChargeMock.mockImplementation((charge) => ({
      chargeId: charge.id,
      status: charge.status,
      estimatedCostUsd: charge.estimatedCostUsd,
      estimatedCostSats: charge.estimatedCostSats,
      finalCostUsd: charge.finalCostUsd ?? 0,
      finalCostSats: charge.finalCostSats ?? 0,
      chargedSats: charge.chargedSats ?? 0,
      reasonCode: charge.reasonCode ?? null,
      reasonDetail: charge.reasonDetail ?? null,
      paymentProvider: charge.paymentProvider ?? null
    }))
  })

  it('bloquea el build antes del LLM cuando el cobro es rechazado en precheck', async () => {
    mocks.canChargeOperationMock.mockResolvedValue({
      decision: 'rejected',
      operation: 'plan_build',
      estimatedCostUsd: 0.005,
      estimatedCostSats: 5,
      reasonCode: 'wallet_not_connected',
      reasonDetail: 'WALLET_NOT_CONNECTED',
      paymentProvider: null,
      wallet: null
    })
    mocks.createOperationChargeMock.mockResolvedValue({
      id: 'charge-1',
      status: 'rejected',
      estimatedCostUsd: 0.005,
      estimatedCostSats: 5,
      finalCostUsd: 0,
      finalCostSats: 0,
      chargedSats: 0,
      reasonCode: 'wallet_not_connected',
      reasonDetail: 'WALLET_NOT_CONNECTED',
      paymentProvider: null
    })

    const response = await POST(new Request('http://localhost/api/plan/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildRequestBody()
    }))

    const result = extractResultPayload(await response.text())

    expect(mocks.buildWithOllamaFallbackMock).not.toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: 'Cobro bloqueado',
      charge: expect.objectContaining({
        chargeId: 'charge-1',
        status: 'rejected'
      })
    }))
  })

  it('persiste el chargeId y devuelve cobro pagado cuando el build online sale bien', async () => {
    mocks.canChargeOperationMock.mockResolvedValue({
      decision: 'chargeable',
      operation: 'plan_build',
      estimatedCostUsd: 0.005,
      estimatedCostSats: 5,
      reasonCode: null,
      reasonDetail: null,
      paymentProvider: 'nwc',
      wallet: null
    })
    mocks.createOperationChargeMock.mockResolvedValue({
      id: 'charge-1',
      status: 'pending',
      estimatedCostUsd: 0.005,
      estimatedCostSats: 5,
      finalCostUsd: 0,
      finalCostSats: 0,
      chargedSats: 0,
      reasonCode: null,
      reasonDetail: null,
      paymentProvider: null
    })
    mocks.buildWithOllamaFallbackMock.mockResolvedValue({
      fallbackUsed: false,
      modelId: 'openai:gpt-4o-mini',
      result: {
        nombre: 'Plan real',
        resumen: 'Resumen',
        eventos: [],
        tokensUsed: { input: 1200, output: 800 }
      }
    })
    mocks.estimateCostUsdMock.mockReturnValue(0.001)
    mocks.estimateCostSatsMock.mockReturnValue(1)
    mocks.chargeOperationMock.mockResolvedValue({
      status: 'paid',
      operation: 'plan_build',
      chargedSats: 5,
      paymentProvider: 'nwc',
      lightningInvoice: 'lnbc1...',
      lightningPaymentHash: 'hash-1',
      lightningPreimage: 'preimage-1',
      providerReference: 'hash-1',
      reasonCode: null,
      reasonDetail: null,
      wallet: null
    })
    mocks.recordChargeResultMock
      .mockResolvedValueOnce({
        id: 'charge-1',
        status: 'paid',
        estimatedCostUsd: 0.005,
        estimatedCostSats: 5,
        finalCostUsd: 0.001,
        finalCostSats: 1,
        chargedSats: 5,
        reasonCode: null,
        reasonDetail: null,
        paymentProvider: 'nwc'
      })
      .mockResolvedValueOnce({
        id: 'charge-1',
        status: 'paid',
        estimatedCostUsd: 0.005,
        estimatedCostSats: 5,
        finalCostUsd: 0.001,
        finalCostSats: 1,
        chargedSats: 5,
        reasonCode: null,
        reasonDetail: null,
        paymentProvider: 'nwc'
      })
    mocks.createPlanMock.mockResolvedValue('plan-1')
    mocks.trackCostMock.mockResolvedValue({ costUsd: 0.001, costSats: 1 })
    mocks.seedProgressFromEventsMock.mockResolvedValue(0)

    const response = await POST(new Request('http://localhost/api/plan/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildRequestBody()
    }))

    const result = extractResultPayload(await response.text())

    expect(mocks.chargeOperationMock).toHaveBeenCalledWith({
      operation: 'plan_build',
      amountSats: 5,
      description: 'LAP plan build 11111111-1111-4111-8111-111111111111'
    })
    expect(mocks.trackCostMock).toHaveBeenCalledWith(
      'plan-1',
      'plan_build',
      'openai:gpt-4o-mini',
      1200,
      800,
      'charge-1'
    )
    expect(result).toEqual(expect.objectContaining({
      success: true,
      planId: 'plan-1',
      charge: expect.objectContaining({
        chargeId: 'charge-1',
        status: 'paid',
        chargedSats: 5
      })
    }))
  })
})
