import { DEFAULT_CREDENTIAL_LABEL, getExecutionModeSpec, resolvedExecutionContextSchema } from '../../shared/schemas'
import type {
  ExecutionBlockReason,
  ExecutionMode,
  ExecutionResolutionSource,
  ProviderDescriptor,
  ResolvedExecutionContext
} from '../../shared/types/execution-context'
import {
  findCredentialConfiguration,
  DEFAULT_BACKEND_OWNER_ID,
  ensureBackendEnvCredentialConfiguration,
  getCredentialConfiguration,
  listCredentialConfigurations
} from '../auth/credential-config'
import { DEFAULT_USER_ID, getApiKeySettingKey, type CloudApiKeyProvider } from '../auth/user-settings'
import { canUseLocalOllama, getDeploymentMode, type DeploymentMode } from '../env/deployment'
import { getModelProviderName, isCloudModel, isLocalModel } from '../providers/provider-metadata'

type RequestedExecutionMode = ExecutionMode | 'auto'

interface ResolveExecutionContextInput {
  modelId: string
  requestedMode?: RequestedExecutionMode | null
  deploymentMode?: DeploymentMode
  userId?: string
  backendOwnerId?: string
  userSuppliedApiKey?: string | null
  backendCredentialId?: string | null
  userStoredCredentialLabel?: string | null
  backendStoredCredentialLabel?: string | null
  allowUserLocalExecution?: boolean
}

interface StoredCredentialCandidate {
  credentialSource: 'backend-stored' | 'user-stored'
  credentialId: string
}

function canUseCodexServiceMode(deploymentMode: DeploymentMode): boolean {
  const override = process.env.LAP_ENABLE_CODEX_SERVICE_MODE?.trim().toLowerCase() || ''

  if (override === '1' || override === 'true') {
    return true
  }

  return deploymentMode === 'local'
}

async function findSpecificStoredCredential(input: {
  credentialId: string
  owner: 'backend' | 'user'
  ownerId: string
  providerId: string
}): Promise<StoredCredentialCandidate | null> {
  const credential = await getCredentialConfiguration(input.credentialId)

  if (!credential) {
    return null
  }

  if (
    credential.owner !== input.owner
    || credential.ownerId !== input.ownerId
    || credential.providerId !== input.providerId
    || credential.secretType !== 'api-key'
    || credential.status !== 'active'
  ) {
    return null
  }

  return {
    credentialSource: input.owner === 'backend' ? 'backend-stored' : 'user-stored',
    credentialId: credential.id
  }
}

function createBlockedContext(input: {
  mode: ExecutionMode
  provider: ProviderDescriptor
  credentialSource: ResolvedExecutionContext['credentialSource']
  resolutionSource: ExecutionResolutionSource
  blockReasonCode: ExecutionBlockReason
  blockReasonDetail: string
}): ResolvedExecutionContext {
  const modeSpec = getExecutionModeSpec(input.mode)

  return resolvedExecutionContextSchema.parse({
    mode: modeSpec.mode,
    resourceOwner: modeSpec.resourceOwner,
    executionTarget: modeSpec.executionTarget,
    credentialSource: input.credentialSource,
    provider: input.provider,
    chargePolicy: modeSpec.chargePolicy,
    chargeReason: modeSpec.chargeReason,
    credentialId: null,
    canExecute: false,
    resolutionSource: input.resolutionSource,
    blockReasonCode: input.blockReasonCode,
    blockReasonDetail: input.blockReasonDetail
  })
}

function createExecutableContext(input: {
  mode: ExecutionMode
  provider: ProviderDescriptor
  credentialSource: ResolvedExecutionContext['credentialSource']
  credentialId: string | null
  resolutionSource: ExecutionResolutionSource
}): ResolvedExecutionContext {
  const modeSpec = getExecutionModeSpec(input.mode)

  return resolvedExecutionContextSchema.parse({
    mode: modeSpec.mode,
    resourceOwner: modeSpec.resourceOwner,
    executionTarget: modeSpec.executionTarget,
    credentialSource: input.credentialSource,
    provider: input.provider,
    chargePolicy: modeSpec.chargePolicy,
    chargeReason: modeSpec.chargeReason,
    credentialId: input.credentialId,
    canExecute: true,
    resolutionSource: input.resolutionSource,
    blockReasonCode: null,
    blockReasonDetail: null
  })
}

function getProviderDescriptor(modelId: string): ProviderDescriptor | null {
  const normalizedModelId = modelId.trim()
  const providerId = getModelProviderName(normalizedModelId)

  if (!normalizedModelId || providerId === 'unknown') {
    return null
  }

  return {
    providerId,
    modelId: normalizedModelId,
    providerKind: isLocalModel(normalizedModelId) ? 'local' : 'cloud'
  }
}

function getUserCloudCredentialLabels(providerId: CloudApiKeyProvider, explicitLabel?: string | null): string[] {
  const candidates = [
    explicitLabel?.trim() || '',
    DEFAULT_CREDENTIAL_LABEL,
    getApiKeySettingKey(providerId)
  ]

  return Array.from(new Set(candidates.filter(Boolean)))
}

function getBackendCloudCredentialLabels(explicitLabel?: string | null): string[] {
  const candidates = [
    explicitLabel?.trim() || '',
    DEFAULT_CREDENTIAL_LABEL
  ]

  return Array.from(new Set(candidates.filter(Boolean)))
}

async function findActiveCredentialByLabels(input: {
  owner: 'backend' | 'user'
  ownerId: string
  providerId: string
  labels: string[]
}): Promise<StoredCredentialCandidate | null> {
  for (const label of input.labels) {
    const credential = await findCredentialConfiguration({
      owner: input.owner,
      ownerId: input.ownerId,
      providerId: input.providerId,
      secretType: 'api-key',
      label
    })

    if (credential?.status === 'active') {
      return {
        credentialSource: input.owner === 'backend' ? 'backend-stored' : 'user-stored',
        credentialId: credential.id
      }
    }
  }

  if (input.owner === 'backend' && (input.providerId === 'openai' || input.providerId === 'openrouter')) {
    for (const label of input.labels) {
      const credential = await ensureBackendEnvCredentialConfiguration({
        providerId: input.providerId,
        ownerId: input.ownerId,
        label
      })

      if (credential?.status === 'active') {
        return {
          credentialSource: 'backend-stored',
          credentialId: credential.id
        }
      }
    }
  }

  return null
}

async function findAnyActiveBackendCredential(input: {
  ownerId: string
  providerId: string
}): Promise<StoredCredentialCandidate | null> {
  const credentials = await listCredentialConfigurations({
    owner: 'backend',
    ownerId: input.ownerId,
    providerId: input.providerId,
    secretType: 'api-key',
    status: 'active'
  })
  const credential = credentials
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.label.localeCompare(right.label))[0]

  if (!credential) {
    return null
  }

  return {
    credentialSource: 'backend-stored',
    credentialId: credential.id
  }
}

async function resolveCloudRequestedMode(input: {
  provider: ProviderDescriptor
  requestedMode: 'backend-cloud' | 'user-cloud' | 'codex-cloud'
  deploymentMode: DeploymentMode
  userSuppliedApiKey: string
  userId: string
  backendOwnerId: string
  backendCredentialId?: string | null
  userStoredCredentialLabel?: string | null
  backendStoredCredentialLabel?: string | null
}): Promise<ResolvedExecutionContext> {
  const providerId = input.provider.providerId as CloudApiKeyProvider

  if (input.requestedMode === 'user-cloud') {
    if (input.userSuppliedApiKey) {
      return createExecutableContext({
        mode: 'user-cloud',
        provider: input.provider,
        credentialSource: 'user-supplied',
        credentialId: null,
        resolutionSource: 'requested-mode'
      })
    }

    const storedCredential = await findActiveCredentialByLabels({
      owner: 'user',
      ownerId: input.userId,
      providerId,
      labels: getUserCloudCredentialLabels(providerId, input.userStoredCredentialLabel)
    })

    if (storedCredential) {
      return createExecutableContext({
        mode: 'user-cloud',
        provider: input.provider,
        credentialSource: storedCredential.credentialSource,
        credentialId: storedCredential.credentialId,
        resolutionSource: 'requested-mode'
      })
    }

    return createBlockedContext({
      mode: 'user-cloud',
      provider: input.provider,
      credentialSource: 'user-stored',
      resolutionSource: 'requested-mode',
      blockReasonCode: 'user_credential_missing',
      blockReasonDetail: `No active user credential is configured for provider ${providerId}.`
    })
  }

  if (input.requestedMode === 'codex-cloud' && !canUseCodexServiceMode(input.deploymentMode)) {
    return createBlockedContext({
      mode: 'codex-cloud',
      provider: input.provider,
      credentialSource: 'backend-stored',
      resolutionSource: 'requested-mode',
      blockReasonCode: 'codex_mode_unavailable',
      blockReasonDetail: 'Codex service mode is only available in local development unless explicitly enabled.'
    })
  }

  const requestedBackendCredentialId = input.backendCredentialId?.trim() || ''

  if (requestedBackendCredentialId) {
    const specificCredential = await findSpecificStoredCredential({
      credentialId: requestedBackendCredentialId,
      owner: 'backend',
      ownerId: input.backendOwnerId,
      providerId
    })

    if (specificCredential) {
      return createExecutableContext({
        mode: input.requestedMode,
        provider: input.provider,
        credentialSource: specificCredential.credentialSource,
        credentialId: specificCredential.credentialId,
        resolutionSource: 'requested-mode'
      })
    }

    return createBlockedContext({
      mode: input.requestedMode,
      provider: input.provider,
      credentialSource: 'backend-stored',
      resolutionSource: 'requested-mode',
      blockReasonCode: 'backend_credential_missing',
      blockReasonDetail: `Selected backend credential ${requestedBackendCredentialId} is unavailable for provider ${providerId}.`
    })
  }

  const backendCredential = await findActiveCredentialByLabels({
    owner: 'backend',
    ownerId: input.backendOwnerId,
    providerId,
    labels: getBackendCloudCredentialLabels(input.backendStoredCredentialLabel)
  })

  if (backendCredential) {
    return createExecutableContext({
      mode: input.requestedMode,
      provider: input.provider,
      credentialSource: backendCredential.credentialSource,
      credentialId: backendCredential.credentialId,
      resolutionSource: 'requested-mode'
    })
  }

  if (!input.backendStoredCredentialLabel?.trim()) {
    const fallbackBackendCredential = await findAnyActiveBackendCredential({
      ownerId: input.backendOwnerId,
      providerId
    })

    if (fallbackBackendCredential) {
      return createExecutableContext({
        mode: input.requestedMode,
        provider: input.provider,
        credentialSource: fallbackBackendCredential.credentialSource,
        credentialId: fallbackBackendCredential.credentialId,
        resolutionSource: 'requested-mode'
      })
    }
  }

  return createBlockedContext({
    mode: input.requestedMode,
    provider: input.provider,
    credentialSource: 'backend-stored',
    resolutionSource: 'requested-mode',
    blockReasonCode: 'backend_credential_missing',
    blockReasonDetail: `No active backend credential is configured for provider ${providerId}.`
  })
}

function resolveLocalRequestedMode(input: {
  provider: ProviderDescriptor
  requestedMode: 'backend-local' | 'user-local'
  deploymentMode: DeploymentMode
  allowUserLocalExecution: boolean
}): ResolvedExecutionContext {
  if (input.requestedMode === 'backend-local') {
    if (canUseLocalOllama(input.deploymentMode)) {
      return createExecutableContext({
        mode: 'backend-local',
        provider: input.provider,
        credentialSource: 'none',
        credentialId: null,
        resolutionSource: 'requested-mode'
      })
    }

    return createBlockedContext({
      mode: 'backend-local',
      provider: input.provider,
      credentialSource: 'none',
      resolutionSource: 'requested-mode',
      blockReasonCode: 'backend_local_unavailable',
      blockReasonDetail: `Backend local execution is unavailable in deployment mode ${input.deploymentMode}.`
    })
  }

  if (input.allowUserLocalExecution) {
    return createExecutableContext({
      mode: 'user-local',
      provider: input.provider,
      credentialSource: 'none',
      credentialId: null,
      resolutionSource: 'requested-mode'
    })
  }

  return createBlockedContext({
    mode: 'user-local',
    provider: input.provider,
    credentialSource: 'none',
    resolutionSource: 'requested-mode',
    blockReasonCode: 'user_local_not_supported',
    blockReasonDetail: 'User-local execution is not supported from the current backend flow.'
  })
}

async function resolveCloudAutoMode(input: {
  provider: ProviderDescriptor
  userSuppliedApiKey: string
  userId: string
  backendOwnerId: string
  userStoredCredentialLabel?: string | null
  backendStoredCredentialLabel?: string | null
}): Promise<ResolvedExecutionContext> {
  const providerId = input.provider.providerId as CloudApiKeyProvider

  if (input.userSuppliedApiKey) {
    return createExecutableContext({
      mode: 'user-cloud',
      provider: input.provider,
      credentialSource: 'user-supplied',
      credentialId: null,
      resolutionSource: 'auto-user-supplied'
    })
  }

  const userCredential = await findActiveCredentialByLabels({
    owner: 'user',
    ownerId: input.userId,
    providerId,
    labels: getUserCloudCredentialLabels(providerId, input.userStoredCredentialLabel)
  })

  if (userCredential) {
    return createExecutableContext({
      mode: 'user-cloud',
      provider: input.provider,
      credentialSource: userCredential.credentialSource,
      credentialId: userCredential.credentialId,
      resolutionSource: 'auto-user-stored'
    })
  }

  const backendCredential = await findActiveCredentialByLabels({
    owner: 'backend',
    ownerId: input.backendOwnerId,
    providerId,
    labels: getBackendCloudCredentialLabels(input.backendStoredCredentialLabel)
  })

  if (backendCredential) {
    return createExecutableContext({
      mode: 'backend-cloud',
      provider: input.provider,
      credentialSource: backendCredential.credentialSource,
      credentialId: backendCredential.credentialId,
      resolutionSource: 'auto-backend-stored'
    })
  }

  if (!input.backendStoredCredentialLabel?.trim()) {
    const fallbackBackendCredential = await findAnyActiveBackendCredential({
      ownerId: input.backendOwnerId,
      providerId
    })

    if (fallbackBackendCredential) {
      return createExecutableContext({
        mode: 'backend-cloud',
        provider: input.provider,
        credentialSource: fallbackBackendCredential.credentialSource,
        credentialId: fallbackBackendCredential.credentialId,
        resolutionSource: 'auto-backend-stored'
      })
    }
  }

  return createBlockedContext({
    mode: 'user-cloud',
    provider: input.provider,
    credentialSource: 'user-stored',
    resolutionSource: 'auto-cloud-missing',
    blockReasonCode: 'cloud_credential_missing',
    blockReasonDetail: `No active user or backend credential is configured for provider ${providerId}.`
  })
}

function resolveLocalAutoMode(input: {
  provider: ProviderDescriptor
  deploymentMode: DeploymentMode
  allowUserLocalExecution: boolean
}): ResolvedExecutionContext {
  if (canUseLocalOllama(input.deploymentMode)) {
    return createExecutableContext({
      mode: 'backend-local',
      provider: input.provider,
      credentialSource: 'none',
      credentialId: null,
      resolutionSource: 'auto-backend-local'
    })
  }

  if (input.allowUserLocalExecution) {
    return createExecutableContext({
      mode: 'user-local',
      provider: input.provider,
      credentialSource: 'none',
      credentialId: null,
      resolutionSource: 'auto-user-local'
    })
  }

  return createBlockedContext({
    mode: 'backend-local',
    provider: input.provider,
    credentialSource: 'none',
    resolutionSource: 'auto-local-unavailable',
    blockReasonCode: 'backend_local_unavailable',
    blockReasonDetail: `Backend local execution is unavailable in deployment mode ${input.deploymentMode}.`
  })
}

function isCloudExecutionMode(mode: ExecutionMode): mode is 'backend-cloud' | 'user-cloud' | 'codex-cloud' {
  return mode === 'backend-cloud' || mode === 'user-cloud' || mode === 'codex-cloud'
}

function isLocalExecutionMode(mode: ExecutionMode): mode is 'backend-local' | 'user-local' {
  return mode === 'backend-local' || mode === 'user-local'
}

export async function resolveExecutionContext(input: ResolveExecutionContextInput): Promise<ResolvedExecutionContext> {
  const modelId = input.modelId.trim()
  const provider = getProviderDescriptor(modelId)
  const requestedMode: RequestedExecutionMode = input.requestedMode ?? 'auto'
  const deploymentMode = input.deploymentMode ?? getDeploymentMode()
  const userId = input.userId?.trim() || DEFAULT_USER_ID
  const backendOwnerId = input.backendOwnerId?.trim() || DEFAULT_BACKEND_OWNER_ID
  const userSuppliedApiKey = input.userSuppliedApiKey?.trim() || ''
  const backendCredentialId = input.backendCredentialId?.trim() || ''
  const allowUserLocalExecution = input.allowUserLocalExecution ?? false

  if (!provider) {
    return createBlockedContext({
      mode: 'user-cloud',
      provider: {
        providerId: 'unknown',
        modelId: modelId || 'unknown',
        providerKind: 'cloud'
      },
      credentialSource: 'user-stored',
      resolutionSource: requestedMode === 'auto' ? 'auto-cloud-missing' : 'requested-mode',
      blockReasonCode: 'unsupported_provider',
      blockReasonDetail: `Model ${modelId || '(empty)'} is not supported by the execution resolver.`
    })
  }

  if (requestedMode !== 'auto') {
    if (isCloudExecutionMode(requestedMode) && !isCloudModel(modelId)) {
      return createBlockedContext({
        mode: requestedMode === 'user-cloud' ? 'user-local' : 'backend-local',
        provider,
        credentialSource: 'none',
        resolutionSource: 'requested-mode',
        blockReasonCode: 'execution_mode_provider_mismatch',
        blockReasonDetail: `Requested mode ${requestedMode} requires a cloud model.`
      })
    }

    if (isLocalExecutionMode(requestedMode) && !isLocalModel(modelId)) {
      return createBlockedContext({
        mode: requestedMode === 'backend-local' ? 'backend-cloud' : 'user-cloud',
        provider,
        credentialSource: requestedMode === 'backend-local' ? 'backend-stored' : 'user-stored',
        resolutionSource: 'requested-mode',
        blockReasonCode: 'execution_mode_provider_mismatch',
        blockReasonDetail: `Requested mode ${requestedMode} requires a local model.`
      })
    }

    if (isCloudExecutionMode(requestedMode)) {
      return resolveCloudRequestedMode({
        provider,
        requestedMode,
        deploymentMode,
        userSuppliedApiKey,
        userId,
        backendOwnerId,
        backendCredentialId,
        userStoredCredentialLabel: input.userStoredCredentialLabel,
        backendStoredCredentialLabel: input.backendStoredCredentialLabel
      })
    }

    return resolveLocalRequestedMode({
      provider,
      requestedMode,
      deploymentMode,
      allowUserLocalExecution
    })
  }

  if (isCloudModel(modelId)) {
    return resolveCloudAutoMode({
      provider,
      userSuppliedApiKey,
      userId,
      backendOwnerId,
      userStoredCredentialLabel: input.userStoredCredentialLabel,
      backendStoredCredentialLabel: input.backendStoredCredentialLabel
    })
  }

  if (isLocalModel(modelId)) {
    return resolveLocalAutoMode({
      provider,
      deploymentMode,
      allowUserLocalExecution
    })
  }

  return createBlockedContext({
    mode: 'user-cloud',
    provider,
    credentialSource: 'none',
    resolutionSource: 'auto-cloud-missing',
    blockReasonCode: 'unsupported_provider',
    blockReasonDetail: `Model ${modelId} is not supported by the execution resolver.`
  })
}

export type { ResolveExecutionContextInput, RequestedExecutionMode }
