import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const values = vi.fn(() => ({}))
const insert = vi.fn(() => ({ values }))
const updateWhere = vi.fn()
const updateSet = vi.fn(() => ({ where: updateWhere }))
const update = vi.fn(() => ({ set: updateSet }))
const where = vi.fn()
const from = vi.fn(() => ({ where }))
const select = vi.fn(() => ({ from }))

vi.mock('../src/lib/db/connection', () => ({
  getDatabase: () => ({
    select,
    insert,
    update
  })
}))

import { encryptSecret } from '../src/lib/auth/secret-storage'
import {
  getCredentialSecretValue,
  listCredentialRecords,
  recordCredentialValidationResult,
  upsertCredentialRecord
} from '../src/lib/db/db-helpers'

describe('credential registry', () => {
  beforeEach(() => {
    process.env.API_KEY_ENCRYPTION_SECRET = 'test-secret'
    values.mockClear()
    insert.mockClear()
    update.mockClear()
    updateSet.mockClear()
    updateWhere.mockReset()
    where.mockReset()
    from.mockClear()
    select.mockClear()
  })

  afterEach(() => {
    delete process.env.API_KEY_ENCRYPTION_SECRET
  })

  it('inserta una credencial nueva con label default y valor encriptado', async () => {
    where.mockResolvedValueOnce([])

    const record = await upsertCredentialRecord({
      owner: 'backend',
      ownerId: 'system',
      providerId: 'openrouter',
      secretType: 'api-key',
      secretValue: 'or-key-123'
    })

    expect(insert).toHaveBeenCalled()
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'backend',
      ownerId: 'system',
      providerId: 'openrouter',
      secretType: 'api-key',
      label: 'default',
      status: 'active'
    }))
    expect(record.label).toBe('default')
    expect(record.encryptedValue).not.toBe('or-key-123')
    expect(record.status).toBe('active')
  })

  it('actualiza una credencial existente cuando coincide el locator', async () => {
    const existingRow = {
      id: 'cred-1',
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'openai',
      secretType: 'api-key',
      label: 'default',
      encryptedValue: encryptSecret('old-key'),
      status: 'active',
      lastValidatedAt: null,
      lastValidationError: null,
      metadata: null,
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:00.000Z'
    }
    const updatedRow = {
      ...existingRow,
      encryptedValue: encryptSecret('new-key'),
      metadata: { source: 'test' },
      updatedAt: '2026-03-21T00:10:00.000Z'
    }

    where
      .mockResolvedValueOnce([existingRow])
      .mockResolvedValueOnce([updatedRow])
    updateWhere.mockResolvedValueOnce(undefined)

    const record = await upsertCredentialRecord({
      owner: 'user',
      ownerId: 'local-user',
      providerId: 'openai',
      secretType: 'api-key',
      secretValue: 'new-key',
      metadata: { source: 'test' }
    })

    expect(insert).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalled()
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      encryptedValue: expect.any(String),
      metadata: { source: 'test' }
    }))
    expect(record.id).toBe('cred-1')
    expect(record.metadata).toBe(JSON.stringify({ source: 'test' }))
  })

  it('lista credenciales filtradas y serializa metadata a string', async () => {
    where.mockResolvedValueOnce([
      {
        id: 'cred-2',
        owner: 'backend',
        ownerId: 'system',
        providerId: 'ollama',
        secretType: 'custom',
        label: 'runtime',
        encryptedValue: encryptSecret('local-runtime'),
        status: 'inactive',
        lastValidatedAt: null,
        lastValidationError: 'disabled',
        metadata: { executionTarget: 'backend-local' },
        createdAt: '2026-03-21T00:00:00.000Z',
        updatedAt: '2026-03-21T00:00:00.000Z'
      }
    ])

    const records = await listCredentialRecords({
      owner: 'backend',
      status: 'inactive'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      providerId: 'ollama',
      status: 'inactive',
      metadata: JSON.stringify({ executionTarget: 'backend-local' })
    })
  })

  it('registra el resultado de validacion con timestamp y error', async () => {
    const updatedRow = {
      id: 'cred-3',
      owner: 'backend',
      ownerId: 'system',
      providerId: 'openrouter',
      secretType: 'api-key',
      label: 'default',
      encryptedValue: encryptSecret('or-key'),
      status: 'invalid',
      lastValidatedAt: '2026-03-21T00:00:00.000Z',
      lastValidationError: '401',
      metadata: null,
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:00.000Z'
    }

    updateWhere.mockResolvedValueOnce(undefined)
    where.mockResolvedValueOnce([updatedRow])

    const record = await recordCredentialValidationResult('cred-3', 'invalid', '401')

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      status: 'invalid',
      lastValidationError: '401',
      lastValidatedAt: expect.any(String)
    }))
    expect(record?.status).toBe('invalid')
  })

  it('desencripta el valor guardado de una credencial', async () => {
    where.mockResolvedValueOnce([
      {
        id: 'cred-4',
        owner: 'user',
        ownerId: 'local-user',
        providerId: 'openrouter',
        secretType: 'api-key',
        label: 'default',
        encryptedValue: encryptSecret('visible-secret'),
        status: 'active',
        lastValidatedAt: null,
        lastValidationError: null,
        metadata: null,
        createdAt: '2026-03-21T00:00:00.000Z',
        updatedAt: '2026-03-21T00:00:00.000Z'
      }
    ])

    await expect(getCredentialSecretValue('cred-4')).resolves.toBe('visible-secret')
  })
})
