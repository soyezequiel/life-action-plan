import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveBackendServiceExecutionMock: vi.fn(),
  toOperationChargeSkipReasonMock: vi.fn(),
  canChargeOperationMock: vi.fn(),
  chargeOperationMock: vi.fn(),
  recordChargeResultMock: vi.fn(),
  simulatePlanViabilityWithProgressMock: vi.fn(),
  summarizeOperationChargeMock: vi.fn(),
  startTraceMock: vi.fn(() => 'trace-1'),
  completeTraceMock: vi.fn(),
  failTraceMock: vi.fn(),
  createOperationChargeMock: vi.fn(),
  getPlanMock: vi.fn(),
  getProfileMock: vi.fn(),
  getProgressByPlanMock: vi.fn(),
  trackCostMock: vi.fn(),
  trackEventMock: vi.fn(),
  updatePlanManifestMock: vi.fn(),
  createSimulationManifestMock: vi.fn(() => '{"manifest":true}'),
  getProfileTimezoneMock: vi.fn(() => 'America/Argentina/Buenos_Aires'),
  parseStoredProfileMock: vi.fn(() => ({
    participantes: [{ datosPersonales: { ubicacion: { zonaHoraria: 'America/Argentina/Buenos_Aires' } } }]
  })),
  toChargeErrorMessageMock: vi.fn(() => 'Cobro bloqueado'),
  toExecutionBlockErrorMessageMock: vi.fn(() => 'Necesitas configurar tu conexion primero.'),
  toPlanBuildErrorMessageMock: vi.fn(() => 'Simulacion fallida')
}))

vi.mock('../src/lib/runtime/backend-service-execution', () => ({
  resolveBackendServiceExecution: mocks.resolveBackendServiceExecutionMock
}))

vi.mock('../src/lib/runtime/build-execution', () => ({
  toOperationChargeSkipReason: mocks.toOperationChargeSkipReasonMock
}))

vi.mock('../src/lib/payments/operation-charging', () => ({
  canChargeOperation: mocks.canChargeOperationMock,
  chargeOperation: mocks.chargeOperationMock,
  recordChargeResult: mocks.recordChargeResultMock,
  summarizeOperationCharge: mocks.summarizeOperationChargeMock
}))

vi.mock('../src/lib/skills/plan-simulator', () => ({
  simulatePlanViabilityWithProgress: mocks.simulatePlanViabilityWithProgressMock
}))

vi.mock('../src/debug/trace-collector', () => ({
  traceCollector: {
    startTrace: mocks.startTraceMock,
    completeTrace: mocks.completeTraceMock,
    failTrace: mocks.failTraceMock
  }
}))

vi.mock('../src/lib/db/db-helpers', () => ({
  createOperationCharge: mocks.createOperationChargeMock,
  getPlan: mocks.getPlanMock,
  getProfile: mocks.getProfileMock,
  getProgressByPlan: mocks.getProgressByPlanMock,
  trackCost: mocks.trackCostMock,
  trackEvent: mocks.trackEventMock,
  updatePlanManifest: mocks.updatePlanManifestMock
}))

vi.mock('../src/lib/domain/plan-helpers', () => ({
  createSimulationManifest: mocks.createSimulationManifestMock,
  getProfileTimezone: mocks.getProfileTimezoneMock,
  parseStoredProfile: mocks.parseStoredProfileMock,
  toChargeErrorMessage: mocks.toChargeErrorMessageMock,
  toExecutionBlockErrorMessage: mocks.toExecutionBlockErrorMessageMock,
  toPlanBuildErrorMessage: mocks.toPlanBuildErrorMessageMock
}))

vi.mock('../app/api/_plan', () => ({
  createSimulationManifest: mocks.createSimulationManifestMock,
  getProfileTimezone: mocks.getProfileTimezoneMock,
  parseStoredProfile: mocks.parseStoredProfileMock,
  toChargeErrorMessage: mocks.toChargeErrorMessageMock,
  toExecutionBlockErrorMessage: mocks.toExecutionBlockErrorMessageMock,
  toPlanBuildErrorMessage: mocks.toPlanBuildErrorMessageMock
}))

import { POST } from '../app/api/plan/simulate/route'

function buildRequestBody(overrides?: Record<string, unknown>): string {
  return JSON.stringify({
    planId: '22222222-2222-4222-8222-222222222222',
    mode: 'interactive',
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

function makeSimulationResolution(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operation: 'plan_simulate',
    executionContext: {
      mode: 'backend-local',
      resourceOwner: 'backend',
      executionTarget: 'backend-local',
      credentialSource: 'none',
      provider: {
        providerId: 'lap',
        modelId: 'lap:plan-simulator',
        providerKind: 'local'
      },
      chargePolicy: 'charge',
      chargeReason: 'backend_resource',
      credentialId: null,
      canExecute: true,
      resolutionSource: 'requested-mode',
      blockReasonCode: null,
      blockReasonDetail: null
    },
    billingPolicy: {
      operation: 'plan_simulate',
      executionMode: 'backend-local',
      resourceOwner: 'backend',
      executionTarget: 'backend-local',
      chargePolicy: 'charge',
      chargeReason: 'backend_resource',
      billableOperation: true,
      estimatedAmountStrategy: 'none',
      estimatedCostUsd: 0,
      estimatedCostSats: 0,
      chargeable: false,
      skipReasonCode: 'operation_not_chargeable',
      skipReasonDetail: 'NO_ESTIMATE_STRATEGY'
    },
    ...overrides
  }
}

describe('plan simulate route', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => {
      if (typeof mock === 'function' && 'mockReset' in mock) {
        mock.mockReset()
      }
    })

    mocks.getPlanMock.mockResolvedValue({
      id: 'plan-1',
      profileId: 'profile-1',
      manifest: '{"nombrePlan":"Plan"}'
    })
    mocks.getProfileMock.mockResolvedValue({
      id: 'profile-1',
      data: '{"profile":true}'
    })
    mocks.getProgressByPlanMock.mockResolvedValue([])
    mocks.resolveBackendServiceExecutionMock.mockReturnValue(makeSimulationResolution())
    mocks.toOperationChargeSkipReasonMock.mockReturnValue({
      reasonCode: 'operation_not_chargeable',
      reasonDetail: 'NO_ESTIMATE_STRATEGY'
    })
    mocks.createSimulationManifestMock.mockReturnValue('{"manifest":true}')
    mocks.getProfileTimezoneMock.mockReturnValue('America/Argentina/Buenos_Aires')
    mocks.parseStoredProfileMock.mockReturnValue({
      participantes: [{ datosPersonales: { ubicacion: { zonaHoraria: 'America/Argentina/Buenos_Aires' } } }]
    })
    mocks.toChargeErrorMessageMock.mockReturnValue('Cobro bloqueado')
    mocks.toPlanBuildErrorMessageMock.mockReturnValue('Simulacion fallida')
    mocks.simulatePlanViabilityWithProgressMock.mockResolvedValue({
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
      findings: []
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

  it('registra simulate como recurso del backend y lo deja skipped cuando no tiene estrategia de cobro', async () => {
    mocks.createOperationChargeMock.mockResolvedValue({
      id: 'charge-1',
      status: 'skipped',
      estimatedCostUsd: 0,
      estimatedCostSats: 0,
      finalCostUsd: 0,
      finalCostSats: 0,
      chargedSats: 0,
      reasonCode: 'operation_not_chargeable',
      reasonDetail: 'NO_ESTIMATE_STRATEGY',
      paymentProvider: null
    })
    mocks.recordChargeResultMock.mockResolvedValue({
      id: 'charge-1',
      status: 'skipped',
      estimatedCostUsd: 0,
      estimatedCostSats: 0,
      finalCostUsd: 0,
      finalCostSats: 0,
      chargedSats: 0,
      reasonCode: 'operation_not_chargeable',
      reasonDetail: 'NO_ESTIMATE_STRATEGY',
      paymentProvider: null
    })

    const response = await POST(new Request('http://localhost/api/plan/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildRequestBody()
    }))

    const result = extractResultPayload(await response.text())

    expect(mocks.canChargeOperationMock).not.toHaveBeenCalled()
    expect(mocks.chargeOperationMock).not.toHaveBeenCalled()
    expect(mocks.trackCostMock).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      'plan_simulate',
      'lap:plan-simulator',
      0,
      0,
      'charge-1'
    )
    expect(mocks.updatePlanManifestMock).toHaveBeenCalled()
    expect(mocks.trackEventMock).toHaveBeenCalledWith('SIMULATION_STARTED', expect.objectContaining({
      planId: '22222222-2222-4222-8222-222222222222',
      chargeId: 'charge-1',
      executionMode: 'backend-local',
      resourceOwner: 'backend',
      executionTarget: 'backend-local',
      credentialSource: 'none',
      chargePolicy: 'charge',
      chargeReason: 'backend_resource',
      chargeable: false,
      billingReasonCode: 'operation_not_chargeable',
      providerId: 'lap',
      modelId: 'lap:plan-simulator'
    }))
    expect(mocks.trackEventMock).toHaveBeenCalledWith('SIMULATION_RAN', expect.objectContaining({
      planId: '22222222-2222-4222-8222-222222222222',
      chargeId: 'charge-1',
      executionMode: 'backend-local',
      resourceOwner: 'backend',
      chargePolicy: 'charge',
      billingReasonCode: 'operation_not_chargeable',
      providerId: 'lap',
      modelId: 'lap:plan-simulator'
    }))
    expect(result).toEqual(expect.objectContaining({
      success: true,
      charge: expect.objectContaining({
        chargeId: 'charge-1',
        status: 'skipped',
        reasonCode: 'operation_not_chargeable'
      })
    }))
  })

  it('bloquea la simulacion si un precheck de cobro futuro la rechaza', async () => {
    mocks.resolveBackendServiceExecutionMock.mockReturnValue(makeSimulationResolution({
      billingPolicy: {
        operation: 'plan_simulate',
        executionMode: 'backend-local',
        resourceOwner: 'backend',
        executionTarget: 'backend-local',
        chargePolicy: 'charge',
        chargeReason: 'backend_resource',
        billableOperation: true,
        estimatedAmountStrategy: 'fixed_plan_build_sats',
        estimatedCostUsd: 0.005,
        estimatedCostSats: 5,
        chargeable: true,
        skipReasonCode: null,
        skipReasonDetail: null
      }
    }))
    mocks.canChargeOperationMock.mockResolvedValue({
      decision: 'rejected',
      operation: 'plan_simulate',
      estimatedCostUsd: 0.005,
      estimatedCostSats: 5,
      reasonCode: 'wallet_not_connected',
      reasonDetail: 'WALLET_NOT_CONNECTED',
      paymentProvider: null,
      wallet: null
    })
    mocks.createOperationChargeMock.mockResolvedValue({
      id: 'charge-2',
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

    const response = await POST(new Request('http://localhost/api/plan/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildRequestBody()
    }))

    const result = extractResultPayload(await response.text())

    expect(mocks.simulatePlanViabilityWithProgressMock).not.toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: 'Cobro bloqueado',
      charge: expect.objectContaining({
        chargeId: 'charge-2',
        status: 'rejected'
      })
    }))
  })
})
