import type { IntakeExpressData } from '../../skills/plan-intake'
import type { PlanEvent } from '../../skills/plan-builder'
import type { DebugEvent, DebugSpan, DebugTraceSnapshot } from './debug'

// Intake Express
export interface IntakeSaveResult {
  success: boolean
  profileId: string
  error?: string
}

// Plan Builder
export interface PlanBuildRequest {
  profileId: string
  apiKey: string
  provider?: string // "openai:gpt-4o-mini" | "ollama:qwen3:8b" etc.
}

export interface PlanBuildResult {
  success: boolean
  planId?: string
  nombre?: string
  resumen?: string
  eventos?: PlanEvent[]
  tokensUsed?: { input: number; output: number }
  fallbackUsed?: boolean
  error?: string
}

// Progress
export interface ProgressRow {
  id: string
  planId: string
  fecha: string
  tipo: string // 'habito' | 'tarea' | 'hito'
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
}

export interface WalletConnectResult {
  success: boolean
  status: WalletStatus
  error?: string
}

export interface WalletDisconnectResult {
  success: boolean
}

export interface PlanExportCalendarResult {
  success: boolean
  cancelled?: boolean
  filePath?: string
  error?: string
}

export interface CostSummary {
  planId: string
  tokensInput: number
  tokensOutput: number
  costUsd: number
  costSats: number
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
  error?: string
}

// Re-export for convenience
export type { IntakeExpressData, PlanEvent }
export type { DebugEvent, DebugSpan, DebugTraceSnapshot }
