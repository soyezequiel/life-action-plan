import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ensureBackendEnvCredentialConfigurationMock: vi.fn(),
  listCredentialConfigurationsMock: vi.fn(),
  validateCredentialConfigurationMock: vi.fn(),
  getDeploymentModeMock: vi.fn(() => 'local')
}))

vi.mock('../src/lib/auth/credential-config', () => ({
  DEFAULT_BACKEND_OWNER_ID: 'backend-system',
  ensureBackendEnvCredentialConfiguration: mocks.ensureBackendEnvCredentialConfigurationMock,
  listCredentialConfigurations: mocks.listCredentialConfigurationsMock,
  validateCredentialConfiguration: mocks.validateCredentialConfigurationMock
}))

vi.mock('../src/lib/env/deployment', () => ({
  getDeploymentMode: mocks.getDeploymentModeMock
}))

import { listAvailableServiceModels } from '../src/lib/providers/service-model-availability'

describe('service model availability', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.getDeploymentModeMock.mockReturnValue('local')
    vi.unstubAllGlobals()
  })

  it('solo devuelve modelos del servicio que validan', async () => {
    mocks.listCredentialConfigurationsMock.mockResolvedValue([
      {
        id: 'cred-openrouter',
        providerId: 'openrouter',
        label: 'default',
        updatedAt: '2026-03-22T09:00:00.000Z'
      },
      {
        id: 'cred-openai',
        providerId: 'openai',
        label: 'default',
        updatedAt: '2026-03-22T10:00:00.000Z'
      }
    ])
    mocks.validateCredentialConfigurationMock.mockImplementation(async (credentialId: string) => {
      if (credentialId === 'cred-openai') {
        return {
          credential: {
            id: 'cred-openai',
            status: 'active'
          },
          validation: {
            status: 'active',
            validationError: null
          }
        }
      }

      return {
        credential: {
          id: 'cred-openrouter',
          status: 'invalid'
        },
        validation: {
          status: 'invalid',
          validationError: 'OPENROUTER_API_KEY_REJECTED'
        }
      }
    })
    const result = await listAvailableServiceModels()

    expect(mocks.ensureBackendEnvCredentialConfigurationMock).toHaveBeenCalledWith({
      providerId: 'openai'
    })
    expect(mocks.ensureBackendEnvCredentialConfigurationMock).toHaveBeenCalledWith({
      providerId: 'openrouter'
    })
    expect(result).toEqual([
      {
        providerId: 'openai',
        modelId: 'openai:gpt-4o-mini',
        displayName: 'OpenAI'
      }
    ])
  })

  it('devuelve vacio cuando no hay credenciales validas', async () => {
    mocks.listCredentialConfigurationsMock.mockResolvedValue([])

    const result = await listAvailableServiceModels()

    expect(result).toEqual([])
  })
})
