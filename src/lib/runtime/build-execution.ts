import type { ChargeOperation, ChargeReasonCode } from '../../shared/types/lap-api'
import type { BillingPolicyDecision } from '../payments/billing-policy'
import { resolveBillingPolicy } from '../payments/billing-policy'
import { getCredentialConfigurationSecret } from '../auth/credential-config'
import { getDeploymentMode, type DeploymentMode } from '../env/deployment'
import type { ResolvedExecutionContext } from '../../shared/types/execution-context'
import { resolveExecutionContext, type RequestedExecutionMode } from './execution-context-resolver'
import { DEFAULT_CODEX_BUILD_MODEL } from '../providers/provider-metadata'

const CODEX_BACKEND_BASE_URL = 'https://chatgpt.com/backend-api/codex'
const CODEX_OAUTH_PLACEHOLDER_KEY = 'chatgpt-oauth'

export type BuildRuntimeAuthMode = 'api-key' | 'codex-oauth'

export interface BuildRuntimeConfig {
  modelId: string
  apiKey: string
  baseURL?: string
  authMode?: BuildRuntimeAuthMode
}

export interface ResolvePlanBuildExecutionInput {
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

export interface ResolvedPlanBuildExecution {
  operation: ChargeOperation
  requestedModelId: string
  deploymentMode: DeploymentMode
  executionContext: ResolvedExecutionContext
  billingPolicy: BillingPolicyDecision
  runtime: BuildRuntimeConfig | null
}

export interface OperationChargeSkipReason {
  reasonCode: ChargeReasonCode
  reasonDetail: string
}

async function resolveStoredCredentialSecret(executionContext: ResolvedExecutionContext): Promise<string> {
  if (!executionContext.credentialId) {
    throw new Error('CREDENTIAL_ID_REQUIRED')
  }

  const secretValue = await getCredentialConfigurationSecret(executionContext.credentialId)

  if (!secretValue) {
    const ownerPrefix = executionContext.resourceOwner === 'backend' ? 'BACKEND' : 'USER'
    throw new Error(`${ownerPrefix}_CREDENTIAL_SECRET_UNAVAILABLE`)
  }

  return secretValue
}

async function resolveBuildRuntimeConfig(input: {
  modelId: string
  executionContext: ResolvedExecutionContext
  userSuppliedApiKey?: string | null
}): Promise<BuildRuntimeConfig | null> {
  if (!input.executionContext.canExecute) {
    return null
  }

  if (input.executionContext.mode === 'codex-cloud') {
    return {
      modelId: input.modelId,
      apiKey: CODEX_OAUTH_PLACEHOLDER_KEY,
      baseURL: CODEX_BACKEND_BASE_URL,
      authMode: 'codex-oauth'
    }
  }

  if (input.executionContext.executionTarget !== 'cloud') {
    throw new Error(`UNSUPPORTED_EXECUTION_TARGET:${input.executionContext.executionTarget}`)
  }

  if (input.executionContext.credentialSource === 'user-supplied') {
    const apiKey = input.userSuppliedApiKey?.trim() || ''

    if (!apiKey) {
      throw new Error('USER_SUPPLIED_API_KEY_MISSING')
    }

    return {
      modelId: input.modelId,
      apiKey
    }
  }

  if (
    input.executionContext.credentialSource === 'user-stored'
    || input.executionContext.credentialSource === 'backend-stored'
  ) {
    return {
      modelId: input.modelId,
      apiKey: await resolveStoredCredentialSecret(input.executionContext)
    }
  }

  throw new Error(`UNSUPPORTED_CREDENTIAL_SOURCE:${input.executionContext.credentialSource}`)
}

export function toOperationChargeSkipReason(decision: BillingPolicyDecision): OperationChargeSkipReason {
  if (decision.skipReasonCode === 'user_resource') {
    return {
      reasonCode: 'user_resource',
      reasonDetail: decision.skipReasonDetail ?? 'RESOURCE_OWNER_USER'
    }
  }

  if (decision.skipReasonCode === 'internal_tooling') {
    return {
      reasonCode: 'internal_tooling',
      reasonDetail: decision.skipReasonDetail ?? 'INTERNAL_TOOLING_MODE'
    }
  }

  if (decision.skipReasonCode === 'execution_blocked') {
    return {
      reasonCode: 'execution_blocked',
      reasonDetail: decision.skipReasonDetail ?? 'EXECUTION_BLOCKED'
    }
  }

  return {
    reasonCode: 'operation_not_chargeable',
    reasonDetail: decision.skipReasonDetail ?? 'OPERATION_NOT_CHARGEABLE'
  }
}

export async function resolvePlanBuildExecution(
  input: ResolvePlanBuildExecutionInput
): Promise<ResolvedPlanBuildExecution> {
  const requestedModelId = input.requestedMode === 'codex-cloud'
    ? DEFAULT_CODEX_BUILD_MODEL
    : input.modelId.trim()
  const deploymentMode = input.deploymentMode ?? getDeploymentMode()
  const executionContext = await resolveExecutionContext({
    modelId: requestedModelId,
    requestedMode: input.requestedMode,
    deploymentMode,
    userId: input.userId,
    backendOwnerId: input.backendOwnerId,
    userSuppliedApiKey: input.userSuppliedApiKey,
    backendCredentialId: input.backendCredentialId,
    userStoredCredentialLabel: input.userStoredCredentialLabel,
    backendStoredCredentialLabel: input.backendStoredCredentialLabel,
    allowUserLocalExecution: input.allowUserLocalExecution
  })
  const billingPolicy = resolveBillingPolicy({
    operation: 'plan_build',
    executionContext
  })

  return {
    operation: 'plan_build',
    requestedModelId,
    deploymentMode,
    executionContext,
    billingPolicy,
    runtime: await resolveBuildRuntimeConfig({
      modelId: requestedModelId,
      executionContext,
      userSuppliedApiKey: input.userSuppliedApiKey
    })
  }
}
