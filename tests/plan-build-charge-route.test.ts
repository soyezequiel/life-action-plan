import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDeploymentModeMock: vi.fn(() => 'local'),
  resolvePlanBuildExecutionMock: vi.fn(),
  toOperationChargeSkipReasonMock: vi.fn(),
  canChargeOperationMock: vi.fn(),
  chargeOperationMock: vi.fn(),
  createInstrumentedRuntimeMock: vi.fn(() => ({})),
  buildWithOllamaFallbackMock: vi.fn(),
  generatePlanMock: vi.fn(),
  getProviderMock: vi.fn(() => ({})),
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
  buildPlanManifestMock: vi.fn(() => '{"manifest":true}'),
  createUniquePlanSlugMock: vi.fn(() => 'plan-de-prueba'),
  getProfileTimezoneMock: vi.fn(() => 'America/Argentina/Buenos_Aires'),
  parseStoredProfileMock: vi.fn(() => ({
    participantes: [{ datosPersonales: { ubicacion: { zonaHoraria: 'America/Argentina/Buenos_Aires' } } }]
  })),
  toChargeErrorMessageMock: vi.fn(() => 'Cobro bloqueado'),
  toExecutionBlockErrorMessageMock: vi.fn(() => 'Necesitas configurar tu conexion primero.'),
  toPlanBuildErrorMessageMock: vi.fn(() => 'Build error')
}))

vi.mock('../src/lib/env/deployment', () => ({
  getDeploymentMode: mocks.getDeploymentModeMock
}))

vi.mock('../src/lib/runtime/build-execution', () => ({
  resolvePlanBuildExecution: mocks.resolvePlanBuildExecutionMock,
  toOperationChargeSkipReason: mocks.toOperationChargeSkipReasonMock
}))

vi.mock('../app/api/_domain', () => ({
  DEFAULT_OLLAMA_FALLBACK_MODEL: 'ollama:qwen3:8b',
  canChargeOperation: mocks.canChargeOperationMock,
  chargeOperation: mocks.chargeOperationMock,
  createInstrumentedRuntime: mocks.createInstrumentedRuntimeMock,
  buildWithOllamaFallback: mocks.buildWithOllamaFallbackMock,
  generatePlan: mocks.generatePlanMock,
  getProvider: mocks.getProviderMock,
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
  getProfile: mocks.getProfileMock
}))

vi.mock('../app/api/_plan', () => ({
  buildPlanManifest: mocks.buildPlanManifestMock,
  createUniquePlanSlug: mocks.createUniquePlanSlugMock,
  getProfileTimezone: mocks.getProfileTimezoneMock,
  parseStoredProfile: mocks.parseStoredProfileMock,
  toChargeErrorMessage: mocks.toChargeErrorMessageMock,
  toExecutionBlockErrorMessage: mocks.toExecutionBlockErrorMessageMock,
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

function makeExecutionResolution(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operation: 'plan_build',
    requestedModelId: 'openai:gpt-4o-mini',
    deploymentMode: 'local',
    executionContext: {
      mode: 'backend-cloud',
      resourceOwner: 'backend',
      executionTarget: 'cloud',
      credentialSource: 'backend-stored',
      provider: {
        providerId: 'openai',
        modelId: 'openai:gpt-4o-mini',
        providerKind: 'cloud'
      },
      chargePolicy: 'charge',
      chargeReason: 'backend_resource',
      credentialId: 'cred-1',
      canExecute: true,
      resolutionSource: 'auto-backend-stored',
      blockReasonCode: null,
      blockReasonDetail: null
    },
    billingPolicy: {
      operation: 'plan_build',
      executionMode: 'backend-cloud',
      resourceOwner: 'backend',
      executionTarget: 'cloud',
      chargePolicy: 'charge',
      chargeReason: 'backend_resource',
      billableOperation: true,
      estimatedAmountStrategy: 'fixed_plan_build_sats',
      estimatedCostUsd: 0.005,
      estimatedCostSats: 5,
      chargeable: true,
      skipReasonCode: null,
      skipReasonDetail: null
    },
    runtime: {
      modelId: 'openai:gpt-4o-mini',
      apiKey: 'backend-key'
    },
    ...overrides
  }
}

describe('plan build charge route', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => {
      if (typeof mock === 'function' && 'mockReset' in mock) {
        mock.mockReset()
      }
    })

    mocks.getDeploymentModeMock.mockReturnValue('local')
    mocks.getProfileMock.mockResolvedValue({
      id: 'profile-1',
      data: '{"profile":true}'
    })
    mocks.buildPlanManifestMock.mockReturnValue('{"manifest":true}')
    mocks.createUniquePlanSlugMock.mockResolvedValue('plan-de-prueba')
    mocks.getProfileTimezoneMock.mockReturnValue('America/Argentina/Buenos_Aires')
    mocks.parseStoredProfileMock.mockReturnValue({
      participantes: [{ datosPersonales: { ubicacion: { zonaHoraria: 'America/Argentina/Buenos_Aires' } } }]
    })
    mocks.toChargeErrorMessageMock.mockReturnValue('Cobro bloqueado')
    mocks.toExecutionBlockErrorMessageMock.mockReturnValue('Necesitas configurar tu conexion primero.')
    mocks.toPlanBuildErrorMessageMock.mockReturnValue('Build error')
    mocks.toOperationChargeSkipReasonMock.mockReturnValue({
      reasonCode: 'user_resource',
      reasonDetail: 'RESOURCE_OWNER_USER'
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

  it('bloquea el build antes del LLM cuando el contexto de ejecucion no puede ejecutarse', async () => {
    mocks.resolvePlanBuildExecutionMock.mockResolvedValue(makeExecutionResolution({
      executionContext: {
        mode: 'user-cloud',
        resourceOwner: 'user',
        executionTarget: 'cloud',
        credentialSource: 'user-stored',
        provider: {
          providerId: 'openai',
          modelId: 'openai:gpt-4o-mini',
          providerKind: 'cloud'
        },
        chargePolicy: 'skip',
        chargeReason: 'user_resource',
        credentialId: null,
        canExecute: false,
        resolutionSource: 'auto-cloud-missing',
        blockReasonCode: 'cloud_credential_missing',
        blockReasonDetail: 'No active credential is configured.'
      },
      billingPolicy: {
        operation: 'plan_build',
        executionMode: 'user-cloud',
        resourceOwner: 'user',
        executionTarget: 'cloud',
        chargePolicy: 'skip',
        chargeReason: 'user_resource',
        billableOperation: true,
        estimatedAmountStrategy: 'fixed_plan_build_sats',
        estimatedCostUsd: 0.005,
        estimatedCostSats: 5,
        chargeable: false,
        skipReasonCode: 'execution_blocked',
        skipReasonDetail: 'No active credential is configured.'
      },
      runtime: null
    }))
    mocks.toOperationChargeSkipReasonMock.mockReturnValue({
      reasonCode: 'execution_blocked',
      reasonDetail: 'No active credential is configured.'
    })
    mocks.createOperationChargeMock.mockResolvedValue({
      id: 'charge-1',
      status: 'skipped',
      estimatedCostUsd: 0.005,
      estimatedCostSats: 5,
      finalCostUsd: 0,
      finalCostSats: 0,
      chargedSats: 0,
      reasonCode: 'execution_blocked',
      reasonDetail: 'No active credential is configured.',
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
      error: 'Necesitas configurar tu conexion primero.',
      charge: expect.objectContaining({
        chargeId: 'charge-1',
        status: 'skipped',
        reasonCode: 'execution_blocked'
      })
    }))
  })

  it('no cobra cuando el build usa recurso del usuario', async () => {
    mocks.resolvePlanBuildExecutionMock.mockResolvedValue(makeExecutionResolution({
      executionContext: {
        mode: 'user-cloud',
        resourceOwner: 'user',
        executionTarget: 'cloud',
        credentialSource: 'user-supplied',
        provider: {
          providerId: 'openai',
          modelId: 'openai:gpt-4o-mini',
          providerKind: 'cloud'
        },
        chargePolicy: 'skip',
        chargeReason: 'user_resource',
        credentialId: null,
        canExecute: true,
        resolutionSource: 'auto-user-supplied',
        blockReasonCode: null,
        blockReasonDetail: null
      },
      billingPolicy: {
        operation: 'plan_build',
        executionMode: 'user-cloud',
        resourceOwner: 'user',
        executionTarget: 'cloud',
        chargePolicy: 'skip',
        chargeReason: 'user_resource',
        billableOperation: true,
        estimatedAmountStrategy: 'fixed_plan_build_sats',
        estimatedCostUsd: 0.005,
        estimatedCostSats: 5,
        chargeable: false,
        skipReasonCode: 'user_resource',
        skipReasonDetail: 'RESOURCE_OWNER_USER'
      },
      runtime: {
        modelId: 'openai:gpt-4o-mini',
        apiKey: 'user-key'
      }
    }))
    mocks.createOperationChargeMock.mockResolvedValue({
      id: 'charge-1',
      status: 'skipped',
      estimatedCostUsd: 0.005,
      estimatedCostSats: 5,
      finalCostUsd: 0,
      finalCostSats: 0,
      chargedSats: 0,
      reasonCode: 'user_resource',
      reasonDetail: 'RESOURCE_OWNER_USER',
      paymentProvider: null
    })
    mocks.buildWithOllamaFallbackMock.mockImplementation(async (modelId, buildPlan) => ({
      fallbackUsed: false,
      modelId,
      result: await buildPlan(modelId)
    }))
    mocks.generatePlanMock.mockResolvedValue({
      nombre: 'Plan con recurso propio',
      resumen: 'Resumen',
      eventos: [],
      tokensUsed: { input: 1200, output: 800 }
    })
    mocks.estimateCostUsdMock.mockReturnValue(0.001)
    mocks.estimateCostSatsMock.mockReturnValue(1)
    mocks.recordChargeResultMock
      .mockResolvedValueOnce({
        id: 'charge-1',
        status: 'skipped',
        estimatedCostUsd: 0.005,
        estimatedCostSats: 5,
        finalCostUsd: 0.001,
        finalCostSats: 1,
        chargedSats: 0,
        reasonCode: 'user_resource',
        reasonDetail: 'RESOURCE_OWNER_USER',
        paymentProvider: null
      })
      .mockResolvedValueOnce({
        id: 'charge-1',
        status: 'skipped',
        estimatedCostUsd: 0.005,
        estimatedCostSats: 5,
        finalCostUsd: 0.001,
        finalCostSats: 1,
        chargedSats: 0,
        reasonCode: 'user_resource',
        reasonDetail: 'RESOURCE_OWNER_USER',
        paymentProvider: null
      })
    mocks.createPlanMock.mockResolvedValue('plan-1')
    mocks.trackCostMock.mockResolvedValue({ costUsd: 0.001, costSats: 1 })
    mocks.seedProgressFromEventsMock.mockResolvedValue(0)

    const response = await POST(new Request('http://localhost/api/plan/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildRequestBody({ apiKey: 'user-key' })
    }))

    const result = extractResultPayload(await response.text())

    expect(mocks.canChargeOperationMock).not.toHaveBeenCalled()
    expect(mocks.chargeOperationMock).not.toHaveBeenCalled()
    expect(mocks.trackEventMock).toHaveBeenCalledWith('PLAN_BUILD_STARTED', expect.objectContaining({
      profileId: '11111111-1111-4111-8111-111111111111',
      chargeId: 'charge-1',
      executionMode: 'user-cloud',
      resourceOwner: 'user',
      executionTarget: 'cloud',
      credentialSource: 'user-supplied',
      chargePolicy: 'skip',
      chargeReason: 'user_resource',
      chargeable: false,
      billingReasonCode: 'user_resource',
      providerId: 'openai',
      modelId: 'openai:gpt-4o-mini'
    }))
    expect(mocks.trackEventMock).toHaveBeenCalledWith('PLAN_BUILT', expect.objectContaining({
      planId: 'plan-1',
      chargeId: 'charge-1',
      executionMode: 'user-cloud',
      resourceOwner: 'user',
      chargePolicy: 'skip',
      billingReasonCode: 'user_resource',
      providerId: 'openai',
      modelId: 'openai:gpt-4o-mini'
    }))
    expect(result).toEqual(expect.objectContaining({
      success: true,
      planId: 'plan-1',
      charge: expect.objectContaining({
        chargeId: 'charge-1',
        status: 'skipped',
        reasonCode: 'user_resource'
      })
    }))
  })

  it('no cobra cuando el build usa el modo codex sobre credenciales del backend', async () => {
    mocks.resolvePlanBuildExecutionMock.mockResolvedValue(makeExecutionResolution({
      executionContext: {
        mode: 'codex-cloud',
        resourceOwner: 'backend',
        executionTarget: 'cloud',
        credentialSource: 'backend-stored',
        provider: {
          providerId: 'openrouter',
          modelId: 'openrouter:openai/gpt-4o-mini',
          providerKind: 'cloud'
        },
        chargePolicy: 'skip',
        chargeReason: 'internal_tooling',
        credentialId: 'cred-backend-codex',
        canExecute: true,
        resolutionSource: 'requested-mode',
        blockReasonCode: null,
        blockReasonDetail: null
      },
      billingPolicy: {
        operation: 'plan_build',
        executionMode: 'codex-cloud',
        resourceOwner: 'backend',
        executionTarget: 'cloud',
        chargePolicy: 'skip',
        chargeReason: 'internal_tooling',
        billableOperation: true,
        estimatedAmountStrategy: 'fixed_plan_build_sats',
        estimatedCostUsd: 0.005,
        estimatedCostSats: 5,
        chargeable: false,
        skipReasonCode: 'internal_tooling',
        skipReasonDetail: 'INTERNAL_TOOLING_MODE'
      },
      runtime: {
        modelId: 'openrouter:openai/gpt-4o-mini',
        apiKey: 'backend-codex-key'
      }
    }))
    mocks.toOperationChargeSkipReasonMock.mockReturnValue({
      reasonCode: 'internal_tooling',
      reasonDetail: 'INTERNAL_TOOLING_MODE'
    })
    mocks.createOperationChargeMock.mockResolvedValue({
      id: 'charge-codex-1',
      status: 'skipped',
      estimatedCostUsd: 0.005,
      estimatedCostSats: 5,
      finalCostUsd: 0,
      finalCostSats: 0,
      chargedSats: 0,
      reasonCode: 'internal_tooling',
      reasonDetail: 'INTERNAL_TOOLING_MODE',
      paymentProvider: null
    })
    mocks.buildWithOllamaFallbackMock.mockImplementation(async (modelId, buildPlan) => ({
      fallbackUsed: false,
      modelId,
      result: await buildPlan(modelId)
    }))
    mocks.generatePlanMock.mockResolvedValue({
      nombre: 'Plan codex',
      resumen: 'Resumen',
      eventos: [],
      tokensUsed: { input: 900, output: 500 }
    })
    mocks.estimateCostUsdMock.mockReturnValue(0.001)
    mocks.estimateCostSatsMock.mockReturnValue(1)
    mocks.recordChargeResultMock
      .mockResolvedValueOnce({
        id: 'charge-codex-1',
        status: 'skipped',
        estimatedCostUsd: 0.005,
        estimatedCostSats: 5,
        finalCostUsd: 0.001,
        finalCostSats: 1,
        chargedSats: 0,
        reasonCode: 'internal_tooling',
        reasonDetail: 'INTERNAL_TOOLING_MODE',
        paymentProvider: null
      })
      .mockResolvedValueOnce({
        id: 'charge-codex-1',
        status: 'skipped',
        estimatedCostUsd: 0.005,
        estimatedCostSats: 5,
        finalCostUsd: 0.001,
        finalCostSats: 1,
        chargedSats: 0,
        reasonCode: 'internal_tooling',
        reasonDetail: 'INTERNAL_TOOLING_MODE',
        paymentProvider: null
      })
    mocks.createPlanMock.mockResolvedValue('plan-codex-1')
    mocks.trackCostMock.mockResolvedValue({ costUsd: 0.001, costSats: 1 })
    mocks.seedProgressFromEventsMock.mockResolvedValue(0)

    const response = await POST(new Request('http://localhost/api/plan/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildRequestBody({ provider: 'openrouter:openai/gpt-4o-mini', resourceMode: 'codex' })
    }))

    const result = extractResultPayload(await response.text())

    expect(mocks.canChargeOperationMock).not.toHaveBeenCalled()
    expect(mocks.chargeOperationMock).not.toHaveBeenCalled()
    expect(mocks.trackEventMock).toHaveBeenCalledWith('PLAN_BUILD_STARTED', expect.objectContaining({
      profileId: '11111111-1111-4111-8111-111111111111',
      chargeId: 'charge-codex-1',
      executionMode: 'codex-cloud',
      resourceOwner: 'backend',
      executionTarget: 'cloud',
      credentialSource: 'backend-stored',
      chargePolicy: 'skip',
      chargeReason: 'internal_tooling',
      chargeable: false,
      billingReasonCode: 'internal_tooling',
      providerId: 'openrouter',
      modelId: 'openrouter:openai/gpt-4o-mini'
    }))
    expect(result).toEqual(expect.objectContaining({
      success: true,
      planId: 'plan-codex-1',
      charge: expect.objectContaining({
        chargeId: 'charge-codex-1',
        status: 'skipped',
        reasonCode: 'internal_tooling'
      })
    }))
  })

  it('persiste el chargeId y devuelve cobro pagado cuando el build usa recurso del backend', async () => {
    mocks.resolvePlanBuildExecutionMock.mockResolvedValue(makeExecutionResolution())
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
    mocks.buildWithOllamaFallbackMock.mockImplementation(async (modelId, buildPlan) => ({
      fallbackUsed: false,
      modelId,
      result: await buildPlan(modelId)
    }))
    mocks.generatePlanMock.mockResolvedValue({
      nombre: 'Plan real',
      resumen: 'Resumen',
      eventos: [],
      tokensUsed: { input: 1200, output: 800 }
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

    expect(mocks.canChargeOperationMock).toHaveBeenCalledWith({
      operation: 'plan_build',
      model: 'openai:gpt-4o-mini',
      userId: 'local-user',
      estimatedCostUsd: 0.005,
      estimatedCostSats: 5,
      chargeable: true
    })
    expect(mocks.chargeOperationMock).toHaveBeenCalledWith({
      operation: 'plan_build',
      amountSats: 5,
      userId: 'local-user',
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

  it('cobra tambien cuando el build usa backend-local aunque el modelo sea local', async () => {
    mocks.resolvePlanBuildExecutionMock.mockResolvedValue(makeExecutionResolution({
      requestedModelId: 'ollama:qwen3:8b',
      executionContext: {
        mode: 'backend-local',
        resourceOwner: 'backend',
        executionTarget: 'backend-local',
        credentialSource: 'none',
        provider: {
          providerId: 'ollama',
          modelId: 'ollama:qwen3:8b',
          providerKind: 'local'
        },
        chargePolicy: 'charge',
        chargeReason: 'backend_resource',
        credentialId: null,
        canExecute: true,
        resolutionSource: 'auto-backend-local',
        blockReasonCode: null,
        blockReasonDetail: null
      },
      billingPolicy: {
        operation: 'plan_build',
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
      },
      runtime: {
        modelId: 'ollama:qwen3:8b',
        apiKey: '',
        baseURL: 'http://localhost:11434'
      }
    }))
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
      id: 'charge-local-1',
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
    mocks.buildWithOllamaFallbackMock.mockImplementation(async (modelId, buildPlan) => ({
      fallbackUsed: false,
      modelId,
      result: await buildPlan(modelId)
    }))
    mocks.generatePlanMock.mockResolvedValue({
      nombre: 'Plan local cobrado',
      resumen: 'Resumen',
      eventos: [],
      tokensUsed: { input: 450, output: 900 }
    })
    mocks.estimateCostUsdMock.mockReturnValue(0)
    mocks.estimateCostSatsMock.mockReturnValue(0)
    mocks.chargeOperationMock.mockResolvedValue({
      status: 'paid',
      operation: 'plan_build',
      chargedSats: 5,
      paymentProvider: 'nwc',
      lightningInvoice: 'lnbc1local...',
      lightningPaymentHash: 'hash-local-1',
      lightningPreimage: 'preimage-local-1',
      providerReference: 'hash-local-1',
      reasonCode: null,
      reasonDetail: null,
      wallet: null
    })
    mocks.recordChargeResultMock
      .mockResolvedValueOnce({
        id: 'charge-local-1',
        status: 'paid',
        estimatedCostUsd: 0.005,
        estimatedCostSats: 5,
        finalCostUsd: 0,
        finalCostSats: 0,
        chargedSats: 5,
        reasonCode: null,
        reasonDetail: null,
        paymentProvider: 'nwc'
      })
      .mockResolvedValueOnce({
        id: 'charge-local-1',
        status: 'paid',
        estimatedCostUsd: 0.005,
        estimatedCostSats: 5,
        finalCostUsd: 0,
        finalCostSats: 0,
        chargedSats: 5,
        reasonCode: null,
        reasonDetail: null,
        paymentProvider: 'nwc'
      })
    mocks.createPlanMock.mockResolvedValue('plan-local-1')
    mocks.trackCostMock.mockResolvedValue({ costUsd: 0, costSats: 0 })
    mocks.seedProgressFromEventsMock.mockResolvedValue(0)

    const response = await POST(new Request('http://localhost/api/plan/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildRequestBody({ provider: 'ollama:qwen3:8b', thinkingMode: 'enabled' })
    }))

    const result = extractResultPayload(await response.text())

    expect(mocks.canChargeOperationMock).toHaveBeenCalledWith({
      operation: 'plan_build',
      model: 'ollama:qwen3:8b',
      userId: 'local-user',
      estimatedCostUsd: 0.005,
      estimatedCostSats: 5,
      chargeable: true
    })
    expect(mocks.chargeOperationMock).toHaveBeenCalledWith({
      operation: 'plan_build',
      amountSats: 5,
      userId: 'local-user',
      description: 'LAP plan build 11111111-1111-4111-8111-111111111111'
    })
    expect(mocks.getProviderMock).toHaveBeenCalledWith('ollama:qwen3:8b', {
      apiKey: '',
      baseURL: 'http://localhost:11434',
      thinkingMode: 'enabled'
    })
    expect(mocks.trackCostMock).toHaveBeenCalledWith(
      'plan-local-1',
      'plan_build',
      'ollama:qwen3:8b',
      450,
      900,
      'charge-local-1'
    )
    expect(result).toEqual(expect.objectContaining({
      success: true,
      planId: 'plan-local-1',
      charge: expect.objectContaining({
        chargeId: 'charge-local-1',
        status: 'paid',
        chargedSats: 5
      })
    }))
  })

  it('bloquea de forma explicita un user-local que el backend no puede ejecutar', async () => {
    mocks.resolvePlanBuildExecutionMock.mockResolvedValue(makeExecutionResolution({
      requestedModelId: 'ollama:qwen3:8b',
      executionContext: {
        mode: 'user-local',
        resourceOwner: 'user',
        executionTarget: 'user-local',
        credentialSource: 'none',
        provider: {
          providerId: 'ollama',
          modelId: 'ollama:qwen3:8b',
          providerKind: 'local'
        },
        chargePolicy: 'skip',
        chargeReason: 'user_resource',
        credentialId: null,
        canExecute: false,
        resolutionSource: 'requested-mode',
        blockReasonCode: 'user_local_not_supported',
        blockReasonDetail: 'The backend cannot execute user-local models.'
      },
      billingPolicy: {
        operation: 'plan_build',
        executionMode: 'user-local',
        resourceOwner: 'user',
        executionTarget: 'user-local',
        chargePolicy: 'skip',
        chargeReason: 'user_resource',
        billableOperation: true,
        estimatedAmountStrategy: 'fixed_plan_build_sats',
        estimatedCostUsd: 0.005,
        estimatedCostSats: 5,
        chargeable: false,
        skipReasonCode: 'execution_blocked',
        skipReasonDetail: 'The backend cannot execute user-local models.'
      },
      runtime: null
    }))
    mocks.toOperationChargeSkipReasonMock.mockReturnValue({
      reasonCode: 'execution_blocked',
      reasonDetail: 'The backend cannot execute user-local models.'
    })
    mocks.createOperationChargeMock.mockResolvedValue({
      id: 'charge-user-local-1',
      status: 'skipped',
      estimatedCostUsd: 0.005,
      estimatedCostSats: 5,
      finalCostUsd: 0,
      finalCostSats: 0,
      chargedSats: 0,
      reasonCode: 'execution_blocked',
      reasonDetail: 'The backend cannot execute user-local models.',
      paymentProvider: null
    })

    const response = await POST(new Request('http://localhost/api/plan/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildRequestBody({ provider: 'ollama:qwen3:8b' })
    }))

    const result = extractResultPayload(await response.text())

    expect(mocks.buildWithOllamaFallbackMock).not.toHaveBeenCalled()
    expect(mocks.chargeOperationMock).not.toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: 'Necesitas configurar tu conexion primero.',
      charge: expect.objectContaining({
        chargeId: 'charge-user-local-1',
        status: 'skipped',
        reasonCode: 'execution_blocked'
      })
    }))
  })
})
