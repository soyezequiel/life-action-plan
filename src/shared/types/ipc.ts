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

// Re-export for convenience
export type { IntakeExpressData, PlanEvent }
