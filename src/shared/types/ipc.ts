import type { IntakeExpressData } from '../../skills/plan-intake'
import type { PlanEvent } from '../../skills/plan-builder'

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

// Re-export for convenience
export type { IntakeExpressData, PlanEvent }
