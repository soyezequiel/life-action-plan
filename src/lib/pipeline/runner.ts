import { processIntake, processPlanBuild, processPlanSimulate } from '../services'
import { runReadinessGate } from './readiness-gate'
import { evaluateQualityGate } from './quality-gate'
import { parseStoredProfile, getProfileTimezone } from '../domain/plan-helpers'
import { getProfile, getProgressByPlan, seedProgressFromEvents } from '../db/db-helpers'
import { getProvider } from '../providers/provider-factory'
import { enrichProfile } from '../skills/profile-enricher'
import { repairPlan } from '../skills/plan-repairer'
import type { PipelineContext, PipelinePhase, PipelineStepTracker, DeliveryMode } from './contracts'
import type { RunnerConfig } from '../../../scripts/runner-config.schema'
import type { SimulationFinding, PlanSimulationSnapshot } from '../../shared/types/lap-api'
import type { PlanEvent } from '../skills/plan-builder'
import { intakeEnrichedToProfile } from '../skills/plan-intake'
import type { 
  IntakeInput, IntakeOutput, EnrichInput, EnrichOutput, ReadinessInput, ReadinessOutput, 
  BuildInput, BuildOutput, SimulateInput, SimulateOutput, RepairInput, RepairOutput, 
  OutputInput, OutputOutput 
} from './phase-io'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFailingFindings(snapshot: PlanSimulationSnapshot): SimulationFinding[] {
  return snapshot.findings.filter(f => f.status === 'FAIL' || f.status === 'WARN')
}

// ─── FlowRunner ───────────────────────────────────────────────────────────────

export class FlowRunner {
  private context: PipelineContext

  constructor(config: RunnerConfig, initialState: Partial<PipelineContext> = {}) {
    this.context = {
      config,
      results: {},
      phaseIO: {},
      ...initialState
    }
  }

  getContext() {
    return this.context
  }

  // ── Single-phase execution (used from CLI with --phase flag) ────────────────

  async executePhase(phase: PipelinePhase, tracker: PipelineStepTracker = {}): Promise<any> {
    tracker.onPhaseStart?.(phase)

    try {
      let result: any

      switch (phase) {
        case 'intake':
          result = await this._runIntakePhase()
          break

        case 'enrich':
          result = await this._runEnrichPhase(tracker)
          break

        case 'readiness':
          result = await this._runReadinessPhase()
          break

        case 'build':
          result = await this._runBuildPhase(tracker)
          break

        case 'simulate':
          result = await this._runSimulatePhase(tracker)
          break

        case 'repair':
          result = await this._runRepairPhase(tracker)
          break

        case 'output':
          result = this._assembleOutput()
          break

        default:
          throw new Error(`UNSUPPORTED_PHASE:${phase}`)
      }

      // Notify tracker with IO data
      const io = this.context.phaseIO[phase]
      tracker.onPhaseSuccess?.(phase, result, io)
      return result
    } catch (error) {
      const finalError = error instanceof Error ? error : new Error(String(error))
      tracker.onPhaseFailure?.(phase, finalError)
      throw finalError
    }
  }

  // ── Fast pipeline (identical to v1 behaviour) ───────────────────────────────

  async runFastPipeline(tracker: PipelineStepTracker = {}): Promise<any> {
    await this.executePhase('intake', tracker)
    await this.executePhase('build', tracker)
    await this.executePhase('simulate', tracker)

    // Fast mode: deliver whatever the simulation produced
    const sim = this.context.results.simulate?.simulation
    this.context.output = {
      deliveryMode: sim?.summary.overallStatus === 'PASS' ? 'pass'
        : sim?.summary.overallStatus === 'FAIL' ? 'best-effort'
        : 'warn-acceptable',
      finalQualityScore: sim?.qualityScore ?? 0
    }

    return this.executePhase('output', tracker)
  }

  // ── Deep pipeline (v2: enrich → readiness → build → simulate → repair loop) ─

  async runDeepPipeline(tracker: PipelineStepTracker = {}): Promise<any> {
    const pipelineCfg = this.context.config.pipeline
    const maxAttempts = pipelineCfg?.maxRepairAttempts ?? 3
    const skipEnrichment = pipelineCfg?.skipEnrichment ?? false

    // 1. Intake
    await this.executePhase('intake', tracker)

    // 2. Profile Enrichment (optional)
    if (!skipEnrichment) {
      try {
        await this.executePhase('enrich', tracker)
      } catch (err) {
        // Enrichment failure is non-fatal — continue with base profile
        console.error('[LAP Runner] Enrichment failed (non-fatal):', err instanceof Error ? err.message : String(err))
      }
    }

    // 3. Readiness Gate
    await this.executePhase('readiness', tracker)

    // 4. First build
    await this.executePhase('build', tracker)

    // 5. Simulate + repair loop
    let attempt = 1
    let previousScore: number | undefined

    while (true) {
      await this.executePhase('simulate', tracker)

      const simulation = this.context.results.simulate!.simulation
      const score = simulation.qualityScore ?? 0

      // Update repair tracking
      if (!this.context.repair) {
        this.context.repair = {
          attempts: attempt,
          history: [],
          bestSimulation: simulation,
          bestPlanId: this.context.planId ?? null,
          lastFindings: getFailingFindings(simulation)
        }
      } else {
        this.context.repair.attempts = attempt
        this.context.repair.lastFindings = getFailingFindings(simulation)
        // Track best result
        const bestScore = this.context.repair.bestSimulation?.qualityScore ?? 0
        if (score > bestScore) {
          this.context.repair.bestSimulation = simulation
          this.context.repair.bestPlanId = this.context.planId ?? null
        }
      }

      const decision = evaluateQualityGate(simulation, attempt, maxAttempts, previousScore)

      if (decision === 'deliver') {
        if (attempt === 1) tracker.onPhaseSkipped?.('repair')
        this.context.output = {
          deliveryMode: simulation.summary.overallStatus === 'PASS' ? 'pass' : 'warn-acceptable',
          finalQualityScore: score
        }
        break
      }

      if (decision === 'best-effort') {
        if (attempt === 1) tracker.onPhaseSkipped?.('repair')
        // Use the best simulation we've seen
        const best = this.context.repair?.bestSimulation ?? simulation
        this.context.results.simulate = { simulation: best }
        this.context.output = {
          deliveryMode: 'best-effort',
          finalQualityScore: best.qualityScore ?? score
        }
        break
      }

      // decision === 'repair' — run repair and loop
      tracker.onRepairAttempt?.(attempt, maxAttempts, getFailingFindings(simulation))
      previousScore = score
      attempt++

      await this.executePhase('repair', tracker)
    }

    return this.executePhase('output', tracker)
  }

  // ── Entry point ─────────────────────────────────────────────────────────────

  async runFullPipeline(tracker: PipelineStepTracker = {}): Promise<any> {
    const mode = this.context.config.pipeline?.mode ?? 'deep'
    if (mode === 'fast') {
      return this.runFastPipeline(tracker)
    }
    return this.runDeepPipeline(tracker)
  }

  // ── Phase implementations ───────────────────────────────────────────────────

  private async _runIntakePhase(): Promise<any> {
    const startedAt = new Date().toISOString()
    const t0 = Date.now()

    // 1. Construir input tipado
    const cfg = this.context.config.intake
    const phaseInput: IntakeInput = {
      nombre: cfg.nombre,
      edad: cfg.edad,
      ubicacion: cfg.ubicacion,
      ocupacion: cfg.ocupacion,
      objetivo: cfg.objetivo,
    }

    // 2. Ejecutar lógica existente
    const result = await processIntake(cfg)
    this.context.profileId = result.profileId
    this.context.results.intake = result

    // 3. Extraer profile summary para el visualizador
    try {
      const profileRow = await getProfile(result.profileId)
      if (profileRow) {
        const profile = parseStoredProfile(profileRow.data)
        if (profile) {
          const p = profile.participantes[0]
          this.context.intakeSummary = {
            nombre: p?.datosPersonales?.nombre ?? '',
            edad: p?.datosPersonales?.edad ?? 0,
            ciudad: p?.datosPersonales?.ubicacion?.ciudad ?? '',
            objetivo: profile.objetivos[0]?.descripcion ?? ''
          }
        }
      }
    } catch {
      // Non-fatal: intake summary is optional for the visualizer
    }

    // 4. Construir output tipado
    const phaseOutput: IntakeOutput = {
      profileId: result.profileId,
      nombre: this.context.intakeSummary?.nombre ?? '',
      edad: this.context.intakeSummary?.edad ?? 0,
      ciudad: this.context.intakeSummary?.ciudad ?? '',
      objetivo: this.context.intakeSummary?.objetivo ?? '',
    }

    // 5. Guardar PhaseIO
    this.context.phaseIO.intake = {
      input: phaseInput,
      output: phaseOutput,
      processing: 'Convierte los datos crudos del formulario en un perfil estructurado (Perfil) con participantes, objetivos y calendario. Lo persiste en PostgreSQL.',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    }

    return result
  }

  private async _runEnrichPhase(tracker: PipelineStepTracker): Promise<any> {
    const startedAt = new Date().toISOString()
    const t0 = Date.now()

    if (!this.context.profileId) throw new Error('MISSING_PROFILE_ID_FOR_ENRICH')

    const profileRow = await getProfile(this.context.profileId)
    if (!profileRow) throw new Error('PROFILE_NOT_FOUND_FOR_ENRICH')

    const profile = parseStoredProfile(profileRow.data)
    if (!profile) throw new Error('PROFILE_PARSE_ERROR_FOR_ENRICH')

    const buildCfg = this.context.config.build
    const provider = buildCfg.provider ?? 'openai:gpt-4o-mini'

    const p = profile.participantes[0]
    const phaseInput: EnrichInput = {
      persona: p?.datosPersonales?.nombre ?? 'Sin nombre',
      edad: p?.datosPersonales?.edad ?? 0,
      ciudad: p?.datosPersonales?.ubicacion?.ciudad ?? '',
      ocupacion: this.context.config.intake?.ocupacion ?? '',
      objetivo: profile.objetivos?.[0]?.descripcion ?? '',
      provider: provider,
    }

    const { resolvePlanBuildExecution } = await import('../runtime/build-execution')
    const resolvedExecution = await resolvePlanBuildExecution({
      modelId: provider,
      requestedMode: buildCfg.resourceMode === 'codex' ? 'codex-cloud' : 
                     buildCfg.resourceMode === 'backend' ? 'backend-cloud' : 
                     buildCfg.resourceMode === 'user' ? 'user-cloud' : undefined,
      userSuppliedApiKey: buildCfg.apiKey,
    })

    if (!resolvedExecution.runtime) {
      throw new Error('FAILED_TO_RESOLVE_RUNTIME_FOR_ENRICH')
    }

    const runtime = getProvider(resolvedExecution.runtime.modelId, {
      apiKey: resolvedExecution.runtime.apiKey,
      baseURL: resolvedExecution.runtime.baseURL
    })
    const ctx = {
      planDir: '',
      profileId: this.context.profileId,
      userLocale: 'es-AR',
      formalityLevel: 'informal' as const,
      tokenMultiplier: 1.0
    }

    const enrichResult = await enrichProfile(runtime, profile, ctx)

    // Persist enriched profile back to DB
    const { createProfile } = await import('../db/db-helpers')
    const enrichedProfileId = await createProfile(
      JSON.stringify(enrichResult.enrichedProfile),
      null
    )
    // Update context to use the enriched profile going forward
    this.context.profileId = enrichedProfileId
    this.context.results.intake = { profileId: enrichedProfileId }

    this.context.enrichment = {
      inferences: enrichResult.inferences,
      warnings: enrichResult.warnings
    }

    const phaseOutput: EnrichOutput = {
      enrichedProfileId: enrichedProfileId,
      inferences: enrichResult.inferences,
      warnings: enrichResult.warnings,
      tokensUsed: enrichResult.tokensUsed,
    }

    this.context.phaseIO.enrich = {
      input: phaseInput,
      output: phaseOutput,
      processing: 'Envía el perfil base al LLM para inferir campos faltantes (horarios, preferencias, obstáculos). Guarda el perfil enriquecido como nueva versión en DB.',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    }

    return enrichResult
  }

  private async _runReadinessPhase(): Promise<any> {
    const startedAt = new Date().toISOString()
    const t0 = Date.now()

    if (!this.context.profileId) throw new Error('MISSING_PROFILE_ID_FOR_READINESS')

    const profileRow = await getProfile(this.context.profileId)
    if (!profileRow) throw new Error('PROFILE_NOT_FOUND_FOR_READINESS')

    const profile = parseStoredProfile(profileRow.data)
    if (!profile) throw new Error('PROFILE_PARSE_ERROR_FOR_READINESS')

    const pR = profile.participantes[0]
    const phaseInput: ReadinessInput = {
      persona: pR?.datosPersonales?.nombre ?? 'Sin nombre',
      objetivo: profile.objetivos?.[0]?.descripcion ?? '',
      objectiveCount: profile.objetivos?.length ?? 0,
      freeHoursWeekday: pR?.calendario?.horasLibresEstimadas?.diasLaborales ?? 0,
      freeHoursWeekend: pR?.calendario?.horasLibresEstimadas?.diasDescanso ?? 0,
    }

    const gateResult = runReadinessGate(profile)

    if (!gateResult.ready) {
      const errorLines = gateResult.errors.join('\n  - ')
      throw new Error(`READINESS_GATE_FAILED:\n  - ${errorLines}`)
    }

    this.context.readiness = {
      warnings: gateResult.warnings,
      constraints: gateResult.constraints
    }

    const phaseOutput: ReadinessOutput = {
      ready: gateResult.ready,
      errors: gateResult.errors,
      warnings: gateResult.warnings,
      constraints: gateResult.constraints,
    }

    this.context.phaseIO.readiness = {
      input: phaseInput,
      output: phaseOutput,
      processing: 'Valida que el perfil tenga los datos mínimos para generar un plan viable: objetivos definidos, horas libres positivas, horarios coherentes y carga factible.',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    }

    return gateResult
  }

  private async _runBuildPhase(tracker: PipelineStepTracker): Promise<any> {
    const startedAt = new Date().toISOString()
    const t0 = Date.now()

    if (!this.context.profileId) throw new Error('MISSING_PROFILE_ID_FOR_BUILD')

    const lastFindings = this.context.repair?.lastFindings
    const constraints = this.context.readiness?.constraints

    const phaseInput: BuildInput = {
      persona: this.context.intakeSummary?.nombre ?? 'Sin nombre',
      objetivo: this.context.intakeSummary?.objetivo ?? '',
      provider: this.context.config.build.provider ?? 'auto',
      horasLibresLaborales: this.context.readiness?.constraints ? 0 : (this.context.phaseIO.readiness?.input as any)?.freeHoursWeekday ?? 0,
      horasLibresFinDeSemana: this.context.phaseIO.readiness?.input as any ? (this.context.phaseIO.readiness?.input as any)?.freeHoursWeekend ?? 0 : 0,
      constraints: constraints ?? [],
      previousFindings: lastFindings,
    }

    const result = await processPlanBuild({
      profileId: this.context.profileId,
      provider: this.context.config.build.provider,
      apiKey: this.context.config.build.apiKey || '',
      thinkingMode: this.context.config.build.thinkingMode,
      resourceMode: this.context.config.build.resourceMode || 'auto',
      previousFindings: lastFindings,
      buildConstraints: constraints
    }, {
      onProgress: (p) => tracker.onProgress?.('build', p)
    })
    this.context.planId = result.planId
    this.context.results.build = result

    const phaseOutput: BuildOutput = {
      planId: result.planId,
      nombre: result.nombre,
      resumen: result.resumen,
      eventCount: result.eventos?.length ?? 0,
      eventos: result.eventos ?? [],
      tokensUsed: result.tokensUsed,
      fallbackUsed: result.fallbackUsed,
    }

    this.context.phaseIO.build = {
      input: phaseInput,
      output: phaseOutput,
      processing: 'Genera el plan semanal de actividades usando el LLM. Produce eventos con día, hora, duración y categoría. Guarda el plan en DB y siembra el progreso inicial.',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    }

    return result
  }

  private async _runSimulatePhase(tracker: PipelineStepTracker): Promise<any> {
    const startedAt = new Date().toISOString()
    const t0 = Date.now()

    if (!this.context.planId) throw new Error('MISSING_PLAN_ID_FOR_SIMULATE')

    const buildOutput = this.context.phaseIO.build?.output as BuildOutput | undefined
    const phaseInput: SimulateInput = {
      nombreDelPlan: buildOutput?.nombre ?? this.context.results.build?.nombre ?? 'Sin nombre',
      eventCount: buildOutput?.eventCount ?? this.context.results.build?.eventos?.length ?? 0,
      mode: this.context.config.simulate.mode ?? 'automatic',
    }

    const result = await processPlanSimulate({
      planId: this.context.planId,
      mode: this.context.config.simulate.mode
    }, {
      onProgress: (p) => tracker.onProgress?.('simulate', p)
    })
    this.context.results.simulate = { simulation: result.simulation }

    const sim = result.simulation
    const phaseOutput: SimulateOutput = {
      qualityScore: sim.qualityScore ?? 0,
      overallStatus: sim.summary.overallStatus,
      pass: sim.summary.pass,
      warn: sim.summary.warn,
      fail: sim.summary.fail,
      findings: sim.findings.map(f => ({ status: f.status, code: f.code, params: f.params })),
    }

    this.context.phaseIO.simulate = {
      input: phaseInput,
      output: phaseOutput,
      processing: 'Ejecuta una simulación determinística del plan: verifica horarios, colisiones con trabajo, carga diaria, energía y cobertura de objetivos. Produce un puntaje 0-100.',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    }

    return result
  }

  private async _runRepairPhase(tracker: PipelineStepTracker): Promise<any> {
    const startedAt = new Date().toISOString()
    const t0 = Date.now()

    if (!this.context.planId) throw new Error('MISSING_PLAN_ID_FOR_REPAIR')
    if (!this.context.profileId) throw new Error('MISSING_PROFILE_ID_FOR_REPAIR')

    const simulation = this.context.results.simulate?.simulation
    if (!simulation) throw new Error('MISSING_SIMULATION_FOR_REPAIR')

    const failingFindings = getFailingFindings(simulation)

    // Load profile and current plan events
    const profileRow = await getProfile(this.context.profileId)
    if (!profileRow) throw new Error('PROFILE_NOT_FOUND_FOR_REPAIR')
    const profile = parseStoredProfile(profileRow.data)
    if (!profile) throw new Error('PROFILE_PARSE_ERROR_FOR_REPAIR')

    const rows = await getProgressByPlan(this.context.planId)
    const currentEvents: PlanEvent[] = rows
      .filter(r => r.notas)
      .map(r => {
        try { return JSON.parse(r.notas ?? '') } catch { return null }
      })
      .filter(Boolean)

    if (currentEvents.length === 0) {
      // No events to repair — bail out
      throw new Error('REPAIR_NO_EVENTS_FOUND')
    }

    const buildCfg = this.context.config.build
    const provider = buildCfg.provider ?? 'openai:gpt-4o-mini'

    const repairAttempt = this.context.repair?.attempts ?? 1
    const phaseInput: RepairInput = {
      nombreDelPlan: this.context.results.build?.nombre ?? 'Sin nombre',
      persona: this.context.intakeSummary?.nombre ?? 'Sin nombre',
      attempt: repairAttempt,
      maxAttempts: this.context.config.pipeline?.maxRepairAttempts ?? 3,
      failingFindings: failingFindings,
      currentEventCount: currentEvents.length,
    }

    const { resolvePlanBuildExecution } = await import('../runtime/build-execution')
    const resolvedExecution = await resolvePlanBuildExecution({
      modelId: provider,
      requestedMode: buildCfg.resourceMode === 'codex' ? 'codex-cloud' : 
                     buildCfg.resourceMode === 'backend' ? 'backend-cloud' : 
                     buildCfg.resourceMode === 'user' ? 'user-cloud' : undefined,
      userSuppliedApiKey: buildCfg.apiKey,
    })

    if (!resolvedExecution.runtime) {
      throw new Error('FAILED_TO_RESOLVE_RUNTIME_FOR_REPAIR')
    }

    const runtime = getProvider(resolvedExecution.runtime.modelId, {
      apiKey: resolvedExecution.runtime.apiKey,
      baseURL: resolvedExecution.runtime.baseURL
    })
    const ctx = {
      planDir: '',
      profileId: this.context.profileId,
      planId: this.context.planId,
      userLocale: 'es-AR',
      formalityLevel: 'informal' as const,
      tokenMultiplier: 1.0
    }

    const repairResult = await repairPlan(
      runtime,
      currentEvents,
      failingFindings,
      profile,
      ctx,
      repairAttempt,
      {
        onStatus: (msg) => console.error(`[LAP Runner] Repair: ${msg}`)
      }
    )

    // Record history
    if (this.context.repair) {
      this.context.repair.history.push({
        attempt: repairAttempt,
        findingsCount: failingFindings.length,
        qualityScore: simulation.qualityScore ?? 0,
        repairNotes: repairResult.repairNotes
      })
    }

    // Persist repaired events to DB to create a new plan version
    const timezone = getProfileTimezone(profile)
    const { createPlan } = await import('../db/db-helpers')
    const { createUniquePlanSlug, buildPlanManifest } = await import('../domain/plan-helpers')

    const build = this.context.results.build!
    const planSlug = await createUniquePlanSlug(`${build.nombre} (reparado)`)

    const noop = {} as any
    const manifest = buildPlanManifest({
      nombre: `${build.nombre} (repaired)`,
      fallbackUsed: build.fallbackUsed,
      modelId: buildCfg.provider ?? 'unknown',
      tokensInput: repairResult.tokensUsed.input,
      tokensOutput: repairResult.tokensUsed.output,
      costUsd: 0,
      costSats: 0,
      charge: noop
    })

    const newPlanId = await createPlan(this.context.profileId, `${build.nombre} (repaired)`, planSlug, manifest)
    await seedProgressFromEvents(newPlanId, repairResult.repairedEvents, timezone)

    // Swap to new plan ID for next simulation
    this.context.planId = newPlanId

    const phaseOutput: RepairOutput = {
      newPlanId: newPlanId,
      repairedEventCount: repairResult.repairedEvents.length,
      repairNotes: repairResult.repairNotes,
      tokensUsed: repairResult.tokensUsed,
    }

    this.context.phaseIO.repair = {
      input: phaseInput,
      output: phaseOutput,
      processing: 'Envía los hallazgos fallidos al agente reparador LLM para que corrija los eventos problemáticos. Genera una nueva versión del plan con los eventos reparados.',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    }

    return { planId: newPlanId, repairResult }
  }

  private _assembleOutput(): any {
    const startedAt = new Date().toISOString()
    const t0 = Date.now()

    const deliveryMode: DeliveryMode = this.context.output?.deliveryMode ?? 'best-effort'
    const simulation = this.context.results.simulate?.simulation

    const phaseInput: OutputInput = {
      persona: this.context.intakeSummary?.nombre ?? 'Sin nombre',
      nombreDelPlan: this.context.results.build?.nombre ?? 'Sin nombre',
      deliveryMode,
      finalQualityScore: this.context.output?.finalQualityScore ?? 0,
      repairAttempts: this.context.repair?.attempts ?? 0,
    }

    const base = {
      profileId: this.context.profileId,
      planId: this.context.planId,
      build: this.context.results.build,
      simulation
    }

    let finalResult: any = base

    if (this.context.repair || this.context.enrichment || this.context.readiness) {
      finalResult = {
        ...base,
        meta: {
          deliveryMode,
          finalQualityScore: this.context.output?.finalQualityScore ?? simulation?.qualityScore ?? 0,
          attempts: this.context.repair?.attempts ?? 1,
          repairHistory: this.context.repair?.history ?? [],
          enrichmentInferences: this.context.enrichment?.inferences?.length ?? 0,
          readinessWarnings: this.context.readiness?.warnings ?? [],
          readinessConstraints: this.context.readiness?.constraints ?? [],
          unresolvableFindings: deliveryMode === 'best-effort'
            ? (this.context.repair?.lastFindings ?? getFailingFindings(simulation ?? { findings: [] } as any))
            : [],
          honestWarning: deliveryMode === 'best-effort'
            ? 'Este plan tiene problemas conocidos que no pudimos resolver automáticamente. Revisalo antes de ejecutarlo.'
            : undefined
        }
      }
    }

    const phaseOutput: OutputOutput = {
      deliveryMode,
      finalQualityScore: this.context.output?.finalQualityScore ?? simulation?.qualityScore ?? 0,
      unresolvableFindings: finalResult.meta?.unresolvableFindings ?? [],
      honestWarning: finalResult.meta?.honestWarning,
    }

    this.context.phaseIO.output = {
      input: phaseInput,
      output: phaseOutput,
      processing: 'Evalúa la calidad final del plan y decide el modo de entrega: aprobado, aceptable con avisos o mejor esfuerzo. Ensambla el resultado final del pipeline.',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    }

    return finalResult
  }
}
