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

    expect(mocks.resolvePlanBuildExecutionMock).toHaveBeenCalledWith({
      modelId: 'openrouter:openai/gpt-4o-mini',
      deploymentMode: 'local',
      userSuppliedApiKey: 'preview-user-key'
    })
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
    })

    const response = await GET(new Request('http://localhost/api/settings/build-preview?provider=ollama:qwen3:8b&hasUserApiKey=0'))
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
})
