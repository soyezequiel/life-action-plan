#!/usr/bin/env node
/**
 * LAP Plan Runner CLI
 *
 * Usage:
 *   node scripts/run-plan.mjs "Tu objetivo"
 *   node scripts/run-plan.mjs "Tu objetivo" --profile=<uuid> --provider=ollama --base=http://localhost:3000
 *   node scripts/run-plan.mjs "Tu objetivo" --json          # salida JSON cruda
 *   node scripts/run-plan.mjs "Tu objetivo" --debug         # modo debug con artefacto JSON
 *   node scripts/run-plan.mjs "Tu objetivo" --auto          # no pregunta, avanza solo
 *   node scripts/run-plan.mjs "Tu objetivo" --pause-on-input # pausa en preguntas, escribe JSON
 *   node scripts/run-plan.mjs --resume-session=<id> --answers-json='{"q":"a"}' # reanuda con respuestas
 *   node scripts/run-plan.mjs --plan-id=<uuid> --detail-start-week=3 --detail-weeks=2
 *
 * Variables de entorno:
 *   PROFILE_ID, PROVIDER, BASE_URL
 *
 * Pipe a archivo:
 *   node scripts/run-plan.mjs "Tu objetivo" > report.md
 *
 * Salida:
 *   - Progreso  → stderr (con colores)
 *   - Reporte   → stdout (markdown o JSON)
 */

import { DateTime } from 'luxon'

// ─── ANSI Colors ───────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  blue:    '\x1b[34m',
  gray:    '\x1b[90m',
  magenta: '\x1b[35m',
}
const c = (code, text) => `${C[code]}${text}${C.reset}`
const log = (...args) => process.stderr.write(args.join(' ') + '\n')
const out = (text) => process.stdout.write(text)

// ─── Args ──────────────────────────────────────────────────────────────────────
function parseArgs() {
  const raw = process.argv.slice(2)
  const flag = (name) => {
    const f = raw.find(a => a.startsWith(`--${name}=`))
    return f ? f.slice(`--${name}=`.length) : null
  }
  const parseProvidedAnswers = () => {
    const answersJson = flag('answers-json')
    const answersFile = flag('answers-file')
    if (answersJson && answersFile) {
      log(c('red', 'Error: usá solo uno entre --answers-json y --answers-file.'))
      process.exit(1)
    }

    const source = answersJson
      ? answersJson
      : answersFile
        ? readFileSync(answersFile, 'utf8').replace(/^\uFEFF/, '')
        : null

    if (source == null) return null

    let parsed
    try {
      parsed = JSON.parse(source)
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error)
      log(c('red', `Error: no pude parsear las respuestas predefinidas (${details}).`))
      process.exit(1)
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      log(c('red', 'Error: las respuestas predefinidas deben ser un objeto JSON {"pregunta-id":"respuesta"}.'))
      process.exit(1)
    }

    const normalized = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') {
        log(c('red', `Error: la respuesta para "${key}" debe ser string.`))
        process.exit(1)
      }
      const trimmedKey = key.trim()
      const trimmedValue = value.trim()
      if (!trimmedKey) continue
      if (trimmedValue) {
        normalized[trimmedKey] = trimmedValue
      }
    }

    return normalized
  }
  const intFlag = (name, { min = 1, max = 12 } = {}) => {
    const value = flag(name)
    if (value == null) return null
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      log(c('red', `Error: --${name} debe ser un entero entre ${min} y ${max}.`))
      process.exit(1)
    }
    return parsed
  }
  const goal = raw.find(a => !a.startsWith('--'))
  const existingPlanId = flag('plan-id')
  const resumeSession = flag('resume-session')
  if (!goal && !existingPlanId && !resumeSession) {
    log(c('red', 'Error: se requiere un objetivo, --plan-id o --resume-session.'))
    log('Uso: node scripts/run-plan.mjs "Tu objetivo" [--profile=uuid] [--provider=ollama] [--base=http://localhost:3000]')
    log('  o:  node scripts/run-plan.mjs --plan-id=<uuid> [--detail-start-week=3] [--detail-weeks=2]')
    log('  o:  node scripts/run-plan.mjs --resume-session=<id> --answers-json=\'{"id":"respuesta"}\'')
    log('  --provider=codex    Fuerza sesión OpenAI (sin API key)')
    log('  --provider=ollama   Fuerza Ollama local')
    log('  --no-codex          Saltea el intento con sesión OpenAI')
    log('  --auto              No hace preguntas, avanza directo')
    log('  --pause-on-input    Pausa en preguntas: escribe .lap-pending-input.json y sale con código 42')
    log('  --resume-session    Reanuda una sesión pausada con --answers-json')
    log('  --answers-json      Respuestas predefinidas en JSON {"id":"respuesta"}')
    log('  --answers-file      Archivo JSON con respuestas predefinidas')
    log('  --plan-id           Reabre un plan ya generado sin reconstruirlo')
    log('  --debug             Activa trazas detalladas, heartbeat y artefacto JSON por corrida')
    log('  --detail-start-week Semana inicial del calendario detallado')
    log('  --detail-weeks      Cantidad de semanas detalladas a mostrar')
    process.exit(1)
  }
  const explicitProvider = flag('provider') || process.env.PROVIDER || null
  return {
    goal: goal || '',
    existingPlanId,
    resumeSession,
    profileId:       flag('profile') || process.env.PROFILE_ID || '',
    explicitProvider,                        // null = auto (codex primero, fallback ollama)
    baseUrl:         flag('base') || process.env.BASE_URL || 'http://localhost:3000',
    outputJson:      raw.includes('--json'),
    noCodex:         raw.includes('--no-codex'),
    autoMode:        raw.includes('--auto'),
    pauseOnInput:    raw.includes('--pause-on-input'),
    debugMode:       raw.includes('--debug'),
    providedAnswers: parseProvidedAnswers(),
    detailStartWeek: intFlag('detail-start-week', { max: 104 }),
    detailWeeks:     intFlag('detail-weeks', { max: 104 }),
  }
}

// ─── Readline helper ────────────────────────────────────────────────────────────
import { createInterface } from 'node:readline'
import { createReadStream, createWriteStream, openSync, closeSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve as pathResolve } from 'node:path'

const PENDING_INPUT_FILE = pathResolve(process.cwd(), '.lap-pending-input.json')
const DEBUG_ARTIFACT_DIR = pathResolve(process.cwd(), '.lap-debug')

class ControlledExit extends Error {
  constructor(message, exitCode, details = null) {
    super(message)
    this.name = 'ControlledExit'
    this.exitCode = exitCode
    this.details = details
  }
}

function nowIso() {
  return DateTime.utc().toISO()
    ?? DateTime.utc().toFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
}

function slugifyForFilename(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function ensureDebugArtifactPath({ goal, resumeSession }) {
  mkdirSync(DEBUG_ARTIFACT_DIR, { recursive: true })
  const stamp = DateTime.local().toFormat('yyyyLLdd-HHmmss')
  const base = resumeSession
    ? `resume-${slugifyForFilename(resumeSession)}`
    : slugifyForFilename(goal) || 'plan-run'
  return pathResolve(DEBUG_ARTIFACT_DIR, `${stamp}-${base}.json`)
}

function createDebugSession(options) {
  if (!options.enabled) {
    return {
      enabled: false,
      artifactPath: null,
      recordLocal() {},
      recordSse() {},
      attachPendingInput() {},
      attachPackage() {},
      setSummary() {},
      finalize() {},
      getLatestDebugEvent() { return null },
      getLatestDebugStatus() { return null },
    }
  }

  const artifactPath = ensureDebugArtifactPath(options)
  const state = {
    schemaVersion: 1,
    mode: 'lap-cli-debug',
    startedAt: nowIso(),
    updatedAt: nowIso(),
    invocation: {
      goal: options.goal || '',
      resumeSession: options.resumeSession || null,
      profileId: options.profileId || null,
      baseUrl: options.baseUrl,
      detailStartWeek: options.detailStartWeek ?? null,
      detailWeeks: options.detailWeeks ?? null,
      debug: true,
    },
    summary: {
      planId: null,
      score: null,
      iterations: null,
      degraded: false,
      publicationState: null,
      failureCode: null,
      sessionId: options.resumeSession || null,
      provider: null,
      modelId: null,
      status: 'running',
    },
    pendingInput: null,
    finalPackage: null,
    finalResult: null,
    latestDebugEvent: null,
    latestDebugStatus: null,
    localEvents: [],
    sseEvents: [],
  }

  const persist = () => {
    state.updatedAt = nowIso()
    writeFileSync(artifactPath, JSON.stringify({
      ...state,
      artifactPath,
    }, null, 2), 'utf8')
  }

  const pushEvent = (bucket, type, data) => {
    bucket.push({
      timestamp: nowIso(),
      type,
      data,
    })
  }

  persist()

  return {
    enabled: true,
    artifactPath,
    recordLocal(type, data = {}) {
      pushEvent(state.localEvents, type, data)
      if (data && typeof data === 'object') {
        if (typeof data.provider === 'string') state.summary.provider = data.provider
        if (typeof data.modelId === 'string') state.summary.modelId = data.modelId
      }
      persist()
    },
    recordSse(type, data) {
      pushEvent(state.sseEvents, type, data)
      if (type === 'v6:heartbeat' && data?.status) {
        state.latestDebugStatus = data.status
      }
      if (type === 'v6:debug' && data && typeof data === 'object') {
        state.latestDebugEvent = data
        if (data.publicationState) state.summary.publicationState = data.publicationState
        if (data.failureCode) state.summary.failureCode = data.failureCode
      }
      if (type === 'v6:needs_input' && data?.sessionId) {
        state.summary.sessionId = data.sessionId
      }
      if (type === 'v6:complete') {
        if (typeof data?.planId === 'string') state.summary.planId = data.planId
        if (typeof data?.score === 'number') state.summary.score = data.score
        if (typeof data?.iterations === 'number') state.summary.iterations = data.iterations
        state.summary.degraded = data?.degraded === true
      }
      if (type === 'result' && data && typeof data === 'object') {
        const result = data.result ?? data
        if (result && typeof result === 'object') {
          if (typeof result.publicationState === 'string') state.summary.publicationState = result.publicationState
          if (typeof result.failureCode === 'string') state.summary.failureCode = result.failureCode
          if (result.degraded === true) state.summary.degraded = true
          state.finalResult = result
        }
      }
      persist()
    },
    attachPendingInput(data) {
      state.pendingInput = data
      if (data?.sessionId) state.summary.sessionId = data.sessionId
      persist()
    },
    attachPackage(data) {
      state.finalPackage = data
      if (typeof data?.meta?.modelId === 'string' && data.meta.modelId.trim()) {
        state.summary.modelId = data.meta.modelId.trim()
      }
      if (data?.package?.publicationState) state.summary.publicationState = data.package.publicationState
      persist()
    },
    setSummary(partial) {
      Object.assign(state.summary, partial)
      persist()
    },
    finalize(status, extra = {}) {
      state.summary.status = status
      if (extra && typeof extra === 'object') {
        Object.assign(state.summary, extra)
      }
      persist()
    },
    getLatestDebugEvent() {
      return state.latestDebugEvent
    },
    getLatestDebugStatus() {
      return state.latestDebugStatus
    },
  }
}

function createPromptStreams() {
  if (process.stdin.isTTY && process.stderr.isTTY) {
    return {
      input: process.stdin,
      output: process.stderr,
      close() {},
    }
  }

  if (process.platform === 'win32') {
    let inputFd
    let outputFd
    try {
      inputFd = openSync('\\\\.\\CONIN$', 'r')
      outputFd = openSync('\\\\.\\CONOUT$', 'w')
      const input = createReadStream(null, { fd: inputFd, autoClose: true })
      const output = createWriteStream(null, { fd: outputFd, autoClose: true })
      return {
        input,
        output,
        close() {
          input.destroy()
          output.end()
        },
      }
    } catch {
      try { closeSync(inputFd) } catch {}
      try { closeSync(outputFd) } catch {}
      return null
    }
  }

  return null
}

function askUser(prompt) {
  const streams = createPromptStreams()
  if (!streams) return Promise.resolve(null)

  return new Promise((resolve) => {
    const rl = createInterface({ input: streams.input, output: streams.output })
    rl.question(prompt, (answer) => {
      rl.close()
      streams.close()
      resolve(answer.trim())
    })
  })
}

async function askClarificationQuestions(questions) {
  const answers = {}
  log('')
  log(c('cyan', '  Respondé las preguntas (Enter vacío = saltar):'))
  log('')
  for (const q of questions) {
    const hint = q.options?.length
      ? ` ${c('gray', `[${q.options.join(' / ')}]`)}`
      : q.type === 'number'
        ? ` ${c('gray', `[número${q.min != null ? ` min:${q.min}` : ''}${q.max != null ? ` max:${q.max}` : ''}]`)}`
        : ''
    const answer = await askUser(`  ${c('yellow', q.text)}${hint}\n  ${c('green', '→ ')}`)
    if (answer == null) {
      return null
    }
    if (answer) {
      answers[q.id] = answer
    }
  }
  log('')
  return answers
}

// ─── SSE Parser ────────────────────────────────────────────────────────────────
function parseSseBlock(block) {
  const lines = block.trim().split('\n')
  let eventType = null
  const dataLines = []
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue
    const sep = line.indexOf(':')
    if (sep < 0) continue
    const field = line.slice(0, sep).trim()
    let value = line.slice(sep + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') eventType = value.trim()
    if (field === 'data')  dataLines.push(value)
  }
  if (!dataLines.length) return null
  return { eventType, data: dataLines.join('\n').trim() }
}

// ─── Formatting helpers ────────────────────────────────────────────────────────
function formatMin(minutes) {
  if (!minutes) return '–'
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}min` : `${h}h`
}

const DAYS_ES  = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS_ES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function fmtDate(iso) {
  if (!iso) return '–'
  const d = new Date(iso)
  return `${DAYS_ES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_ES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function fmtTime(iso) {
  if (!iso) return '–'
  const d = new Date(iso)
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`
}

function deriveSkeletonHorizonWeeks(skeleton, detail) {
  const phases = Array.isArray(skeleton?.phases) ? skeleton.phases : []
  const startDate = phases[0]?.startDate || detail?.startDate
  const endDate = phases.at(-1)?.endDate || detail?.endDate

  if (startDate && endDate) {
    const start = DateTime.fromISO(startDate, { zone: 'UTC' }).startOf('day')
    const end = DateTime.fromISO(endDate, { zone: 'UTC' }).startOf('day')
    if (start.isValid && end.isValid && end >= start) {
      return Math.max(1, Math.ceil((end.diff(start, 'days').days + 1) / 7))
    }
  }

  if (typeof skeleton?.horizonWeeks === 'number') {
    return skeleton.horizonWeeks
  }

  if (typeof detail?.horizonWeeks === 'number') {
    return detail.horizonWeeks
  }

  return null
}

function mondayOf(isoDate) {
  const d = new Date(isoDate)
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

// ─── Phase labels ──────────────────────────────────────────────────────────────
const PHASE_LABEL = {
  interpret:       'Interpretando objetivo',
  clarify:         'Preparando preguntas de clarificación',
  'clarify-resume':'Procesando respuestas',
  plan:            'Diseñando plan estratégico',
  check:           'Verificando factibilidad',
  schedule:        'Resolviendo calendario (MILP)',
  critique:        'Evaluando calidad del plan',
  revise:          'Refinando iteración',
  package:         'Empaquetando resultado final',
}

// ─── Build API caller (SSE) ────────────────────────────────────────────────────
// Errores recuperables → se puede reintentar con otro provider
const DEBUG_AGENT_LABEL = {
  'goal-interpreter': 'interprete',
  clarifier: 'clarificador',
  planner: 'planificador',
  'feasibility-checker': 'verificador',
  scheduler: 'scheduler',
  critic: 'critico',
  'domain-expert': 'experto de dominio',
  packager: 'empaquetador',
}

function formatLoopLabel(event) {
  const parts = [`iter ${event?.iteration ?? 0}`]
  if ((event?.revisionCycle ?? 0) > 0) parts.push(`rev ${event.revisionCycle}`)
  if ((event?.clarifyRound ?? 0) > 0) parts.push(`acl ${event.clarifyRound}`)
  return parts.join(' | ')
}

function formatDebugMeta(event) {
  const parts = []
  if (event?.phase) parts.push(`fase: ${PHASE_LABEL[event.phase] || event.phase}`)
  if (event?.agent) parts.push(`agente: ${DEBUG_AGENT_LABEL[event.agent] || event.agent}`)
  if (event?.errorCode) parts.push(`codigo: ${event.errorCode}`)
  if (event?.failureCode) parts.push(`falla: ${event.failureCode}`)
  if (event?.publicationState) parts.push(`publicacion: ${event.publicationState}`)
  if (typeof event?.fallbackCount === 'number') parts.push(`fallbacks: ${event.fallbackCount}`)
  parts.push(formatLoopLabel(event))
  return parts.join(' | ')
}

function formatDebugEvidence(details) {
  if (!details || typeof details !== 'object') return []

  const lines = []
  const partialKind = typeof details.partialKind === 'string' ? details.partialKind : null

  if (partialKind === 'interpretation') {
    if (details.normalizedGoal) lines.push(`objetivo normalizado: ${details.normalizedGoal}`)
    if (details.goalType) lines.push(`tipo detectado: ${details.goalType}`)
    if (details.suggestedDomain) lines.push(`dominio sugerido: ${details.suggestedDomain}`)
    if (Array.isArray(details.ambiguities) && details.ambiguities.length > 0) {
      lines.push(`ambiguedades: ${details.ambiguities.slice(0, 3).join(' | ')}`)
    }
    if (Array.isArray(details.assumptions) && details.assumptions.length > 0) {
      lines.push(`supuestos: ${details.assumptions.slice(0, 3).join(' | ')}`)
    }
  }

  if (partialKind === 'clarification') {
    if (Array.isArray(details.knownAnswers) && details.knownAnswers.length > 0) {
      details.knownAnswers.slice(0, 4).forEach((item, index) => {
        lines.push(`sabemos ${index + 1}: ${item.question} -> ${item.answer}`)
      })
    }
    if (Array.isArray(details.informationGaps) && details.informationGaps.length > 0) {
      lines.push(`faltantes: ${details.informationGaps.slice(0, 4).join(' | ')}`)
    }
    if (Array.isArray(details.duplicateQuestions) && details.duplicateQuestions.length > 0) {
      details.duplicateQuestions.slice(0, 2).forEach((item, index) => {
        lines.push(`pregunta repetida ${index + 1}: ${item.text}`)
      })
    }
  }

  if (partialKind === 'roadmap') {
    if (details.horizonWeeks != null) lines.push(`horizonte: ${details.horizonWeeks} semana(s)`)
    if (details.phaseCount != null) lines.push(`fases: ${details.phaseCount}`)
    if (Array.isArray(details.phases) && details.phases.length > 0) {
      details.phases.slice(0, 4).forEach((phase) => {
        const duration = phase.durationWeeks != null ? ` (${phase.durationWeeks} sem)` : ''
        lines.push(`fase ${phase.index}: ${phase.title}${duration} -> ${phase.focus}`)
      })
    }
    if (Array.isArray(details.milestones) && details.milestones.length > 0) {
      lines.push(`hitos: ${details.milestones.slice(0, 4).join(' | ')}`)
    }
    if (details.fallbackUsed) {
      lines.push(`fallback planner: ${details.fallbackPublishability || 'activo'}`)
    }
  }

  if (partialKind === 'feasibility') {
    if (details.availableHours != null || details.requiredHours != null || details.gap != null) {
      lines.push(`horas: ${details.availableHours ?? '?'} disponibles vs ${details.requiredHours ?? '?'} requeridas | gap: ${details.gap ?? '?'}`)
    }
    if (Array.isArray(details.conflicts) && details.conflicts.length > 0) {
      details.conflicts.slice(0, 3).forEach((item, index) => {
        lines.push(`conflicto ${index + 1}: ${item.description}`)
      })
    }
    if (Array.isArray(details.adjustments) && details.adjustments.length > 0) {
      details.adjustments.slice(0, 3).forEach((item, index) => {
        lines.push(`ajuste ${index + 1}: ${item.description}`)
      })
    }
  }

  if (partialKind === 'schedule') {
    if (details.fillRate != null) lines.push(`fill rate: ${Math.round(Number(details.fillRate) * 100)}%`)
    if (details.unscheduledCount != null) lines.push(`sin calendarizar: ${details.unscheduledCount}`)
    if (details.solverStatus || details.solverTimeMs != null) {
      lines.push(`solver: ${details.solverStatus || 'n/d'}${details.solverTimeMs != null ? ` en ${details.solverTimeMs}ms` : ''}`)
    }
    if (Array.isArray(details.tradeoffs) && details.tradeoffs.length > 0) {
      details.tradeoffs.slice(0, 2).forEach((item, index) => {
        const text = item?.question_esAR || item?.planA?.description_esAR || JSON.stringify(item)
        lines.push(`tradeoff ${index + 1}: ${text}`)
      })
    }
  }

  if (partialKind === 'critic_round') {
    if (details.comparison && details.comparison !== 'sin_base') {
      lines.push(`comparacion vs vuelta anterior: ${details.comparison}${details.scoreDelta != null ? ` (${details.scoreDelta > 0 ? '+' : ''}${details.scoreDelta})` : ''}`)
    }
  }

  if (partialKind === 'package') {
    if (details.summary) lines.push(`resumen paquete: ${details.summary}`)
    if (details.requestDomain || details.packageDomain) {
      lines.push(`dominio pedido/paquete: ${details.requestDomain || 'n/d'} -> ${details.packageDomain || 'n/d'}`)
    }
  }

  if (partialKind === 'publication') {
    lines.push(`listo para publicar: ${details.canPublish ? 'si' : 'no'}`)
    if (details.misalignedGoal === true) lines.push('senal de desalineacion: el paquete parece responder a otro objetivo')
    if (Array.isArray(details.exactBlockers) && details.exactBlockers.length > 0) {
      details.exactBlockers.slice(0, 3).forEach((item, index) => {
        const code = item.errorCode ? ` [${item.errorCode}]` : ''
        lines.push(`bloqueante ${index + 1}: ${item.agent}${code}${item.errorMessage ? ` -> ${item.errorMessage}` : ''}`)
      })
    }
    if (Array.isArray(details.fallbackLedger) && details.fallbackLedger.length > 0) {
      const compact = details.fallbackLedger
        .slice(0, 4)
        .map((item) => `${item.agent}/${item.phase} x${item.count}${item.latestErrorCode ? ` [${item.latestErrorCode}]` : ''}`)
        .join(' | ')
      lines.push(`ledger fallbacks: ${compact}`)
    }
  }

  if (details.failedCheck) lines.push(`check fallido: ${details.failedCheck}`)
  if (details.validationSummaryEs) lines.push(`motivo: ${details.validationSummaryEs}`)

  if (details.validationEvidence && typeof details.validationEvidence === 'object') {
    for (const [key, value] of Object.entries(details.validationEvidence).slice(0, 4)) {
      const printable = Array.isArray(value)
        ? value.join(' | ')
        : typeof value === 'object' && value !== null
          ? JSON.stringify(value)
          : String(value)
      lines.push(`${key}: ${printable}`)
    }
  }

  if (Array.isArray(details.mustFix) && details.mustFix.length > 0) {
    details.mustFix.slice(0, 3).forEach((finding, index) => {
      lines.push(`must-fix ${index + 1}: ${finding.message}`)
    })
  }

  if (Array.isArray(details.qualityIssues) && details.qualityIssues.length > 0) {
    details.qualityIssues.slice(0, 3).forEach((issue, index) => {
      lines.push(`issue ${index + 1}: ${issue.message}${issue.code ? ` [${issue.code}]` : ''}`)
    })
  }

  if (Array.isArray(details.questions) && details.questions.length > 0) {
    details.questions.slice(0, 3).forEach((question, index) => {
      lines.push(`pregunta ${index + 1}: ${question.text}`)
    })
  }

  return lines
}

function shouldRenderDebugEvent(event) {
  if (!event || typeof event !== 'object') return false
  if (event.action === 'phase.enter' || event.action === 'phase.transition' || event.action === 'agent.start') {
    return false
  }
  if (event.category === 'agent' && event.action === 'agent.completed') {
    return false
  }
  return true
}

function renderDebugEventLine(event, elapsedSeconds) {
  if (!shouldRenderDebugEvent(event)) return
  log(c('magenta', `  [${elapsedSeconds}s][debug]`) + ` ${event.summary_es}`)
  log(c('gray', `         ${formatDebugMeta(event)}`))
  formatDebugEvidence(event.details).forEach((line) => {
    log(c('gray', `         ${line}`))
  })
}

function renderDebugHeartbeat(heartbeat, elapsedSeconds, renderState = null) {
  const status = heartbeat?.status ?? {}
  const signature = [
    status.lifecycle || 'running',
    status.currentPhase || '',
    status.currentAgent || '',
    status.iteration ?? 0,
    status.revisionCycles ?? 0,
    status.clarifyRounds ?? 0,
    status.fallbackCount ?? 0,
    status.publicationState || '',
    status.lastEventSequence ?? 0,
  ].join('|')
  if (renderState && renderState.lastHeartbeatSignature === signature) {
    return
  }
  if (renderState) {
    renderState.lastHeartbeatSignature = signature
  }
  const phaseLabel = status.currentPhase ? (PHASE_LABEL[status.currentPhase] || status.currentPhase) : 'sin fase'
  const agentLabel = status.currentAgent ? (DEBUG_AGENT_LABEL[status.currentAgent] || status.currentAgent) : 'sin agente'
  const publication = status.publicationState ? ` | publicacion: ${status.publicationState}` : ''
  log(c('magenta', `  [${elapsedSeconds}s][latido]`) + ` ${status.currentSummary_es || 'El pipeline sigue activo.'}`)
  log(c('gray', `         estado: ${status.lifecycle || 'running'} | fase: ${phaseLabel} | agente: ${agentLabel} | iter: ${status.iteration ?? 0} | rev: ${status.revisionCycles ?? 0} | acl: ${status.clarifyRounds ?? 0} | fallbacks: ${status.fallbackCount ?? 0}${publication}`))
}

function renderDebugFailureDiagnosis(details, debugSession, elapsedSeconds) {
  const latestDebug = debugSession?.getLatestDebugEvent?.() || null
  log(c('red', `  [${elapsedSeconds}s][diagnostico] ${details.message}`))
  if (latestDebug) {
    log(c('gray', `         ${formatDebugMeta(latestDebug)}`))
    formatDebugEvidence(latestDebug.details).forEach((line) => {
      log(c('gray', `         ${line}`))
    })
  }
  formatFailureDetails(details).forEach((line) => log(line))
}

const RECOVERABLE_ERRORS = [
  'codex_auth_missing', 'codex_mode_unavailable', 'cloud_credential_missing',
  'user_credential_missing', 'backend_credential_missing', 'authentication',
  'unauthorized', 'api key', 'no se encontró una clave', 'local assistant',
  'usage limit', 'quota', 'rate limit', 'too many requests', '429',
]
function isRecoverableError(msg) {
  const low = (msg || '').toLowerCase()
  return RECOVERABLE_ERRORS.some(k => low.includes(k))
}

function normalizeStringList(values) {
  if (!Array.isArray(values)) return []
  return Array.from(new Set(values.map((value) => typeof value === 'string' ? value.trim() : '').filter(Boolean)))
}

function normalizeFailureOutcomeList(values) {
  if (!Array.isArray(values)) return []
  return values
    .filter((value) => value && typeof value === 'object')
    .map((value) => ({
      agent: typeof value.agent === 'string' ? value.agent : 'unknown',
      source: typeof value.source === 'string' ? value.source : 'unknown',
      errorCode: typeof value.errorCode === 'string' ? value.errorCode : null,
      errorMessage: typeof value.errorMessage === 'string' ? value.errorMessage : null,
    }))
}

function normalizeFailureIssues(values) {
  if (!Array.isArray(values)) return []
  return values
    .filter((value) => value && typeof value === 'object')
    .map((value) => ({
      code: typeof value.code === 'string' ? value.code : '',
      severity: typeof value.severity === 'string' ? value.severity : 'warning',
      message: typeof value.message === 'string' ? value.message : '',
    }))
    .filter((issue) => issue.message.length > 0)
}

function extractFailureDetails(payload) {
  const source = payload?.result?.success === false ? payload.result : payload
  const planPackage = source?.package && typeof source.package === 'object' ? source.package : null

  return {
    message: source?.error || source?.message || 'Error del pipeline',
    failureCode: source?.failureCode ?? null,
    publicationState: source?.publicationState ?? 'failed',
    agentOutcomes: normalizeFailureOutcomeList(source?.agentOutcomes),
    blockingAgents: normalizeFailureOutcomeList(source?.blockingAgents),
    qualityIssues: normalizeFailureIssues(source?.qualityIssues ?? planPackage?.qualityIssues),
    warnings: normalizeStringList(source?.warnings ?? planPackage?.warnings),
    package: planPackage,
  }
}

function isRecoverableFailureDetails(details) {
  const fragments = [
    details?.message,
    details?.failureCode,
    ...(details?.warnings ?? []),
    ...(details?.blockingAgents ?? []).flatMap((agent) => [agent.errorCode, agent.errorMessage]),
    ...(details?.agentOutcomes ?? []).flatMap((agent) => [agent.errorCode, agent.errorMessage]),
    ...(details?.qualityIssues ?? []).flatMap((issue) => [issue.code, issue.message]),
  ]

  return isRecoverableError(fragments.filter(Boolean).join(' | '))
}

function formatFailureDetails(details) {
  const lines = []
  if (details.failureCode) {
    lines.push(c('red', `  failureCode: ${details.failureCode}`))
  }
  if (details.publicationState) {
    lines.push(c('red', `  publicationState: ${details.publicationState}`))
  }
  if (details.blockingAgents.length > 0) {
    lines.push(c('red', `  blockingAgents: ${details.blockingAgents.map((agent) => `${agent.agent}${agent.errorCode ? ` [${agent.errorCode}]` : ''}: ${agent.errorMessage ?? 'unknown'}`).join('; ')}`))
  }
  if (details.agentOutcomes.length > 0) {
    lines.push(c('red', `  agentOutcomes: ${details.agentOutcomes.map((agent) => `${agent.agent}${agent.errorCode ? ` [${agent.errorCode}]` : ''}: ${agent.errorMessage ?? 'unknown'}`).join('; ')}`))
  }
  if (details.qualityIssues.length > 0) {
    lines.push(c('red', '  qualityIssues:'))
    details.qualityIssues.forEach((issue) => {
      lines.push(c('red', `    - [${issue.severity}${issue.code ? `/${issue.code}` : ''}] ${issue.message}`))
    })
  }
  if (details.warnings.length > 0) {
    lines.push(c('red', `  warnings: ${details.warnings.join(' | ')}`))
  }
  return lines
}

function normalizeAnswerKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function resolveQuestionCategory(question) {
  const haystack = normalizeAnswerKey(`${question?.id || ''} ${question?.text || ''}`)
  if (/(nivel|habilidad|experiencia|principiante|intermedio|avanzado)/.test(haystack)) return 'level'
  if (/(platos|subtema|pizza|pasta|risotto|postre|cocina italiana|tipos)/.test(haystack)) return 'subtopic'
  if (/(metodo|m[eé]todo|clases|videos|libros|curso|autodidacta)/.test(haystack)) return 'method'
  if (/(horizonte|plazo|tiempo|fecha|meses|semanas|objetivo temporal)/.test(haystack)) return 'horizon'
  return null
}

function resolveAnswerForQuestion(question, normalizedEntries) {
  const idKey = normalizeAnswerKey(question?.id || '')
  if (idKey && normalizedEntries.has(idKey)) {
    return normalizedEntries.get(idKey)
  }

  const category = resolveQuestionCategory(question)
  if (!category) return null

  const categoryMatchers = {
    level: /(nivel|habilidad|experiencia|principiante|intermedio|avanzado)/,
    subtopic: /(subtema|platos|pizza|pasta|risotto|postre|italian)/,
    method: /(metodo|metodo aprendizaje|clases|videos|libros|curso|autodidacta)/,
    horizon: /(horizonte|plazo|tiempo|fecha|mes|semana)/,
  }

  for (const [key, value] of normalizedEntries.entries()) {
    if (categoryMatchers[category].test(key)) {
      return value
    }
  }

  return null
}

function pickProvidedAnswers(questions, providedAnswers) {
  if (!providedAnswers) return {}
  const normalizedEntries = new Map(
    Object.entries(providedAnswers).map(([key, value]) => [normalizeAnswerKey(key), value])
  )
  const selected = {}
  for (const question of questions) {
    const answer = resolveAnswerForQuestion(question, normalizedEntries)
    if (typeof answer === 'string' && answer.trim()) {
      selected[question.id] = answer.trim()
    }
  }
  return selected
}

async function runPipeline(baseUrl, body, {
  autoMode = false,
  pauseOnInput = false,
  providedAnswers = null,
  debugMode = false,
  debugSession = null,
} = {}) {
  const requestBody = debugMode ? { ...body, debug: true } : body
  debugSession?.recordLocal?.('build.requested', {
    endpoint: '/api/plan/build',
    provider: body.provider ?? body.resourceMode ?? 'auto',
    goalText: body.goalText ?? '',
    profileId: body.profileId ?? null,
  })
  const res = await fetch(`${baseUrl}/api/plan/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    body: JSON.stringify(requestBody),
  })
  if (!res.ok) {
    const txt = await res.text()
    debugSession?.recordLocal?.('build.http_error', {
      endpoint: '/api/plan/build',
      status: res.status,
      body: txt,
    })
    throw new Error(`API ${res.status}: ${txt}`)
  }

  let reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let planId = null, score = 0, iterations = 0
  let degraded = false
  let agentOutcomes = []
  let readerSwitched = false

  const t0 = Date.now()
  const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1)
  const noteSse = (type, data) => debugSession?.recordSse?.(type, data)
  const debugRenderState = { lastHeartbeatSignature: null }

  while (true) {
    const { done, value } = await reader.read()
    if (value) {
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n')
      let bi = buffer.indexOf('\n\n')
      while (bi >= 0) {
        const block = buffer.slice(0, bi)
        buffer = buffer.slice(bi + 2)
        const parsed = parseSseBlock(block)
        if (parsed) {
          let payload
          try { payload = JSON.parse(parsed.data) } catch { payload = null }
          if (!payload) { bi = buffer.indexOf('\n\n'); continue }

          const type = parsed.eventType || payload.type
          const data = payload.data ?? payload
          noteSse(type, data)
          if (type === 'v6:debug') {
            if (debugMode) {
              renderDebugEventLine(data, elapsed())
            }
          }

          else if (type === 'v6:heartbeat') {
            if (debugMode) {
              renderDebugHeartbeat(data, elapsed(), debugRenderState)
            }
          }

          else if (type === 'v6:phase') {
            const label = PHASE_LABEL[data.phase] || data.phase
            const iter  = data.iteration > 0 ? c('gray', ` (vuelta ${data.iteration})`) : ''
            if (!debugMode) {
              log(c('cyan', `  [${elapsed()}s]`) + ` ${label}` + iter)
            }
          }

          else if (type === 'v6:progress') {
            const pct    = Math.min(100, Math.max(0, Math.round(data.score ?? 0)))
            const filled = Math.round(pct / 5)
            const bar    = '█'.repeat(filled) + '░'.repeat(20 - filled)
            const action = data.lastAction ? c('dim', ` ${data.lastAction}`) : ''
            if (!debugMode) {
              log(c('gray', `         ${bar} ${pct}%`) + action)
            }
          }

          else if (type === 'v6:complete') {
            planId     = data.planId
            score      = data.score
            iterations = data.iterations
            degraded   = data.degraded === true
            agentOutcomes = Array.isArray(data.agentOutcomes) ? data.agentOutcomes : agentOutcomes
            debugSession?.setSummary?.({
              planId,
              score,
              iterations,
              degraded,
            })
            log('')
            log(c('green', `  ✔ Pipeline completado en ${elapsed()}s`))
            const completionScoreLabel = degraded ? 'degradado' : `${score}/100`
            log(c('green', `    Score: ${completionScoreLabel}  |  Iteraciones: ${iterations}  |  Plan ID: ${planId}`))
          }

          else if (type === 'v6:needs_input') {
            const sessionId = data.sessionId
            const questions = data.questions?.questions ?? []
            const resumeCommand = `node scripts/run-plan.mjs --resume-session=${sessionId} --answers-json='{"id":"respuesta",...}'${debugMode ? ' --debug' : ''}`
            const pendingData = {
              sessionId,
              goal: body.goalText || '',
              profileId: body.profileId || '',
              questions: questions.map(q => ({
                id: q.id,
                text: q.text,
                type: q.type || 'text',
                options: q.options || null,
                min: q.min ?? null,
                max: q.max ?? null,
              })),
              createdAt: nowIso(),
              pendingFilePath: PENDING_INPUT_FILE,
              resumeCommand,
            }
            debugSession?.attachPendingInput?.(pendingData)
            if (debugMode) {
              log(c('gray', `         session: ${sessionId || 'sin sessionId'} | archivo: ${PENDING_INPUT_FILE}`))
              questions.forEach((question, index) => {
                log(c('gray', `         pregunta ${index + 1}: ${question.text}`))
              })
              log(c('gray', `         reanudar: ${resumeCommand}`))
            }
            log(c('yellow', `  ⏸ El modelo necesita mas informacion (${questions.length} preguntas)`))

            // ── Modo pause-on-input: escribir preguntas a archivo y salir ──
            if (pauseOnInput) {
              writeFileSync(PENDING_INPUT_FILE, JSON.stringify(pendingData, null, 2), 'utf8')
              log(c('cyan', `  Preguntas escritas en ${PENDING_INPUT_FILE}`))
              log(c('cyan', '  Para reanudar:'))
              log(c('cyan', `    ${resumeCommand}`))
              throw new ControlledExit('Pipeline pausado esperando respuestas.', 42, pendingData)
            }

            let answers = {}
            const selectedProvidedAnswers = pickProvidedAnswers(questions, providedAnswers)
            if (Object.keys(selectedProvidedAnswers).length > 0) {
              answers = selectedProvidedAnswers
              debugSession?.recordLocal?.('input.answers_preloaded', {
                sessionId,
                answersCount: Object.keys(answers).length,
              })
              log(c('blue', `  ↻ Continuando con ${Object.keys(answers).length}/${questions.length} respuestas predefinidas...`))
            } else if (autoMode) {
              debugSession?.recordLocal?.('input.answers_skipped_auto', {
                sessionId,
                questionsCount: questions.length,
              })
              questions.forEach((q, i) => log(c('yellow', `    ${i + 1}. ${q.text}`)))
              log(c('blue', '  ↻ Modo auto: avanzando sin respuestas...'))
            } else {
              const promptedAnswers = await askClarificationQuestions(questions)
              if (promptedAnswers == null) {
                debugSession?.recordLocal?.('input.answers_missing_console', {
                  sessionId,
                  questionsCount: questions.length,
                })
                questions.forEach((q, i) => log(c('yellow', `    ${i + 1}. ${q.text}`)))
                log(c('blue', '  ↻ No se detectó una consola interactiva. Usá `--auto` o ejecutalo desde una terminal local para responder.'))
              } else {
                answers = promptedAnswers
                const answered = Object.keys(answers).length
                debugSession?.recordLocal?.('input.answers_collected', {
                  sessionId,
                  answersCount: answered,
                })
                log(c('blue', `  ↻ Continuando con ${answered}/${questions.length} respuestas...`))
              }
            }

            if (sessionId) {
              try {
                const resumePayload = debugMode ? { sessionId, answers, debug: true } : { sessionId, answers }
                const resumeRes = await fetch(`${baseUrl}/api/plan/build/resume`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(resumePayload),
                })
                if (resumeRes.ok && resumeRes.body) {
                  debugSession?.recordLocal?.('resume.requested', {
                    sessionId,
                    answersCount: Object.keys(answers).length,
                  })
                  reader = resumeRes.body.getReader()
                  buffer = ''
                  readerSwitched = true
                } else {
                  debugSession?.recordLocal?.('resume.rejected', {
                    sessionId,
                    status: resumeRes.status,
                  })
                }
              } catch (resumeErr) {
                debugSession?.recordLocal?.('resume.failed', {
                  sessionId,
                  error: resumeErr instanceof Error ? resumeErr.message : String(resumeErr),
                })
                log(c('yellow', `  Aviso: no se pudo continuar la sesion: ${resumeErr.message}`))
              }
            }
          }

          else if (type === 'v6:degraded') {
            degraded = true
            debugSession?.setSummary?.({ degraded: true })
            agentOutcomes = Array.isArray(data.agentOutcomes) ? data.agentOutcomes : agentOutcomes
            log(c('yellow', '  Plan degradado: se usaron datos de respaldo.'))
            if (data.failedAgents) {
              log(c('yellow', `    ${data.failedAgents}`))
            }
          }

          else if (type === 'result' && (data.success === false || data.result?.success === false)) {
            const failureDetails = extractFailureDetails(data)
            log('')
            if (debugMode) {
              renderDebugFailureDiagnosis(failureDetails, debugSession, elapsed())
            } else {
              log(c('red', `  Error estructurado: ${failureDetails.message}`))
              formatFailureDetails(failureDetails).forEach((line) => log(line))
            }
            const err = new Error(failureDetails.message)
            err.recoverable = isRecoverableFailureDetails(failureDetails)
            err.failureDetails = failureDetails
            debugSession?.setSummary?.({
              failureCode: failureDetails.failureCode,
              publicationState: failureDetails.publicationState,
              degraded: failureDetails.agentOutcomes.some((outcome) => outcome.source === 'fallback'),
            })
            throw err
          }
        }
        bi = buffer.indexOf('\n\n')
      }
    }
    if (done && !readerSwitched) break
    if (readerSwitched) { readerSwitched = false }
  }

  // tail
  buffer += decoder.decode().replace(/\r\n/g, '\n')
  const tail = parseSseBlock(buffer)
  if (tail) {
    let payload; try { payload = JSON.parse(tail.data) } catch { payload = null }
    if (payload?.type === 'v6:complete' && !planId) {
      const d = payload.data ?? payload
      planId = d.planId; score = d.score; iterations = d.iterations
      degraded = d.degraded === true
      agentOutcomes = Array.isArray(d.agentOutcomes) ? d.agentOutcomes : agentOutcomes
    }
  }

  if (!planId) {
    debugSession?.recordLocal?.('build.missing_plan_id', {
      degraded,
      iterations,
    })
    throw new Error('No se recibió planId del pipeline. ¿Terminó correctamente?')
  }
  debugSession?.setSummary?.({
    planId,
    score,
    iterations,
    degraded,
  })
  return { planId, score, iterations, degraded, agentOutcomes }
}

// ─── Resume session (for --resume-session) ────────────────────────────────────
async function resumePipeline(baseUrl, sessionId, answers, {
  debugMode = false,
  debugSession = null,
} = {}) {
  log(c('blue', `Reanudando sesion ${sessionId}...`))
  log('')

  debugSession?.recordLocal?.('resume.explicit_request', {
    endpoint: '/api/plan/build/resume',
    sessionId,
    answersCount: Object.keys(answers || {}).length,
  })

  const res = await fetch(`${baseUrl}/api/plan/build/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(debugMode ? { sessionId, answers, debug: true } : { sessionId, answers }),
  })
  if (!res.ok) {
    const txt = await res.text()
    debugSession?.recordLocal?.('resume.http_error', {
      endpoint: '/api/plan/build/resume',
      sessionId,
      status: res.status,
      body: txt,
    })
    throw new Error(`Resume API ${res.status}: ${txt}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let planId = null
  let score = 0
  let iterations = 0
  let degraded = false
  let agentOutcomes = []

  const t0 = Date.now()
  const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1)
  const noteSse = (type, data) => debugSession?.recordSse?.(type, data)
  const debugRenderState = { lastHeartbeatSignature: null }

  while (true) {
    const { done, value } = await reader.read()
    if (value) {
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n')
      let bi = buffer.indexOf('\n\n')
      while (bi >= 0) {
        const block = buffer.slice(0, bi)
        buffer = buffer.slice(bi + 2)
        const parsed = parseSseBlock(block)
        if (!parsed) {
          bi = buffer.indexOf('\n\n')
          continue
        }

        let payload
        try {
          payload = JSON.parse(parsed.data)
        } catch {
          payload = null
        }
        if (!payload) {
          bi = buffer.indexOf('\n\n')
          continue
        }

        const type = parsed.eventType || payload.type
        const data = payload.data ?? payload
        noteSse(type, data)

        if (type === 'v6:debug') {
          if (debugMode) {
            renderDebugEventLine(data, elapsed())
          }
        } else if (type === 'v6:heartbeat') {
          if (debugMode) {
            renderDebugHeartbeat(data, elapsed(), debugRenderState)
          }
        } else if (type === 'v6:phase') {
          const label = PHASE_LABEL[data.phase] || data.phase
          const iter = data.iteration > 0 ? c('gray', ` (vuelta ${data.iteration})`) : ''
          if (!debugMode) {
            log(c('cyan', `  [${elapsed()}s]`) + ` ${label}` + iter)
          }
        } else if (type === 'v6:progress') {
          const pct = Math.min(100, Math.max(0, Math.round(data.score ?? 0)))
          const filled = Math.round(pct / 5)
          const bar = '#'.repeat(filled) + '-'.repeat(20 - filled)
          const action = data.lastAction ? c('dim', ` ${data.lastAction}`) : ''
          if (!debugMode) {
            log(c('gray', `         ${bar} ${pct}%`) + action)
          }
        } else if (type === 'v6:needs_input') {
          const questions = data.questions?.questions ?? []
          const resumeCommand = `node scripts/run-plan.mjs --resume-session=${sessionId} --answers-json='{"id":"respuesta",...}'${debugMode ? ' --debug' : ''}`
          const pendingData = {
            sessionId,
            answers,
            questions: questions.map((q) => ({
              id: q.id,
              text: q.text,
              type: q.type || 'text',
              options: q.options || null,
              min: q.min ?? null,
              max: q.max ?? null,
            })),
            createdAt: nowIso(),
            pendingFilePath: PENDING_INPUT_FILE,
            resumeCommand,
          }

          debugSession?.attachPendingInput?.(pendingData)
          if (debugMode) {
            log(c('gray', `         session: ${sessionId} | archivo: ${PENDING_INPUT_FILE}`))
            questions.forEach((question, index) => {
              log(c('gray', `         pregunta ${index + 1}: ${question.text}`))
            })
            log(c('gray', `         reanudar: ${resumeCommand}`))
          }

          writeFileSync(PENDING_INPUT_FILE, JSON.stringify(pendingData, null, 2), 'utf8')
          log(c('yellow', `  Pausa: la sesion sigue necesitando mas informacion (${questions.length} preguntas)`))
          log(c('cyan', `  Preguntas escritas en ${PENDING_INPUT_FILE}`))
          log(c('cyan', '  Para reanudar:'))
          log(c('cyan', `    ${resumeCommand}`))
          throw new ControlledExit('La sesion sigue necesitando respuestas.', 42, pendingData)
        } else if (type === 'v6:complete') {
          planId = data.planId
          score = data.score
          iterations = data.iterations
          degraded = data.degraded === true
          agentOutcomes = Array.isArray(data.agentOutcomes) ? data.agentOutcomes : agentOutcomes
          debugSession?.setSummary?.({
            sessionId,
            planId,
            score,
            iterations,
            degraded,
          })
          log('')
          log(c('green', `  Pipeline completado en ${elapsed()}s`))
          const completionScoreLabel = degraded ? 'degradado' : `${score}/100`
          log(c('green', `    Score: ${completionScoreLabel}  |  Iteraciones: ${iterations}  |  Plan ID: ${planId}`))
        } else if (type === 'v6:degraded') {
          degraded = true
          agentOutcomes = Array.isArray(data.agentOutcomes) ? data.agentOutcomes : agentOutcomes
          debugSession?.setSummary?.({ degraded: true })
          log(c('yellow', '  Plan degradado: se usaron datos de respaldo.'))
          if (data.failedAgents) {
            log(c('yellow', `    ${data.failedAgents}`))
          }
        } else if (type === 'result' && (data.success === false || data.result?.success === false)) {
          const failureDetails = extractFailureDetails(data)
          log('')
          if (debugMode) {
            renderDebugFailureDiagnosis(failureDetails, debugSession, elapsed())
          } else {
            log(c('red', `  Error estructurado: ${failureDetails.message}`))
            formatFailureDetails(failureDetails).forEach((line) => log(line))
          }
          const err = new Error(failureDetails.message)
          err.failureDetails = failureDetails
          debugSession?.setSummary?.({
            failureCode: failureDetails.failureCode,
            publicationState: failureDetails.publicationState,
            degraded: failureDetails.agentOutcomes.some((outcome) => outcome.source === 'fallback'),
          })
          throw err
        }

        bi = buffer.indexOf('\n\n')
      }
    }

    if (done) break
  }

  buffer += decoder.decode().replace(/\r\n/g, '\n')
  const tail = parseSseBlock(buffer)
  if (tail) {
    let payload
    try {
      payload = JSON.parse(tail.data)
    } catch {
      payload = null
    }
    if (payload?.type === 'v6:complete' && !planId) {
      const d = payload.data ?? payload
      planId = d.planId
      score = d.score
      iterations = d.iterations
      degraded = d.degraded === true
      agentOutcomes = Array.isArray(d.agentOutcomes) ? d.agentOutcomes : agentOutcomes
    }
  }

  if (!planId) {
    debugSession?.recordLocal?.('resume.missing_plan_id', {
      sessionId,
      degraded,
      iterations,
    })
    throw new Error('No se recibio planId del resume. Termino correctamente?')
  }

  debugSession?.setSummary?.({
    sessionId,
    planId,
    score,
    iterations,
    degraded,
  })
  return { planId, score, iterations, degraded, agentOutcomes }
}

async function fetchPackage(baseUrl, planId, { detailStartWeek = null, detailWeeks = null } = {}) {
  const search = new URLSearchParams({ planId })
  if (detailStartWeek != null) search.set('detailStartWeek', String(detailStartWeek))
  if (detailWeeks != null) search.set('detailWeeks', String(detailWeeks))
  const res = await fetch(`${baseUrl}/api/plan/package?${search.toString()}`)
  if (!res.ok) throw new Error(`Package API ${res.status}`)
  const json = await res.json()
  if (!json.ok) throw new Error(`Package error: ${json.error}`)
  return {
    package: json.data,
    meta: json.meta ?? { modelId: null },
  }
}

// ─── Markdown report ───────────────────────────────────────────────────────────
function buildReport(goal, pkg, meta) {
  const { planId, score, iterations, provider, modelId, degraded, agentOutcomes } = meta
  const items     = pkg.items    || []
  const plan      = pkg.plan     || {}
  const skeleton  = plan.skeleton || {}
  const detail    = plan.detail   || {}

  const events    = items.filter(i => i.kind === 'time_event')
                         .sort((a,b) => a.startAt.localeCompare(b.startAt))
  const milestones = items.filter(i => i.kind === 'milestone')
                          .sort((a,b) => (a.dueDate||'').localeCompare(b.dueDate||''))
  const flexTasks  = items.filter(i => i.kind === 'flex_task')

  // Eventos desde rolling-wave detail si items está vacío
  const detailEvents = Array.from(
    new Map(
      (detail.scheduledEvents || [])
        .concat((detail.weeks || []).flatMap(w => w.scheduledEvents || []))
        .map((event) => [event.id || `${event.startAt}-${event.title}`, event])
    ).values()
  ).sort((a, b) => (a.startAt || '').localeCompare(b.startAt || ''))

  // Agrupar eventos por semana (preferir items, fallback a detail)
  const calendarEvents = detailEvents.length > events.length ? detailEvents : events
  const calendarFlexibleEvents = calendarEvents.filter((ev) => ev.rigidity === 'soft')
  const weekMap = new Map()
  for (const ev of calendarEvents) {
    const startKey = ev.startAt || ev.date || ev.startDate
    if (!startKey) continue
    const monday = mondayOf(startKey)
    const key = monday.toISOString().slice(0,10)
    if (!weekMap.has(key)) weekMap.set(key, { monday, events: [] })
    weekMap.get(key).events.push({ ...ev, _startKey: startKey })
  }

  const totalMin = calendarEvents.reduce((s, ev) => s + (ev.durationMin || ev.durationMinutes || 0), 0)
  const scoreLabel = degraded ? 'degradado' : Number.isFinite(score) ? `${score}/100` : 'persistido'
  const iterationsLabel = Number.isFinite(iterations) ? String(iterations) : '–'
  const horizonWeeks = deriveSkeletonHorizonWeeks(skeleton, detail)
  const horizonLabel = horizonWeeks ?? skeleton.horizonWeeks ?? detail.horizonWeeks ?? '?'

  const L = []

  L.push(`# Plan: ${goal}`)
  L.push('')
  L.push(`| Campo | Valor |`)
  L.push(`|-------|-------|`)
  L.push(`| Plan ID | \`${planId}\` |`)
  L.push(`| Puntaje | ${scoreLabel} |`)
  L.push(`| Iteraciones critic | ${iterationsLabel} |`)
  L.push(`| Proveedor | ${provider} |`)
  L.push(`| Modelo LLM | ${modelId ? `\`${modelId}\`` : 'no disponible'} |`)
  L.push(`| Generado | ${new Date().toLocaleString('es-AR')} |`)
  L.push('')

  if (degraded) {
    const fallbackOutcomes = (Array.isArray(agentOutcomes) ? agentOutcomes : [])
      .filter((outcome) => outcome?.source === 'fallback')

    L.push('## Advertencia: Plan degradado')
    L.push('')
    L.push('Este plan fue generado parcialmente con datos de respaldo.')
    L.push('Los siguientes agentes no pudieron conectarse al LLM:')
    L.push('')
    L.push('| Agente | Error | Duracion |')
    L.push('|--------|-------|----------|')
    for (const outcome of fallbackOutcomes) {
      L.push(`| ${outcome.agent || 'desconocido'} | ${outcome.errorMessage || outcome.errorCode || 'unknown'} | ${outcome.durationMs || 0}ms |`)
    }
    L.push('')
  }

  if (plan.title) {
    L.push(`## ${plan.title}`)
    L.push('')
  }
  if (plan.description) {
    L.push(plan.description)
    L.push('')
  }

  // Fases del skeleton (siempre presentes aunque el scheduler haya fallado)
  const phases = skeleton.phases || []
  if (phases.length) {
    L.push(`## Fases del plan (horizonte: ${horizonLabel} semanas)`)
    L.push('')
    L.push(`| # | Fase | Inicio | Fin | Objetivo |`)
    L.push(`|---|------|--------|-----|----------|`)
    phases.forEach((p, i) => {
      const start = p.startDate ? fmtDate(p.startDate + 'T00:00:00Z') : `Semana ${p.startWeek}`
      const end   = p.endDate   ? fmtDate(p.endDate   + 'T00:00:00Z') : `Semana ${p.endWeek}`
      const obj   = (p.objectives || p.title || '').slice(0, 60)
      L.push(`| ${i+1} | ${p.title || p.phaseId} | ${start} | ${end} | ${obj} |`)
    })
    L.push('')
  }

  // Hitos del skeleton + items
  const skeletonMilestones = skeleton.milestones || []
  if (milestones.length || skeletonMilestones.length) {
    const allMilestones = milestones.length ? milestones : skeletonMilestones
    L.push(`## Hitos (${allMilestones.length})`)
    L.push('')
    allMilestones.forEach((m, i) => {
      const date = (m.dueDate || m.date) ? fmtDate((m.dueDate || m.date) + (m.dueDate?.includes('T') ? '' : 'T00:00:00Z')) : 'sin fecha'
      L.push(`${i+1}. **${date}** — ${m.title || m.label || m}`)
      if (m.notes) L.push(`   > ${m.notes}`)
    })
    L.push('')
  }

  // Calendario semana a semana
  L.push(`## Calendario de actividades`)
  L.push('')
  if (calendarEvents.length === 0) {
    L.push(`> El scheduler no genero eventos de calendario. El plan tiene ${phases.length} fases definidas en el skeleton.`)
    L.push(`> Esto puede ocurrir si el modelo LLM no produjo suficiente información para el solver MILP.`)
  } else {
    L.push(`> Total: **${calendarEvents.length} eventos** | **${formatMin(totalMin)}** programadas`)
  }
  L.push('')

  let weekNum = 1
  for (const [key, { monday, events: wevents }] of weekMap) {
    const sunday = new Date(monday)
    sunday.setUTCDate(monday.getUTCDate() + 6)
    L.push(`### Semana ${weekNum} — ${fmtDate(monday.toISOString())} al ${fmtDate(sunday.toISOString())}`)
    L.push('')
    L.push(`| Día | Hora | Duración | Actividad | Rigidez |`)
    L.push(`|-----|------|----------|-----------|---------|`)
    for (const ev of wevents) {
      const rigidity = ev.rigidity === 'hard' ? 'Fija' : (ev.rigidity === 'soft' ? 'Flexible' : '–')
      L.push(`| ${fmtDate(ev._startKey)} | ${fmtTime(ev._startKey)} | ${formatMin(ev.durationMin || ev.durationMinutes)} | ${ev.title} | ${rigidity} |`)
    }
    L.push('')
    weekNum++
  }

  // Tareas flexibles
  if (flexTasks.length) {
    L.push(`## Tareas flexibles (${flexTasks.length})`)
    L.push('')
    for (const t of flexTasks) {
      const due = t.dueDate ? ` ← hasta ${fmtDate(t.dueDate)}` : ''
      const est = t.estimateMin ? ` (${formatMin(t.estimateMin)})` : ''
      L.push(`- ${t.title}${est}${due}`)
    }
    L.push('')
  }

  // Resumen estadístico
  L.push(`## Resumen estadístico`)
  L.push('')
  L.push(`| Métrica | Valor |`)
  L.push(`|---------|-------|`)
  L.push(`| Fases del plan | ${phases.length} |`)
  L.push(`| Eventos en calendario | ${calendarEvents.length} |`)
  L.push(`| Eventos flexibles en calendario | ${calendarFlexibleEvents.length} |`)
  L.push(`| Hitos | ${milestones.length || skeletonMilestones.length} |`)
  L.push(`| Tareas flexibles pendientes | ${flexTasks.length} |`)
  L.push(`| Tiempo total programado | ${formatMin(totalMin)} |`)
  L.push(`| Semanas cubiertas | ${weekMap.size} |`)

  if (weekMap.size > 0) {
    const avgPerWeek = Math.round(totalMin / weekMap.size)
    L.push(`| Promedio por semana | ${formatMin(avgPerWeek)} |`)
  }
  L.push('')

  return L.join('\n')
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const {
    goal,
    existingPlanId,
    resumeSession,
    profileId,
    explicitProvider,
    baseUrl,
    outputJson,
    noCodex,
    autoMode,
    pauseOnInput,
    debugMode,
    providedAnswers,
    detailStartWeek,
    detailWeeks,
  } = parseArgs()

  const debugSession = createDebugSession({
    enabled: debugMode,
    goal,
    resumeSession,
    profileId,
    baseUrl,
    detailStartWeek,
    detailWeeks,
  })

  debugSession.recordLocal('cli.started', {
    goal,
    resumeSession,
    explicitProvider: explicitProvider ?? null,
    autoMode,
    pauseOnInput,
    noCodex,
  })

  log('')
  log(c('cyan', c('bold', 'LAP Plan Runner')))
  if (resumeSession) {
    log(c('gray', `  Modo     : resume-session`))
    log(c('gray', `  Session  : ${resumeSession}`))
  } else {
    log(c('gray', `  Objetivo : ${goal || '(usar plan existente)'}`))
  }
  log(c('gray', `  Base URL : ${baseUrl}`))
  if (profileId) log(c('gray', `  Profile  : ${profileId}`))
  if (existingPlanId) log(c('gray', `  Plan ID  : ${existingPlanId}`))
  if (pauseOnInput) log(c('gray', '  Modo     : pause-on-input (sale con codigo 42 al recibir preguntas)'))
  if (detailStartWeek != null || detailWeeks != null) {
    const startLabel = detailStartWeek ?? 1
    const weeksLabel = detailWeeks ?? 'default'
    log(c('gray', `  Detail   : semana ${startLabel} + ${weeksLabel} semana(s)`))
  }
  if (debugMode) {
    log(c('gray', '  Debug    : activado'))
    if (debugSession.artifactPath) {
      log(c('gray', `  Artefacto: ${debugSession.artifactPath}`))
    }
  }
  log('')

  try {
    if (resumeSession) {
      const answers = providedAnswers || {}
      log(c('blue', `  Respuestas: ${Object.keys(answers).length}`))
      Object.entries(answers).forEach(([k, v]) => log(c('gray', `    ${k}: ${v}`)))
      log('')

      const resumeResult = await resumePipeline(baseUrl, resumeSession, answers, { debugMode, debugSession })
      const { planId, score, iterations, degraded, agentOutcomes } = resumeResult

      log('')
      log(c('blue', 'Descargando datos del plan...'))
      debugSession.recordLocal('package.fetch_requested', { planId, provider: 'resume' })

      const packageResponse = await fetchPackage(baseUrl, planId, { detailStartWeek, detailWeeks })
      debugSession.attachPackage(packageResponse)
      const pkg = packageResponse.package
      const modelId = typeof packageResponse.meta?.modelId === 'string' && packageResponse.meta.modelId.trim()
        ? packageResponse.meta.modelId.trim()
        : null
      const reportTitle = goal || pkg.plan?.title || `Plan ${planId}`
      const isDegraded = degraded === true || pkg.degraded === true
      const effectiveScore = isDegraded ? null : score
      const effectiveAgentOutcomes = Array.isArray(agentOutcomes) && agentOutcomes.length > 0
        ? agentOutcomes
        : (Array.isArray(pkg.agentOutcomes) ? pkg.agentOutcomes : [])

      debugSession.recordLocal('package.fetched', {
        planId,
        provider: 'resume',
        modelId,
        publicationState: pkg.publicationState ?? null,
        degraded: isDegraded,
      })
      debugSession.setSummary({
        sessionId: resumeSession,
        planId,
        score: effectiveScore,
        iterations,
        provider: 'resume',
        modelId,
        degraded: isDegraded,
        publicationState: pkg.publicationState ?? null,
      })

      log(c('green', '  Datos obtenidos'))
      log('')

      if (outputJson) {
        out(JSON.stringify({ meta: { planId, score: effectiveScore, iterations, provider: 'resume', modelId, degraded: isDegraded, agentOutcomes: effectiveAgentOutcomes }, package: pkg }, null, 2) + '\n')
      } else {
        const report = buildReport(reportTitle, pkg, { planId, score: effectiveScore, iterations, provider: 'resume', modelId, degraded: isDegraded, agentOutcomes: effectiveAgentOutcomes })
        out(report + '\n')
      }

      debugSession.finalize('completed', {
        sessionId: resumeSession,
        planId,
        score: effectiveScore,
        iterations,
        provider: 'resume',
        modelId,
        degraded: isDegraded,
        publicationState: pkg.publicationState ?? null,
      })
      return
    }

    let attempts = []
    let result = existingPlanId
      ? { planId: existingPlanId, score: null, iterations: null, providerLabel: 'existing-plan', degraded: false, agentOutcomes: [] }
      : null

    if (existingPlanId) {
      debugSession.recordLocal('plan.existing_selected', {
        planId: existingPlanId,
        provider: 'existing-plan',
      })
    }

    if (!existingPlanId && explicitProvider) {
      const isCodex = explicitProvider === 'codex'
      attempts = [
        {
          label: isCodex ? 'OpenAI (sesion)' : explicitProvider,
          body: isCodex
            ? { goalText: goal, profileId, resourceMode: 'codex' }
            : { goalText: goal, profileId, provider: explicitProvider },
          providerLabel: isCodex ? 'codex-oauth' : explicitProvider,
        },
        ...(isCodex ? [{
          label: 'Ollama (local)',
          body: { goalText: goal, profileId, provider: 'ollama' },
          providerLabel: 'ollama',
        }] : []),
      ]
    } else if (!existingPlanId) {
      attempts = [
        ...(!noCodex ? [{
          label: 'OpenAI (sesion iniciada)',
          body: { goalText: goal, profileId, resourceMode: 'codex' },
          providerLabel: 'codex-oauth',
        }] : []),
        {
          label: 'Ollama (local)',
          body: { goalText: goal, profileId, provider: 'ollama' },
          providerLabel: 'ollama',
        },
      ]
    }

    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i]
      const isLast = i === attempts.length - 1

      debugSession.recordLocal('attempt.started', {
        provider: attempt.providerLabel,
        label: attempt.label,
        attemptIndex: i + 1,
        totalAttempts: attempts.length,
      })

      log(c('blue', `Intentando con ${attempt.label}...`))
      log('')

      try {
        result = await runPipeline(baseUrl, attempt.body, {
          autoMode,
          pauseOnInput,
          providedAnswers,
          debugMode,
          debugSession,
        })
        result.providerLabel = attempt.providerLabel
        debugSession.recordLocal('attempt.succeeded', {
          provider: attempt.providerLabel,
          planId: result.planId,
          degraded: result.degraded === true,
        })
        break
      } catch (err) {
        debugSession.recordLocal('attempt.failed', {
          provider: attempt.providerLabel,
          recoverable: err?.recoverable !== false,
          message: err instanceof Error ? err.message : String(err),
          failureCode: err?.failureDetails?.failureCode ?? null,
        })
        if (!isLast && err.recoverable !== false) {
          log(c('yellow', `  ${attempt.label} no disponible: ${err.message}`))
          log(c('gray', `  Reintentando con ${attempts[i + 1].label}...`))
          log('')
        } else {
          throw err
        }
      }
    }

    if (!result) throw new Error('No se pudo ejecutar el pipeline con ningun proveedor.')

    const { planId, score, iterations, providerLabel, degraded, agentOutcomes } = result

    log('')
    log(c('blue', 'Descargando datos del plan...'))
    debugSession.recordLocal('package.fetch_requested', {
      planId,
      provider: providerLabel,
    })

    const packageResponse = await fetchPackage(baseUrl, planId, { detailStartWeek, detailWeeks })
    debugSession.attachPackage(packageResponse)
    const pkg = packageResponse.package
    const modelId = typeof packageResponse.meta?.modelId === 'string' && packageResponse.meta.modelId.trim()
      ? packageResponse.meta.modelId.trim()
      : null
    const reportTitle = goal || pkg.plan?.title || `Plan ${planId}`
    const isDegraded = degraded === true || pkg.degraded === true
    const effectiveScore = isDegraded ? null : score
    const effectiveAgentOutcomes = Array.isArray(agentOutcomes) && agentOutcomes.length > 0
      ? agentOutcomes
      : (Array.isArray(pkg.agentOutcomes) ? pkg.agentOutcomes : [])

    debugSession.recordLocal('package.fetched', {
      planId,
      provider: providerLabel,
      modelId,
      publicationState: pkg.publicationState ?? null,
      degraded: isDegraded,
    })
    debugSession.setSummary({
      planId,
      score: effectiveScore,
      iterations,
      provider: providerLabel,
      modelId,
      degraded: isDegraded,
      publicationState: pkg.publicationState ?? null,
    })

    if (isDegraded) {
      const fallbackRows = effectiveAgentOutcomes.filter((outcome) => outcome?.source === 'fallback')
      log(c('yellow', `  Advertencia: ${fallbackRows.length} agente(s) usaron datos de respaldo.`))
    }

    log(c('green', '  Datos obtenidos'))
    if (modelId) {
      log(c('gray', `  Modelo  : ${modelId}`))
    }
    log('')
    log(c('gray', '-'.repeat(60)))
    log(c('green', '  Reporte en stdout. Redirigi con > report.md para guardar.'))
    log(c('gray', '-'.repeat(60)))
    log('')

    if (outputJson) {
      out(JSON.stringify({ meta: { planId, score: effectiveScore, iterations, provider: providerLabel, modelId, degraded: isDegraded, agentOutcomes: effectiveAgentOutcomes }, package: pkg }, null, 2) + '\n')
    } else {
      const report = buildReport(reportTitle, pkg, { planId, score: effectiveScore, iterations, provider: providerLabel, modelId, degraded: isDegraded, agentOutcomes: effectiveAgentOutcomes })
      out(report + '\n')
    }

    debugSession.finalize('completed', {
      planId,
      score: effectiveScore,
      iterations,
      provider: providerLabel,
      modelId,
      degraded: isDegraded,
      publicationState: pkg.publicationState ?? null,
    })
  } catch (err) {
    if (err instanceof ControlledExit) {
      debugSession.finalize('paused_for_input', {
        sessionId: err.details?.sessionId ?? resumeSession ?? null,
      })
      throw err
    }

    const failureDetails = err?.failureDetails ?? null
    debugSession.recordLocal('cli.failed', {
      message: err instanceof Error ? err.message : String(err),
      failureCode: failureDetails?.failureCode ?? null,
      publicationState: failureDetails?.publicationState ?? null,
    })
    debugSession.finalize('failed', {
      failureCode: failureDetails?.failureCode ?? null,
      publicationState: failureDetails?.publicationState ?? null,
    })
    throw err
  }
}

main().catch(err => {
  if (err instanceof ControlledExit) {
    process.exitCode = err.exitCode
    return
  }
  log('')
  log(c('red', `✖ Error: ${err.message}`))
  process.exitCode = 1
})
