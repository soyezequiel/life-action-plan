import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findCredentialRecordMock: vi.fn(),
  getCredentialRecordMock: vi.fn(),
  getCredentialSecretValueMock: vi.fn(),
  listCredentialRecordsMock: vi.fn(),
  updateCredentialRecordMock: vi.fn(),
  upsertCredentialRecordMock: vi.fn(),
  getPaymentProviderMock: vi.fn()
}))

vi.mock('../src/lib/db/db-helpers', () => ({
  findCredentialRecord: mocks.findCredentialRecordMock,
  getCredentialRecord: mocks.getCredentialRecordMock,
  getCredentialSecretValue: mocks.getCredentialSecretValueMock,
  listCredentialRecords: mocks.listCredentialRecordsMock,
  updateCredentialRecord: mocks.updateCredentialRecordMock,
  upsertCredentialRecord: mocks.upsertCredentialRecordMock
}))

vi.mock('../src/lib/providers/payment-provider', () => ({
  getPaymentProvider: mocks.getPaymentProviderMock
}))

import {
  DEFAULT_BACKEND_OWNER_ID,
  findCredentialConfiguration,
  listCredentialConfigurations,
  saveCredentialConfiguration,
  validateCredentialConfiguration
} from '../src/lib/auth/credential-config'

describe('credential config service', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lista credenciales sin exponer encryptedValue y resuelve ownerId por default', async () => {
    mocks.listCredentialRecordsMock.mockResolvedValue([
      {
        id: 'cred-1',
        owner: 'user',
        ownerId: 'local-user',
        providerId: 'openai',
        secretType: 'api-key',
        label: 'default',
        encryptedValue: 'ciphertext',
        status: 'active',
        lastValidatedAt: '2026-03-21T10:00:00.000Z',
        lastValidationError: null,
        metadata: '{"scope":"build"}',
        createdAt: '2026-03-21T09:00:00.000Z',
        updatedAt: '2026-03-21T10:00:00.000Z'
      }
    ])

    const result = await listCredentialConfigurations({
      owner: 'user',
      providerId: 'openai'
    })

    expect(mocks.listCredentialRecordsMock).toHaveBeenCalledWith({
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'openai'
    })
    expect(result).toEqual([{
      id: 'cred-1',
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'openai',
      secretType: 'api-key',
      label: 'default',
      status: 'active',
      lastValidatedAt: '2026-03-21T10:00:00.000Z',
      lastValidationError: null,
      metadata: { scope: 'build' },
      createdAt: '2026-03-21T09:00:00.000Z',
      updatedAt: '2026-03-21T10:00:00.000Z'
    }])
  })

  it('guarda credenciales de backend con ownerId estable', async () => {
    mocks.upsertCredentialRecordMock.mockResolvedValue({
      id: 'cred-2',
      owner: 'backend',
      ownerId: DEFAULT_BACKEND_OWNER_ID,
      providerId: 'openrouter',
      secretType: 'api-key',
      label: 'default',
      encryptedValue: 'ciphertext',
      status: 'active',
      lastValidatedAt: null,
      lastValidationError: null,
      metadata: null,
      createdAt: '2026-03-21T09:00:00.000Z',
      updatedAt: '2026-03-21T09:00:00.000Z'
    })

    const result = await saveCredentialConfiguration({
      owner: 'backend',
      providerId: 'openrouter',
      secretType: 'api-key',
      secretValue: 'sk-or-v1-123'
    })

    expect(mocks.upsertCredentialRecordMock).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'backend',
      ownerId: DEFAULT_BACKEND_OWNER_ID,
      providerId: 'openrouter',
      secretType: 'api-key',
      secretValue: 'sk-or-v1-123'
    }))
    expect(result.id).toBe('cred-2')
    expect((result as Record<string, unknown>).encryptedValue).toBeUndefined()
  })

  it('valida una API key de OpenAI y persiste el resultado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: 'gpt-4o-mini' }]
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    })))

    mocks.getCredentialRecordMock.mockResolvedValue({
      id: 'cred-openai',
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'openai',
      secretType: 'api-key',
      label: 'default',
      encryptedValue: 'ciphertext',
      status: 'active',
      lastValidatedAt: null,
      lastValidationError: null,
      metadata: null,
      createdAt: '2026-03-21T09:00:00.000Z',
      updatedAt: '2026-03-21T09:00:00.000Z'
    })
    mocks.getCredentialSecretValueMock.mockResolvedValue('sk-test')
    mocks.updateCredentialRecordMock.mockResolvedValue({
      id: 'cred-openai',
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'openai',
      secretType: 'api-key',
      label: 'default',
      encryptedValue: 'ciphertext',
      status: 'active',
      lastValidatedAt: '2026-03-21T10:00:00.000Z',
      lastValidationError: null,
      metadata: null,
      createdAt: '2026-03-21T09:00:00.000Z',
      updatedAt: '2026-03-21T10:00:00.000Z'
    })

    const result = await validateCredentialConfiguration('cred-openai')

    expect(mocks.updateCredentialRecordMock).toHaveBeenCalledWith('cred-openai', expect.objectContaining({
      status: 'active',
      lastValidationError: null
    }))
    expect(result).toEqual(expect.objectContaining({
      credential: expect.objectContaining({
        id: 'cred-openai',
        status: 'active'
      }),
      validation: expect.objectContaining({
        status: 'active',
        validationError: null
      }),
      details: {
        sampleModel: 'gpt-4o-mini'
      }
    }))
  })

  it('normaliza una wallet NWC incompatible durante la validacion', async () => {
    const closeMock = vi.fn()

    mocks.getCredentialRecordMock.mockResolvedValue({
      id: 'cred-wallet',
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'nwc',
      secretType: 'wallet-connection',
      label: 'default',
      encryptedValue: 'ciphertext',
      status: 'active',
      lastValidatedAt: null,
      lastValidationError: null,
      metadata: null,
      createdAt: '2026-03-21T09:00:00.000Z',
      updatedAt: '2026-03-21T09:00:00.000Z'
    })
    mocks.getCredentialSecretValueMock.mockResolvedValue('nostr+walletconnect://demo')
    mocks.getPaymentProviderMock.mockReturnValue({
      getStatus: vi.fn(async () => {
        throw new Error('no info event (kind 13194) returned from relay')
      }),
      close: closeMock
    })
    mocks.updateCredentialRecordMock.mockResolvedValue({
      id: 'cred-wallet',
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'nwc',
      secretType: 'wallet-connection',
      label: 'default',
      encryptedValue: 'ciphertext',
      status: 'invalid',
      lastValidatedAt: '2026-03-21T10:00:00.000Z',
      lastValidationError: 'WALLET_NWC_INFO_UNAVAILABLE',
      metadata: null,
      createdAt: '2026-03-21T09:00:00.000Z',
      updatedAt: '2026-03-21T10:00:00.000Z'
    })

    const result = await validateCredentialConfiguration('cred-wallet')

    expect(closeMock).toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({
      credential: expect.objectContaining({
        id: 'cred-wallet',
        status: 'invalid'
      }),
      validation: expect.objectContaining({
        status: 'invalid',
        validationError: 'WALLET_NWC_INFO_UNAVAILABLE'
      })
    }))
  })

  it('encuentra una credencial por locator resolviendo ownerId implicito', async () => {
    mocks.findCredentialRecordMock.mockResolvedValue({
      id: 'cred-3',
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'openrouter',
      secretType: 'api-key',
      label: 'openrouter-api-key',
      encryptedValue: 'ciphertext',
      status: 'active',
      lastValidatedAt: null,
      lastValidationError: null,
      metadata: null,
      createdAt: '2026-03-21T09:00:00.000Z',
      updatedAt: '2026-03-21T09:00:00.000Z'
    })

    const result = await findCredentialConfiguration({
      owner: 'user',
      providerId: 'openrouter',
      secretType: 'api-key',
      label: 'openrouter-api-key'
    })

    expect(mocks.findCredentialRecordMock).toHaveBeenCalledWith({
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'openrouter',
      secretType: 'api-key',
      label: 'openrouter-api-key'
    })
    expect(result?.id).toBe('cred-3')
  })
})
