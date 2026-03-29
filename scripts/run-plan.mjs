#!/usr/bin/env node
/**
 * LAP Plan Runner CLI
 *
 * Usage:
 *   node scripts/run-plan.mjs "Tu objetivo"
 *   node scripts/run-plan.mjs "Tu objetivo" --profile=<uuid> --provider=ollama --base=http://localhost:3000
 *   node scripts/run-plan.mjs "Tu objetivo" --json          # salida JSON cruda
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
    providedAnswers: parseProvidedAnswers(),
    detailStartWeek: intFlag('detail-start-week', { max: 104 }),
    detailWeeks:     intFlag('detail-weeks', { max: 104 }),
  }
}

// ─── Readline helper ────────────────────────────────────────────────────────────
import { createInterface } from 'node:readline'
import { createReadStream, createWriteStream, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve as pathResolve } from 'node:path'

const PENDING_INPUT_FILE = pathResolve(process.cwd(), '.lap-pending-input.json')

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
const RECOVERABLE_ERRORS = [
  'codex_auth_missing', 'codex_mode_unavailable', 'cloud_credential_missing',
  'user_credential_missing', 'backend_credential_missing', 'authentication',
  'unauthorized', 'api key', 'no se encontró una clave', 'local assistant',
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

async function runPipeline(baseUrl, body, { autoMode = false, pauseOnInput = false, providedAnswers = null } = {}) {
  const res = await fetch(`${baseUrl}/api/plan/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text()
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
          if (type === 'v6:phase') {
            const label = PHASE_LABEL[data.phase] || data.phase
            const iter  = data.iteration > 0 ? c('gray', ` (vuelta ${data.iteration})`) : ''
            log(c('cyan', `  [${elapsed()}s]`) + ` ${label}` + iter)
          }

          else if (type === 'v6:progress') {
            const pct    = Math.min(100, Math.max(0, Math.round(data.score ?? 0)))
            const filled = Math.round(pct / 5)
            const bar    = '█'.repeat(filled) + '░'.repeat(20 - filled)
            const action = data.lastAction ? c('dim', ` ${data.lastAction}`) : ''
            log(c('gray', `         ${bar} ${pct}%`) + action)
          }

          else if (type === 'v6:complete') {
            planId     = data.planId
            score      = data.score
            iterations = data.iterations
            degraded   = data.degraded === true
            agentOutcomes = Array.isArray(data.agentOutcomes) ? data.agentOutcomes : agentOutcomes
            log('')
            log(c('green', `  ✔ Pipeline completado en ${elapsed()}s`))
            const completionScoreLabel = degraded ? 'degradado' : `${score}/100`
            log(c('green', `    Score: ${completionScoreLabel}  |  Iteraciones: ${iterations}  |  Plan ID: ${planId}`))
          }

          else if (type === 'v6:needs_input') {
            const sessionId = data.sessionId
            const questions = data.questions?.questions ?? []
            log(c('yellow', `  ⏸ El modelo necesita mas informacion (${questions.length} preguntas)`))

            // ── Modo pause-on-input: escribir preguntas a archivo y salir ──
            if (pauseOnInput) {
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
                createdAt: new Date().toISOString(),
              }
              writeFileSync(PENDING_INPUT_FILE, JSON.stringify(pendingData, null, 2), 'utf8')
              log(c('cyan', `  📝 Preguntas escritas en ${PENDING_INPUT_FILE}`))
              log(c('cyan', '  Para reanudar:'))
              log(c('cyan', `    node scripts/run-plan.mjs --resume-session=${sessionId} --answers-json='{"id":"respuesta",...}'`))
              process.exit(42)
            }

            let answers = {}
            const selectedProvidedAnswers = pickProvidedAnswers(questions, providedAnswers)
            if (Object.keys(selectedProvidedAnswers).length > 0) {
              answers = selectedProvidedAnswers
              log(c('blue', `  ↻ Continuando con ${Object.keys(answers).length}/${questions.length} respuestas predefinidas...`))
            } else if (autoMode) {
              questions.forEach((q, i) => log(c('yellow', `    ${i + 1}. ${q.text}`)))
              log(c('blue', '  ↻ Modo auto: avanzando sin respuestas...'))
            } else {
              const promptedAnswers = await askClarificationQuestions(questions)
              if (promptedAnswers == null) {
                questions.forEach((q, i) => log(c('yellow', `    ${i + 1}. ${q.text}`)))
                log(c('blue', '  ↻ No se detectó una consola interactiva. Usá `--auto` o ejecutalo desde una terminal local para responder.'))
              } else {
                answers = promptedAnswers
                const answered = Object.keys(answers).length
                log(c('blue', `  ↻ Continuando con ${answered}/${questions.length} respuestas...`))
              }
            }

            if (sessionId) {
              try {
                const resumeRes = await fetch(`${baseUrl}/api/plan/build/resume`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sessionId, answers }),
                })
                if (resumeRes.ok && resumeRes.body) {
                  reader = resumeRes.body.getReader()
                  buffer = ''
                  readerSwitched = true
                }
              } catch (resumeErr) {
                log(c('yellow', `  ⚠ No se pudo continuar la sesion: ${resumeErr.message}`))
              }
            }
          }

          else if (type === 'v6:degraded') {
            degraded = true
            agentOutcomes = Array.isArray(data.agentOutcomes) ? data.agentOutcomes : agentOutcomes
            log(c('yellow', '  âš  Plan degradado: se usaron datos de respaldo.'))
            if (data.failedAgents) {
              log(c('yellow', `    ${data.failedAgents}`))
            }
          }

          else if (type === 'result' && (data.success === false || data.result?.success === false)) {
            const failureDetails = extractFailureDetails(data)
            log('')
            log(c('red', `  Error estructurado: ${failureDetails.message}`))
            formatFailureDetails(failureDetails).forEach((line) => log(line))
            const err = new Error(failureDetails.message)
            err.recoverable = isRecoverableError(failureDetails.message)
            err.failureDetails = failureDetails
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

  if (!planId) throw new Error('No se recibió planId del pipeline. ¿Terminó correctamente?')
  return { planId, score, iterations, degraded, agentOutcomes }
}

// ─── Resume session (for --resume-session) ────────────────────────────────────
async function resumePipeline(baseUrl, sessionId, answers) {
  log(c('blue', `⟳ Reanudando sesión ${sessionId}...`))
  log('')

  const res = await fetch(`${baseUrl}/api/plan/build/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, answers }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Resume API ${res.status}: ${txt}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let planId = null, score = 0, iterations = 0
  let degraded = false
  let agentOutcomes = []

  const t0 = Date.now()
  const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1)

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

          if (type === 'v6:phase') {
            const label = PHASE_LABEL[data.phase] || data.phase
            const iter = data.iteration > 0 ? c('gray', ` (vuelta ${data.iteration})`) : ''
            log(c('cyan', `  [${elapsed()}s]`) + ` ${label}` + iter)
          } else if (type === 'v6:progress') {
            const pct = Math.min(100, Math.max(0, Math.round(data.score ?? 0)))
            const filled = Math.round(pct / 5)
            const bar = '█'.repeat(filled) + '░'.repeat(20 - filled)
            const action = data.lastAction ? c('dim', ` ${data.lastAction}`) : ''
            log(c('gray', `         ${bar} ${pct}%`) + action)
          } else if (type === 'v6:complete') {
            planId = data.planId
            score = data.score
            iterations = data.iterations
            degraded = data.degraded === true
            agentOutcomes = Array.isArray(data.agentOutcomes) ? data.agentOutcomes : agentOutcomes
            log('')
            log(c('green', `  ✔ Pipeline completado en ${elapsed()}s`))
            const completionScoreLabel = degraded ? 'degradado' : `${score}/100`
            log(c('green', `    Score: ${completionScoreLabel}  |  Iteraciones: ${iterations}  |  Plan ID: ${planId}`))
          } else if (type === 'v6:degraded') {
            degraded = true
            agentOutcomes = Array.isArray(data.agentOutcomes) ? data.agentOutcomes : agentOutcomes
            log(c('yellow', '  ⚠ Plan degradado: se usaron datos de respaldo.'))
          } else if (type === 'result' && (data.success === false || data.result?.success === false)) {
            const failureDetails = extractFailureDetails(data)
            log('')
            log(c('red', `  Error estructurado: ${failureDetails.message}`))
            formatFailureDetails(failureDetails).forEach((line) => log(line))
            throw new Error(failureDetails.message)
          }
        }
        bi = buffer.indexOf('\n\n')
      }
    }
    if (done) break
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

  if (!planId) throw new Error('No se recibió planId del resume. ¿Terminó correctamente?')
  return { planId, score, iterations, degraded, agentOutcomes }
}

// ─── Package fetcher ───────────────────────────────────────────────────────────
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
    L.push(`> ⚠️ El scheduler no generó eventos de calendario. El plan tiene ${phases.length} fases definidas en el skeleton.`)
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
    providedAnswers,
    detailStartWeek,
    detailWeeks,
  } = parseArgs()
  log('')
  log(c('cyan', c('bold', '▶ LAP Plan Runner')))
  if (resumeSession) {
    log(c('gray', `  Modo     : resume-session`))
    log(c('gray', `  Session  : ${resumeSession}`))
  } else {
    log(c('gray', `  Objetivo : ${goal || '(usar plan existente)'}`))
  }
  log(c('gray', `  Base URL : ${baseUrl}`))
  if (profileId) log(c('gray', `  Profile  : ${profileId}`))
  if (existingPlanId) log(c('gray', `  Plan ID  : ${existingPlanId}`))
  if (pauseOnInput) log(c('gray', `  Modo     : pause-on-input (sale con código 42 al recibir preguntas)`))
  if (detailStartWeek != null || detailWeeks != null) {
    const startLabel = detailStartWeek ?? 1
    const weeksLabel = detailWeeks ?? 'default'
    log(c('gray', `  Detail   : semana ${startLabel} + ${weeksLabel} semana(s)`))
  }
  log('')

  // ── Resume session ───────────────────────────────────────────────────────────
  if (resumeSession) {
    const answers = providedAnswers || {}
    log(c('blue', `  Respuestas: ${Object.keys(answers).length}`))
    Object.entries(answers).forEach(([k, v]) => log(c('gray', `    ${k}: ${v}`)))
    log('')

    const resumeResult = await resumePipeline(baseUrl, resumeSession, answers)
    const { planId, score, iterations, degraded, agentOutcomes } = resumeResult

    log('')
    log(c('blue', '⟳ Descargando datos del plan...'))

    const packageResponse = await fetchPackage(baseUrl, planId, { detailStartWeek, detailWeeks })
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

    log(c('green', '  ✔ Datos obtenidos'))
    log('')

    if (outputJson) {
      out(JSON.stringify({ meta: { planId, score: effectiveScore, iterations, provider: 'resume', modelId, degraded: isDegraded, agentOutcomes: effectiveAgentOutcomes }, package: pkg }, null, 2) + '\n')
    } else {
      const report = buildReport(reportTitle, pkg, { planId, score: effectiveScore, iterations, provider: 'resume', modelId, degraded: isDegraded, agentOutcomes: effectiveAgentOutcomes })
      out(report + '\n')
    }
    return
  }

  // ── Estrategia de ejecución ──────────────────────────────────────────────────
  // 1. Si el usuario forzó un provider explícito → usarlo directamente, sin fallback
  // 2. Si no → intentar primero Codex OAuth (sesión iniciada) → fallback a Ollama
  let attempts = []
  let result = existingPlanId
    ? { planId: existingPlanId, score: null, iterations: null, providerLabel: 'existing-plan', degraded: false, agentOutcomes: [] }
    : null

  if (!existingPlanId && explicitProvider) {
    const isCodex = explicitProvider === 'codex'
    attempts = [
      {
        label: isCodex ? 'OpenAI (sesión)' : explicitProvider,
        body: isCodex
          ? { goalText: goal, profileId, resourceMode: 'codex' }
          : { goalText: goal, profileId, provider: explicitProvider },
        providerLabel: isCodex ? 'codex-oauth' : explicitProvider,
      }
    ]
  } else if (!existingPlanId) {
    attempts = [
      ...(!noCodex ? [{
        label: 'OpenAI (sesión iniciada)',
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
    const isLast  = i === attempts.length - 1

    log(c('blue', `⟳ Intentando con ${attempt.label}...`))
    log('')

    try {
      result = await runPipeline(baseUrl, attempt.body, { autoMode, pauseOnInput, providedAnswers })
      result.providerLabel = attempt.providerLabel
      break
    } catch (err) {
      if (!isLast && err.recoverable !== false) {
        // Puede ser recuperable → intentar siguiente
        log(c('yellow', `  ⚠ ${attempt.label} no disponible: ${err.message}`))
        log(c('gray',   `  → Reintentando con ${attempts[i+1].label}...`))
        log('')
      } else {
        throw err
      }
    }
  }

  if (!result) throw new Error('No se pudo ejecutar el pipeline con ningún proveedor.')

  const { planId, score, iterations, providerLabel, degraded, agentOutcomes } = result

  log('')
  log(c('blue', '⟳ Descargando datos del plan...'))

  const packageResponse = await fetchPackage(baseUrl, planId, { detailStartWeek, detailWeeks })
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
  if (isDegraded) {
    const fallbackRows = effectiveAgentOutcomes.filter((outcome) => outcome?.source === 'fallback')
    log(c('yellow', `  âš  Advertencia: ${fallbackRows.length} agente(s) usaron datos de respaldo.`))
  }

  log(c('green', '  ✔ Datos obtenidos'))
  if (modelId) {
    log(c('gray', `  Modelo  : ${modelId}`))
  }
  log('')
  log(c('gray', '─'.repeat(60)))
  log(c('green', '  Reporte en stdout. Redirigí con > report.md para guardar.'))
  log(c('gray', '─'.repeat(60)))
  log('')

  if (outputJson) {
    out(JSON.stringify({ meta: { planId, score: effectiveScore, iterations, provider: providerLabel, modelId, degraded: isDegraded, agentOutcomes: effectiveAgentOutcomes }, package: pkg }, null, 2) + '\n')
  } else {
    const report = buildReport(reportTitle, pkg, { planId, score: effectiveScore, iterations, provider: providerLabel, modelId, degraded: isDegraded, agentOutcomes: effectiveAgentOutcomes })
    out(report + '\n')
  }
}

main().catch(err => {
  log('')
  log(c('red', `✖ Error: ${err.message}`))
  process.exit(1)
})
