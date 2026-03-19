import { DateTime } from 'luxon'
import type { Perfil } from '../shared/schemas/perfil'
import type {
  SimulationMode,
  PlanSimulationSnapshot,
  ProgressRow,
  SimulationFinding,
  SimulationStatus
} from '../shared/types/ipc'
import type { Skill, AgentRuntime, SkillContext, SkillResult } from './skill-interface'

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

interface SimulationOptions {
  timezone: string
  locale?: string
  mode?: SimulationMode
}

const statusPriority: Record<SimulationStatus, number> = {
  FAIL: 0,
  WARN: 1,
  MISSING: 2,
  PASS: 3
}

function parseTaskMeta(notas: string | null): TaskMeta {
  if (!notas) {
    return {}
  }

  try {
    const parsed = JSON.parse(notas) as TaskMeta
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function parseMinutes(value?: string): number | null {
  if (!value) {
    return null
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) {
    return null
  }

  const hours = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null
  }

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

function findingBucket(code: SimulationFinding['code']): string {
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

    if (usedBuckets.has(bucket)) {
      continue
    }

    usedBuckets.add(bucket)
    selected.push(finding)

    if (selected.length >= 4) {
      break
    }
  }

  return selected
}

export function simulatePlanViability(
  profile: Perfil,
  rows: ProgressRow[],
  options: SimulationOptions
): PlanSimulationSnapshot {
  const locale = options.locale ?? 'es-AR'
  const timezone = options.timezone
  const mode = options.mode ?? 'interactive'
  const participant = profile.participantes[0]
  const wakeStart = parseMinutes(participant?.rutinaDiaria?.porDefecto?.despertar) ?? 7 * 60
  const sleepStart = parseMinutes(participant?.rutinaDiaria?.porDefecto?.dormir) ?? 23 * 60
  const workStart = parseMinutes(participant?.rutinaDiaria?.porDefecto?.trabajoInicio ?? undefined)
  const workEnd = parseMinutes(participant?.rutinaDiaria?.porDefecto?.trabajoFin ?? undefined)
  const weekdayFreeMinutes = Math.max(0, (participant?.calendario?.horasLibresEstimadas?.diasLaborales ?? 0) * 60)
  const weekendFreeMinutes = Math.max(0, (participant?.calendario?.horasLibresEstimadas?.diasDescanso ?? 0) * 60)
  const findings: SimulationFinding[] = []
  const daySummaries = new Map<string, DaySummary>()
  let missingScheduleCount = 0
  let hasAwakeConflicts = false
  let hasWorkConflicts = false
  let hasCapacityConflicts = false
  let hasCapacityWarnings = false
  let hasCrowdedDays = false
  let scheduledItemsCount = 0

  if (rows.length === 0) {
    const noPlanFinding: SimulationFinding = {
      status: 'MISSING',
      code: 'no_plan_items'
    }

    return {
      ranAt: DateTime.now().setZone(timezone).toISO() ?? DateTime.utc().toISO() ?? '',
      mode,
      periodLabel: buildPeriodLabel(rows, timezone, locale),
      summary: buildSummary([noPlanFinding]),
      findings: [noPlanFinding]
    }
  }

  for (const row of rows) {
    const meta = parseTaskMeta(row.notas)
    const startMinutes = parseMinutes(meta.hora)
    const duration = typeof meta.duracion === 'number' ? Math.max(0, Math.trunc(meta.duracion)) : Number.NaN

    if (startMinutes === null || !Number.isFinite(duration) || duration <= 0) {
      missingScheduleCount += 1
      continue
    }

    scheduledItemsCount += 1

    const dt = DateTime.fromISO(row.fecha, { zone: timezone })
    const dayLabel = buildDayLabel(row.fecha, timezone, locale)
    const weekday = dt.isValid ? dt.weekday : 1
    const daySummary = daySummaries.get(row.fecha) ?? {
      count: 0,
      plannedMinutes: 0,
      weekday,
      dayLabel
    }

    daySummary.count += 1
    daySummary.plannedMinutes += duration
    daySummaries.set(row.fecha, daySummary)

    if (isOutsideAwakeWindow(startMinutes, duration, wakeStart, sleepStart)) {
      hasAwakeConflicts = true
      findings.push({
        status: 'FAIL',
        code: 'outside_awake_hours',
        params: {
          actividad: row.descripcion,
          dayLabel
        }
      })
    }

    if (
      weekday <= 5 &&
      workStart !== null &&
      workEnd !== null &&
      overlapsWindow(startMinutes, duration, workStart, workEnd)
    ) {
      hasWorkConflicts = true
      findings.push({
        status: 'FAIL',
        code: 'overlaps_work',
        params: {
          actividad: row.descripcion,
          dayLabel
        }
      })
    }
  }

  if (missingScheduleCount > 0) {
    findings.push({
      status: 'MISSING',
      code: 'missing_schedule',
      params: { count: missingScheduleCount }
    })
  }

  for (const [, daySummary] of daySummaries) {
    const availableMinutes = daySummary.weekday >= 6 ? weekendFreeMinutes : weekdayFreeMinutes

    if (availableMinutes > 0 && daySummary.plannedMinutes > availableMinutes) {
      hasCapacityConflicts = true
      findings.push({
        status: 'FAIL',
        code: 'day_over_capacity',
        params: {
          dayLabel: daySummary.dayLabel,
          planned: daySummary.plannedMinutes,
          available: availableMinutes
        }
      })
    } else if (availableMinutes > 0 && daySummary.plannedMinutes >= Math.ceil(availableMinutes * 0.8)) {
      hasCapacityWarnings = true
      findings.push({
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
      hasCrowdedDays = true
      findings.push({
        status: 'WARN',
        code: 'too_many_activities',
        params: {
          dayLabel: daySummary.dayLabel,
          count: daySummary.count
        }
      })
    }
  }

  if (!hasAwakeConflicts && scheduledItemsCount > 0) {
    findings.push({
      status: 'PASS',
      code: 'schedule_ok'
    })
  }

  if (!hasWorkConflicts && workStart !== null && workEnd !== null && scheduledItemsCount > 0) {
    findings.push({
      status: 'PASS',
      code: 'work_balance_ok'
    })
  }

  if (!hasCapacityConflicts && !hasCapacityWarnings && !hasCrowdedDays && daySummaries.size > 0) {
    findings.push({
      status: 'PASS',
      code: 'capacity_ok'
    })
  }

  if (missingScheduleCount === 0) {
    findings.push({
      status: 'PASS',
      code: 'metadata_ok'
    })
  }

  const sorted = sortedFindings(findings)

  return {
    ranAt: DateTime.now().setZone(timezone).toISO() ?? DateTime.utc().toISO() ?? '',
    mode,
    periodLabel: buildPeriodLabel(rows, timezone, locale),
    summary: buildSummary(sorted),
    findings: findingsForMode(sorted, mode)
  }
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
