import { DateTime } from 'luxon'
import { z } from 'zod'

import { saveCredentialConfiguration } from '../../auth/credential-config'
import { getApiKeySettingKey } from '../../auth/user-settings'
import {
  createProfile,
  getLatestProfileIdForUser,
  getPlanWorkflow,
  getProfile
} from '../../db/db-helpers'
import {
  createInteractiveSession,
  deleteInteractiveSession,
  getInteractiveSession,
  updateInteractiveSession,
  type InteractiveSessionRecord
} from '../../db/interactive-sessions'
import { getDeploymentMode } from '../../env/deployment'
import {
  getProfileTimezone,
  parseStoredProfile
} from '../../domain/plan-helpers'
import { persistPlanFromV5Package } from '../../domain/plan-v5-activation'
import { TimeEventItemSchema } from '../../domain/plan-item'
import { GoalTypeSchema } from '../../domain/goal-taxonomy'
import {
  PIPELINE_V5_PHASES,
  createPipelineRuntimeRecorder,
  persistPipelineRuntimeData,
  type PipelineRuntimeData,
  type PipelineRuntimeRecorder
} from '../../flow/pipeline-runtime-data'
import { getProvider } from '../../providers/provider-factory'
import {
  getModelProviderName,
  resolveBuildModel
} from '../../providers/provider-metadata'
import {
  resolvePlanBuildExecution,
  type ResolvedPlanBuildExecution
} from '../../runtime/build-execution'
import type {
  AvailabilityWindow,
  SchedulerInput,
  SchedulerOutput
} from '../../scheduler/types'
import {
  buildSchedulingContextFromProfile,
  resolveWeekStartDate
} from './scheduling-context'
import { executeHardValidator } from './hard-validator'
import { evaluateOperationalAcceptance } from './operational-acceptance'
import type {
  FlowRunnerV5Context,
  FlowRunnerV5Tracker,
  PipelinePhaseV5
} from './runner'
import { FlowRunnerV5 } from './runner'
import type {
  PackageOutput,
  RepairOutput,
  UserProfileV5,
  V5PhaseSnapshot
} from './phase-io-v5'
import { perfilSchema, type Perfil } from '../../../shared/schemas/perfil'
import {
  interactiveConfigSchema,
  interactivePauseFromPhaseSchema,
  type InteractiveConfig,
  type InteractivePauseFromPhase,
  type InteractiveSessionCreateRequest,
  type InteractiveSessionInputRequest,
  type InteractiveSessionRuntimeRequest,
  type InteractiveSessionSeed,
  type InteractiveSessionState,
  type InteractiveSessionStatus,
  type PausePointSnapshot
} from '../../../shared/schemas/pipeline-interactive'

const DEFAULT_TIMEZONE = 'America/Buenos_Aires'
const DEFAULT_WAKE_TIME = '07:00'
const DEFAULT_SLEEP_TIME = '22:00'
const REPAIR_MAX_CYCLES = 3
const REPAIR_LOOP_PHASES = ['hardValidate', 'softValidate', 'coveVerify', 'repair'] as const

type RepairLoopPhase = (typeof REPAIR_LOOP_PHASES)[number]
type RequestedExecutionMode = 'backend-cloud' | 'backend-local' | 'user-cloud' | 'codex-cloud' | null
type InteractiveResourceMode = InteractiveSessionCreateRequest['resourceMode'] | null | undefined
type PersistedPhaseStatus = V5PhaseSnapshot['phaseStatuses'][PipelinePhaseV5]
type PersistedRepairPhaseStatus = V5PhaseSnapshot['repairTimeline'][number]['phases'][number]['status']

export interface InteractiveSessionResponse {
  sessionId: string
  status: InteractiveSessionStatus
  pausePoint: PausePointSnapshot | null
  snapshot: PipelineRuntimeData
  planId: string | null
}

interface SessionAccessContext {
  ownerUserId: string | null
  executionUserId: string
}

interface InteractiveSessionSetup {
  profileId: string
  profile: Perfil
  execution: ResolvedPlanBuildExecution
  runtimeRequest: InteractiveSessionRuntimeRequest
  seed: InteractiveSessionSeed
  config: InteractiveConfig
}

interface LoadedSession {
  record: InteractiveSessionRecord
  state: InteractiveSessionState
}

const classifyReviewInputSchema = z.object({
  goalType: GoalTypeSchema.optional(),
  context: z.string().trim().optional()
}).strict()

const requirementsAnswerSchema = z.object({
  answers: z.record(z.string(), z.string())
}).strict()

const profileEditSchema = z.object({
  freeHoursWeekday: z.number().min(0).max(12).optional(),
  freeHoursWeekend: z.number().min(0).max(16).optional(),
  energyLevel: z.enum(['low', 'medium', 'high']).optional(),
  fixedCommitments: z.array(z.string().trim().min(1)).optional(),
  scheduleConstraints: z.array(z.string().trim().min(1)).optional()
}).strict()

const scheduleEditSchema = z.object({
  events: z.array(TimeEventItemSchema)
}).strict()

const goBackInputSchema = z.object({
  action: z.literal('go_back'),
  targetPhase: interactivePauseFromPhaseSchema
}).strict()

const packageReviewInputSchema = z.object({
  action: z.enum(['accept', 'regenerate']),
  regenerateFrom: interactivePauseFromPhaseSchema.optional()
}).strict()

function nowIso(): string {
  return DateTime.utc().toISO() ?? DateTime.utc().toFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
}

function cloneJson<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeGoalText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function expiresAtForMinutes(minutes: number): string {
  return DateTime.utc().plus({ minutes }).toISO() ?? nowIso()
}

function hasBlockingFindings(context: FlowRunnerV5Context): boolean {
  return (context.hardValidate?.findings.length ?? 0) > 0
    || (context.coveVerify?.findings.some((finding) => finding.severity === 'FAIL') ?? false)
}

function buildRepairFindings(context: FlowRunnerV5Context): Array<{ severity: string; message: string }> {
  return [
    ...(context.hardValidate?.findings ?? []).map((finding) => ({
      severity: finding.severity,
      message: finding.description
    })),
    ...(context.softValidate?.findings ?? []).map((finding) => ({
      severity: finding.severity,
      message: finding.suggestion_esAR
    })),
    ...(context.coveVerify?.findings ?? []).map((finding) => ({
      severity: finding.severity,
      message: finding.answer
    }))
  ]
}

function summarizeRepairLoopPhase(phase: RepairLoopPhase, output: unknown): string | null {
  const payload = output && typeof output === 'object'
    ? output as Record<string, unknown>
    : null

  if (!payload) {
    return null
  }

  if (phase === 'hardValidate') {
    return `${Array.isArray(payload.findings) ? payload.findings.length : 0} FAIL`
  }

  if (phase === 'softValidate' || phase === 'coveVerify') {
    const findings = Array.isArray(payload.findings) ? payload.findings : []
    const failCount = findings.filter((finding) => (
      finding && typeof finding === 'object' && (finding as Record<string, unknown>).severity === 'FAIL'
    )).length
    const warnCount = findings.filter((finding) => (
      finding && typeof finding === 'object' && (finding as Record<string, unknown>).severity === 'WARN'
    )).length
    const infoCount = findings.filter((finding) => (
      finding && typeof finding === 'object' && (finding as Record<string, unknown>).severity === 'INFO'
    )).length

    if (failCount > 0) {
      return `${failCount} FAIL`
    }

    if (warnCount > 0) {
      return `${warnCount} WARN`
    }

    return `${infoCount} INFO`
  }

  return `${Array.isArray(payload.patchesApplied) ? payload.patchesApplied.length : 0} patches`
}

function extractRepairScores(output: unknown): { scoreBefore: number | null; scoreAfter: number | null } {
  const payload = output && typeof output === 'object'
    ? output as Record<string, unknown>
    : null

  return {
    scoreBefore: typeof payload?.scoreBefore === 'number' ? payload.scoreBefore : null,
    scoreAfter: typeof payload?.scoreAfter === 'number' ? payload.scoreAfter : null
  }
}

function skippedPhaseMessage(phase: PipelinePhaseV5): string {
  if (phase === 'repair') {
    return 'Repair skipped because the validation loop found no blocking issues.'
  }

  if (phase === 'adapt') {
    return 'Adapt skipped because there are no activity logs for this run.'
  }

  return `Phase ${phase} was skipped.`
}

function getRepairLoopCycle(phase: RepairLoopPhase, repairCycles: number): number {
  if (phase === 'repair') {
    return Math.max(repairCycles, 1)
  }

  return repairCycles + 1
}

function getPlanIdFromSnapshot(snapshot: PipelineRuntimeData): string | null {
  const packagePause = snapshot.pauseHistory
    .slice()
    .reverse()
    .find((pause) => pause.type === 'package_review')

  if (!packagePause || !packagePause.userInput || typeof packagePause.userInput !== 'object') {
    return null
  }

  const candidate = (packagePause.userInput as { planId?: unknown }).planId
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : null
}

function normalizePersistedPhaseStatus(status: string | null | undefined): PersistedPhaseStatus {
  if (status === 'pending' || status === 'running' || status === 'success' || status === 'error' || status === 'skipped') {
    return status
  }

  return status === 'paused' ? 'success' : 'pending'
}

function normalizePersistedRepairPhaseStatus(status: string | null | undefined): PersistedRepairPhaseStatus {
  if (
    status === 'pending'
    || status === 'running'
    || status === 'success'
    || status === 'error'
    || status === 'skipped'
    || status === 'exhausted'
  ) {
    return status
  }

  return status === 'paused' ? 'success' : 'pending'
}

function toV5PhaseSnapshot(snapshot: PipelineRuntimeData): V5PhaseSnapshot {
  const packageOutput = snapshot.phases.package?.output as Record<string, unknown> | undefined
  const qualityScore = typeof packageOutput?.qualityScore === 'number'
    ? packageOutput.qualityScore
    : 0

  return {
    runId: snapshot.run.runId,
    modelId: snapshot.run.modelId,
    qualityScore,
    startedAt: snapshot.run.startedAt,
    finishedAt: snapshot.run.finishedAt,
    phaseTimeline: snapshot.phaseTimeline,
    phaseStatuses: Object.fromEntries(
      Object.entries(snapshot.phaseStatuses).map(([phase, status]) => [
        phase,
        normalizePersistedPhaseStatus(status)
      ])
    ) as V5PhaseSnapshot['phaseStatuses'],
    repairTimeline: snapshot.repairTimeline.map((cycle) => ({
      ...cycle,
      phases: cycle.phases.map((phase) => ({
        ...phase,
        status: normalizePersistedRepairPhaseStatus(phase.status)
      }))
    }))
  }
}

function buildDefaultAvailability(): AvailabilityWindow[] {
  return [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday'
  ].map((day) => ({
    day,
    startTime: DEFAULT_WAKE_TIME,
    endTime: DEFAULT_SLEEP_TIME
  }))
}

function buildDefaultProfile(goalText: string, timezone: string): Perfil {
  return perfilSchema.parse({
    version: '3.0',
    planificacionConjunta: false,
    participantes: [
      {
        id: 'p1',
        datosPersonales: {
          nombre: 'Usuario',
          edad: 30,
          sexo: 'no_informado',
          ubicacion: {
            ciudad: 'Buenos Aires',
            pais: 'AR',
            zonaHoraria: timezone,
            zonaHorariaSecundaria: null,
            feriadosRelevantes: [],
            conectividad: 'alta',
            accesoCursos: 'online',
            distanciaCentroUrbano: 0,
            transporteDisponible: 'publico',
            adversidadesLocales: []
          },
          idioma: 'es',
          nivelAcademico: 'no_informado',
          nivelEconomico: 'medio',
          narrativaPersonal: ''
        },
        dependientes: [],
        habilidades: {
          actuales: [],
          aprendiendo: []
        },
        condicionesSalud: [],
        patronesEnergia: {
          cronotipo: 'neutro',
          horarioPicoEnergia: '10:00',
          horarioBajoEnergia: '16:00',
          horasProductivasMaximas: 6
        },
        problemasActuales: [],
        patronesConocidos: {
          diaTipicoBueno: '',
          diaTipicoMalo: '',
          tendencias: []
        },
        rutinaDiaria: {
          porDefecto: {
            despertar: DEFAULT_WAKE_TIME,
            dormir: DEFAULT_SLEEP_TIME,
            trabajoInicio: null,
            trabajoFin: null,
            tiempoTransporte: 0
          },
          fasesHorario: []
        },
        calendario: {
          fuente: 'ninguno',
          eventosInamovibles: [],
          eventosFlexibles: [],
          horasLibresEstimadas: {
            diasLaborales: 3,
            diasDescanso: 6
          }
        },
        compromisos: []
      }
    ],
    objetivos: [
      {
        id: 'goal-1',
        descripcion: goalText,
        tipo: 'meta',
        responsable: 'p1',
        prioridad: 1,
        plazo: null,
        tipoTimeline: 'mixto',
        rangoEstimado: {
          optimista: null,
          probable: null,
          pesimista: null
        },
        motivacion: goalText,
        relaciones: [],
        horasSemanalesEstimadas: 6
      }
    ],
    estadoDinamico: {
      ultimaActualizacion: nowIso(),
      salud: 'buena',
      nivelEnergia: 'medio',
      estadoEmocional: {
        motivacion: 3,
        estres: 2,
        satisfaccion: 3
      },
      notasTemporales: [],
      umbralStaleness: 7
    }
  })
}

function resolveRequestedMode(resourceMode: InteractiveResourceMode, workflowMode?: string | null): RequestedExecutionMode {
  if (resourceMode === 'backend') {
    return 'backend-cloud'
  }

  if (resourceMode === 'user') {
    return 'user-cloud'
  }

  if (resourceMode === 'codex') {
    return 'codex-cloud'
  }

  if (workflowMode === 'service') {
    return 'backend-cloud'
  }

  if (workflowMode === 'own') {
    return 'user-cloud'
  }

  if (workflowMode === 'codex') {
    return 'codex-cloud'
  }

  if (workflowMode === 'local') {
    return 'backend-local'
  }

  return null
}

export function resolveInteractiveDefaultProvider(input: {
  provider?: string | null
  workflowProvider?: string | null
  resourceMode?: InteractiveResourceMode
  deploymentMode: ReturnType<typeof getDeploymentMode>
  hasApiKey: boolean
}): string | undefined {
  const explicitProvider = input.provider?.trim()
  if (explicitProvider) {
    return explicitProvider
  }

  const inheritedProvider = input.workflowProvider?.trim()
  if (inheritedProvider) {
    return inheritedProvider
  }

  if (
    input.deploymentMode === 'local'
    && !input.hasApiKey
    && input.resourceMode !== 'backend'
    && input.resourceMode !== 'user'
    && input.resourceMode !== 'codex'
  ) {
    return 'ollama'
  }

  return undefined
}

function buildInteractiveSeed(input: {
  goalText: string
  profileId: string
  workflowId: string | null
  profile: Perfil
}): InteractiveSessionSeed {
  const scheduling = buildSchedulingContextFromProfile(input.profile, {
    weekStartDate: resolveWeekStartDate(getProfileTimezone(input.profile))
  })
  const goalId = input.profile.objetivos[0]?.id ?? crypto.randomUUID()

  return {
    goalText: normalizeGoalText(input.goalText),
    baseGoalText: normalizeGoalText(input.goalText),
    profileId: input.profileId,
    workflowId: input.workflowId,
    goalId,
    domainHint: null,
    timezone: scheduling.timezone || DEFAULT_TIMEZONE,
    weekStartDate: scheduling.weekStartDate,
    availability: scheduling.availability.length > 0 ? scheduling.availability : buildDefaultAvailability(),
    blocked: scheduling.blocked.length > 0 ? scheduling.blocked : [],
    preferences: [],
    answers: {},
    previousProgressionKeys: [],
    initialHabitStates: [],
    activityLogs: [],
    adaptiveAnchorAt: null,
    slackPolicy: null
  }
}

function buildRunnerConfig(input: {
  runtime: ReturnType<typeof getProvider>
  seed: InteractiveSessionSeed
}): ConstructorParameters<typeof FlowRunnerV5>[0] {
  return {
    runtime: input.runtime,
    text: input.seed.goalText,
    answers: input.seed.answers,
    timezone: input.seed.timezone,
    availability: input.seed.availability,
    blocked: input.seed.blocked,
    preferences: input.seed.preferences,
    weekStartDate: input.seed.weekStartDate,
    goalId: input.seed.goalId ?? undefined,
    domainHint: input.seed.domainHint ?? undefined,
    activityLogs: input.seed.activityLogs,
    adaptiveAnchorAt: input.seed.adaptiveAnchorAt ?? undefined,
    slackPolicy: input.seed.slackPolicy ?? undefined,
    previousProgressionKeys: input.seed.previousProgressionKeys,
    initialHabitStates: input.seed.initialHabitStates,
    inlineAdaptive: false
  }
}

function buildInitialContext(snapshot: PipelineRuntimeData, seed: InteractiveSessionSeed): Partial<FlowRunnerV5Context> {
  const persistedScheduleInput = snapshot.phases.schedule?.input as { activities?: SchedulerInput['activities'] } | undefined

  return {
    phaseIO: cloneJson(snapshot.phases) as FlowRunnerV5Context['phaseIO'],
    repairCycles: snapshot.repairCycles,
    classification: snapshot.phases.classify?.output as FlowRunnerV5Context['classification'],
    requirements: snapshot.phases.requirements?.output as FlowRunnerV5Context['requirements'],
    profile: snapshot.phases.profile?.output as FlowRunnerV5Context['profile'],
    strategy: snapshot.phases.strategy?.output as FlowRunnerV5Context['strategy'],
    template: snapshot.phases.template?.output as FlowRunnerV5Context['template'],
    scheduleInput: persistedScheduleInput?.activities
      ? {
          activities: persistedScheduleInput.activities,
          availability: seed.availability,
          blocked: seed.blocked,
          preferences: seed.preferences,
          timezone: seed.timezone,
          weekStartDate: seed.weekStartDate
        }
      : undefined,
    schedule: snapshot.phases.schedule?.output as FlowRunnerV5Context['schedule'],
    hardValidate: snapshot.phases.hardValidate?.output as FlowRunnerV5Context['hardValidate'],
    softValidate: snapshot.phases.softValidate?.output as FlowRunnerV5Context['softValidate'],
    coveVerify: snapshot.phases.coveVerify?.output as FlowRunnerV5Context['coveVerify'],
    repair: snapshot.phases.repair?.output as FlowRunnerV5Context['repair'],
    package: snapshot.phases.package?.output as FlowRunnerV5Context['package'],
    adapt: snapshot.phases.adapt?.output as FlowRunnerV5Context['adapt'],
    habitStates: seed.initialHabitStates.length > 0 ? seed.initialHabitStates : undefined,
    habitProgressionKeys: seed.previousProgressionKeys
  }
}

function buildTracker(recorder: PipelineRuntimeRecorder): FlowRunnerV5Tracker {
  return {
    onPhaseStart(phase, details) {
      recorder.markPhaseStart(phase, {
        startedAt: details?.startedAt ?? null,
        input: details?.input
      })
    },
    onPhaseSuccess(phase, _result, io) {
      recorder.markPhaseSuccess(phase, io)
    },
    onPhaseFailure(phase, error) {
      recorder.markPhaseFailure(phase, error)
    },
    onPhaseSkipped(phase) {
      recorder.markPhaseSkipped(phase)
    },
    onProgress(phase, progress) {
      recorder.recordProgress(phase, progress)
    },
    onRepairAttempt(attempt, maxAttempts, findings) {
      recorder.recordRepairAttempt(attempt, maxAttempts, findings)
    },
    onRepairExhausted() {
      recorder.markRepairExhausted()
    }
  }
}

function getPauseOutput(phase: PipelinePhaseV5, context: FlowRunnerV5Context): unknown {
  if (phase === 'classify') {
    return context.classification ?? null
  }

  if (phase === 'requirements') {
    return context.requirements ?? null
  }

  if (phase === 'profile') {
    return context.profile ?? null
  }

  if (phase === 'schedule') {
    return context.schedule ?? null
  }

  if (phase === 'package') {
    return context.package ?? null
  }

  return null
}

function getPauseType(phase: PipelinePhaseV5): PausePointSnapshot['type'] | null {
  if (phase === 'classify') {
    return 'classify_review'
  }

  if (phase === 'requirements') {
    return 'requirements_answer'
  }

  if (phase === 'profile') {
    return 'profile_edit'
  }

  if (phase === 'schedule') {
    return 'schedule_edit'
  }

  if (phase === 'package') {
    return 'package_review'
  }

  return null
}

function nextPhaseAfterPause(phase: PipelinePhaseV5): PipelinePhaseV5 | null {
  if (phase === 'classify') {
    return 'requirements'
  }

  if (phase === 'requirements') {
    return 'profile'
  }

  if (phase === 'profile') {
    return 'strategy'
  }

  if (phase === 'schedule') {
    return 'hardValidate'
  }

  if (phase === 'package') {
    return null
  }

  return null
}

function nextLinearPhase(phase: PipelinePhaseV5): PipelinePhaseV5 | null {
  const index = PIPELINE_V5_PHASES.indexOf(phase)
  if (index < 0) {
    return null
  }

  for (let cursor = index + 1; cursor < PIPELINE_V5_PHASES.length; cursor += 1) {
    const candidate = PIPELINE_V5_PHASES[cursor]
    if (!['hardValidate', 'softValidate', 'coveVerify', 'repair', 'adapt'].includes(candidate)) {
      return candidate
    }
  }

  return null
}

function createInteractiveConfig(config?: Partial<InteractiveConfig> | null): InteractiveConfig {
  const defaults = interactiveConfigSchema.parse({
    pausePoints: {}
  })
  return interactiveConfigSchema.parse({
    ...defaults,
    ...(config ?? {}),
    pausePoints: {
      ...defaults.pausePoints,
      ...(config?.pausePoints ?? {})
    }
  })
}

function applySnapshotMutation(
  recorder: PipelineRuntimeRecorder,
  mutator: (snapshot: PipelineRuntimeData) => void
): PipelineRuntimeData {
  const snapshot = recorder.getSnapshot()
  mutator(snapshot)
  persistPipelineRuntimeData(snapshot)
  return snapshot
}

function trimPauseHistory(snapshot: PipelineRuntimeData, fromPhase: InteractivePauseFromPhase): void {
  const startIndex = PIPELINE_V5_PHASES.indexOf(fromPhase)
  snapshot.pauseHistory = snapshot.pauseHistory.filter((pause) => {
    return PIPELINE_V5_PHASES.indexOf(pause.phase) < startIndex
  })
}

function getInteractiveStepIndex(phase: InteractivePauseFromPhase | 'package'): number {
  return ['classify', 'requirements', 'profile', 'schedule', 'package'].indexOf(phase)
}

function getInteractiveSeedBaseGoalText(seed: InteractiveSessionSeed): string {
  return normalizeGoalText(seed.baseGoalText ?? seed.goalText)
}

function resetInteractiveSeedFromPhase(snapshot: PipelineRuntimeData, phase: InteractivePauseFromPhase): void {
  const interactiveState = snapshot.interactiveState

  if (!interactiveState) {
    return
  }

  if (phase === 'classify') {
    interactiveState.seed.goalText = getInteractiveSeedBaseGoalText(interactiveState.seed)
    interactiveState.seed.answers = {}
    snapshot.run.goalText = interactiveState.seed.goalText
    return
  }

  if (phase === 'requirements') {
    interactiveState.seed.answers = {}
  }
}

function getGoBackTargets(
  snapshot: PipelineRuntimeData,
  pausePoint: PausePointSnapshot
): InteractivePauseFromPhase[] {
  const currentPhase: InteractivePauseFromPhase | 'package' = pausePoint.type === 'package_review'
    ? 'package'
    : pausePoint.phase === 'classify'
      ? 'classify'
      : pausePoint.phase === 'requirements'
        ? 'requirements'
        : pausePoint.phase === 'profile'
          ? 'profile'
          : 'schedule'
  const currentIndex = getInteractiveStepIndex(currentPhase)
  const visitedPhases = new Set(snapshot.pauseHistory.map((pause) => pause.phase))

  return (['classify', 'requirements', 'profile', 'schedule'] as const).filter((phase) => {
    return getInteractiveStepIndex(phase) < currentIndex && visitedPhases.has(phase)
  })
}

export function resetSnapshotFromPhase(snapshot: PipelineRuntimeData, phase: InteractivePauseFromPhase): PipelineRuntimeData {
  const nextSnapshot = cloneJson(snapshot)
  const startIndex = PIPELINE_V5_PHASES.indexOf(phase)
  const phasesToReset = PIPELINE_V5_PHASES.slice(startIndex)

  for (const phaseId of phasesToReset) {
    nextSnapshot.phaseStatuses[phaseId] = 'pending'
    delete nextSnapshot.phases[phaseId]
    delete nextSnapshot.phaseTimeline[phaseId]
  }

  nextSnapshot.currentPausePoint = null
  trimPauseHistory(nextSnapshot, phase)
  nextSnapshot.progress = null
  nextSnapshot.lastError = null

  if (startIndex <= PIPELINE_V5_PHASES.indexOf('hardValidate')) {
    nextSnapshot.repairCycles = 0
    nextSnapshot.repairExhausted = false
    nextSnapshot.repairAttempts = []
    nextSnapshot.repairTimeline = []
  }

  if (phase === 'classify') {
    nextSnapshot.domainCardMeta = null
  }

  resetInteractiveSeedFromPhase(nextSnapshot, phase)

  return nextSnapshot
}

function resolveRequirementsAnswers(
  pausePoint: PausePointSnapshot,
  answers: Record<string, string>
): Record<string, string> {
  const questions = Array.isArray((pausePoint.output as { questions?: unknown }).questions)
    ? ((pausePoint.output as { questions: unknown[] }).questions.filter((value): value is string => typeof value === 'string'))
    : []

  return Object.entries(answers).reduce<Record<string, string>>((accumulator, [key, value]) => {
    const trimmed = value.trim()
    if (!trimmed) {
      return accumulator
    }

    const numericIndex = Number.parseInt(key, 10)
    const questionKey = Number.isFinite(numericIndex) && questions[numericIndex]
      ? questions[numericIndex]
      : key

    accumulator[questionKey] = trimmed
    return accumulator
  }, {})
}

function getContextualGoalText(seed: InteractiveSessionSeed, extraContext?: string): string {
  const normalizedGoal = getInteractiveSeedBaseGoalText(seed)
  const context = extraContext?.trim()

  if (!context) {
    return normalizedGoal
  }

  return `${normalizedGoal}. Contexto adicional: ${context}`
}

export function shouldPauseScheduleReview(schedule: SchedulerOutput | null | undefined): boolean {
  if (!schedule) {
    return false
  }

  return schedule.events.length > 0
    || schedule.unscheduled.length > 0
    || (schedule.tradeoffs?.length ?? 0) > 0
}

function buildResponse(record: InteractiveSessionRecord): InteractiveSessionResponse {
  const snapshot = record.runtimeSnapshot
  return {
    sessionId: record.id,
    status: record.status,
    pausePoint: snapshot.currentPausePoint ?? null,
    snapshot,
    planId: getPlanIdFromSnapshot(snapshot)
  }
}

async function resolveRuntimeForRequest(
  request: InteractiveSessionRuntimeRequest
): Promise<ReturnType<typeof getProvider>> {
  const providerName = getModelProviderName(request.modelId)
  const execution = await resolvePlanBuildExecution({
    modelId: request.modelId,
    requestedMode: request.requestedMode,
    deploymentMode: request.deploymentMode,
    userId: request.userId ?? undefined,
    backendCredentialId: request.backendCredentialId ?? undefined,
    userStoredCredentialLabel: providerName === 'openai' || providerName === 'openrouter'
      ? getApiKeySettingKey(providerName)
      : null,
    allowUserLocalExecution: request.allowUserLocalExecution
  })

  if (!execution.runtime) {
    throw new Error('BUILD_RUNTIME_UNAVAILABLE')
  }

  return getProvider(execution.runtime.modelId, {
    apiKey: execution.runtime.apiKey,
    baseURL: execution.runtime.baseURL,
    thinkingMode: request.thinkingMode ?? 'disabled',
    authMode: execution.runtime.authMode
  })
}

export class InteractivePipelineCoordinator {
  private readonly ownerUserId: string | null
  private readonly executionUserId: string

  constructor(context: SessionAccessContext) {
    this.ownerUserId = context.ownerUserId
    this.executionUserId = context.executionUserId
  }

  async createSession(input: InteractiveSessionCreateRequest): Promise<InteractiveSessionResponse> {
    const setup = await this.prepareSessionSetup(input)
    const recorder = createPipelineRuntimeRecorder({
      source: 'interactive',
      modelId: setup.execution.runtime?.modelId ?? setup.execution.requestedModelId,
      goalText: setup.seed.goalText,
      profileId: setup.profileId,
      interactiveState: {
        request: setup.runtimeRequest,
        seed: setup.seed,
        config: setup.config
      }
    })
    const sessionId = crypto.randomUUID()
    const created = await createInteractiveSession({
      id: sessionId,
      status: 'active',
      currentPauseId: null,
      runtimeSnapshot: recorder.getSnapshot(),
      userId: this.ownerUserId,
      expiresAt: expiresAtForMinutes(setup.config.sessionTTLMinutes)
    })

    try {
      const runner = await this.createRunner(created.runtimeSnapshot, setup.runtimeRequest, setup.seed)
      return await this.runUntilPause({
        sessionId,
        record: created,
        recorder,
        runner,
        startPhase: 'classify',
        config: setup.config
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      recorder.completeRun('error', { message })
      const failed = await updateInteractiveSession(sessionId, {
        status: 'error',
        currentPauseId: recorder.getSnapshot().currentPausePoint?.id ?? null,
        runtimeSnapshot: recorder.getSnapshot(),
        expiresAt: expiresAtForMinutes(setup.config.sessionTTLMinutes)
      })

      if (!failed) {
        throw error
      }

      return buildResponse(failed)
    }
  }

  async getSession(sessionId: string): Promise<InteractiveSessionResponse> {
    const loaded = await this.loadSession(sessionId)
    persistPipelineRuntimeData(loaded.record.runtimeSnapshot)
    return buildResponse(loaded.record)
  }

  async deleteSession(sessionId: string): Promise<{ status: 'deleted' }> {
    await this.loadSession(sessionId)
    await deleteInteractiveSession(sessionId)
    return { status: 'deleted' }
  }

  private async restartFromPhase(params: {
    sessionId: string
    record: InteractiveSessionRecord
    recorder: PipelineRuntimeRecorder
    state: InteractiveSessionState
    startPhase: InteractivePauseFromPhase
  }): Promise<InteractiveSessionResponse> {
    const resetSnapshot = resetSnapshotFromPhase(params.recorder.getSnapshot(), params.startPhase)
    const resetState = resetSnapshot.interactiveState ?? params.state
    const resetRecorder = createPipelineRuntimeRecorder({
      source: 'interactive',
      modelId: resetSnapshot.run.modelId,
      goalText: resetState.seed.goalText,
      profileId: resetState.seed.profileId,
      interactiveState: resetState
    }, resetSnapshot)
    const rerunRunner = await this.createRunner(resetSnapshot, resetState.request, resetState.seed)

    return this.runUntilPause({
      sessionId: params.sessionId,
      record: params.record,
      recorder: resetRecorder,
      runner: rerunRunner,
      startPhase: params.startPhase,
      config: resetState.config
    })
  }

  async applyUserInput(sessionId: string, payload: InteractiveSessionInputRequest): Promise<InteractiveSessionResponse> {
    const loaded = await this.loadSession(sessionId, { requireActive: true })
    const pausePoint = loaded.record.runtimeSnapshot.currentPausePoint

    if (!pausePoint) {
      throw new Error('NO_ACTIVE_PAUSE')
    }

    if (pausePoint.id !== payload.pauseId) {
      throw new Error('PAUSE_NOT_ACTIVE')
    }

    const recorder = createPipelineRuntimeRecorder({
      source: 'interactive',
      modelId: loaded.record.runtimeSnapshot.run.modelId,
      goalText: loaded.state.seed.goalText,
      profileId: loaded.state.seed.profileId,
      interactiveState: loaded.state
    }, loaded.record.runtimeSnapshot)
    const runner = await this.createRunner(recorder.getSnapshot(), loaded.state.request, loaded.state.seed)
    const goBackInput = goBackInputSchema.safeParse(payload.input)

    if (goBackInput.success) {
      const allowedTargets = getGoBackTargets(recorder.getSnapshot(), pausePoint)

      if (!allowedTargets.includes(goBackInput.data.targetPhase)) {
        throw new Error('INTERACTIVE_GO_BACK_TARGET_INVALID')
      }

      return this.restartFromPhase({
        sessionId,
        record: loaded.record,
        recorder,
        state: loaded.state,
        startPhase: goBackInput.data.targetPhase
      })
    }

    const normalizedInput = await this.validateAndApplyPauseInput({
      pausePoint,
      input: payload.input,
      recorder,
      runner
    })

    if (pausePoint.type === 'package_review') {
      const packageInput = normalizedInput as z.infer<typeof packageReviewInputSchema>

      if (packageInput.action === 'accept') {
        return this.completeAcceptedPlan({
          sessionId,
          recorder,
          runner,
          config: loaded.state.config
        })
      }

      const regenerateFrom = packageInput.regenerateFrom
      if (!regenerateFrom) {
        throw new Error('INTERACTIVE_PACKAGE_REGENERATE_PHASE_REQUIRED')
      }

      const allowedTargets = getGoBackTargets(recorder.getSnapshot(), pausePoint)
      if (!allowedTargets.includes(regenerateFrom)) {
        throw new Error('INTERACTIVE_GO_BACK_TARGET_INVALID')
      }

      return this.restartFromPhase({
        sessionId,
        record: loaded.record,
        recorder,
        state: loaded.state,
        startPhase: regenerateFrom
      })
    }

    recorder.resumeFromPause(pausePoint.id)
    const nextPhase = nextPhaseAfterPause(pausePoint.phase)

    if (!nextPhase) {
      const completed = await updateInteractiveSession(sessionId, {
        status: 'completed',
        currentPauseId: null,
        runtimeSnapshot: recorder.getSnapshot(),
        expiresAt: expiresAtForMinutes(loaded.state.config.sessionTTLMinutes)
      })

      if (!completed) {
        throw new Error('INTERACTIVE_SESSION_NOT_FOUND')
      }

      return buildResponse(completed)
    }

    return this.runUntilPause({
      sessionId,
      record: loaded.record,
      recorder,
      runner,
      startPhase: nextPhase,
      config: loaded.state.config
    })
  }

  private async prepareSessionSetup(input: InteractiveSessionCreateRequest): Promise<InteractiveSessionSetup> {
    const goalText = normalizeGoalText(input.goalText)
    const workflow = input.workflowId
      ? await getPlanWorkflow(input.workflowId)
      : null

    if (workflow && workflow.userId && workflow.userId !== this.ownerUserId) {
      throw new Error('INTERACTIVE_WORKFLOW_NOT_FOUND')
    }

    let profileId = input.profileId?.trim() || workflow?.profileId?.trim() || ''
    let profile: Perfil | null = null

    if (!profileId) {
      const latestProfileId = await getLatestProfileIdForUser(this.ownerUserId)
      if (latestProfileId) {
        profileId = latestProfileId
      }
    }

    if (profileId) {
      const profileRow = await getProfile(profileId)
      profile = profileRow ? parseStoredProfile(profileRow.data) : null
    }

    if (!profile) {
      profile = buildDefaultProfile(goalText, DEFAULT_TIMEZONE)
      profileId = await createProfile(JSON.stringify(profile), this.ownerUserId)
    }

    const deploymentMode = getDeploymentMode()
    const providerPreference = resolveInteractiveDefaultProvider({
      provider: input.provider,
      workflowProvider: workflow?.state.gate?.provider ?? null,
      resourceMode: input.resourceMode,
      deploymentMode,
      hasApiKey: Boolean(input.apiKey?.trim())
    })
    const requestedModelId = input.resourceMode === 'codex'
      ? 'openai:gpt-5-codex'
      : resolveBuildModel(providerPreference)
    const providerName = getModelProviderName(requestedModelId)

    if (input.apiKey?.trim() && (providerName === 'openai' || providerName === 'openrouter')) {
      await saveCredentialConfiguration({
        owner: 'user',
        ownerId: this.executionUserId,
        providerId: providerName,
        secretType: 'api-key',
        label: getApiKeySettingKey(providerName),
        secretValue: input.apiKey.trim(),
        status: 'active'
      })
    }

    const requestedMode = resolveRequestedMode(input.resourceMode, workflow?.state.gate?.llmMode ?? null)
      ?? (input.apiKey?.trim() ? 'user-cloud' : null)
    const backendCredentialId = input.backendCredentialId
      ?? workflow?.state.gate?.backendCredentialId
      ?? null
    const execution = await resolvePlanBuildExecution({
      modelId: requestedModelId,
      requestedMode,
      deploymentMode,
      userId: this.executionUserId,
      backendCredentialId,
      userStoredCredentialLabel: providerName === 'openai' || providerName === 'openrouter'
        ? getApiKeySettingKey(providerName)
        : null,
      allowUserLocalExecution: deploymentMode === 'local'
    })

    if (!execution.executionContext.canExecute) {
      const error = new Error('PLAN_EXECUTION_BLOCKED')
      ;(error as { executionBlockReasonCode?: string | null }).executionBlockReasonCode = execution.executionContext.blockReasonCode
      throw error
    }

    if (!execution.runtime) {
      throw new Error('BUILD_RUNTIME_UNAVAILABLE')
    }

    const runtimeRequest: InteractiveSessionRuntimeRequest = {
      modelId: execution.runtime.modelId,
      requestedMode,
      backendCredentialId,
      userId: this.executionUserId,
      deploymentMode,
      allowUserLocalExecution: deploymentMode === 'local',
      thinkingMode: input.thinkingMode ?? 'disabled'
    }
    const seed = buildInteractiveSeed({
      goalText,
      profileId,
      workflowId: input.workflowId ?? null,
      profile
    })

    return {
      profileId,
      profile,
      execution,
      runtimeRequest,
      seed,
      config: createInteractiveConfig()
    }
  }

  private async createRunner(
    snapshot: PipelineRuntimeData,
    runtimeRequest: InteractiveSessionRuntimeRequest,
    seed: InteractiveSessionSeed
  ): Promise<FlowRunnerV5> {
    const resolved = snapshot.interactiveState?.request ?? runtimeRequest
    const execution = await resolveRuntimeForRequest(resolved)

    return new FlowRunnerV5(
      buildRunnerConfig({
        runtime: execution,
        seed
      }),
      buildInitialContext(snapshot, seed)
    )
  }

  private shouldPause(phase: PipelinePhaseV5, context: FlowRunnerV5Context, config: InteractiveConfig): boolean {
    if (phase === 'classify') {
      const mode = config.pausePoints.classify
      if (mode === 'never') {
        return false
      }
      if (mode === 'always') {
        return true
      }
      return (context.classification?.confidence ?? 0) < config.autoSkipThreshold
    }

    if (phase === 'requirements') {
      return config.pausePoints.requirements === 'always'
    }

    if (phase === 'profile') {
      return config.pausePoints.profile === 'always'
    }

    if (phase === 'schedule') {
      return config.pausePoints.schedule === 'always' && shouldPauseScheduleReview(context.schedule)
    }

    if (phase === 'package') {
      return config.pausePoints.package === 'always'
    }

    return false
  }

  private async executePhase(
    phase: PipelinePhaseV5,
    runner: FlowRunnerV5,
    recorder: PipelineRuntimeRecorder
  ): Promise<unknown> {
    const tracker = buildTracker(recorder)
    const result = await runner.executePhase(phase, tracker)

    if (phase === 'classify') {
      const domainCard = runner.getContext().domainCard
      if (domainCard) {
        recorder.setDomainCardMeta({
          domainLabel: domainCard.domainLabel,
          method: domainCard.generationMeta.method,
          confidence: domainCard.generationMeta.confidence
        })
      }
    }

    return result
  }

  private async executeRepairLoopPhase(
    phase: RepairLoopPhase,
    runner: FlowRunnerV5,
    recorder: PipelineRuntimeRecorder
  ): Promise<unknown> {
    const cycle = getRepairLoopCycle(phase, recorder.getSnapshot().repairCycles)
    recorder.markRepairCyclePhaseStart(cycle, phase)

    try {
      const result = await this.executePhase(phase, runner, recorder)
      const io = runner.getContext().phaseIO[phase]

      recorder.markRepairCyclePhaseComplete(cycle, phase, 'success', {
        io,
        summaryLabel: summarizeRepairLoopPhase(phase, io?.output)
      })

      if (phase === 'repair') {
        const scores = extractRepairScores(io?.output)
        recorder.finalizeRepairCycle(cycle, {
          status: 'repaired',
          findings: buildRepairFindings(runner.getContext()),
          scoreBefore: scores.scoreBefore,
          scoreAfter: scores.scoreAfter
        })
      }

      return result
    } catch (error) {
      recorder.markRepairCyclePhaseComplete(cycle, phase, 'error', {
        summaryLabel: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  private async runUntilPause(params: {
    sessionId: string
    record: InteractiveSessionRecord
    recorder: PipelineRuntimeRecorder
    runner: FlowRunnerV5
    startPhase: PipelinePhaseV5
    config: InteractiveConfig
  }): Promise<InteractiveSessionResponse> {
    let nextPhase: PipelinePhaseV5 | null = params.startPhase

    while (nextPhase) {
      if (nextPhase === 'hardValidate') {
        await this.executeRepairLoopPhase('hardValidate', params.runner, params.recorder)
        await this.executeRepairLoopPhase('softValidate', params.runner, params.recorder)
        await this.executeRepairLoopPhase('coveVerify', params.runner, params.recorder)

        if (!hasBlockingFindings(params.runner.getContext())) {
          const cycle = params.recorder.getSnapshot().repairCycles + 1
          params.recorder.markPhaseSkipped('repair', skippedPhaseMessage('repair'))
          params.recorder.markRepairCyclePhaseComplete(cycle, 'repair', 'skipped', {
            summaryLabel: 'Sin fallas'
          })
          params.recorder.finalizeRepairCycle(cycle, {
            status: 'clean',
            findings: buildRepairFindings(params.runner.getContext())
          })
          nextPhase = 'package'
          continue
        }

        const cycle = params.recorder.getSnapshot().repairCycles + 1
        params.recorder.recordRepairAttempt(cycle, REPAIR_MAX_CYCLES, buildRepairFindings(params.runner.getContext()))
        const repairOutput = await this.executeRepairLoopPhase('repair', params.runner, params.recorder) as RepairOutput

        if (repairOutput.status === 'escalated' || cycle >= REPAIR_MAX_CYCLES) {
          params.recorder.markRepairExhausted()
          params.recorder.markRepairCyclePhaseComplete(cycle, 'repair', 'exhausted', {
            summaryLabel: 'Agotado'
          })
          params.recorder.finalizeRepairCycle(cycle, {
            status: 'exhausted',
            findings: repairOutput.remainingFindings
          })
        }

        const acceptance = evaluateOperationalAcceptance({
          hardValidate: params.runner.getContext().hardValidate,
          coveVerify: params.runner.getContext().coveVerify,
          repair: params.runner.getContext().repair
        })

        if (!acceptance.accepted && params.runner.getContext().repair?.status === 'escalated') {
          throw new Error(`${acceptance.reason}:${acceptance.remainingFindings.map((finding) => finding.message).join(' | ')}`)
        }

        if (hasBlockingFindings(params.runner.getContext()) && !params.recorder.getSnapshot().repairExhausted) {
          nextPhase = 'hardValidate'
          continue
        }

        if (!acceptance.accepted) {
          throw new Error(`${acceptance.reason}:${acceptance.remainingFindings.map((finding) => finding.message).join(' | ')}`)
        }

        nextPhase = 'package'
        continue
      }

      await this.executePhase(nextPhase, params.runner, params.recorder)

      if (this.shouldPause(nextPhase, params.runner.getContext(), params.config)) {
        const pauseType = getPauseType(nextPhase)
        if (!pauseType) {
          throw new Error(`INTERACTIVE_PAUSE_UNSUPPORTED:${nextPhase}`)
        }

        params.recorder.markPhaseAsPausedForUserInput(
          nextPhase,
          pauseType,
          getPauseOutput(nextPhase, params.runner.getContext())
        )

        const active = await updateInteractiveSession(params.sessionId, {
          status: 'active',
          currentPauseId: params.recorder.getSnapshot().currentPausePoint?.id ?? null,
          runtimeSnapshot: params.recorder.getSnapshot(),
          expiresAt: expiresAtForMinutes(params.config.sessionTTLMinutes)
        })

        if (!active) {
          throw new Error('INTERACTIVE_SESSION_NOT_FOUND')
        }

        return buildResponse(active)
      }

      if (nextPhase === 'package') {
        params.recorder.completeRun('success')
        const completed = await updateInteractiveSession(params.sessionId, {
          status: 'completed',
          currentPauseId: null,
          runtimeSnapshot: params.recorder.getSnapshot(),
          expiresAt: expiresAtForMinutes(params.config.sessionTTLMinutes)
        })

        if (!completed) {
          throw new Error('INTERACTIVE_SESSION_NOT_FOUND')
        }

        return buildResponse(completed)
      }

      nextPhase = nextPhase === 'schedule'
        ? 'hardValidate'
        : nextLinearPhase(nextPhase)
    }

    params.recorder.completeRun('success')
    const completed = await updateInteractiveSession(params.sessionId, {
      status: 'completed',
      currentPauseId: null,
      runtimeSnapshot: params.recorder.getSnapshot(),
      expiresAt: expiresAtForMinutes(params.config.sessionTTLMinutes)
    })

    if (!completed) {
      throw new Error('INTERACTIVE_SESSION_NOT_FOUND')
    }

    return buildResponse(completed)
  }

  private async validateAndApplyPauseInput(params: {
    pausePoint: PausePointSnapshot
    input: unknown
    recorder: PipelineRuntimeRecorder
    runner: FlowRunnerV5
  }): Promise<
    | z.infer<typeof classifyReviewInputSchema>
    | { answers: Record<string, string> }
    | Partial<UserProfileV5>
    | { events: SchedulerOutput['events'] }
    | z.infer<typeof packageReviewInputSchema>
  > {
    const snapshot = params.recorder.getSnapshot()
    const interactiveState = snapshot.interactiveState

    if (!interactiveState) {
      throw new Error('INTERACTIVE_STATE_MISSING')
    }

    if (params.pausePoint.type === 'classify_review') {
      const parsed = classifyReviewInputSchema.parse(params.input)
      const contextWords = (parsed.context ?? '').trim().split(/\s+/).filter(Boolean)

      if (parsed.context && contextWords.length < 4) {
        throw new Error('INTERACTIVE_CLASSIFY_CONTEXT_TOO_SHORT')
      }

      params.recorder.applyUserInputToPause(params.pausePoint.id, parsed)
      applySnapshotMutation(params.recorder, (draft) => {
        const currentClassification = params.runner.getContext().classification
        if (!currentClassification) {
          throw new Error('INTERACTIVE_CLASSIFICATION_MISSING')
        }

        if (parsed.goalType) {
          currentClassification.goalType = parsed.goalType
          if (draft.phases.classify?.output && typeof draft.phases.classify.output === 'object') {
            ;(draft.phases.classify.output as Record<string, unknown>).goalType = parsed.goalType
          }
        }

        const nextGoalText = getContextualGoalText(interactiveState.seed, parsed.context)
        interactiveState.seed.goalText = nextGoalText
        draft.run.goalText = nextGoalText
        params.runner.getContext().config.text = nextGoalText
      })

      return parsed
    }

    if (params.pausePoint.type === 'requirements_answer') {
      const parsed = requirementsAnswerSchema.parse(params.input)
      const answers = resolveRequirementsAnswers(params.pausePoint, parsed.answers)

      params.recorder.applyUserInputToPause(params.pausePoint.id, { answers })
      applySnapshotMutation(params.recorder, () => {
        interactiveState.seed.answers = {
          ...interactiveState.seed.answers,
          ...answers
        }
        params.runner.getContext().config.answers = {
          ...params.runner.getContext().config.answers,
          ...answers
        }
      })

      return { answers }
    }

    if (params.pausePoint.type === 'profile_edit') {
      const parsed = profileEditSchema.parse(params.input)

      params.recorder.applyUserInputToPause(params.pausePoint.id, parsed)
      applySnapshotMutation(params.recorder, (draft) => {
        const currentProfile = params.runner.getContext().profile
        if (!currentProfile) {
          throw new Error('INTERACTIVE_PROFILE_MISSING')
        }

        const nextProfile = {
          ...currentProfile,
          ...parsed
        }

        params.runner.getContext().profile = nextProfile
        const profilePhaseIo = params.runner.getContext().phaseIO.profile
        if (profilePhaseIo) {
          profilePhaseIo.output = nextProfile
        }
        if (draft.phases.profile) {
          draft.phases.profile.output = cloneJson(nextProfile)
        }
      })

      return parsed
    }

    if (params.pausePoint.type === 'schedule_edit') {
      const parsed = scheduleEditSchema.parse(params.input)
      const currentScheduleInput = params.runner.getContext().scheduleInput
      const currentProfile = params.runner.getContext().profile

      if (!currentScheduleInput || !currentProfile) {
        throw new Error('INTERACTIVE_SCHEDULE_CONTEXT_MISSING')
      }

      const nextSchedule = {
        ...(params.runner.getContext().schedule ?? {
          events: [],
          unscheduled: [],
          metrics: {
            fillRate: 0,
            solverTimeMs: 0,
            solverStatus: 'manual'
          }
        }),
        events: parsed.events
      } satisfies SchedulerOutput
      const hardValidation = await executeHardValidator({
        schedule: nextSchedule,
        originalInput: currentScheduleInput,
        profile: currentProfile,
        timezone: params.runner.getContext().config.timezone
      })

      if (hardValidation.findings.length > 0) {
        throw new Error(hardValidation.findings[0]?.description ?? 'INTERACTIVE_SCHEDULE_INVALID')
      }

      params.recorder.applyUserInputToPause(params.pausePoint.id, parsed)
      applySnapshotMutation(params.recorder, (draft) => {
        params.runner.getContext().schedule = nextSchedule
        const schedulePhaseIo = params.runner.getContext().phaseIO.schedule
        if (schedulePhaseIo) {
          schedulePhaseIo.output = nextSchedule
        }
        if (draft.phases.schedule) {
          draft.phases.schedule.output = cloneJson(nextSchedule)
        }
      })

      return parsed
    }

    const parsed = packageReviewInputSchema.parse(params.input)

    if (parsed.action === 'regenerate' && !parsed.regenerateFrom) {
      throw new Error('INTERACTIVE_PACKAGE_REGENERATE_PHASE_REQUIRED')
    }

    params.recorder.applyUserInputToPause(params.pausePoint.id, parsed)
    return parsed
  }

  private async completeAcceptedPlan(params: {
    sessionId: string
    recorder: PipelineRuntimeRecorder
    runner: FlowRunnerV5
    config: InteractiveConfig
  }): Promise<InteractiveSessionResponse> {
    const snapshot = params.recorder.getSnapshot()
    const interactiveState = snapshot.interactiveState
    const packageOutput = params.runner.getContext().package ?? snapshot.phases.package?.output as PackageOutput | undefined
    const profileId = interactiveState?.seed.profileId

    if (!interactiveState || !packageOutput || !profileId) {
      throw new Error('INTERACTIVE_PACKAGE_MISSING')
    }

    const persisted = await persistPlanFromV5Package({
      profileId,
      package: packageOutput,
      goalId: interactiveState.seed.goalId ?? 'goal-v5-interactive',
      goalText: interactiveState.seed.goalText,
      timezone: interactiveState.seed.timezone,
      modelId: snapshot.run.modelId ?? interactiveState.request.modelId,
      tokensInput: snapshot.run.tokensUsed?.input,
      tokensOutput: snapshot.run.tokensUsed?.output,
      runSnapshot: toV5PhaseSnapshot(snapshot)
    })

    const activePause = snapshot.currentPausePoint
    if (!activePause) {
      throw new Error('NO_ACTIVE_PAUSE')
    }

    params.recorder.applyUserInputToPause(activePause.id, {
      action: 'accept',
      planId: persisted.planId
    })
    params.recorder.resumeFromPause(activePause.id)
    params.recorder.completeRun('success', {
      message: `Plan persisted as ${persisted.planId}`
    })

    const completed = await updateInteractiveSession(params.sessionId, {
      status: 'completed',
      currentPauseId: null,
      runtimeSnapshot: params.recorder.getSnapshot(),
      expiresAt: expiresAtForMinutes(params.config.sessionTTLMinutes)
    })

    if (!completed) {
      throw new Error('INTERACTIVE_SESSION_NOT_FOUND')
    }

    return buildResponse(completed)
  }

  private async loadSession(
    sessionId: string,
    options: { requireActive?: boolean } = {}
  ): Promise<LoadedSession> {
    const record = await getInteractiveSession(sessionId)

    if (!record) {
      throw new Error('INTERACTIVE_SESSION_NOT_FOUND')
    }

    if (record.userId !== null && record.userId !== this.ownerUserId) {
      throw new Error('INTERACTIVE_SESSION_NOT_FOUND')
    }

    if (record.userId === null && this.ownerUserId !== null) {
      throw new Error('INTERACTIVE_SESSION_NOT_FOUND')
    }

    if (
      record.status === 'active'
      && DateTime.fromISO(record.expiresAt).isValid
      && DateTime.fromISO(record.expiresAt) < DateTime.utc()
    ) {
      const abandoned = await updateInteractiveSession(sessionId, {
        status: 'abandoned',
        currentPauseId: null,
        runtimeSnapshot: record.runtimeSnapshot,
        expiresAt: record.expiresAt
      })

      if (!abandoned) {
        throw new Error('INTERACTIVE_SESSION_NOT_FOUND')
      }

      if (options.requireActive) {
        throw new Error('INTERACTIVE_SESSION_EXPIRED')
      }

      return {
        record: abandoned,
        state: abandoned.runtimeSnapshot.interactiveState ?? (() => { throw new Error('INTERACTIVE_STATE_MISSING') })()
      }
    }

    if (options.requireActive && record.status !== 'active') {
      throw new Error('INTERACTIVE_SESSION_NOT_ACTIVE')
    }

    const state = record.runtimeSnapshot.interactiveState
    if (!state) {
      throw new Error('INTERACTIVE_STATE_MISSING')
    }

    return { record, state }
  }
}
