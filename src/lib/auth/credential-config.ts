import { DateTime } from 'luxon'
import { DEFAULT_CREDENTIAL_LABEL } from '../../shared/schemas'
import type {
  CredentialLocator,
  CredentialOwner,
  CredentialRecordStatus,
  CredentialRecordView,
  CredentialSecretType,
  CredentialValidationResult
} from '../../shared/types/credential-registry'
import {
  findCredentialRecord,
  getCredentialRecord,
  getCredentialSecretValue,
  listCredentialRecords,
  updateCredentialRecord,
  upsertCredentialRecord
} from '../db/db-helpers'
import { getPaymentProvider } from '../providers/payment-provider'
import { getCloudApiKeyEnvName } from '../providers/provider-metadata'
import { DEFAULT_USER_ID } from './user-settings'
import { normalizeWalletConnectionError } from '../payments/wallet-errors'

const OPENAI_KEY_VALIDATION_URL = 'https://api.openai.com/v1/models?limit=1'
const OPENROUTER_KEY_VALIDATION_URL = 'https://openrouter.ai/api/v1/key'
const CREDENTIAL_VALIDATION_TIMEOUT_MS = 10_000

export const DEFAULT_BACKEND_OWNER_ID = 'backend-system'

type CredentialMetadata = Record<string, unknown> | Array<unknown> | null

interface ListCredentialConfigurationsFilters {
  owner?: CredentialOwner
  ownerId?: string
  providerId?: string
  secretType?: CredentialSecretType
  status?: CredentialRecordStatus
  label?: string
}

interface SaveCredentialConfigurationInput {
  owner: CredentialOwner
  ownerId?: string
  providerId: string
  secretType: CredentialSecretType
  label?: string | null
  secretValue: string
  status?: CredentialRecordStatus
  metadata?: CredentialMetadata
}

interface UpdateCredentialConfigurationInput {
  label?: string | null
  secretValue?: string
  status?: CredentialRecordStatus
  metadata?: CredentialMetadata
}

interface CredentialValidationAttempt {
  credential: CredentialRecordView
  validation: CredentialValidationResult
  details: Record<string, unknown> | null
}

interface ValidatorOutcome {
  kind: 'valid' | 'invalid' | 'error'
  validationError: string | null
  details?: Record<string, unknown> | null
}

type CredentialLocatorInput = Omit<CredentialLocator, 'ownerId'> & {
  ownerId?: string
}

function now(): string {
  return DateTime.utc().toISO()!
}

function resolveOwnerId(owner: CredentialOwner, ownerId?: string): string {
  const trimmed = ownerId?.trim()

  if (trimmed) {
    return trimmed
  }

  return owner === 'backend' ? DEFAULT_BACKEND_OWNER_ID : DEFAULT_USER_ID
}

function parseMetadata(metadata: string | null): CredentialMetadata {
  if (!metadata) {
    return null
  }

  try {
    return JSON.parse(metadata) as CredentialMetadata
  } catch {
    return null
  }
}

function toCredentialView(record: Awaited<ReturnType<typeof getCredentialRecord>> extends infer TResult
  ? TResult extends null
    ? never
    : Exclude<TResult, null>
  : never): CredentialRecordView {
  return {
    id: record.id,
    owner: record.owner,
    ownerId: record.ownerId,
    providerId: record.providerId,
    secretType: record.secretType,
    label: record.label,
    status: record.status,
    lastValidatedAt: record.lastValidatedAt,
    lastValidationError: record.lastValidationError,
    metadata: parseMetadata(record.metadata),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, CREDENTIAL_VALIDATION_TIMEOUT_MS)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function validateOpenAIApiKey(secretValue: string): Promise<ValidatorOutcome> {
  try {
    const response = await fetchWithTimeout(OPENAI_KEY_VALIDATION_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretValue}`
      }
    })

    if (response.ok) {
      const payload = await response.json().catch(() => null) as { data?: Array<{ id?: string }> } | null

      return {
        kind: 'valid',
        validationError: null,
        details: {
          sampleModel: payload?.data?.[0]?.id ?? null
        }
      }
    }

    if (response.status === 401 || response.status === 403) {
      return {
        kind: 'invalid',
        validationError: 'OPENAI_API_KEY_REJECTED'
      }
    }

    return {
      kind: 'error',
      validationError: `OPENAI_API_KEY_VALIDATION_FAILED_${response.status}`
    }
  } catch {
    return {
      kind: 'error',
      validationError: 'OPENAI_API_KEY_VALIDATION_FAILED'
    }
  }
}

async function validateOpenRouterApiKey(secretValue: string): Promise<ValidatorOutcome> {
  try {
    const response = await fetchWithTimeout(OPENROUTER_KEY_VALIDATION_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretValue}`
      }
    })

    if (response.ok) {
      const payload = await response.json().catch(() => null) as { data?: { label?: string; limit?: number | null } } | null

      return {
        kind: 'valid',
        validationError: null,
        details: {
          label: payload?.data?.label ?? null,
          creditLimit: payload?.data?.limit ?? null
        }
      }
    }

    if (response.status === 401 || response.status === 403) {
      return {
        kind: 'invalid',
        validationError: 'OPENROUTER_API_KEY_REJECTED'
      }
    }

    return {
      kind: 'error',
      validationError: `OPENROUTER_API_KEY_VALIDATION_FAILED_${response.status}`
    }
  } catch {
    return {
      kind: 'error',
      validationError: 'OPENROUTER_API_KEY_VALIDATION_FAILED'
    }
  }
}

async function validateWalletConnection(secretValue: string): Promise<ValidatorOutcome> {
  let provider: ReturnType<typeof getPaymentProvider> | null = null

  try {
    provider = getPaymentProvider('nwc', { connectionUrl: secretValue })
    const snapshot = await provider.getStatus({
      includeBalance: false,
      includeBudget: false
    })

    return {
      kind: 'valid',
      validationError: null,
      details: {
        alias: snapshot.alias,
        network: snapshot.network,
        methods: snapshot.methods
      }
    }
  } catch (error) {
    const normalizedError = normalizeWalletConnectionError(error)

    if (
      normalizedError === 'INVALID_NWC_URL' ||
      normalizedError === 'WALLET_NWC_INFO_UNAVAILABLE'
    ) {
      return {
        kind: 'invalid',
        validationError: normalizedError
      }
    }

    return {
      kind: 'error',
      validationError: normalizedError || 'WALLET_CONNECTION_VALIDATION_FAILED'
    }
  } finally {
    provider?.close()
  }
}

async function validateSecretValue(
  providerId: string,
  secretType: CredentialSecretType,
  secretValue: string
): Promise<ValidatorOutcome> {
  if (secretType === 'api-key' && providerId === 'openai') {
    return validateOpenAIApiKey(secretValue)
  }

  if (secretType === 'api-key' && providerId === 'openrouter') {
    return validateOpenRouterApiKey(secretValue)
  }

  if (secretType === 'wallet-connection' && providerId === 'nwc') {
    return validateWalletConnection(secretValue)
  }

  return {
    kind: 'error',
    validationError: 'CREDENTIAL_VALIDATION_UNSUPPORTED'
  }
}

function resolveStatusAfterValidation(
  currentStatus: CredentialRecordStatus,
  outcome: ValidatorOutcome
): CredentialRecordStatus {
  if (outcome.kind === 'invalid') {
    return 'invalid'
  }

  if (outcome.kind === 'valid') {
    return currentStatus === 'inactive' ? 'inactive' : 'active'
  }

  return currentStatus
}

function toValidationResult(
  status: CredentialRecordStatus,
  validatedAt: string,
  validationError: string | null
): CredentialValidationResult {
  return {
    status,
    validatedAt,
    validationError
  }
}

export function resolveCredentialLocator(locator: CredentialLocatorInput): CredentialLocator {
  return {
    owner: locator.owner,
    ownerId: resolveOwnerId(locator.owner, locator.ownerId),
    providerId: locator.providerId.trim(),
    secretType: locator.secretType,
    label: locator.label?.trim() || DEFAULT_CREDENTIAL_LABEL
  }
}

export async function listCredentialConfigurations(
  filters: ListCredentialConfigurationsFilters = {}
): Promise<CredentialRecordView[]> {
  const records = await listCredentialRecords({
    ...filters,
    ownerId: filters.owner ? resolveOwnerId(filters.owner, filters.ownerId) : filters.ownerId?.trim()
  })

  return records.map((record) => toCredentialView(record))
}

export async function getCredentialConfiguration(id: string): Promise<CredentialRecordView | null> {
  const record = await getCredentialRecord(id)
  return record ? toCredentialView(record) : null
}

export async function getCredentialConfigurationSecret(id: string): Promise<string | null> {
  const record = await getCredentialRecord(id)

  if (!record || record.status !== 'active') {
    return null
  }

  return getCredentialSecretValue(id)
}

export async function findCredentialConfiguration(locator: CredentialLocatorInput): Promise<CredentialRecordView | null> {
  const record = await findCredentialRecord(resolveCredentialLocator(locator))
  return record ? toCredentialView(record) : null
}

export async function saveCredentialConfiguration(
  input: SaveCredentialConfigurationInput
): Promise<CredentialRecordView> {
  const record = await upsertCredentialRecord({
    owner: input.owner,
    ownerId: resolveOwnerId(input.owner, input.ownerId),
    providerId: input.providerId.trim(),
    secretType: input.secretType,
    label: input.label,
    secretValue: input.secretValue,
    status: input.status,
    metadata: input.metadata
  })

  return toCredentialView(record)
}

export async function updateCredentialConfiguration(
  id: string,
  input: UpdateCredentialConfigurationInput
): Promise<CredentialRecordView | null> {
  const record = await updateCredentialRecord(id, {
    label: input.label,
    secretValue: input.secretValue,
    status: input.status,
    metadata: input.metadata
  })

  return record ? toCredentialView(record) : null
}

export async function validateCredentialConfiguration(id: string): Promise<CredentialValidationAttempt | null> {
  const record = await getCredentialRecord(id)

  if (!record) {
    return null
  }

  const secretValue = await getCredentialSecretValue(id)
  const validatedAt = now()

  if (!secretValue) {
    const updated = await updateCredentialRecord(id, {
      status: 'invalid',
      lastValidatedAt: validatedAt,
      lastValidationError: 'CREDENTIAL_SECRET_UNAVAILABLE'
    })
    const nextRecord = updated ?? record

    return {
      credential: toCredentialView(nextRecord),
      validation: toValidationResult(nextRecord.status, validatedAt, 'CREDENTIAL_SECRET_UNAVAILABLE'),
      details: null
    }
  }

  const outcome = await validateSecretValue(record.providerId, record.secretType, secretValue)
  const nextStatus = resolveStatusAfterValidation(record.status, outcome)
  const updated = await updateCredentialRecord(id, {
    status: nextStatus,
    lastValidatedAt: validatedAt,
    lastValidationError: outcome.validationError
  })
  const nextRecord = updated ?? record

  return {
    credential: toCredentialView(nextRecord),
    validation: toValidationResult(nextStatus, validatedAt, outcome.validationError),
    details: outcome.details ?? null
  }
}

export async function ensureBackendEnvCredentialConfiguration(input: {
  providerId: 'openai' | 'openrouter'
  ownerId?: string
  label?: string | null
}): Promise<CredentialRecordView | null> {
  const envName = getCloudApiKeyEnvName(`${input.providerId}:bootstrap`)
  const secretValue = envName ? process.env[envName]?.trim() || '' : ''

  if (!envName || !secretValue) {
    return null
  }

  const ownerId = resolveOwnerId('backend', input.ownerId)
  const label = input.label?.trim() || DEFAULT_CREDENTIAL_LABEL
  const existing = await findCredentialConfiguration({
    owner: 'backend',
    ownerId,
    providerId: input.providerId,
    secretType: 'api-key',
    label
  })

  if (existing?.status === 'active') {
    return existing
  }

  return saveCredentialConfiguration({
    owner: 'backend',
    ownerId,
    providerId: input.providerId,
    secretType: 'api-key',
    label,
    secretValue,
    status: 'active',
    metadata: {
      provisionedBy: 'env-bootstrap',
      envName,
      syncedAt: now()
    }
  })
}
