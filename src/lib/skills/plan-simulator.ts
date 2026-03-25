import { DateTime } from 'luxon'
import type { Perfil } from '../../shared/schemas/perfil'
import type {
  PlanSimulationProgress,
  PlanSimulationSnapshot,
  ProgressRow,
  SimulationFinding,
  SimulationFindingCode,
  SimulationMode,
  SimulationProgressStage,
  SimulationStatus
} from '../../shared/types/lap-api'
import type { AgentRuntime, SkillContext, SkillResult, Skill } from './skill-interface'

interface TaskMeta {
  hora?: string
  duracion?: number
}

interface DaySummary {
  count: number
  plannedMinutes: number
  weekday: number
  dayLabel: string
}

interface ScheduledEntry {
  row: ProgressRow
  startMinutes: number
  duration: number
  weekday: number
  dayLabel: string
}

type SimulationProgressUpdate = Omit<PlanSimulationProgress, 'planId'>
type SimulationProgressListener = (progress: SimulationProgressUpdate) => Promise<void> | void

interface SimulationOptions {
  timezone: string
  locale?: string
  mode?: SimulationMode
  onProgress?: SimulationProgressListener
}

interface SimulationState {
  rows: ProgressRow[]
  locale: string
  timezone: string
  mode: SimulationMode
  wakeStart: number
  sleepStart: number
  workStart: number | null
  workEnd: number | null
  weekdayFreeMinutes: number
  weekendFreeMinutes: number
  findings: SimulationFinding[]
  scheduledEntries: ScheduledEntry[]
  daySummaries: Map<string, DaySummary>
  missingScheduleCount: number
  hasAwakeConflicts: boolean
  hasWorkConflicts: boolean
  hasCapacityConflicts: boolean
  hasCapacityWarnings: boolean
  hasCrowdedDays: boolean
  scheduledItemsCount: number
  // v2 extended state
  profileObjectiveIds: string[]
  commitmentWindows: Array<{ startMinutes: number; endMinutes: number; weekdayOnly: boolean; label: string }>
  horarioBajoEnergiaStart: number | null
  horarioBajoEnergiaEnd: number | null
  weekActivityCounts: Map<number, number>  // semana → activity count
  categoryDistribution: Map<string, number> // categoria → count
}

const statusPriority: Record<SimulationStatus, number> = {
  FAIL: 0,
  WARN: 1,
  MISSING: 2,
  PASS: 3
}

function parseTaskMeta(notas: string | null): TaskMeta {
  if (!notas) return {}

  try {
    const parsed = JSON.parse(notas) as TaskMeta
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function parseMinutes(value?: string): number | null {
  if (!value) return null

  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null

  const hours = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

  return (hours * 60) + minutes
}

function overlapsWindow(start: number, duration: number, windowStart: number, windowEnd: number): boolean {
  const end = start + duration
  return start < windowEnd && end > windowStart
}

function isOutsideAwakeWindow(start: number, duration: number, wakeStart: number, sleepStart: number): boolean {
  const end = start + duration

  if (wakeStart < sleepStart) {
    return start < wakeStart || end > sleepStart
  }

  const inLateWindow = start >= wakeStart
  const inEarlyWindow = end <= sleepStart
  return !(inLateWindow || inEarlyWindow)
}

function buildDayLabel(fecha: string, timezone: string, locale: string): string {
  const dt = DateTime.fromISO(fecha, { zone: timezone }).setLocale(locale)
  return dt.isValid ? dt.toFormat('cccc d/LL') : fecha
}

function buildPeriodLabel(rows: ProgressRow[], timezone: string, locale: string): string {
  const validDates = rows
    .map((row) => DateTime.fromISO(row.fecha, { zone: timezone }))
    .filter((date) => date.isValid)
    .sort((left, right) => left.toMillis() - right.toMillis())

  if (validDates.length === 0) {
    return DateTime.now().setZone(timezone).setLocale(locale).toFormat('LLLL yyyy')
  }

  const first = validDates[0]
  const last = validDates[validDates.length - 1]

  if (first.hasSame(last, 'month') && first.hasSame(last, 'year')) {
    return first.toFormat('LLLL yyyy')
  }

  return `${first.toFormat('d/LL')} - ${last.toFormat('d/LL')}`
}

function buildSummary(findings: SimulationFinding[]) {
  const summary = findings.reduce(
    (acc, finding) => {
      if (finding.status === 'PASS') acc.pass += 1
      if (finding.status === 'WARN') acc.warn += 1
      if (finding.status === 'FAIL') acc.fail += 1
      if (finding.status === 'MISSING') acc.missing += 1
      return acc
    },
    { pass: 0, warn: 0, fail: 0, missing: 0 }
  )

  const overallStatus: SimulationStatus = summary.fail > 0
    ? 'FAIL'
    : summary.warn > 0
      ? 'WARN'
      : summary.missing > 0
        ? 'MISSING'
        : 'PASS'

  return {
    ...summary,
    overallStatus
  }
}

function sortedFindings(findings: SimulationFinding[]): SimulationFinding[] {
  return [...findings].sort((left, right) => statusPriority[left.status] - statusPriority[right.status])
}

function findingBucket(code: SimulationFindingCode | string): string {
  switch (code) {
    case 'no_plan_items':
    case 'missing_schedule':
    case 'metadata_ok':
      return 'datos'
    case 'outside_awake_hours':
    case 'schedule_ok':
      return 'horarios'
    case 'overlaps_work':
    case 'work_balance_ok':
      return 'trabajo'
    case 'day_over_capacity':
    case 'day_high_load':
    case 'too_many_activities':
    case 'capacity_ok':
      return 'carga'
    case 'energy_mismatch':
      return 'energia'
    case 'no_rest_days':
    case 'front_loaded_week':
    case 'monotony':
    case 'unrealistic_ramp':
      return 'distribucion'
    case 'goal_coverage':
      return 'objetivos'
    case 'commitment_collision':
      return 'compromisos'
    default:
      return code
  }
}

function findingsForMode(findings: SimulationFinding[], mode: SimulationMode): SimulationFinding[] {
  if (mode === 'automatic') {
    return findings.slice(0, 12)
  }

  const preferredFindings = findings.some((finding) => finding.status !== 'PASS')
    ? findings.filter((finding) => finding.status !== 'PASS')
    : findings
  const selected: SimulationFinding[] = []
  const usedBuckets = new Set<string>()

  for (const finding of preferredFindings) {
    const bucket = findingBucket(finding.code)

    if (usedBuckets.has(bucket)) continue

    usedBuckets.add(bucket)
    selected.push(finding)

    if (selected.length >= 4) break
  }

  return selected
}

function createTimestamp(timezone: string): string {
  return DateTime.now().setZone(timezone).toISO() ?? DateTime.utc().toISO() ?? ''
}

function parseTimeRangeToMinutes(range: string): { start: number; end: number } | null {
  // Expected format: "HH:MM-HH:MM"
  const parts = range.split('-')
  if (parts.length !== 2) return null
  const start = parseMinutes(parts[0].trim())
  const end = parseMinutes(parts[1].trim())
  if (start === null || end === null) return null
  return { start, end }
}

function createSimulationState(
  profile: Perfil,
  rows: ProgressRow[],
  options: SimulationOptions
): SimulationState {
  const locale = options.locale ?? 'es-AR'
  const timezone = options.timezone
  const mode = options.mode ?? 'interactive'
  const participant = profile.participantes[0]

  // Parse low-energy window
  let horarioBajoEnergiaStart: number | null = null
  let horarioBajoEnergiaEnd: number | null = null
  const bajoRange = participant?.patronesEnergia?.horarioBajoEnergia
  if (bajoRange) {
    const parsed = parseTimeRangeToMinutes(bajoRange)
    if (parsed) { horarioBajoEnergiaStart = parsed.start; horarioBajoEnergiaEnd = parsed.end }
  }

  // Parse commitment windows
  const commitmentWindows: SimulationState['commitmentWindows'] = []
  for (const comp of participant?.compromisos ?? []) {
    if (!comp.recurrencia) continue
    // Try to parse horario from notas if stored as JSON (best-effort)
    // commitments are mostly used as label warnings
    const match = (comp.descripcion + ' ' + (comp.recurrencia ?? '')).match(/(\d{1,2}:\d{2})/g)
    if (match && match.length >= 2) {
      const start = parseMinutes(match[0])
      const end = parseMinutes(match[1])
      if (start !== null && end !== null) {
        commitmentWindows.push({ startMinutes: start, endMinutes: end, weekdayOnly: true, label: comp.descripcion })
      }
    }
  }

  return {
    rows,
    locale,
    timezone,
    mode,
    wakeStart: parseMinutes(participant?.rutinaDiaria?.porDefecto?.despertar) ?? 7 * 60,
    sleepStart: parseMinutes(participant?.rutinaDiaria?.porDefecto?.dormir) ?? 23 * 60,
    workStart: parseMinutes(participant?.rutinaDiaria?.porDefecto?.trabajoInicio ?? undefined),
    workEnd: parseMinutes(participant?.rutinaDiaria?.porDefecto?.trabajoFin ?? undefined),
    weekdayFreeMinutes: Math.max(0, (participant?.calendario?.horasLibresEstimadas?.diasLaborales ?? 0) * 60),
    weekendFreeMinutes: Math.max(0, (participant?.calendario?.horasLibresEstimadas?.diasDescanso ?? 0) * 60),
    findings: [],
    scheduledEntries: [],
    daySummaries: new Map<string, DaySummary>(),
    missingScheduleCount: 0,
    hasAwakeConflicts: false,
    hasWorkConflicts: false,
    hasCapacityConflicts: false,
    hasCapacityWarnings: false,
    hasCrowdedDays: false,
    scheduledItemsCount: 0,
    // v2 extended state
    profileObjectiveIds: profile.objetivos?.map((o) => o.id) ?? [],
    commitmentWindows,
    horarioBajoEnergiaStart,
    horarioBajoEnergiaEnd,
    weekActivityCounts: new Map<number, number>(),
    categoryDistribution: new Map<string, number>()
  }
}

function runScheduleStage(state: SimulationState): void {
  for (const row of state.rows) {
    const meta = parseTaskMeta(row.notas)
    const startMinutes = parseMinutes(meta.hora)
    const duration = typeof meta.duracion === 'number' ? Math.max(0, Math.trunc(meta.duracion)) : Number.NaN

    if (startMinutes === null || !Number.isFinite(duration) || duration <= 0) {
      state.missingScheduleCount += 1
      continue
    }

    state.scheduledItemsCount += 1

    const dt = DateTime.fromISO(row.fecha, { zone: state.timezone })
    const dayLabel = buildDayLabel(row.fecha, state.timezone, state.locale)
    const weekday = dt.isValid ? dt.weekday : 1
    const daySummary = state.daySummaries.get(row.fecha) ?? {
      count: 0,
      plannedMinutes: 0,
      weekday,
      dayLabel
    }

    daySummary.count += 1
    daySummary.plannedMinutes += duration
    state.daySummaries.set(row.fecha, daySummary)

    // Track week-level activity count
    const weekNumber = dt.isValid ? dt.weekNumber : 0
    state.weekActivityCounts.set(weekNumber, (state.weekActivityCounts.get(weekNumber) ?? 0) + 1)

    // Track category distribution
    const cat = row.tipo ?? 'otro'
    state.categoryDistribution.set(cat, (state.categoryDistribution.get(cat) ?? 0) + 1)

    state.scheduledEntries.push({
      row,
      startMinutes,
      duration,
      weekday,
      dayLabel
    })

    if (isOutsideAwakeWindow(startMinutes, duration, state.wakeStart, state.sleepStart)) {
      state.hasAwakeConflicts = true
      state.findings.push({
        status: 'FAIL',
        code: 'outside_awake_hours',
        params: {
          actividad: row.descripcion,
          dayLabel
        }
      })
    }
  }
}

function runWorkStage(state: SimulationState): void {
  for (const entry of state.scheduledEntries) {
    if (
      entry.weekday <= 5 &&
      state.workStart !== null &&
      state.workEnd !== null &&
      overlapsWindow(entry.startMinutes, entry.duration, state.workStart, state.workEnd)
    ) {
      state.hasWorkConflicts = true
      state.findings.push({
        status: 'FAIL',
        code: 'overlaps_work',
        params: {
          actividad: entry.row.descripcion,
          dayLabel: entry.dayLabel
        }
      })
    }
  }
}

function runLoadStage(state: SimulationState): void {
  for (const [, daySummary] of state.daySummaries) {
    const availableMinutes = daySummary.weekday >= 6 ? state.weekendFreeMinutes : state.weekdayFreeMinutes

    if (availableMinutes > 0 && daySummary.plannedMinutes > availableMinutes) {
      state.hasCapacityConflicts = true
      state.findings.push({
        status: 'FAIL',
        code: 'day_over_capacity',
        params: {
          dayLabel: daySummary.dayLabel,
          planned: daySummary.plannedMinutes,
          available: availableMinutes
        }
      })
    } else if (availableMinutes > 0 && daySummary.plannedMinutes >= Math.ceil(availableMinutes * 0.8)) {
      state.hasCapacityWarnings = true
      state.findings.push({
        status: 'WARN',
        code: 'day_high_load',
        params: {
          dayLabel: daySummary.dayLabel,
          planned: daySummary.plannedMinutes,
          available: availableMinutes
        }
      })
    }

    if (daySummary.count > 3) {
      state.hasCrowdedDays = true
      state.findings.push({
        status: 'WARN',
        code: 'too_many_activities',
        params: {
          dayLabel: daySummary.dayLabel,
          count: daySummary.count
        }
      })
    }
  }
}

// ─── NEW v2 CHECKS ────────────────────────────────────────────────────────────

function runEnergyStage(state: SimulationState): void {
  // energy_mismatch: cognitive tasks scheduled during low-energy window
  if (state.horarioBajoEnergiaStart !== null && state.horarioBajoEnergiaEnd !== null) {
    const cognitiveCategories = new Set(['estudio', 'trabajo'])
    for (const entry of state.scheduledEntries) {
      const cat = entry.row.tipo ?? 'otro'
      if (
        cognitiveCategories.has(cat) &&
        overlapsWindow(
          entry.startMinutes,
          entry.duration,
          state.horarioBajoEnergiaStart,
          state.horarioBajoEnergiaEnd
        )
      ) {
        state.findings.push({
          status: 'WARN',
          code: 'energy_mismatch' as any,
          params: { actividad: entry.row.descripcion, dayLabel: entry.dayLabel }
        })
        break // one warning is enough
      }
    }
  }

  // no_rest_days: check each ISO week — if all 7 days have activities, warn
  const daysByWeek = new Map<number, Set<number>>()
  for (const entry of state.scheduledEntries) {
    const dt = DateTime.fromISO(entry.row.fecha, { zone: state.timezone })
    if (!dt.isValid) continue
    const wk = dt.weekNumber
    if (!daysByWeek.has(wk)) daysByWeek.set(wk, new Set())
    daysByWeek.get(wk)!.add(dt.weekday)
  }
  for (const [, days] of daysByWeek) {
    if (days.size === 7) {
      state.findings.push({ status: 'WARN', code: 'no_rest_days' as any })
      break
    }
  }

  // front_loaded_week: >60% of activities on Mon/Tue across all weeks
  const totalEntries = state.scheduledEntries.length
  if (totalEntries >= 5) {
    const monTueCount = state.scheduledEntries.filter(e => e.weekday === 1 || e.weekday === 2).length
    if (monTueCount / totalEntries > 0.6) {
      state.findings.push({
        status: 'WARN',
        code: 'front_loaded_week' as any,
        params: { monTue: monTueCount, total: totalEntries }
      })
    }
  }

  // monotony: single category > 70% of all activities
  const totalCats = state.scheduledEntries.length
  if (totalCats >= 5) {
    for (const [cat, count] of state.categoryDistribution) {
      if (count / totalCats > 0.7) {
        state.findings.push({
          status: 'WARN',
          code: 'monotony' as any,
          params: { categoria: cat, pct: Math.round(count / totalCats * 100) }
        })
        break
      }
    }
  }

  // unrealistic_ramp: week 1 has >70% of total activity count vs later weeks
  if (state.weekActivityCounts.size >= 2) {
    const counts = [...state.weekActivityCounts.values()]
    const week1Count = counts[0] ?? 0
    const otherCounts = counts.slice(1).reduce((a, b) => a + b, 0)
    const total = week1Count + otherCounts
    if (total > 0 && week1Count / total > 0.7) {
      state.findings.push({
        status: 'WARN',
        code: 'unrealistic_ramp' as any,
        params: { week1: week1Count, total }
      })
    }
  }
}

function runCoverageStage(state: SimulationState): void {
  // goal_coverage: every declared objective must appear in at least 1 event
  if (state.profileObjectiveIds.length > 0 && state.scheduledEntries.length > 0) {
    const coveredIds = new Set(state.scheduledEntries.map(e => e.row.objetivoId).filter(Boolean))
    for (const objId of state.profileObjectiveIds) {
      if (!coveredIds.has(objId)) {
        state.findings.push({
          status: 'FAIL',
          code: 'goal_coverage' as any,
          params: { objetivoId: objId }
        })
      }
    }
  }

  // commitment_collision: activity overlaps a persisted commitment window
  for (const entry of state.scheduledEntries) {
    for (const cw of state.commitmentWindows) {
      if (
        (!cw.weekdayOnly || entry.weekday <= 5) &&
        overlapsWindow(entry.startMinutes, entry.duration, cw.startMinutes, cw.endMinutes)
      ) {
        state.findings.push({
          status: 'FAIL',
          code: 'commitment_collision' as any,
          params: { actividad: entry.row.descripcion, compromiso: cw.label }
        })
      }
    }
  }
}

function computeQualityScore(findings: SimulationFinding[]): number {
  let score = 100
  for (const f of findings) {
    if (f.status === 'FAIL') score -= 25
    else if (f.status === 'WARN') score -= 8
    else if (f.status === 'MISSING') score -= 15
  }
  return Math.max(0, score)
}

function finalizeSimulation(state: SimulationState): PlanSimulationSnapshot {
  if (state.rows.length === 0) {
    const noPlanFinding: SimulationFinding = {
      status: 'MISSING',
      code: 'no_plan_items'
    }

    return {
      ranAt: createTimestamp(state.timezone),
      mode: state.mode,
      periodLabel: buildPeriodLabel(state.rows, state.timezone, state.locale),
      summary: buildSummary([noPlanFinding]),
      findings: [noPlanFinding],
      qualityScore: 0
    }
  }

  if (state.missingScheduleCount > 0) {
    state.findings.push({
      status: 'MISSING',
      code: 'missing_schedule',
      params: { count: state.missingScheduleCount }
    })
  }

  if (!state.hasAwakeConflicts && state.scheduledItemsCount > 0) {
    state.findings.push({ status: 'PASS', code: 'schedule_ok' })
  }

  if (!state.hasWorkConflicts && state.workStart !== null && state.workEnd !== null && state.scheduledItemsCount > 0) {
    state.findings.push({ status: 'PASS', code: 'work_balance_ok' })
  }

  if (!state.hasCapacityConflicts && !state.hasCapacityWarnings && !state.hasCrowdedDays && state.daySummaries.size > 0) {
    state.findings.push({ status: 'PASS', code: 'capacity_ok' })
  }

  if (state.missingScheduleCount === 0) {
    state.findings.push({ status: 'PASS', code: 'metadata_ok' })
  }

  const sorted = sortedFindings(state.findings)
  const qualityScore = computeQualityScore(sorted)

  return {
    ranAt: createTimestamp(state.timezone),
    mode: state.mode,
    periodLabel: buildPeriodLabel(state.rows, state.timezone, state.locale),
    summary: buildSummary(sorted),
    findings: findingsForMode(sorted, state.mode),
    qualityScore
  }
}

async function emitProgress(
  listener: SimulationProgressListener | undefined,
  mode: SimulationMode,
  stage: SimulationProgressStage,
  current: number,
  total: number
): Promise<void> {
  if (!listener) return

  await listener({
    mode,
    stage,
    current,
    total
  })
}

export function simulatePlanViability(
  profile: Perfil,
  rows: ProgressRow[],
  options: SimulationOptions
): PlanSimulationSnapshot {
  const state = createSimulationState(profile, rows, options)
  runScheduleStage(state)
  runWorkStage(state)
  runLoadStage(state)
  runEnergyStage(state)
  runCoverageStage(state)
  return finalizeSimulation(state)
}

export async function simulatePlanViabilityWithProgress(
  profile: Perfil,
  rows: ProgressRow[],
  options: SimulationOptions
): Promise<PlanSimulationSnapshot> {
  const state = createSimulationState(profile, rows, options)
  const totalStages = 6

  await emitProgress(options.onProgress, state.mode, 'schedule', 1, totalStages)
  runScheduleStage(state)

  await emitProgress(options.onProgress, state.mode, 'work', 2, totalStages)
  runWorkStage(state)

  await emitProgress(options.onProgress, state.mode, 'load', 3, totalStages)
  runLoadStage(state)

  await emitProgress(options.onProgress, state.mode, 'load', 4, totalStages)
  runEnergyStage(state)

  await emitProgress(options.onProgress, state.mode, 'load', 5, totalStages)
  runCoverageStage(state)

  await emitProgress(options.onProgress, state.mode, 'summary', 6, totalStages)
  return finalizeSimulation(state)
}

export const planSimulator: Skill = {
  name: 'plan-simulator',
  tier: 'medio',
  getSystemPrompt(): string {
    return 'This simulator uses local plan checks and does not need a runtime prompt.'
  },
  async run(_runtime: AgentRuntime, _ctx: SkillContext): Promise<SkillResult> {
    return {
      success: true,
      filesWritten: [],
      summary: 'Plan simulator ready',
      tokensUsed: { input: 0, output: 0 }
    }
  }
}
