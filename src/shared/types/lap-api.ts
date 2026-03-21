import type { Perfil } from '../schemas/perfil'
import type { DebugEvent, DebugTraceSnapshot } from './debug'
import type { ResourceUsageSummary } from './resource-usage'

export interface IntakeExpressData {
  nombre: string
  edad: number
  ubicacion: string
  ocupacion: string
  objetivo: string
}

export interface PlanEvent {
  semana: number
  dia: string
  hora: string
  duracion: number
  actividad: string
  categoria: 'estudio' | 'ejercicio' | 'trabajo' | 'habito' | 'descanso' | 'otro'
  objetivoId: string
}

export interface IntakeSaveRequest {
  data: IntakeExpressData
}

export interface IntakeSaveResult {
  success: boolean
  profileId: string
  error?: string
}

export interface PlanBuildRequest {
  profileId: string
  apiKey: string
  provider?: string
  backendCredentialId?: string
  resourceMode?: 'auto' | 'backend' | 'user'
}

export interface PlanBuildResult {
  success: boolean
  planId?: string
  nombre?: string
  resumen?: string
  eventos?: PlanEvent[]
  tokensUsed?: { input: number; output: number }
  fallbackUsed?: boolean
  charge?: OperationChargeSummary
  resourceUsage?: ResourceUsageSummary | null
  error?: string
}

export type PlanBuildProgressStage = 'preparing' | 'generating' | 'validating' | 'saving'

export interface PlanBuildProgress {
  profileId: string
  provider: string
  stage: PlanBuildProgressStage
  current: number
  total: number
  charCount: number
  chunk?: string
}

export interface PlanListRequest {
  profileId: string
}

export interface PlanListResult {
  plans: PlanRow[]
}

export interface PlanSimulateRequest {
  planId: string
  mode?: 'interactive' | 'automatic'
}

export interface ProgressRow {
  id: string
  planId: string
  fecha: string
  tipo: string
  objetivoId: string | null
  descripcion: string
  completado: boolean
  notas: string | null
  createdAt: string
}

export interface PlanRow {
  id: string
  profileId: string
  nombre: string
  slug: string
  manifest: string
  createdAt: string
  updatedAt: string
}

export interface ProgressListRequest {
  planId: string
  fecha?: string
}

export interface ProgressListResult {
  rows: ProgressRow[]
}

export interface ProgressToggleRequest {
  progressId: string
}

export interface ProgressToggleResult {
  success: boolean
  completado: boolean
}

export interface StreakResult {
  current: number
  best: number
}

export interface WalletStatus {
  configured: boolean
  connected: boolean
  canUseSecureStorage: boolean
  alias?: string
  balanceSats?: number
  budgetSats?: number
  budgetUsedSats?: number
  planBuildChargeSats?: number
  planBuildChargeReady?: boolean
  planBuildChargeReasonCode?: ChargeReasonCode | null
}

export interface WalletConnectRequest {
  connectionUrl: string
}

export interface WalletConnectResult {
  success: boolean
  status: WalletStatus
  error?: string
}

export interface WalletDisconnectResult {
  success: boolean
}

export type ChargeOperation = 'plan_build' | 'plan_simulate'

export type ChargeStatus = 'pending' | 'paid' | 'rejected' | 'skipped' | 'failed'

export type ChargeReasonCode =
  | 'user_resource'
  | 'execution_blocked'
  | 'free_local_operation'
  | 'operation_not_chargeable'
  | 'wallet_not_connected'
  | 'wallet_connection_unavailable'
  | 'payment_not_allowed'
  | 'insufficient_balance'
  | 'insufficient_budget'
  | 'receiver_not_configured'
  | 'invoice_creation_failed'
  | 'payment_failed'
  | 'provider_unavailable'
  | 'unknown_error'

export interface OperationChargeRow {
  id: string
  profileId: string | null
  planId: string | null
  operation: ChargeOperation
  model: string | null
  paymentProvider: string | null
  status: ChargeStatus
  estimatedCostUsd: number
  estimatedCostSats: number
  finalCostUsd: number
  finalCostSats: number
  chargedSats: number
  reasonCode: ChargeReasonCode | null
  reasonDetail: string | null
  lightningInvoice: string | null
  lightningPaymentHash: string | null
  lightningPreimage: string | null
  providerReference: string | null
  metadata: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export interface OperationChargeSummary {
  chargeId: string
  status: ChargeStatus
  estimatedCostUsd: number
  estimatedCostSats: number
  finalCostUsd: number
  finalCostSats: number
  chargedSats: number
  reasonCode: ChargeReasonCode | null
  reasonDetail: string | null
  paymentProvider: string | null
  resourceUsage?: ResourceUsageSummary | null
}

export interface PlanExportCalendarRequest {
  planId: string
}

export interface PlanExportCalendarResult {
  success: boolean
  cancelled?: boolean
  filePath?: string
  error?: string
}

export interface CostOperationSummary {
  operation: string
  count: number
  costUsd: number
  costSats: number
  estimatedChargeSats?: number
  chargedSats?: number
  latestChargeStatus?: ChargeStatus | null
  latestChargeReasonCode?: ChargeReasonCode | null
}

export interface CostSummary {
  planId: string
  tokensInput: number
  tokensOutput: number
  costUsd: number
  costSats: number
  chargedSats: number
  operations: CostOperationSummary[]
  latestCharge?: OperationChargeSummary | null
}

export interface DebugStatusResult {
  enabled: boolean
  panelVisible: boolean
}

export interface DebugSnapshotResult {
  traces: DebugTraceSnapshot[]
}

export type SimulationStatus = 'PASS' | 'WARN' | 'FAIL' | 'MISSING'
export type SimulationMode = 'interactive' | 'automatic'
export type SimulationProgressStage = 'schedule' | 'work' | 'load' | 'summary'

export type SimulationFindingCode =
  | 'no_plan_items'
  | 'missing_schedule'
  | 'outside_awake_hours'
  | 'overlaps_work'
  | 'day_over_capacity'
  | 'day_high_load'
  | 'too_many_activities'
  | 'schedule_ok'
  | 'work_balance_ok'
  | 'capacity_ok'
  | 'metadata_ok'

export interface SimulationFinding {
  status: SimulationStatus
  code: SimulationFindingCode
  params?: Record<string, string | number>
}

export interface SimulationSummary {
  overallStatus: SimulationStatus
  pass: number
  warn: number
  fail: number
  missing: number
}

export interface PlanSimulationSnapshot {
  ranAt: string
  mode: SimulationMode
  periodLabel: string
  summary: SimulationSummary
  findings: SimulationFinding[]
}

export interface PlanSimulationProgress {
  planId: string
  mode: SimulationMode
  stage: SimulationProgressStage
  current: number
  total: number
}

export interface PlanSimulationResult {
  success: boolean
  simulation?: PlanSimulationSnapshot
  charge?: OperationChargeSummary
  resourceUsage?: ResourceUsageSummary | null
  error?: string
}

export interface BuildUsagePreviewResult {
  success: boolean
  usage: ResourceUsageSummary
}

export interface LapAPI {
  intake: {
    save: (data: IntakeExpressData) => Promise<IntakeSaveResult>
  }
  plan: {
    build: (
      profileId: string,
      apiKey: string,
      provider?: string,
      backendCredentialId?: string,
      resourceMode?: 'auto' | 'backend' | 'user'
    ) => Promise<PlanBuildResult>
    onBuildProgress: (listener: (progress: PlanBuildProgress) => void) => () => void
    list: (profileId: string) => Promise<PlanRow[]>
    simulate: (planId: string, mode?: 'interactive' | 'automatic') => Promise<PlanSimulationResult>
    onSimulationProgress: (listener: (progress: PlanSimulationProgress) => void) => () => void
    exportCalendar: (planId: string) => Promise<PlanExportCalendarResult>
  }
  profile: {
    get: (profileId: string) => Promise<Perfil | null>
    latest: () => Promise<string | null>
  }
  progress: {
    list: (planId: string, fecha?: string) => Promise<ProgressRow[]>
    toggle: (progressId: string) => Promise<ProgressToggleResult>
  }
  streak: {
    get: (planId: string) => Promise<StreakResult>
  }
  wallet: {
    status: () => Promise<WalletStatus>
    connect: (connectionUrl: string) => Promise<WalletConnectResult>
    disconnect: () => Promise<WalletDisconnectResult>
  }
  cost: {
    summary: (planId: string) => Promise<CostSummary>
  }
  debug: {
    enable: () => Promise<DebugStatusResult>
    disable: () => Promise<DebugStatusResult>
    clear: () => Promise<DebugStatusResult>
    status: () => Promise<DebugStatusResult>
    snapshot: () => Promise<DebugSnapshotResult>
    onEvent: (listener: (event: DebugEvent) => void) => () => void
  }
}
