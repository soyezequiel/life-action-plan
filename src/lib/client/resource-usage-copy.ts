import { t } from '../../i18n'
import type { ResourceUsageSummary } from '../../shared/types/resource-usage'

export interface ResourceUsageDisplay {
  label: string
  detail: string
  source: string
  billing: string
  tone: 'success' | 'warning' | 'neutral'
}

function getModeDetail(mode: ResourceUsageSummary['mode']): string {
  return t(`resource_usage.mode.${mode}`)
}

function getSourceDetail(usage: ResourceUsageSummary): string {
  if (usage.executionTarget !== 'cloud') {
    return t('resource_usage.source.none')
  }

  return t(`resource_usage.source.${usage.credentialSource}`)
}

function getBlockedDetail(reasonCode: ResourceUsageSummary['blockReasonCode']): string {
  switch (reasonCode) {
    case 'user_credential_missing':
    case 'cloud_credential_missing':
      return t('resource_usage.blocked.user_credential_missing')
    case 'backend_credential_missing':
      return t('resource_usage.blocked.backend_credential_missing')
    case 'codex_mode_unavailable':
      return t('resource_usage.blocked.codex_mode_unavailable')
    case 'backend_local_unavailable':
      return t('builder.local_unavailable_deploy')
    case 'user_local_not_supported':
      return t('resource_usage.blocked.user_local_not_supported')
    case 'execution_mode_provider_mismatch':
    case 'unsupported_provider':
    default:
      return t('resource_usage.blocked.other')
  }
}

function getBillingDetail(usage: ResourceUsageSummary): string {
  if (!usage.canExecute) {
    return getBlockedDetail(usage.blockReasonCode)
  }

  if (usage.chargeable) {
    return t('resource_usage.billing.charge')
  }

  switch (usage.billingReasonCode) {
    case 'user_resource':
      return t('resource_usage.billing.user_resource')
    case 'internal_tooling':
      return t('resource_usage.billing.internal_tooling')
    case 'operation_not_chargeable':
      return t('resource_usage.billing.operation_not_chargeable')
    case 'execution_blocked':
      return t('resource_usage.billing.execution_blocked')
    default:
      return t('resource_usage.billing.user_resource')
  }
}

export function getResourceUsageDisplay(usage: ResourceUsageSummary | null | undefined): ResourceUsageDisplay | null {
  if (!usage) {
    return null
  }

  return {
    label: t('resource_usage.label'),
    detail: getModeDetail(usage.mode),
    source: getSourceDetail(usage),
    billing: getBillingDetail(usage),
    tone: !usage.canExecute
      ? 'warning'
      : usage.chargeable
        ? 'warning'
        : 'success'
  }
}
