import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDeploymentModeMock: vi.fn(() => 'local'),
  resolvePlanBuildExecutionMock: vi.fn()
}))

vi.mock('../src/lib/env/deployment', () => ({
  getDeploymentMode: mocks.getDeploymentModeMock
}))

vi.mock('../src/lib/runtime/build-execution', () => ({
  resolvePlanBuildExecution: mocks.resolvePlanBuildExecutionMock
}))

import { GET } from '../app/api/settings/build-preview/route'

describe('build preview route', () => {
  beforeEach(() => {
    mocks.getDeploymentModeMock.mockReset()
    mocks.resolvePlanBuildExecutionMock.mockReset()
    mocks.getDeploymentModeMock.mockReturnValue('local')
  })

  it('devuelve user-cloud cuando el usuario ya aporto su clave', async () => {
    mocks.resolvePlanBuildExecutionMock.mockResolvedValue({
      executionContext: {
        mode: 'user-cloud',
        resourceOwner: 'user',
        executionTarget: 'cloud',
        credentialSource: 'user-supplied',
        provider: {
          providerId: 'openrouter',
          modelId: 'openrouter:openai/gpt-4o-mini',
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
        modelId: 'openrouter:openai/gpt-4o-mini',
        apiKey: 'preview-user-key'
      }
    })

    const response = await GET(new Request('http://localhost/api/settings/build-preview?provider=openrouter&hasUserApiKey=1'))
    const payload = await response.json() as {
      success: boolean
      usage: {
        mode: string
        resourceOwner: string
        chargeable: boolean
        billingReasonCode: string | null
      }
    }

    expect(mocks.resolvePlanBuildExecutionMock).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'openrouter:openai/gpt-4o-mini',
      deploymentMode: 'local',
      userId: 'local-user',
      userSuppliedApiKey: 'preview-user-key'
    }))
    expect(payload).toEqual({
      success: true,
      usage: expect.objectContaining({
        mode: 'user-cloud',
        resourceOwner: 'user',
        chargeable: false,
        billingReasonCode: 'user_resource'
      })
    })
  })

  it('devuelve backend-local cobrable para el build local del sistema', async () => {
    mocks.resolvePlanBuildExecutionMock.mockResolvedValue({
      executionContext: {
        mode: 'backend-local',
        resourceOwner: 'backend',
        executionTarget: 'backend-local',
        credentialSource: 'none',
        provider: {
          providerId: 'openrouter',
          modelId: 'openai:gpt-4o-mini',
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
        modelId: 'openrouter:openai/gpt-4o-mini',
        apiKey: '',
        baseURL: 'http://localhost:11434'
      }
    })

    const response = await GET(new Request('http://localhost/api/settings/build-preview?provider=openrouter:openai/gpt-4o-mini&hasUserApiKey=0'))
    const payload = await response.json() as {
      success: boolean
      usage: {
        mode: string
        resourceOwner: string
        chargeable: boolean
      }
    }

    expect(payload).toEqual({
      success: true,
      usage: expect.objectContaining({
        mode: 'backend-local',
        resourceOwner: 'backend',
        chargeable: true
      })
    })
  })

  it('fuerza backend-cloud cuando se elige una API del sistema por credencial', async () => {
    mocks.resolvePlanBuildExecutionMock.mockResolvedValue({
      executionContext: {
        mode: 'backend-cloud',
        resourceOwner: 'backend',
        executionTarget: 'cloud',
        credentialSource: 'backend-stored',
        provider: {
          providerId: 'openrouter',
          modelId: 'openrouter:openai/gpt-4o-mini',
          providerKind: 'cloud'
        },
        chargePolicy: 'charge',
        chargeReason: 'backend_resource',
        credentialId: 'cred-backend-1',
        canExecute: true,
        resolutionSource: 'requested-mode',
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
        modelId: 'openrouter:openai/gpt-4o-mini',
        apiKey: 'backend-key'
      }
    })

    const response = await GET(new Request(
      'http://localhost/api/settings/build-preview?provider=openrouter&backendCredentialId=cred-backend-1&hasUserApiKey=0'
    ))
    const payload = await response.json() as {
      success: boolean
      usage: {
        mode: string
        resourceOwner: string
        chargeable: boolean
      }
    }

    expect(mocks.resolvePlanBuildExecutionMock).toHaveBeenCalledWith({
      modelId: 'openrouter:openai/gpt-4o-mini',
      deploymentMode: 'local',
      requestedMode: 'backend-cloud',
      userId: 'local-user',
      userSuppliedApiKey: '',
      backendCredentialId: 'cred-backend-1'
    })
    expect(payload).toEqual({
      success: true,
      usage: expect.objectContaining({
        mode: 'backend-cloud',
        resourceOwner: 'backend',
        chargeable: true
      })
    })
  })

  it('permite previsualizar el modo codex local sin cobro', async () => {
    mocks.resolvePlanBuildExecutionMock.mockResolvedValue({
      executionContext: {
        mode: 'codex-cloud',
        resourceOwner: 'backend',
        executionTarget: 'cloud',
        credentialSource: 'none',
        provider: {
          providerId: 'openai',
          modelId: 'openai:gpt-5-codex',
          providerKind: 'cloud'
        },
        chargePolicy: 'skip',
        chargeReason: 'internal_tooling',
        credentialId: null,
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
        modelId: 'openai:gpt-5-codex',
        apiKey: 'chatgpt-oauth',
        baseURL: 'https://chatgpt.com/backend-api/codex',
        authMode: 'codex-oauth'
      }
    })

    const response = await GET(new Request('http://localhost/api/settings/build-preview?provider=openrouter&resourceMode=codex'))
    const payload = await response.json() as {
      success: boolean
      usage: {
        mode: string
        resourceOwner: string
        chargeable: boolean
        billingReasonCode: string | null
      }
    }

    expect(mocks.resolvePlanBuildExecutionMock).toHaveBeenCalledWith({
      modelId: 'openrouter:openai/gpt-4o-mini',
      deploymentMode: 'local',
      requestedMode: 'codex-cloud',
      userId: 'local-user',
      userSuppliedApiKey: '',
      backendCredentialId: ''
    })
    expect(payload).toEqual({
      success: true,
      usage: expect.objectContaining({
        mode: 'codex-cloud',
        resourceOwner: 'backend',
        chargeable: false,
        billingReasonCode: 'internal_tooling'
      })
    })
  })
})
