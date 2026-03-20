import { DateTime } from 'luxon'
import type { StreakResult } from '../shared/types/lap-api'

interface HabitProgressLike {
  fecha: string
  tipo: string
  completado: boolean
}

function parseDay(fecha: string): DateTime | null {
  const parsed = DateTime.fromISO(fecha, { zone: 'utc' }).startOf('day')
  return parsed.isValid ? parsed : null
}

function isConsecutive(previous: DateTime, next: DateTime): boolean {
  return Math.round(next.diff(previous, 'days').days) === 1
}

export function calculateHabitStreak(
  rows: HabitProgressLike[],
  todayISO: string
): StreakResult {
  const uniqueDates = new Map<string, DateTime>()

  for (const row of rows) {
    if (row.tipo !== 'habito' || !row.completado) continue

    const day = parseDay(row.fecha)
    const isoDate = day?.toISODate()
    if (!day || !isoDate) continue

    uniqueDates.set(isoDate, day)
  }

  const completedDays = [...uniqueDates.values()].sort((left, right) => left.toMillis() - right.toMillis())
  if (completedDays.length === 0) {
    return { current: 0, best: 0 }
  }

  let best = 1
  let running = 1

  for (let index = 1; index < completedDays.length; index += 1) {
    if (isConsecutive(completedDays[index - 1], completedDays[index])) {
      running += 1
      best = Math.max(best, running)
    } else {
      running = 1
    }
  }

  const today = parseDay(todayISO)
  if (!today) {
    return { current: 0, best }
  }

  const latest = completedDays[completedDays.length - 1]
  const gapFromToday = Math.round(today.diff(latest, 'days').days)

  if (gapFromToday < 0 || gapFromToday > 1) {
    return { current: 0, best }
  }

  let current = 1

  for (let index = completedDays.length - 2; index >= 0; index -= 1) {
    if (isConsecutive(completedDays[index], completedDays[index + 1])) {
      current += 1
    } else {
      break
    }
  }

  return { current, best }
}
