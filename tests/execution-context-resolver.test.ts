import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findCredentialConfigurationMock: vi.fn(),
  ensureBackendEnvCredentialConfigurationMock: vi.fn(),
  getCredentialConfigurationMock: vi.fn(),
  listCredentialConfigurationsMock: vi.fn(),
  getCodexAuthAvailabilityMock: vi.fn()
}))

vi.mock('../src/lib/auth/credential-config', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/auth/credential-config')>('../src/lib/auth/credential-config')

  return {
    ...actual,
    findCredentialConfiguration: mocks.findCredentialConfigurationMock,
    ensureBackendEnvCredentialConfiguration: mocks.ensureBackendEnvCredentialConfigurationMock,
    getCredentialConfiguration: mocks.getCredentialConfigurationMock,
    listCredentialConfigurations: mocks.listCredentialConfigurationsMock
  }
})

vi.mock('../src/lib/auth/codex-auth', () => ({
  getCodexAuthAvailability: mocks.getCodexAuthAvailabilityMock
}))

import { resolveExecutionContext } from '../src/lib/runtime/execution-context-resolver'

describe('execution context resolver', () => {
  beforeEach(() => {
    mocks.findCredentialConfigurationMock.mockReset()
    mocks.ensureBackendEnvCredentialConfigurationMock.mockReset()
    mocks.getCredentialConfigurationMock.mockReset()
    mocks.listCredentialConfigurationsMock.mockReset()
    mocks.getCodexAuthAvailabilityMock.mockReset()
    mocks.getCodexAuthAvailabilityMock.mockResolvedValue({
      available: true,
      reason: null
    })
    delete process.env.LAP_ENABLE_CODEX_SERVICE_MODE
  })

  it('prioriza la API key provista por el usuario para cloud en modo automatico', async () => {
    const context = await resolveExecutionContext({
      modelId: 'openrouter:openai/gpt-4o-mini',
      requestedMode: 'auto',
      userSuppliedApiKey: 'sk-or-v1-123'
    })

    expect(mocks.findCredentialConfigurationMock).not.toHaveBeenCalled()
    expect(context).toEqual(expect.objectContaining({
      mode: 'user-cloud',
      resourceOwner: 'user',
      credentialSource: 'user-supplied',
      credentialId: null,
      canExecute: true,
      resolutionSource: 'auto-user-supplied'
    }))
  })

  it('encuentra una credencial user-stored usando el label legacy del wrapper actual', async () => {
    mocks.findCredentialConfigurationMock.mockImplementation(async (locator) => {
      if (locator.owner === 'user' && locator.label === 'openai-api-key') {
        return {
          id: 'cred-user-openai',
          owner: 'user',
          ownerId: 'local-user',
          providerId: 'openai',
          secretType: 'api-key',
          label: 'openai-api-key',
          status: 'active',
          lastValidatedAt: null,
          lastValidationError: null,
          metadata: null,
          createdAt: '2026-03-21T00:00:00.000Z',
          updatedAt: '2026-03-21T00:00:00.000Z'
        }
      }

      return null
    })

    const context = await resolveExecutionContext({
      modelId: 'openai:gpt-4o-mini',
      requestedMode: 'auto'
    })

    expect(mocks.findCredentialConfigurationMock).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'user',
      label: 'default'
    }))
    expect(mocks.findCredentialConfigurationMock).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'user',
      label: 'openai-api-key'
    }))
    expect(context).toEqual(expect.objectContaining({
      mode: 'user-cloud',
      credentialSource: 'user-stored',
      credentialId: 'cred-user-openai',
      canExecute: true,
      resolutionSource: 'auto-user-stored'
    }))
  })

  it('cae a backend-stored cuando no hay credencial del usuario', async () => {
    mocks.findCredentialConfigurationMock.mockImplementation(async (locator) => {
      if (locator.owner === 'backend' && locator.label === 'default') {
        return {
          id: 'cred-backend-openrouter',
          owner: 'backend',
          ownerId: 'backend-system',
          providerId: 'openrouter',
          secretType: 'api-key',
          label: 'default',
          status: 'active',
          lastValidatedAt: null,
          lastValidationError: null,
          metadata: null,
          createdAt: '2026-03-21T00:00:00.000Z',
          updatedAt: '2026-03-21T00:00:00.000Z'
        }
      }

      return null
    })

    const context = await resolveExecutionContext({
      modelId: 'openrouter:openai/gpt-4o-mini',
      requestedMode: 'auto'
    })

    expect(context).toEqual(expect.objectContaining({
      mode: 'backend-cloud',
      resourceOwner: 'backend',
      credentialSource: 'backend-stored',
      credentialId: 'cred-backend-openrouter',
      canExecute: true,
      resolutionSource: 'auto-backend-stored',
      chargePolicy: 'charge'
    }))
  })

  it('bootstrappea una credencial backend desde env cuando todavia no existe en DB', async () => {
    mocks.findCredentialConfigurationMock.mockResolvedValue(null)
    mocks.ensureBackendEnvCredentialConfigurationMock.mockResolvedValue({
      id: 'cred-backend-openai-env',
      owner: 'backend',
      ownerId: 'backend-system',
      providerId: 'openai',
      secretType: 'api-key',
      label: 'default',
      status: 'active',
      lastValidatedAt: null,
      lastValidationError: null,
      metadata: {
        provisionedBy: 'env-bootstrap',
        envName: 'OPENAI_API_KEY'
      },
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:00.000Z'
    })

    const context = await resolveExecutionContext({
      modelId: 'openai:gpt-4o-mini',
      requestedMode: 'backend-cloud'
    })

    expect(mocks.ensureBackendEnvCredentialConfigurationMock).toHaveBeenCalledWith({
      providerId: 'openai',
      ownerId: 'backend-system',
      label: 'default'
    })
    expect(context).toEqual(expect.objectContaining({
      mode: 'backend-cloud',
      resourceOwner: 'backend',
      credentialSource: 'backend-stored',
      credentialId: 'cred-backend-openai-env',
      canExecute: true,
      resolutionSource: 'requested-mode'
    }))
  })

  it('bloquea backend-cloud explicito cuando falta credencial del backend', async () => {
    mocks.findCredentialConfigurationMock.mockResolvedValue(null)
    mocks.listCredentialConfigurationsMock.mockResolvedValue([])

    const context = await resolveExecutionContext({
      modelId: 'openrouter:openai/gpt-4o-mini',
      requestedMode: 'backend-cloud'
    })

    expect(context).toEqual(expect.objectContaining({
      mode: 'backend-cloud',
      credentialSource: 'backend-stored',
      canExecute: false,
      resolutionSource: 'requested-mode',
      blockReasonCode: 'backend_credential_missing'
    }))
  })

  it('permite codex-cloud en local usando la sesion local de Codex sin cobrar', async () => {
    const context = await resolveExecutionContext({
      modelId: 'openai:gpt-5-codex',
      requestedMode: 'codex-cloud',
      deploymentMode: 'local'
    })

    expect(mocks.getCodexAuthAvailabilityMock).toHaveBeenCalledTimes(1)
    expect(context).toEqual(expect.objectContaining({
      mode: 'codex-cloud',
      resourceOwner: 'backend',
      credentialSource: 'none',
      credentialId: null,
      canExecute: true,
      resolutionSource: 'requested-mode',
      chargePolicy: 'skip',
      chargeReason: 'internal_tooling'
    }))
  })

  it('bloquea codex-cloud fuera de local si no se habilita explicitamente', async () => {
    const context = await resolveExecutionContext({
      modelId: 'openrouter:openai/gpt-4o-mini',
      requestedMode: 'codex-cloud',
      deploymentMode: 'vercel-preview'
    })

    expect(context).toEqual(expect.objectContaining({
      mode: 'codex-cloud',
      credentialSource: 'none',
      canExecute: false,
      resolutionSource: 'requested-mode',
      blockReasonCode: 'codex_mode_unavailable'
    }))
  })

  it('bloquea codex-cloud cuando falta una sesion local de Codex', async () => {
    mocks.getCodexAuthAvailabilityMock.mockResolvedValue({
      available: false,
      reason: 'No pude leer la sesion local de Codex.'
    })

    const context = await resolveExecutionContext({
      modelId: 'openai:gpt-5-codex',
      requestedMode: 'codex-cloud',
      deploymentMode: 'local'
    })

    expect(context).toEqual(expect.objectContaining({
      mode: 'codex-cloud',
      credentialSource: 'none',
      credentialId: null,
      canExecute: false,
      resolutionSource: 'requested-mode',
      blockReasonCode: 'codex_auth_missing'
    }))
  })

  it('usa una credencial backend activa aunque no tenga el label default', async () => {
    mocks.findCredentialConfigurationMock.mockResolvedValue(null)
    mocks.listCredentialConfigurationsMock.mockResolvedValue([
      {
        id: 'cred-backend-lap3',
        owner: 'backend',
        ownerId: 'backend-system',
        providerId: 'openrouter',
        secretType: 'api-key',
        label: 'lap3',
        status: 'active',
        lastValidatedAt: null,
        lastValidationError: null,
        metadata: null,
        createdAt: '2026-03-21T00:00:00.000Z',
        updatedAt: '2026-03-21T01:00:00.000Z'
      }
    ])

    const context = await resolveExecutionContext({
      modelId: 'openrouter:openai/gpt-4o-mini',
      requestedMode: 'backend-cloud'
    })

    expect(mocks.listCredentialConfigurationsMock).toHaveBeenCalledWith({
      owner: 'backend',
      ownerId: 'backend-system',
      providerId: 'openrouter',
      secretType: 'api-key',
      status: 'active'
    })
    expect(context).toEqual(expect.objectContaining({
      mode: 'backend-cloud',
      credentialSource: 'backend-stored',
      credentialId: 'cred-backend-lap3',
      canExecute: true,
      resolutionSource: 'requested-mode'
    }))
  })

  it('usa una credencial backend elegida de forma explicita por id', async () => {
    mocks.getCredentialConfigurationMock.mockResolvedValue({
      id: 'cred-backend-picked',
      owner: 'backend',
      ownerId: 'backend-system',
      providerId: 'openrouter',
      secretType: 'api-key',
      label: 'equipo',
      status: 'active',
      lastValidatedAt: null,
      lastValidationError: null,
      metadata: null,
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:00.000Z'
    })

    const context = await resolveExecutionContext({
      modelId: 'openrouter:openai/gpt-4o-mini',
      requestedMode: 'backend-cloud',
      backendCredentialId: 'cred-backend-picked'
    })

    expect(mocks.getCredentialConfigurationMock).toHaveBeenCalledWith('cred-backend-picked')
    expect(context).toEqual(expect.objectContaining({
      mode: 'backend-cloud',
      credentialSource: 'backend-stored',
      credentialId: 'cred-backend-picked',
      canExecute: true,
      resolutionSource: 'requested-mode'
    }))
  })

  it('bloquea un modo local si el modelo pedido es cloud', async () => {
    const context = await resolveExecutionContext({
      modelId: 'openai:gpt-4o-mini',
      requestedMode: 'backend-local'
    })

    expect(context).toEqual(expect.objectContaining({
      mode: 'backend-cloud',
      canExecute: false,
      blockReasonCode: 'execution_mode_provider_mismatch'
    }))
  })

  it('usa backend-local automaticamente cuando Ollama esta disponible en local', async () => {
    const context = await resolveExecutionContext({
      modelId: 'ollama:qwen3:8b',
      requestedMode: 'auto',
      deploymentMode: 'local'
    })

    expect(context).toEqual(expect.objectContaining({
      mode: 'backend-local',
      credentialSource: 'none',
      credentialId: null,
      canExecute: true,
      resolutionSource: 'auto-backend-local',
      chargePolicy: 'charge'
    }))
  })

  it('bloquea auto local en deploy cuando no se soporta user-local', async () => {
    const context = await resolveExecutionContext({
      modelId: 'ollama:qwen3:8b',
      requestedMode: 'auto',
      deploymentMode: 'vercel-preview',
      allowUserLocalExecution: false
    })

    expect(context).toEqual(expect.objectContaining({
      mode: 'backend-local',
      canExecute: false,
      resolutionSource: 'auto-local-unavailable',
      blockReasonCode: 'backend_local_unavailable'
    }))
  })

  it('permite user-local explicito cuando el flujo lo habilita', async () => {
    const context = await resolveExecutionContext({
      modelId: 'ollama:qwen3:8b',
      requestedMode: 'user-local',
      deploymentMode: 'vercel-preview',
      allowUserLocalExecution: true
    })

    expect(context).toEqual(expect.objectContaining({
      mode: 'user-local',
      resourceOwner: 'user',
      canExecute: true,
      resolutionSource: 'requested-mode',
      chargePolicy: 'skip'
    }))
  })

  it('bloquea providers desconocidos con una razon estable', async () => {
    const context = await resolveExecutionContext({
      modelId: 'anthropic:claude-3-7-sonnet',
      requestedMode: 'auto'
    })

    expect(context).toEqual(expect.objectContaining({
      canExecute: false,
      blockReasonCode: 'unsupported_provider'
    }))
  })
})
