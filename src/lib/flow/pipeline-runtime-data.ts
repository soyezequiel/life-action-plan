import type { PipelineContext } from '../pipeline/contracts'

// ─── PipelineRuntimeData ──────────────────────────────────────────────────────
// Snapshot serializable del estado del pipeline para el dashboard de debug.
// Persiste en tmp/pipeline-context.json y se sirve via /api/debug/pipeline-context.

export type PhaseStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped'

export interface PipelineRuntimeData {
  updatedAt: string
  phaseStatuses: Record<string, PhaseStatus>
  // v3: datos estructurados por fase con input/output explícito
  phases: Record<string, {
    input: Record<string, unknown>
    output: Record<string, unknown>
    processing: string
    startedAt: string
    finishedAt: string
    durationMs: number
  }>
  // v2 legacy: mantener mientras el viewer migra (DEPRECAR luego)
  intake?: {
    profileId: string
    nombre?: string
    edad?: number
    ciudad?: string
    objetivo?: string
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
    resumen?: string
    fallbackUsed?: boolean
    tokensUsed?: { input: number; output: number }
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
  phaseStatuses: Record<string, PhaseStatus>
): PipelineRuntimeData {
  // v3: Mapear PhaseIORegistry a un objeto plano para el frontend
  const phases: Record<string, any> = {}
  Object.entries(context.phaseIO).forEach(([phase, io]) => {
    if (io) {
      phases[phase] = {
        input: io.input,
        output: io.output,
        processing: io.processing,
        startedAt: io.startedAt,
        finishedAt: io.finishedAt,
        durationMs: io.durationMs
      }
    }
  })

  const results: PipelineRuntimeData = {
    updatedAt: new Date().toISOString(),
    phaseStatuses,
    phases,
  }

  // Legacy mappings (V2 compatibility)
  if (context.intakeSummary) {
    results.intake = {
      profileId: context.profileId || '',
      ...context.intakeSummary
    }
  }

  if (context.enrichment) {
    results.enrich = {
      inferences: context.enrichment.inferences.map(inf => ({
        field: inf.field,
        value: String(inf.value),
        confidence: inf.confidence,
        reason: inf.reason
      })),
      warnings: context.enrichment.warnings
    }
  }

  if (context.readiness) {
    results.readiness = {
      warnings: context.readiness.warnings,
      constraints: context.readiness.constraints
    }
  }

  const build = context.results.build
  if (build) {
    results.build = {
      planId: context.planId || '',
      nombre: build.nombre,
      eventCount: build.eventos?.length ?? 0,
      resumen: build.resumen,
      fallbackUsed: build.fallbackUsed,
      tokensUsed: build.tokensUsed,
      eventos: (build.eventos || []).map(e => ({
        semana: e.semana,
        dia: e.dia,
        hora: e.hora,
        duracion: e.duracion,
        actividad: e.actividad,
        categoria: e.categoria
      }))
    }
  }

  const simulate = context.results.simulate?.simulation
  if (simulate) {
    results.simulate = {
      qualityScore: simulate.qualityScore ?? 0,
      findings: simulate.findings.map(f => ({
        status: f.status,
        code: f.code,
        params: f.params
      })),
      summary: {
        pass: simulate.summary.pass,
        warn: simulate.summary.warn,
        fail: simulate.summary.fail
      }
    }
  }

  if (context.repair) {
    results.repair = {
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
    results.output = {
      deliveryMode: context.output.deliveryMode,
      finalQualityScore: context.output.finalQualityScore,
      warnings: results.readiness?.warnings
    }
  }

  return results
}
