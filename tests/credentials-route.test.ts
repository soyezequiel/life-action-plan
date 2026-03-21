import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listCredentialConfigurationsMock: vi.fn(),
  saveCredentialConfigurationMock: vi.fn(),
  getCredentialConfigurationMock: vi.fn(),
  updateCredentialConfigurationMock: vi.fn(),
  validateCredentialConfigurationMock: vi.fn()
}))

vi.mock('../src/lib/auth/credential-config', () => ({
  listCredentialConfigurations: mocks.listCredentialConfigurationsMock,
  saveCredentialConfiguration: mocks.saveCredentialConfigurationMock,
  getCredentialConfiguration: mocks.getCredentialConfigurationMock,
  updateCredentialConfiguration: mocks.updateCredentialConfigurationMock,
  validateCredentialConfiguration: mocks.validateCredentialConfigurationMock
}))

import { GET as listCredentials, POST as saveCredential } from '../app/api/settings/credentials/route'
import { GET as getCredential, PATCH as updateCredential } from '../app/api/settings/credentials/[credentialId]/route'
import { POST as validateCredential } from '../app/api/settings/credentials/[credentialId]/validate/route'

describe('credentials routes', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
  })

  it('lista credenciales con filtros parseados', async () => {
    mocks.listCredentialConfigurationsMock.mockResolvedValue([
      {
        id: 'cred-1',
        owner: 'backend',
        ownerId: 'backend-system',
        providerId: 'openai',
        secretType: 'api-key',
        label: 'default',
        status: 'active',
        lastValidatedAt: null,
        lastValidationError: null,
        metadata: null,
        createdAt: '2026-03-21T09:00:00.000Z',
        updatedAt: '2026-03-21T09:00:00.000Z'
      }
    ])

    const response = await listCredentials(new Request('http://localhost/api/settings/credentials?owner=backend&providerId=openai'))
    const body = await response.json()

    expect(mocks.listCredentialConfigurationsMock).toHaveBeenCalledWith({
      owner: 'backend',
      providerId: 'openai'
    })
    expect(body).toEqual({
      success: true,
      credentials: [expect.objectContaining({ id: 'cred-1', providerId: 'openai' })]
    })
  })

  it('guarda una credencial nueva', async () => {
    mocks.saveCredentialConfigurationMock.mockResolvedValue({
      id: 'cred-2',
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'openrouter',
      secretType: 'api-key',
      label: 'default',
      status: 'active',
      lastValidatedAt: null,
      lastValidationError: null,
      metadata: null,
      createdAt: '2026-03-21T09:00:00.000Z',
      updatedAt: '2026-03-21T09:00:00.000Z'
    })

    const response = await saveCredential(new Request('http://localhost/api/settings/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: 'user',
        providerId: 'openrouter',
        secretType: 'api-key',
        secretValue: 'sk-or-v1-123'
      })
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.saveCredentialConfigurationMock).toHaveBeenCalledWith({
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'openrouter',
      secretType: 'api-key',
      secretValue: 'sk-or-v1-123'
    })
    expect(body).toEqual({
      success: true,
      credential: expect.objectContaining({ id: 'cred-2' })
    })
  })

  it('obtiene una credencial puntual', async () => {
    mocks.getCredentialConfigurationMock.mockResolvedValue({
      id: 'cred-3',
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'nwc',
      secretType: 'wallet-connection',
      label: 'default',
      status: 'active',
      lastValidatedAt: null,
      lastValidationError: null,
      metadata: null,
      createdAt: '2026-03-21T09:00:00.000Z',
      updatedAt: '2026-03-21T09:00:00.000Z'
    })

    const response = await getCredential(new Request('http://localhost/api/settings/credentials/cred-3'), {
      params: Promise.resolve({ credentialId: 'cred-3' })
    })
    const body = await response.json()

    expect(body).toEqual({
      success: true,
      credential: expect.objectContaining({ id: 'cred-3' })
    })
  })

  it('actualiza una credencial existente', async () => {
    mocks.getCredentialConfigurationMock.mockResolvedValue({
      id: 'cred-4',
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'openai',
      secretType: 'api-key',
      label: 'mi-key',
      status: 'active',
      lastValidatedAt: null,
      lastValidationError: null,
      metadata: null,
      createdAt: '2026-03-21T09:00:00.000Z',
      updatedAt: '2026-03-21T09:00:00.000Z'
    })
    mocks.updateCredentialConfigurationMock.mockResolvedValue({
      id: 'cred-4',
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'openai',
      secretType: 'api-key',
      label: 'mi-key',
      status: 'inactive',
      lastValidatedAt: null,
      lastValidationError: null,
      metadata: null,
      createdAt: '2026-03-21T09:00:00.000Z',
      updatedAt: '2026-03-21T09:00:00.000Z'
    })

    const response = await updateCredential(new Request('http://localhost/api/settings/credentials/cred-4', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'inactive'
      })
    }), {
      params: Promise.resolve({ credentialId: 'cred-4' })
    })
    const body = await response.json()

    expect(mocks.updateCredentialConfigurationMock).toHaveBeenCalledWith('cred-4', {
      status: 'inactive'
    })
    expect(body).toEqual({
      success: true,
      credential: expect.objectContaining({ id: 'cred-4', status: 'inactive' })
    })
  })

  it('valida una credencial por id', async () => {
    mocks.getCredentialConfigurationMock.mockResolvedValue({
      id: 'cred-5',
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'openai',
      secretType: 'api-key',
      label: 'default',
      status: 'active',
      lastValidatedAt: '2026-03-21T10:00:00.000Z',
      lastValidationError: null,
      metadata: null,
      createdAt: '2026-03-21T09:00:00.000Z',
      updatedAt: '2026-03-21T10:00:00.000Z'
    })
    mocks.validateCredentialConfigurationMock.mockResolvedValue({
      credential: {
        id: 'cred-5',
        owner: 'user',
        ownerId: 'local-user',
        providerId: 'openai',
        secretType: 'api-key',
        label: 'default',
        status: 'active',
        lastValidatedAt: '2026-03-21T10:00:00.000Z',
        lastValidationError: null,
        metadata: null,
        createdAt: '2026-03-21T09:00:00.000Z',
        updatedAt: '2026-03-21T10:00:00.000Z'
      },
      validation: {
        status: 'active',
        validatedAt: '2026-03-21T10:00:00.000Z',
        validationError: null
      },
      details: {
        sampleModel: 'gpt-4o-mini'
      }
    })

    const response = await validateCredential(new Request('http://localhost/api/settings/credentials/cred-5/validate', {
      method: 'POST'
    }), {
      params: Promise.resolve({ credentialId: 'cred-5' })
    })
    const body = await response.json()

    expect(body).toEqual({
      success: true,
      credential: expect.objectContaining({ id: 'cred-5' }),
      validation: expect.objectContaining({ status: 'active' }),
      details: {
        sampleModel: 'gpt-4o-mini'
      }
    })
  })
})
