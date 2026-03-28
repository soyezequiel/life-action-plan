import { DateTime } from 'luxon'
import { t } from '../../i18n'
import type { Perfil } from '../../shared/schemas/perfil'
import { toConfigErrorMessage } from '../../shared/config-errors'
import type { ChargeReasonCode, OperationChargeSummary, PlanSimulationSnapshot } from '../../shared/types/lap-api'
import type { ExecutionBlockReason } from '../../shared/types/execution-context'
import { getPlanBySlug } from '../db/db-helpers'
import type { PlanPackage, StoredAdaptiveState, V5PhaseSnapshot } from '../pipeline/shared/phase-io'

export interface StoredPlanV5Manifest {
  package?: PlanPackage | null
  adaptive?: StoredAdaptiveState | null
  run?: V5PhaseSnapshot | null
}

export function parseStoredProfile(data: string): Perfil | null {
  try {
    const parsed = JSON.parse(data) as Perfil
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function getProfileTimezone(profile: Perfil | null | undefined): string {
  return profile?.participantes[0]?.datosPersonales?.ubicacion?.zonaHoraria || 'America/Argentina/Buenos_Aires'
}

export function getTodayISO(timezone: string): string {
  return DateTime.now().setZone(timezone).toISODate() ?? DateTime.now().toISODate() ?? '2026-03-20'
}

export function normalizePlanSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'mi-plan'
}

export async function createUniquePlanSlug(baseName: string): Promise<string> {
  const baseSlug = normalizePlanSlug(baseName)
  let candidate = baseSlug
  let suffix = 2

  while (await getPlanBySlug(candidate)) {
    candidate = `${baseSlug}-${suffix}`
    suffix += 1
  }

  return candidate
}

export function buildPlanManifest(params: {
  nombre: string
  fallbackUsed: boolean
  modelId: string
  tokensInput: number
  tokensOutput: number
  costUsd: number
  costSats: number
  charge?: OperationChargeSummary | null
  v5?: StoredPlanV5Manifest | null
}): string {
  const now = DateTime.utc().toISO() ?? '2026-03-20T00:00:00.000Z'

  return JSON.stringify({
    nombrePlan: params.nombre,
    creado: now,
    ultimaModificacion: now,
    versionGlobal: 1,
    modo: 'individual',
    planGeneral: 'plan-general.md',
    fallbackUsed: params.fallbackUsed,
    ultimoModeloUsado: params.modelId,
    horizontePlan: { anosTotal: 1, estrategia: 'completo' },
    granularidadCompletada: { anual: false, mensual: [], diario: [] },
    estadoSimulacion: {},
    versionesArchivos: {},
    checkpoint: {
      operacion: 'build',
      iteracionActual: 1,
      maxIteraciones: 5,
      itemsPendientes: [],
      ultimoPasoCompletado: 'plan-builder',
      granularidad: 'mensual',
      periodoObjetivo: null,
      periodosValidados: [],
      periodosPendientes: []
    },
    ramas: {},
    archivados: {},
    ultimaSimulacion: null,
    v5: params.v5 ?? undefined,
    ultimoCobro: params.charge ?? null,
    costoAcumulado: {
      llamadasModelo: { alto: 1, medio: 0, bajo: 0 },
      tokensInput: params.tokensInput,
      tokensOutput: params.tokensOutput,
      estimacionUSD: params.costUsd,
      estimacionSats: params.costSats
    }
  })
}

export function buildPendingAdaptiveState(nowIso = DateTime.utc().toISO() ?? '2026-03-20T00:00:00.000Z'): StoredAdaptiveState {
  return {
    status: 'pending',
    output: null,
    updatedAt: nowIso,
    lastError: null
  }
}

export function readPlanV5Manifest(manifestJson: string | null | undefined): StoredPlanV5Manifest | null {
  const manifest = safeParseJsonRecord(manifestJson)
  const candidate = manifest.v5

  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  const v5 = candidate as Record<string, unknown>
  return {
    package: (v5.package && typeof v5.package === 'object' ? v5.package : null) as PlanPackage | null,
    adaptive: (v5.adaptive && typeof v5.adaptive === 'object' ? v5.adaptive : null) as StoredAdaptiveState | null,
    run: (v5.run && typeof v5.run === 'object' ? v5.run : null) as V5PhaseSnapshot | null
  }
}

export function updatePlanManifestV5(
  manifestJson: string | null | undefined,
  next: Partial<StoredPlanV5Manifest>
): string {
  const manifest = safeParseJsonRecord(manifestJson)
  const current = readPlanV5Manifest(manifestJson) ?? {}
  const updatedAt = DateTime.utc().toISO() ?? '2026-03-20T00:00:00.000Z'

  const merged: StoredPlanV5Manifest = {
    package: typeof next.package !== 'undefined' ? next.package : current.package,
    adaptive: typeof next.adaptive !== 'undefined' ? next.adaptive : current.adaptive,
    run: typeof next.run !== 'undefined' ? next.run : current.run
  }

  return JSON.stringify({
    ...manifest,
    v5: merged,
    ultimaModificacion: updatedAt
  })
}

export function createSimulationManifest(
  manifestJson: string,
  simulation: PlanSimulationSnapshot,
  timezone: string,
  charge?: OperationChargeSummary | null
): string {
  const manifest = safeParseJsonRecord(manifestJson)
  const periodKey = DateTime.now().setZone(timezone).toFormat('yyyy-MM')
  const findings = simulation.findings
  const hasMissingSimulationData = findings.some((finding) => (
    finding.code === 'missing_schedule' || finding.code === 'no_plan_items'
  ))

  return JSON.stringify({
    ...manifest,
    ultimaModificacion: simulation.ranAt,
    estadoSimulacion: {
      ...(manifest.estadoSimulacion && typeof manifest.estadoSimulacion === 'object'
        ? manifest.estadoSimulacion
        : {}),
      'viabilidad-general': simulation.summary.overallStatus === 'MISSING'
        ? 'PENDIENTE'
        : simulation.summary.overallStatus,
      horarios: hasMissingSimulationData
        ? 'PENDIENTE'
        : findings.some((finding) => finding.code === 'outside_awake_hours')
          ? 'FAIL'
          : 'PASS',
      trabajo: hasMissingSimulationData
        ? 'PENDIENTE'
        : findings.some((finding) => finding.code === 'overlaps_work')
          ? 'FAIL'
          : 'PASS',
      carga: hasMissingSimulationData
        ? 'PENDIENTE'
        : findings.some((finding) => finding.code === 'day_over_capacity')
          ? 'FAIL'
          : findings.some((finding) => finding.code === 'day_high_load' || finding.code === 'too_many_activities')
            ? 'WARN'
            : 'PASS',
      datos: hasMissingSimulationData ? 'PENDIENTE' : 'PASS'
    },
    checkpoint: {
      ...(manifest.checkpoint && typeof manifest.checkpoint === 'object' ? manifest.checkpoint : {}),
      operacion: simulation.summary.missing > 0 ? 'simulacion-parcial' : 'simulacion',
      iteracionActual: 1,
      maxIteraciones: 5,
      ultimoPasoCompletado: 'plan-simulator',
      granularidad: 'mensual',
      periodoObjetivo: periodKey,
      periodosValidados: simulation.summary.overallStatus === 'FAIL' ? [] : [periodKey],
      periodosPendientes: simulation.summary.overallStatus === 'FAIL' || simulation.summary.missing > 0
        ? [periodKey]
        : []
    },
    ultimaSimulacion: simulation,
    ultimoCobro: charge ?? (
      manifest.ultimoCobro && typeof manifest.ultimoCobro === 'object'
        ? manifest.ultimoCobro
        : null
    )
  })
}

export function buildCalendarFileName(planName: string, timezone: string): string {
  const date = DateTime.now().setZone(timezone).toISODate() ?? 'plan'
  return `lap-${normalizePlanSlug(planName)}-${date}.ics`
}

export function safeParseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {}
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function toPlanBuildErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error'
  const normalized = message.toLowerCase()

  if (
    message.startsWith('El asistente ') ||
    message.startsWith('No pude ') ||
    message === t('errors.profile_not_found') ||
    message === t('errors.plan_not_found') ||
    message === t('errors.invalid_request')
  ) {
    return message
  }

  if (
    normalized.includes('codex_auth') ||
    normalized.includes('codex session')
  ) {
    return t('errors.codex_auth_required')
  }

  if (
    normalized.includes('user_supplied_api_key_missing') ||
    normalized.includes('user_credential_secret_unavailable') ||
    normalized.includes('api key') ||
    normalized.includes('unauthorized') ||
    normalized.includes('authentication') ||
    normalized.includes('401') ||
    normalized.includes('403')
  ) {
    return t('errors.no_api_key')
  }

  if (
    normalized.includes('budget') ||
    normalized.includes('quota') ||
    normalized.includes('insufficient')
  ) {
    return t('errors.budget_exceeded')
  }

  if (normalized.includes('backend_credential_secret_unavailable')) {
    return t('errors.service_unavailable')
  }

  if (
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('tard')
  ) {
    return t('errors.request_timeout')
  }

  if (
    normalized.includes('fetch failed') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('connect') ||
    normalized.includes('econnrefused') ||
    normalized.includes('enotfound') ||
    normalized.includes('networkerror')
  ) {
    return t('errors.network_unavailable')
  }

  const configErrorMessage = toConfigErrorMessage(message)
  if (configErrorMessage) {
    return configErrorMessage
  }

  return t('errors.generic')
}

export function toExecutionBlockErrorMessage(reasonCode: ExecutionBlockReason | null | undefined): string {
  switch (reasonCode) {
    case 'user_credential_missing':
    case 'cloud_credential_missing':
      return t('errors.no_api_key')
    case 'codex_auth_missing':
      return t('errors.codex_auth_required')
    case 'backend_credential_missing':
    case 'codex_mode_unavailable':
      return t('errors.service_unavailable')
    case 'backend_local_unavailable':
    case 'user_local_not_supported':
      return t('builder.local_unavailable_deploy')
    case 'execution_mode_provider_mismatch':
    case 'unsupported_provider':
    default:
      return t('errors.generic')
  }
}

export function toChargeErrorMessage(reasonCode: ChargeReasonCode | null): string {
  switch (reasonCode) {
    case 'user_resource':
    case 'internal_tooling':
    case 'execution_blocked':
      return t('errors.generic')
    case 'wallet_not_connected':
      return t('errors.charge_wallet_required')
    case 'insufficient_balance':
      return t('errors.charge_balance_insufficient')
    case 'insufficient_budget':
      return t('errors.charge_budget_insufficient')
    case 'payment_not_allowed':
      return t('errors.charge_permission_denied')
    case 'receiver_not_configured':
    case 'invoice_creation_failed':
    case 'payment_failed':
    case 'provider_unavailable':
    case 'wallet_connection_unavailable':
    case 'unknown_error':
      return t('errors.charge_temporarily_unavailable')
    case 'free_local_operation':
    case 'operation_not_chargeable':
    default:
      return t('errors.generic')
  }
}
