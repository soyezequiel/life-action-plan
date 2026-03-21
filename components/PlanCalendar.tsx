'use client'

import React, { useEffect, useState } from 'react'
import type { JSX } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import timeGridPlugin from '@fullcalendar/timegrid'
import esLocale from '@fullcalendar/core/locales/es'
import type { EventContentArg, EventInput } from '@fullcalendar/core'
import { DateTime } from 'luxon'
import { getCurrentLocale, t } from '../src/i18n'
import type { ProgressRow } from '../src/shared/types/lap-api'
import styles from './PlanCalendar.module.css'

type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'

interface TaskMeta {
  hora?: string
  duracion?: number
  categoria?: string
}

interface PlanCalendarProps {
  tasks: ProgressRow[]
  timezone: string
}

function parseTaskMeta(notas: string | null): TaskMeta {
  if (!notas) {
    return {}
  }

  try {
    return JSON.parse(notas) as TaskMeta
  } catch {
    return {}
  }
}

function getEventAccentClass(category: string): string {
  switch (category) {
    case 'estudio':
      return styles.eventEstudio
    case 'ejercicio':
      return styles.eventEjercicio
    case 'trabajo':
      return styles.eventTrabajo
    case 'habito':
      return styles.eventHabito
    case 'descanso':
      return styles.eventDescanso
    default:
      return styles.eventOtro
  }
}

function buildEvent(task: ProgressRow, timezone: string): EventInput | null {
  const meta = parseTaskMeta(task.notas)
  const category = meta.categoria || 'otro'
  const hour = meta.hora || '09:00'
  const duration = typeof meta.duracion === 'number' && meta.duracion > 0 ? meta.duracion : 30
  const start = DateTime.fromISO(`${task.fecha}T${hour}`, { zone: timezone })

  if (!start.isValid) {
    return null
  }

  const end = start.plus({ minutes: duration })
  const timeLabel = start.setLocale(getCurrentLocale()).toFormat('HH:mm')
  const categoryLabel = t(`dashboard.category.${category}`)
  const statusLabel = task.completado ? t('dashboard.completed') : t('dashboard.pending')

  return {
    id: task.id,
    title: task.descripcion,
    start: start.toISO(),
    end: end.toISO(),
    classNames: [
      styles.event,
      getEventAccentClass(category),
      task.completado ? styles.eventCompleted : ''
    ].filter(Boolean),
    extendedProps: {
      categoryLabel,
      statusLabel,
      timeLabel
    }
  }
}

function renderEventContent(content: EventContentArg): JSX.Element {
  const categoryLabel = String(content.event.extendedProps.categoryLabel || '')
  const statusLabel = String(content.event.extendedProps.statusLabel || '')
  const isCompactView = content.view.type === 'dayGridMonth'

  return (
    <div className={styles.eventBody}>
      <div className={styles.eventTopline}>
        <span className={styles.eventTime}>{content.timeText || String(content.event.extendedProps.timeLabel || '')}</span>
        {!isCompactView && statusLabel && <span className={styles.eventStatus}>{statusLabel}</span>}
      </div>
      <strong className={styles.eventTitle}>{content.event.title}</strong>
      {!isCompactView && categoryLabel && (
        <span className={styles.eventMeta}>{categoryLabel}</span>
      )}
    </div>
  )
}

export default function PlanCalendar({ tasks, timezone }: PlanCalendarProps): JSX.Element {
  const [initialView, setInitialView] = useState<CalendarView>('dayGridMonth')

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    if (window.matchMedia('(max-width: 720px)').matches) {
      setInitialView('timeGridDay')
    }
  }, [])

  const countFormatter = new Intl.NumberFormat(getCurrentLocale())
  const completedCount = tasks.filter((task) => task.completado).length
  const pendingCount = Math.max(tasks.length - completedCount, 0)
  const todayIso = DateTime.now().setZone(timezone).toISODate()
  const todayCount = tasks.filter((task) => task.fecha === todayIso).length
  const events = tasks
    .map((task) => buildEvent(task, timezone))
    .filter((event): event is EventInput => event !== null)

  return (
    <section className={styles.calendarShell} aria-labelledby="dashboard-calendar-title">
      <div className={styles.header}>
        <div className={styles.copy}>
          <span className={styles.label}>{t('dashboard.calendar_panel.label')}</span>
          <h3 id="dashboard-calendar-title" className={styles.title}>
            {t('dashboard.calendar_panel.title')}
          </h3>
          <p className={styles.hint}>{t('dashboard.calendar_panel.hint')}</p>
        </div>

        <div className={styles.stats} aria-label={t('dashboard.calendar_panel.stats_label')}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>{t('dashboard.calendar_panel.total_label')}</span>
            <strong className={styles.statValue}>{countFormatter.format(tasks.length)}</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>{t('dashboard.calendar_panel.pending_label')}</span>
            <strong className={styles.statValue}>{countFormatter.format(pendingCount)}</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>{t('dashboard.calendar_panel.today_label')}</span>
            <strong className={styles.statValue}>{countFormatter.format(todayCount)}</strong>
          </div>
        </div>
      </div>

      {events.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>{t('dashboard.calendar_panel.empty_title')}</strong>
          <p>{t('dashboard.calendar_panel.empty_copy')}</p>
        </div>
      ) : (
        <FullCalendar
          key={initialView}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          locale={esLocale}
          initialView={initialView}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
          }}
          buttonText={{
            today: t('dashboard.calendar_panel.toolbar.today')
          }}
          views={{
            dayGridMonth: {
              buttonText: t('dashboard.calendar_panel.toolbar.month')
            },
            timeGridWeek: {
              buttonText: t('dashboard.calendar_panel.toolbar.week')
            },
            timeGridDay: {
              buttonText: t('dashboard.calendar_panel.toolbar.day')
            }
          }}
          firstDay={1}
          weekends
          nowIndicator
          allDaySlot={false}
          height="auto"
          dayMaxEventRows={3}
          stickyHeaderDates
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          eventTimeFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }}
          slotLabelFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }}
          events={events}
          eventContent={renderEventContent}
          eventDidMount={(info) => {
            const categoryLabel = String(info.event.extendedProps.categoryLabel || '')
            const statusLabel = String(info.event.extendedProps.statusLabel || '')
            const timeLabel = info.timeText || String(info.event.extendedProps.timeLabel || '')
            info.el.setAttribute('title', [timeLabel, info.event.title, categoryLabel, statusLabel].filter(Boolean).join(' | '))
          }}
        />
      )}

      <div className={styles.footer}>
        <span className={styles.footerChip}>
          <span className={styles.footerDot} />
          {t('dashboard.calendar_panel.legend_scheduled')}
        </span>
        <span className={styles.footerChip}>
          <span className={`${styles.footerDot} ${styles.footerDotDone}`} />
          {t('dashboard.calendar_panel.legend_completed', { count: countFormatter.format(completedCount) })}
        </span>
      </div>
    </section>
  )
}
