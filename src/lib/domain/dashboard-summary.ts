import { DateTime } from 'luxon'

import type {
  DashboardDaySummary,
  DashboardFocusSummary,
  DashboardScheduleEvent,
  DashboardSummaryResult,
  DashboardTrendSummary,
  PlanRow,
  ProgressRow,
} from '../../shared/types/lap-api'
import { readPlanV5Manifest } from '../../shared/utils/plan-manifest'
import { getHabitStreak } from '../db/db-helpers'

function resolveTimezone(plan: PlanRow): string {
  const manifest = readPlanV5Manifest(plan.manifest)
  return manifest?.package?.timezone?.trim() || DateTime.local().zoneName || 'UTC'
}

function toLocalDateTime(iso: string, timezone: string): DateTime {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(timezone)
}

function toScheduleEvent(event: { title: string; startAt: string; durationMin: number; rigidity: 'hard' | 'soft' }, timezone: string): DashboardScheduleEvent {
  const localStart = toLocalDateTime(event.startAt, timezone)
  const localEnd = localStart.plus({ minutes: event.durationMin })

  return {
    title: event.title,
    startAt: localStart.toISO() ?? event.startAt,
    endAt: localEnd.toISO() ?? event.startAt,
    durationMin: event.durationMin,
    rigidity: event.rigidity
  }
}

function aggregateByDate(rows: ProgressRow[]): Map<string, { completed: number; total: number }> {
  const buckets = new Map<string, { completed: number; total: number }>()

  for (const row of rows) {
    const current = buckets.get(row.fecha) ?? { completed: 0, total: 0 }
    current.total += 1
    if (row.completado) {
      current.completed += 1
    }
    buckets.set(row.fecha, current)
  }

  return buckets
}

function buildDailySummary(rows: ProgressRow[], now: DateTime, days: number): DashboardDaySummary[] {
  const buckets = aggregateByDate(rows)
  const start = now.startOf('day').minus({ days: days - 1 })
  const today = now.toISODate() ?? ''

  return Array.from({ length: days }, (_, index) => {
    const currentDay = start.plus({ days: index })
    const date = currentDay.toISODate() ?? ''
    const bucket = buckets.get(date)
    const percentage = bucket && bucket.total > 0 ? Math.round((bucket.completed / bucket.total) * 100) : 0

    return {
      date,
      weekdayLabel: currentDay.setLocale('es-AR').toFormat('ccc'),
      percentage,
      completedCount: bucket?.completed ?? 0,
      totalCount: bucket?.total ?? 0,
      isToday: date === today
    }
  })
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }

  const total = values.reduce((sum, value) => sum + value, 0)
  return Math.round(total / values.length)
}

function buildTrendSummary(rows: ProgressRow[], now: DateTime): DashboardTrendSummary {
  if (rows.length === 0) {
    return {
      direction: 'unavailable',
      deltaPercentagePoints: null,
      currentAverage: null,
      previousAverage: null
    }
  }

  const windowDays = buildDailySummary(rows, now, 14)
  const previousWindow = windowDays.slice(0, 7)
  const currentWindow = windowDays.slice(7)
  const previousAverage = average(previousWindow.map((day) => day.percentage))
  const currentAverage = average(currentWindow.map((day) => day.percentage))

  if (currentAverage === null || previousAverage === null) {
    return {
      direction: 'unavailable',
      deltaPercentagePoints: null,
      currentAverage,
      previousAverage
    }
  }

  const delta = currentAverage - previousAverage

  return {
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    deltaPercentagePoints: delta,
    currentAverage,
    previousAverage
  }
}

function resolveTodayEvents(plan: PlanRow, timezone: string, todayISO: string): DashboardScheduleEvent[] {
  const manifest = readPlanV5Manifest(plan.manifest)
  const operational = manifest?.package?.plan.operational
  const operationalDay = operational?.days.find((day) => day.date === todayISO)
  const currentEvents = operationalDay?.scheduledEvents.length
    ? operationalDay.scheduledEvents
    : (operational?.scheduledEvents ?? []).filter((event) => toLocalDateTime(event.startAt, timezone).toISODate() === todayISO)

  const fallbackEvents = currentEvents.length > 0
    ? currentEvents
    : (manifest?.package?.plan.detail.scheduledEvents ?? []).filter((event) => toLocalDateTime(event.startAt, timezone).toISODate() === todayISO)

  return fallbackEvents
    .slice()
    .sort((left, right) => toLocalDateTime(left.startAt, timezone).toMillis() - toLocalDateTime(right.startAt, timezone).toMillis())
    .map((event) => toScheduleEvent({
      title: event.title,
      startAt: event.startAt,
      durationMin: event.durationMin,
      rigidity: event.rigidity
    }, timezone))
}

function resolveFocus(events: DashboardScheduleEvent[], now: DateTime): DashboardFocusSummary {
  if (events.length === 0) {
    return {
      status: 'no_events',
      remainingMinutes: null,
      title: null,
      nextEventStartAt: null,
      targetAt: null
    }
  }

  const current = events.find((event) => {
    const start = DateTime.fromISO(event.startAt)
    const end = DateTime.fromISO(event.endAt)
    return now >= start && now < end
  })

  if (current) {
    return {
      status: 'in_event',
      remainingMinutes: Math.max(0, Math.ceil(DateTime.fromISO(current.endAt).diff(now, 'minutes').minutes ?? 0)),
      title: current.title,
      nextEventStartAt: current.startAt,
      targetAt: current.endAt
    }
  }

  const next = events.find((event) => DateTime.fromISO(event.startAt) > now)

  if (next) {
    return {
      status: 'before_next',
      remainingMinutes: Math.max(0, Math.ceil(DateTime.fromISO(next.startAt).diff(now, 'minutes').minutes ?? 0)),
      title: next.title,
      nextEventStartAt: next.startAt,
      targetAt: next.startAt
    }
  }

  const targetAt = now.endOf('day').toISO()

  return {
    status: 'after_last_event',
    remainingMinutes: Math.max(0, Math.ceil(now.endOf('day').diff(now, 'minutes').minutes ?? 0)),
    title: events[events.length - 1]?.title ?? null,
    nextEventStartAt: null,
    targetAt
  }
}

export async function buildDashboardSummary(input: {
  plan: PlanRow
  progressRows: ProgressRow[]
}): Promise<DashboardSummaryResult> {
  const timezone = resolveTimezone(input.plan)
  const now = DateTime.now().setZone(timezone)
  const date = now.toISODate() ?? DateTime.now().toISODate() ?? ''
  const todayRows = input.progressRows.filter((row) => row.fecha === date)
  const tasksCompleted = todayRows.filter((row) => row.completado).length
  const tasksTotal = todayRows.length
  const scheduleEvents = resolveTodayEvents(input.plan, timezone, date)
  const week = buildDailySummary(input.progressRows, now, 7)
  const trend = buildTrendSummary(input.progressRows, now)
  const streak = await getHabitStreak(input.plan.id, date)

  return {
    planId: input.plan.id,
    planName: input.plan.nombre,
    timezone,
    date,
    dateLabel: now.setLocale('es-AR').toFormat('cccc d LLLL yyyy'),
    progressPercentage: tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0,
    tasksTotal,
    tasksCompleted,
    tasksActive: Math.max(0, tasksTotal - tasksCompleted),
    tasks: todayRows,
    schedule: {
      events: scheduleEvents,
      isEmpty: scheduleEvents.length === 0
    },
    focus: resolveFocus(scheduleEvents, now),
    week: {
      days: week
    },
    trend,
    streak
  }
}
