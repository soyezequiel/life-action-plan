import type { ResolvedPlanBuildExecution } from './build-execution'
import type { BuildRuntimeAuthMode } from './build-execution'
import type { RequestedExecutionMode } from './execution-context-resolver'
import type { ExecutionBlockReason } from '../../shared/types/execution-context'
import { DEFAULT_CODEX_BUILD_MODEL, resolveBuildModel } from '../providers/provider-metadata'

export type ProviderFailureCode =
  | 'provider_not_supported'
  | 'provider_not_configured'
  | 'provider_auth_failed'
  | 'provider_unavailable'
  | 'provider_quota_exceeded'

export interface ProviderTrace {
  requestedProvider: string | null
  requestedMode: RequestedExecutionMode
  resolvedModelId: string
  providerId: string
  executionMode: string
  resolutionSource: string
  authMode: BuildRuntimeAuthMode | 'unknown'
  canExecute: boolean
  blockReasonCode: ExecutionBlockReason | null
  blockReasonDetail: string | null
}

import { type QuotaInfo, formatQuotaMessage } from './quota-parser'

export interface ProviderFailure {
  code: ProviderFailureCode
  message: string
  trace: ProviderTrace
  quota?: QuotaInfo | null
}

export function resolveRequestedBuildMode(input: {
  provider?: string | null
  resourceMode?: 'auto' | 'backend' | 'user' | 'codex' | null
  backendCredentialId?: string | null
}): RequestedExecutionMode | undefined {
  if (input.resourceMode === 'backend') {
    return 'backend-cloud'
  }

  if (input.resourceMode === 'user') {
    return 'user-cloud'
  }

  if (input.resourceMode === 'codex') {
    return 'codex-cloud'
  }

  if (isCodexProviderSelection(input.provider)) {
    return 'codex-cloud'
  }

  return input.backendCredentialId?.trim()
    ? 'backend-cloud'
    : undefined
}

function normalizeRequestedProviderValue(provider: string | null | undefined): string | null {
  const normalized = provider?.trim() || ''
  return normalized || null
}

function isCodexProviderSelection(provider: string | null | undefined): boolean {
  const normalized = provider?.trim().toLowerCase() || ''

  if (!normalized) {
    return false
  }

  if (normalized === 'codex' || normalized === 'codex-cloud' || normalized === 'gpt-5-codex') {
    return true
  }

  if (normalized.startsWith('openai:')) {
    return normalized.includes('codex')
  }

  return false
}

export function normalizeRequestedProvider(
  provider: string | null | undefined,
  requestedMode: RequestedExecutionMode | undefined,
): string | null {
  if (requestedMode === 'codex-cloud') {
    return 'codex'
  }

  return normalizeRequestedProviderValue(provider)
}

export function resolveRequestedBuildModel(
  provider: string | null | undefined,
  requestedMode: RequestedExecutionMode | undefined,
): string {
  if (requestedMode === 'codex-cloud') {
    return DEFAULT_CODEX_BUILD_MODEL
  }

  return resolveBuildModel(provider)
}

export function createProviderTrace(input: {
  execution: ResolvedPlanBuildExecution
  requestedProvider?: string | null
  requestedMode?: RequestedExecutionMode
}): ProviderTrace {
  return {
    requestedProvider: input.requestedProvider?.trim() || null,
    requestedMode: input.requestedMode ?? 'auto',
    resolvedModelId: input.execution.requestedModelId,
    providerId: input.execution.executionContext.provider.providerId,
    executionMode: input.execution.executionContext.mode,
    resolutionSource: input.execution.executionContext.resolutionSource,
    authMode: input.execution.runtime?.authMode ?? 'unknown',
    canExecute: input.execution.executionContext.canExecute,
    blockReasonCode: input.execution.executionContext.blockReasonCode,
    blockReasonDetail: input.execution.executionContext.blockReasonDetail,
  }
}

function formatProviderTrace(trace: ProviderTrace): string {
  const parts = [
    `provider=${trace.providerId}`,
    `model=${trace.resolvedModelId}`,
    `mode=${trace.executionMode}`,
    `auth=${trace.authMode}`,
  ]

  if (trace.requestedProvider) {
    parts.unshift(`requested=${trace.requestedProvider}`)
  }

  return parts.join(', ')
}

function mapExecutionBlockReason(reasonCode: ExecutionBlockReason | null): ProviderFailureCode {
  switch (reasonCode) {
    case 'unsupported_provider':
    case 'execution_mode_provider_mismatch':
      return 'provider_not_supported'
    case 'codex_auth_missing':
      return 'provider_auth_failed'
    case 'cloud_credential_missing':
    case 'user_credential_missing':
    case 'backend_credential_missing':
      return 'provider_not_configured'
    case 'codex_mode_unavailable':
    case 'backend_local_unavailable':
    case 'user_local_not_supported':
    default:
      return 'provider_unavailable'
  }
}

export function createExecutionBlockedProviderFailure(trace: ProviderTrace): ProviderFailure {
  const code = mapExecutionBlockReason(trace.blockReasonCode)
  const detail = trace.blockReasonDetail ?? 'No detail available.'

  return {
    code,
    trace,
    message: `Provider error [${code}]. ${detail} Trace: ${formatProviderTrace(trace)}.`,
  }
}

function isQuotaError(message: string): boolean {
  return /\b(usage limit|rate limit|quota|insufficient_quota|429)\b/i.test(message)
}

function isAuthError(message: string): boolean {
  return /\b(unauthorized|unauthenticated|authentication|session|expired|invalid api key|forbidden|401|403)\b/i.test(message)
}

function isNotFoundError(message: string): boolean {
  return /\b(404|not found|model_not_found|no route matched)\b/i.test(message)
}

function isAvailabilityError(message: string): boolean {
  return /\b(timeout|timed out|econnrefused|enotfound|fetch failed|service unavailable|bad gateway|502|503|504)\b/i.test(message)
}

export function createRuntimeProviderFailure(input: {
  rawMessage: string
  trace: ProviderTrace
  quota?: QuotaInfo | null
}): ProviderFailure {
  const rawMessage = input.rawMessage.trim() || 'Unknown provider runtime error.'
  const code = isQuotaError(rawMessage)
    ? 'provider_quota_exceeded'
    : isAuthError(rawMessage)
      ? 'provider_auth_failed'
      : isNotFoundError(rawMessage) || isAvailabilityError(rawMessage)
        ? 'provider_unavailable'
        : 'provider_unavailable'

  const guidance = code === 'provider_quota_exceeded'
    ? 'El backend respondio, pero no puede procesar la corrida por limite de uso o cuota.'
    : code === 'provider_auth_failed'
      ? 'La autenticacion del provider fallo o no esta lista para esta ruta.'
      : 'El provider pedido no estuvo disponible para este intento.'

  const quotaMessage = formatQuotaMessage(input.quota)
  const finalGuidance = quotaMessage ? `${guidance} ${quotaMessage}` : guidance

  return {
    code,
    trace: input.trace,
    quota: input.quota,
    message: `Provider error [${code}]. ${finalGuidance} Raw: ${rawMessage}. Trace: ${formatProviderTrace(input.trace)}.`,
  }
}

export function createUnexpectedPreflightFailure(input: {
  responseText: string
  trace: ProviderTrace
}): ProviderFailure {
  const preview = input.responseText.slice(0, 100)

  return {
    code: 'provider_unavailable',
    trace: input.trace,
    message: `Provider error [provider_unavailable]. El preflight no devolvio "OK". Respuesta: "${preview}". Trace: ${formatProviderTrace(input.trace)}.`,
  }
}
