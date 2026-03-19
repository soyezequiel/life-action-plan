import { DateTime } from 'luxon'
import { t } from '../i18n'
import type { ProgressRow } from '../shared/types/ipc'

type ProgressRowLike = Pick<ProgressRow, 'id' | 'fecha' | 'descripcion' | 'completado' | 'notas'>

interface ProgressMeta {
  hora?: string
  duracion?: number
  categoria?: string
}

interface GenerateIcsOptions {
  planName: string
  timezone: string
  rows: ProgressRowLike[]
}

function parseMeta(notas: string | null): ProgressMeta {
  if (!notas) return {}

  try {
    const parsed = JSON.parse(notas) as ProgressMeta
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function toUtcStamp(dateTime: DateTime): string {
  return dateTime.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")
}

function getCategoryLabel(category: string): string {
  const categoryKey = `dashboard.category.${category}`
  const translated = t(categoryKey)
  return translated === categoryKey ? t('dashboard.category.otro') : translated
}

export function generateIcsCalendar({
  planName,
  timezone,
  rows
}: GenerateIcsOptions): string {
  const dtStamp = toUtcStamp(DateTime.utc())
  const events = rows
    .map((row, index) => {
      const meta = parseMeta(row.notas)
      const hora = meta.hora || '09:00'
      const duracion = typeof meta.duracion === 'number' && meta.duracion > 0 ? meta.duracion : 30
      const start = DateTime.fromISO(`${row.fecha}T${hora}`, { zone: timezone })

      if (!start.isValid) return null

      const end = start.plus({ minutes: duracion })
      const description = [
        t('calendar.description_category', {
          category: getCategoryLabel(meta.categoria || 'otro')
        }),
        t('calendar.description_status', {
          status: row.completado ? t('dashboard.completed') : t('dashboard.pending')
        })
      ].join('\n')

      return [
        'BEGIN:VEVENT',
        `UID:${escapeIcsText(`${row.id}-${index}@lap.local`)}`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART:${toUtcStamp(start)}`,
        `DTEND:${toUtcStamp(end)}`,
        `SUMMARY:${escapeIcsText(row.descripcion)}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        'END:VEVENT'
      ]
    })
    .filter((event): event is string[] => event !== null)
    .flat()

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LAP//Life Action Plan//ES',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcsText(planName)}`,
    ...events,
    'END:VCALENDAR',
    ''
  ].join('\r\n')
}
