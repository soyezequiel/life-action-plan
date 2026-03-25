import type { RunnerConfig } from '../../../scripts/runner-config.schema'
import type { BuildResult } from '../services/types'
import type { PlanSimulationSnapshot, SimulationFinding } from '../../shared/types/lap-api'
import type { EnrichmentInference } from '../skills/profile-enricher'

export type PipelinePhase = 'intake' | 'enrich' | 'readiness' | 'build' | 'simulate' | 'repair' | 'output'

export type DeliveryMode = 'pass' | 'warn-acceptable' | 'best-effort'

export interface RepairHistoryEntry {
  attempt: number
  findingsCount: number
  qualityScore: number
  repairNotes: string
}

export interface PipelineContext {
  profileId?: string
  planId?: string
  config: RunnerConfig
  intakeSummary?: {
    nombre: string
    edad: number
    ciudad: string
    objetivo: string
  }
  results: {
    intake?: { profileId: string }
    build?: BuildResult
    simulate?: { simulation: PlanSimulationSnapshot }
  }
  // v2 enriched state
  enrichment?: {
    inferences: EnrichmentInference[]
    warnings: string[]
  }
  readiness?: {
    warnings: string[]
    constraints: string[]
  }
  repair?: {
    attempts: number
    history: RepairHistoryEntry[]
    bestSimulation: PlanSimulationSnapshot | null
    bestPlanId: string | null
    lastFindings: SimulationFinding[]
  }
  output?: {
    deliveryMode: DeliveryMode
    finalQualityScore: number
  }
}

export interface PipelineStepTracker {
  onPhaseStart?: (phase: PipelinePhase) => void
  onPhaseSuccess?: (phase: PipelinePhase, result: any) => void
  onPhaseFailure?: (phase: PipelinePhase, error: Error) => void
  onPhaseSkipped?: (phase: PipelinePhase) => void
  onProgress?: (phase: PipelinePhase, progress: any) => void
  onRepairAttempt?: (attempt: number, maxAttempts: number, findings: SimulationFinding[]) => void
}
