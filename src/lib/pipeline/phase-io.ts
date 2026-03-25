// ─── Phase I/O Contracts ──────────────────────────────────────────────────────
// Cada fase del pipeline tiene un tipo explícito de entrada y salida.
// El runner los usa para guardar PhaseIO<I, O> en el contexto.
// Los inputs deben ser descriptivos: no solo IDs, sino lo que representan.

import type { PlanEvent, PlanSimulationSnapshot, SimulationFinding } from '../../shared/types/lap-api'
import type { EnrichmentInference } from '../skills/profile-enricher'

// ─── Generic wrapper ──────────────────────────────────────────────────────────

export interface PhaseIO<I = unknown, O = unknown> {
  input: I
  output: O
  /** Descripción en español de qué hace esta fase internamente */
  processing: string
  startedAt: string
  finishedAt: string
  durationMs: number
}

// ─── 1. Intake ────────────────────────────────────────────────────────────────

export interface IntakeInput {
  nombre: string
  edad: number
  ubicacion: string
  ocupacion: string
  objetivo: string
}

export interface IntakeOutput {
  profileId: string
  nombre: string
  edad: number
  ciudad: string
  objetivo: string
}

// ─── 2. Enrich ────────────────────────────────────────────────────────────────

export interface EnrichInput {
  /** Persona que se va a enriquecer */
  persona: string
  edad: number
  ciudad: string
  ocupacion: string
  objetivo: string
  provider: string
}

export interface EnrichOutput {
  enrichedProfileId: string
  inferences: EnrichmentInference[]
  warnings: string[]
  tokensUsed: { input: number; output: number }
}

// ─── 3. Readiness ─────────────────────────────────────────────────────────────

export interface ReadinessInput {
  persona: string
  objetivo: string
  objectiveCount: number
  freeHoursWeekday: number
  freeHoursWeekend: number
}

export interface ReadinessOutput {
  ready: boolean
  errors: string[]
  warnings: string[]
  constraints: string[]
}

// ─── 4. Build ─────────────────────────────────────────────────────────────────

export interface BuildInput {
  persona: string
  objetivo: string
  provider: string
  horasLibresLaborales: number
  horasLibresFinDeSemana: number
  constraints: string[]
  previousFindings?: SimulationFinding[]
}

export interface BuildOutput {
  planId: string
  nombre: string
  resumen: string
  eventCount: number
  eventos: PlanEvent[]
  tokensUsed: { input: number; output: number }
  fallbackUsed: boolean
}

// ─── 5. Simulate ──────────────────────────────────────────────────────────────

export interface SimulateInput {
  nombreDelPlan: string
  eventCount: number
  mode: 'interactive' | 'automatic'
}

export interface SimulateOutput {
  qualityScore: number
  overallStatus: string
  pass: number
  warn: number
  fail: number
  findings: Array<{ status: string; code: string; params?: Record<string, string | number> }>
}

// ─── 6. Repair ────────────────────────────────────────────────────────────────

export interface RepairInput {
  nombreDelPlan: string
  persona: string
  attempt: number
  maxAttempts: number
  failingFindings: SimulationFinding[]
  currentEventCount: number
}

export interface RepairOutput {
  newPlanId: string
  repairedEventCount: number
  repairNotes: string
  tokensUsed: { input: number; output: number }
}

// ─── 7. Output ────────────────────────────────────────────────────────────────

export interface OutputInput {
  persona: string
  nombreDelPlan: string
  deliveryMode: string
  finalQualityScore: number
  repairAttempts: number
}

export interface OutputOutput {
  deliveryMode: string
  finalQualityScore: number
  unresolvableFindings: SimulationFinding[]
  honestWarning?: string
}

// ─── Registry type for context ────────────────────────────────────────────────

export interface PhaseIORegistry {
  intake?: PhaseIO<IntakeInput, IntakeOutput>
  enrich?: PhaseIO<EnrichInput, EnrichOutput>
  readiness?: PhaseIO<ReadinessInput, ReadinessOutput>
  build?: PhaseIO<BuildInput, BuildOutput>
  simulate?: PhaseIO<SimulateInput, SimulateOutput>
  repair?: PhaseIO<RepairInput, RepairOutput>
  output?: PhaseIO<OutputInput, OutputOutput>
}
