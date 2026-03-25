import type { PipelineContext } from '../pipeline/contracts'

// ─── PipelineRuntimeData ──────────────────────────────────────────────────────
// Snapshot serializable del estado del pipeline para el dashboard de debug.
// Persiste en tmp/pipeline-context.json y se sirve via /api/debug/pipeline-context.

export type PhaseStatus = 'pending' | 'running' | 'success' | 'error'

export interface PipelineRuntimeData {
  updatedAt: string
  phaseStatuses: Record<string, PhaseStatus>
  intake?: {
    profileId: string
  }
  enrich?: {
    inferences: Array<{
      field: string
      value: string
      confidence: string
      reason: string
    }>
    warnings: string[]
  }
  readiness?: {
    warnings: string[]
    constraints: string[]
  }
  build?: {
    planId: string
    nombre: string
    eventCount: number
    eventos: Array<{
      semana: number
      dia: string
      hora: string
      duracion: number
      actividad: string
      categoria: string
    }>
  }
  simulate?: {
    qualityScore: number
    findings: Array<{
      status: string
      code: string
      params?: Record<string, string | number>
    }>
    summary: {
      pass: number
      warn: number
      fail: number
    }
  }
  repair?: {
    attempts: number
    history: Array<{
      attempt: number
      findingsCount: number
      qualityScore: number
      repairNotes: string
    }>
  }
  output?: {
    deliveryMode: string
    finalQualityScore: number
    warnings?: string[]
  }
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function mapContextToRuntimeData(
  context: PipelineContext,
  phaseStatuses: Record<string, PhaseStatus> = {}
): PipelineRuntimeData {
  const data: PipelineRuntimeData = {
    updatedAt: new Date().toISOString(),
    phaseStatuses
  }

  if (context.profileId) {
    data.intake = { profileId: context.profileId }
  }

  if (context.enrichment) {
    data.enrich = {
      inferences: context.enrichment.inferences.map(inf => ({
        field: inf.field,
        value: inf.value != null ? String(inf.value) : '',
        confidence: inf.confidence,
        reason: inf.reason
      })),
      warnings: context.enrichment.warnings
    }
  }

  if (context.readiness) {
    data.readiness = {
      warnings: context.readiness.warnings,
      constraints: context.readiness.constraints
    }
  }

  if (context.results.build) {
    const build = context.results.build
    data.build = {
      planId: build.planId,
      nombre: build.nombre,
      eventCount: build.eventos?.length ?? 0,
      eventos: (build.eventos ?? []).map(ev => ({
        semana: ev.semana,
        dia: ev.dia,
        hora: ev.hora,
        duracion: ev.duracion,
        actividad: ev.actividad,
        categoria: ev.categoria
      }))
    }
  }

  if (context.results.simulate?.simulation) {
    const sim = context.results.simulate.simulation
    data.simulate = {
      qualityScore: sim.qualityScore ?? 0,
      findings: sim.findings.map(f => ({
        status: f.status,
        code: f.code,
        params: f.params
      })),
      summary: {
        pass: sim.summary.pass,
        warn: sim.summary.warn,
        fail: sim.summary.fail
      }
    }
  }

  if (context.repair) {
    data.repair = {
      attempts: context.repair.attempts,
      history: context.repair.history.map(h => ({
        attempt: h.attempt,
        findingsCount: h.findingsCount,
        qualityScore: h.qualityScore,
        repairNotes: h.repairNotes
      }))
    }
  }

  if (context.output) {
    data.output = {
      deliveryMode: context.output.deliveryMode,
      finalQualityScore: context.output.finalQualityScore
    }
  }

  return data
}
