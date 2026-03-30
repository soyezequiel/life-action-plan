import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolvedExecutionContextSchema } from '../src/shared/schemas'
import { DEFAULT_CODEX_BUILD_MODEL } from '../src/lib/providers/provider-metadata'

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

  it('usa OAuth local de Codex y saltea cobro cuando el contexto resuelto es codex-cloud', async () => {
    mocks.resolveExecutionContextMock.mockResolvedValue(resolvedExecutionContextSchema.parse({
      mode: 'codex-cloud',
      resourceOwner: 'backend',
      executionTarget: 'cloud',
      credentialSource: 'none',
      provider: {
        providerId: 'openai',
        modelId: DEFAULT_CODEX_BUILD_MODEL,
        providerKind: 'cloud'
      },
      chargePolicy: 'skip',
      chargeReason: 'internal_tooling',
      credentialId: null,
      canExecute: true,
      resolutionSource: 'requested-mode',
      blockReasonCode: null,
      blockReasonDetail: null
    }))

    const resolution = await resolvePlanBuildExecution({
      modelId: 'openrouter:openai/gpt-4o-mini',
      deploymentMode: 'local',
      requestedMode: 'codex-cloud'
    })

    expect(mocks.resolveExecutionContextMock).toHaveBeenCalledWith(expect.objectContaining({
      modelId: DEFAULT_CODEX_BUILD_MODEL,
      requestedMode: 'codex-cloud'
    }))
    expect(mocks.getCredentialConfigurationSecretMock).not.toHaveBeenCalled()
    expect(resolution.requestedModelId).toBe(DEFAULT_CODEX_BUILD_MODEL)
    expect(resolution.runtime).toEqual({
      modelId: DEFAULT_CODEX_BUILD_MODEL,
      apiKey: 'chatgpt-oauth',
      baseURL: 'https://chatgpt.com/backend-api/codex',
      authMode: 'codex-oauth'
    })
    expect(resolution.billingPolicy.chargeable).toBe(false)
    expect(resolution.billingPolicy.skipReasonCode).toBe('internal_tooling')
    expect(toOperationChargeSkipReason(resolution.billingPolicy)).toEqual({
      reasonCode: 'internal_tooling',
      reasonDetail: 'INTERNAL_TOOLING_MODE'
    })
  })

  it('conserva bloqueo cuando no puede ejecutar una ruta backend-cloud', async () => {
    mocks.resolveExecutionContextMock.mockResolvedValue(resolvedExecutionContextSchema.parse({
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

    const blockedResolution = await resolvePlanBuildExecution({
      modelId: 'openai:gpt-4o-mini',
      deploymentMode: 'local'
    })

    expect(blockedResolution.runtime).toBeNull()
    expect(blockedResolution.billingPolicy.skipReasonCode).toBe('execution_blocked')
    expect(toOperationChargeSkipReason(blockedResolution.billingPolicy)).toEqual({
      reasonCode: 'execution_blocked',
      reasonDetail: 'No active backend credential is configured.'
    })
  })
})
