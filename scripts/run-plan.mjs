#!/usr/bin/env node
/**
 * LAP Plan Runner CLI
 *
 * Usage:
 *   node scripts/run-plan.mjs "Tu objetivo"
 *   node scripts/run-plan.mjs "Tu objetivo" --profile=<uuid> --provider=ollama --base=http://localhost:3000
 *   node scripts/run-plan.mjs "Tu objetivo" --json          # salida JSON cruda
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
  const goal = raw.find(a => !a.startsWith('--'))
  if (!goal) {
    log(c('red', 'Error: se requiere el texto del objetivo como primer argumento.'))
    log('Uso: node scripts/run-plan.mjs "Tu objetivo" [--profile=uuid] [--provider=ollama] [--base=http://localhost:3000]')
    log('  --provider=codex    Fuerza sesión OpenAI (sin API key)')
    log('  --provider=ollama   Fuerza Ollama local')
    log('  --no-codex          Saltea el intento con sesión OpenAI')
    process.exit(1)
  }
  const flag = (name) => {
    const f = raw.find(a => a.startsWith(`--${name}=`))
    return f ? f.slice(`--${name}=`.length) : null
  }
  const explicitProvider = flag('provider') || process.env.PROVIDER || null
  return {
    goal,
    profileId:       flag('profile') || process.env.PROFILE_ID || '',
    explicitProvider,                        // null = auto (codex primero, fallback ollama)
    baseUrl:         flag('base') || process.env.BASE_URL || 'http://localhost:3000',
    outputJson:      raw.includes('--json'),
    noCodex:         raw.includes('--no-codex'),
  }
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

async function runPipeline(baseUrl, body) {
  const res = await fetch(`${baseUrl}/api/plan/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`API ${res.status}: ${txt}`)
  }

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let planId = null, score = 0, iterations = 0

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
            log('')
            log(c('green', `  ✔ Pipeline completado en ${elapsed()}s`))
            log(c('green', `    Score: ${score}/100  |  Iteraciones: ${iterations}  |  Plan ID: ${planId}`))
          }

          else if (type === 'result' && data.success === false) {
            const err = new Error(data.error || 'Error del pipeline')
            err.recoverable = isRecoverableError(data.error)
            throw err
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
    }
  }

  if (!planId) throw new Error('No se recibió planId del pipeline. ¿Terminó correctamente?')
  return { planId, score, iterations }
}

// ─── Package fetcher ───────────────────────────────────────────────────────────
async function fetchPackage(baseUrl, planId) {
  const res = await fetch(`${baseUrl}/api/plan/package?planId=${encodeURIComponent(planId)}`)
  if (!res.ok) throw new Error(`Package API ${res.status}`)
  const json = await res.json()
  if (!json.ok) throw new Error(`Package error: ${json.error}`)
  return json.data
}

// ─── Markdown report ───────────────────────────────────────────────────────────
function buildReport(goal, pkg, meta) {
  const { planId, score, iterations, provider } = meta
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
  const detailEvents = (detail.scheduledEvents || [])
    .concat((detail.weeks || []).flatMap(w => w.scheduledEvents || []))

  // Agrupar eventos por semana (preferir items, fallback a detail)
  const calendarEvents = events.length ? events : detailEvents
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

  const L = []

  L.push(`# Plan: ${goal}`)
  L.push('')
  L.push(`| Campo | Valor |`)
  L.push(`|-------|-------|`)
  L.push(`| Plan ID | \`${planId}\` |`)
  L.push(`| Puntaje | ${score}/100 |`)
  L.push(`| Iteraciones critic | ${iterations} |`)
  L.push(`| Proveedor | ${provider} |`)
  L.push(`| Generado | ${new Date().toLocaleString('es-AR')} |`)
  L.push('')

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
    L.push(`## Fases del plan (horizonte: ${skeleton.horizonWeeks || '?'} semanas)`)
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
  L.push(`| Hitos | ${milestones.length || skeletonMilestones.length} |`)
  L.push(`| Tareas flexibles | ${flexTasks.length} |`)
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
  const { goal, profileId, explicitProvider, baseUrl, outputJson, noCodex } = parseArgs()

  log('')
  log(c('cyan', c('bold', '▶ LAP Plan Runner')))
  log(c('gray', `  Objetivo : ${goal}`))
  log(c('gray', `  Base URL : ${baseUrl}`))
  if (profileId) log(c('gray', `  Profile  : ${profileId}`))
  log('')

  // ── Estrategia de ejecución ──────────────────────────────────────────────────
  // 1. Si el usuario forzó un provider explícito → usarlo directamente, sin fallback
  // 2. Si no → intentar primero Codex OAuth (sesión iniciada) → fallback a Ollama
  let attempts

  if (explicitProvider) {
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
  } else {
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

  let result = null

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]
    const isLast  = i === attempts.length - 1

    log(c('blue', `⟳ Intentando con ${attempt.label}...`))
    log('')

    try {
      result = await runPipeline(baseUrl, attempt.body)
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

  const { planId, score, iterations, providerLabel } = result

  log('')
  log(c('blue', '⟳ Descargando datos del plan...'))

  const pkg = await fetchPackage(baseUrl, planId)

  log(c('green', '  ✔ Datos obtenidos'))
  log('')
  log(c('gray', '─'.repeat(60)))
  log(c('green', '  Reporte en stdout. Redirigí con > report.md para guardar.'))
  log(c('gray', '─'.repeat(60)))
  log('')

  if (outputJson) {
    out(JSON.stringify({ meta: { planId, score, iterations, provider: providerLabel }, package: pkg }, null, 2) + '\n')
  } else {
    const report = buildReport(goal, pkg, { planId, score, iterations, provider: providerLabel })
    out(report + '\n')
  }
}

main().catch(err => {
  log('')
  log(c('red', `✖ Error: ${err.message}`))
  process.exit(1)
})
