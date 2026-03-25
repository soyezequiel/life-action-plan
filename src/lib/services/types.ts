import { z } from 'zod'
import {
  intakeRequestSchema,
  planBuildRequestSchema,
  planSimulateRequestSchema
} from '../../shared/api-schemas'
import type { 
  PlanBuildProgress, 
  PlanSimulationProgress, 
  OperationChargeSummary, 
  PlanEvent, 
  PlanSimulationSnapshot 
} from '../../shared/types/lap-api'
import type { ResourceUsageSummary } from '../../shared/types/resource-usage'

export type IntakeRequestData = z.infer<typeof intakeRequestSchema>
export type PlanBuildRequestData = z.infer<typeof planBuildRequestSchema>
export type PlanSimulateRequestData = z.infer<typeof planSimulateRequestSchema>

export interface IntakeResult {
  profileId: string
}

export interface BuildResult {
  planId: string
  nombre: string
  resumen: string
  eventos: PlanEvent[]
  tokensUsed: { input: number; output: number }
  fallbackUsed: boolean
  charge?: OperationChargeSummary
  resourceUsage?: ResourceUsageSummary | null
}

export interface SimulateResult {
  simulation: PlanSimulationSnapshot
  charge?: OperationChargeSummary
  resourceUsage?: ResourceUsageSummary | null
}

export interface BuildServiceOptions {
  onProgress?: (progress: PlanBuildProgress) => void
  userId?: string
}

export interface SimulateServiceOptions {
  onProgress?: (progress: PlanSimulationProgress) => void
  userId?: string
}
