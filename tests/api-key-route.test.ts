import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findCredentialConfigurationMock: vi.fn(),
  saveCredentialConfigurationMock: vi.fn(),
  updateCredentialConfigurationMock: vi.fn(),
  isSecretStorageAvailableMock: vi.fn(() => true)
}))

vi.mock('../src/lib/auth/credential-config', () => ({
  findCredentialConfiguration: mocks.findCredentialConfigurationMock,
  saveCredentialConfiguration: mocks.saveCredentialConfigurationMock,
  updateCredentialConfiguration: mocks.updateCredentialConfigurationMock
}))

vi.mock('../src/lib/auth/secret-storage', () => ({
  isSecretStorageAvailable: mocks.isSecretStorageAvailableMock
}))

import { DELETE, GET, POST } from '../app/api/settings/api-key/route'

describe('api key route compatibility wrapper', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.isSecretStorageAvailableMock.mockReturnValue(true)
  })

  it('reporta configurada solo una credencial activa', async () => {
    mocks.findCredentialConfigurationMock.mockResolvedValue({
      id: 'cred-1',
      status: 'active'
    })

    const response = await GET(new Request('http://localhost/api/settings/api-key?provider=openrouter'))
    const body = await response.json()

    expect(mocks.findCredentialConfigurationMock).toHaveBeenCalledWith({
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'openrouter',
      secretType: 'api-key',
      label: 'openrouter-api-key'
    })
    expect(body).toEqual({
      provider: 'openrouter',
      configured: true
    })
  })

  it('guarda la API key en el registro unificado', async () => {
    const response = await POST(new Request('http://localhost/api/settings/api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        apiKey: 'sk-test'
      })
    }))
    const body = await response.json()

    expect(mocks.saveCredentialConfigurationMock).toHaveBeenCalledWith({
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'openai',
      secretType: 'api-key',
      label: 'openai-api-key',
      secretValue: 'sk-test',
      status: 'active'
    })
    expect(body).toEqual({
      success: true,
      provider: 'openai',
      configured: true
    })
  })

  it('desactiva la credencial al borrar la configuracion', async () => {
    mocks.findCredentialConfigurationMock.mockResolvedValue({
      id: 'cred-2',
      status: 'active'
    })

    const response = await DELETE(new Request('http://localhost/api/settings/api-key?provider=openrouter', {
      method: 'DELETE'
    }))
    const body = await response.json()

    expect(mocks.updateCredentialConfigurationMock).toHaveBeenCalledWith('cred-2', {
      status: 'inactive'
    })
    expect(body).toEqual({
      success: true,
      provider: 'openrouter',
      configured: false
    })
  })
})
