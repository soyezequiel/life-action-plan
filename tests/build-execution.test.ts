import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolvedExecutionContextSchema } from '../src/shared/schemas'

const mocks = vi.hoisted(() => ({
  resolveExecutionContextMock: vi.fn(),
  getCredentialConfigurationSecretMock: vi.fn()
}))

vi.mock('../src/lib/runtime/execution-context-resolver', () => ({
  resolveExecutionContext: mocks.resolveExecutionContextMock
}))

vi.mock('../src/lib/auth/credential-config', () => ({
  getCredentialConfigurationSecret: mocks.getCredentialConfigurationSecretMock
}))

import { resolvePlanBuildExecution, toOperationChargeSkipReason } from '../src/lib/runtime/build-execution'

describe('build execution runtime', () => {
  beforeEach(() => {
    mocks.resolveExecutionContextMock.mockReset()
    mocks.getCredentialConfigurationSecretMock.mockReset()
    delete process.env.OLLAMA_BASE_URL
  })

  it('usa la api key del usuario cuando el contexto resuelto es user-cloud user-supplied', async () => {
    mocks.resolveExecutionContextMock.mockResolvedValue(resolvedExecutionContextSchema.parse({
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
    }))

    const resolution = await resolvePlanBuildExecution({
      modelId: 'openai:gpt-4o-mini',
      deploymentMode: 'local',
      userSuppliedApiKey: 'user-key'
    })

    expect(resolution.runtime).toEqual({
      modelId: 'openai:gpt-4o-mini',
      apiKey: 'user-key'
    })
    expect(resolution.billingPolicy.chargeable).toBe(false)
    expect(resolution.billingPolicy.skipReasonCode).toBe('user_resource')
  })

  it('usa el secreto persistido del backend cuando el contexto resuelto es backend-cloud', async () => {
    mocks.resolveExecutionContextMock.mockResolvedValue(resolvedExecutionContextSchema.parse({
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
      resolutionSource: 'auto-backend-stored',
      blockReasonCode: null,
      blockReasonDetail: null
    }))
    mocks.getCredentialConfigurationSecretMock.mockResolvedValue('backend-key')

    const resolution = await resolvePlanBuildExecution({
      modelId: 'openrouter:openai/gpt-4o-mini',
      deploymentMode: 'local'
    })

    expect(mocks.getCredentialConfigurationSecretMock).toHaveBeenCalledWith('cred-backend-1')
    expect(resolution.runtime).toEqual({
      modelId: 'openrouter:openai/gpt-4o-mini',
      apiKey: 'backend-key'
    })
    expect(resolution.billingPolicy.chargeable).toBe(true)
    expect(resolution.billingPolicy.estimatedCostSats).toBeGreaterThan(0)
  })

  it('resuelve runtime local del backend sin api key y conserva bloqueo cuando no puede ejecutar', async () => {
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434'
    mocks.resolveExecutionContextMock.mockResolvedValueOnce(resolvedExecutionContextSchema.parse({
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
    }))
    mocks.resolveExecutionContextMock.mockResolvedValueOnce(resolvedExecutionContextSchema.parse({
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
      credentialId: null,
      canExecute: false,
      resolutionSource: 'requested-mode',
      blockReasonCode: 'backend_credential_missing',
      blockReasonDetail: 'No active backend credential is configured.'
    }))

    const localResolution = await resolvePlanBuildExecution({
      modelId: 'ollama:qwen3:8b',
      deploymentMode: 'local'
    })
    const blockedResolution = await resolvePlanBuildExecution({
      modelId: 'openai:gpt-4o-mini',
      deploymentMode: 'local'
    })

    expect(localResolution.runtime).toEqual({
      modelId: 'ollama:qwen3:8b',
      apiKey: '',
      baseURL: 'http://localhost:11434'
    })
    expect(blockedResolution.runtime).toBeNull()
    expect(blockedResolution.billingPolicy.skipReasonCode).toBe('execution_blocked')
    expect(toOperationChargeSkipReason(blockedResolution.billingPolicy)).toEqual({
      reasonCode: 'execution_blocked',
      reasonDetail: 'No active backend credential is configured.'
    })
  })
})
