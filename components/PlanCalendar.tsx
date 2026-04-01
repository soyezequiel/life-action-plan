'use client'

import React, { useEffect, useRef, useState, useMemo } from 'react'
import type { JSX } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import scrollGridPlugin from '@fullcalendar/scrollgrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import multiMonthPlugin from '@fullcalendar/multimonth'
import esLocale from '@fullcalendar/core/locales/es'
import type { CalendarApi, EventContentArg, EventInput } from '@fullcalendar/core'
import { DateTime } from 'luxon'
import { getCurrentLocale, t } from '../src/i18n'
import type { ProgressRow } from '../src/shared/types/lap-api'
import styles from './PlanCalendar.module.css'

export type CalendarView = 'multiMonthYear' | 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'

interface TaskMeta {
  hora?: string
  duracion?: number
  categoria?: string
}

export interface PlanCalendarProps {
  tasks: ProgressRow[]
  timezone: string
  defaultView?: CalendarView
  calendarRef?: React.RefObject<CalendarApi | null>
  variant?: 'dark' | 'light'
  showHeader?: boolean
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
  const isCompactView = content.view.type === 'dayGridMonth' || content.view.type === 'multiMonthYear'

  if (isCompactView) {
    return (
      <div className={styles.eventBodyCompact}>
        <strong className={styles.eventTitleCompact}>{content.event.title}</strong>
      </div>
    )
  }

  return (
    <div className={styles.eventBody}>
      <div className={styles.eventTopline}>
        <span className={styles.eventTime}>{content.timeText || String(content.event.extendedProps.timeLabel || '')}</span>
        {statusLabel && <span className={styles.eventStatus}>{statusLabel}</span>}
      </div>
      <strong className={styles.eventTitle}>{content.event.title}</strong>
      {categoryLabel && (
        <span className={styles.eventMeta}>{categoryLabel}</span>
      )}
    </div>
  )
}

function PlanCalendar({
  tasks,
  timezone,
  defaultView,
  calendarRef,
  variant = 'dark',
  showHeader = true
}: PlanCalendarProps): JSX.Element {
  const [initialView, setInitialView] = useState<CalendarView>(defaultView ?? 'dayGridMonth')
  const [isCompactLayout, setIsCompactLayout] = useState(false)
  const internalRef = useRef<FullCalendar>(null)

  // Expose the FullCalendar API via the provided ref so the parent can imperatively switch views
  useEffect(() => {
    if (calendarRef && internalRef.current) {
      (calendarRef as React.MutableRefObject<CalendarApi | null>).current = internalRef.current.getApi()
    }
  })

  useEffect(() => {
    if (!defaultView) {
      return
    }

    setInitialView(defaultView)

    const api = internalRef.current?.getApi()
    if (api && api.view.type !== defaultView) {
      api.changeView(defaultView)
    }
  }, [defaultView])

  const todayIso = DateTime.now().setZone(timezone).toISODate() ?? ''
  const [selectedDateIso, setSelectedDateIso] = useState(todayIso)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mql = window.matchMedia('(max-width: 900px)')
    const handleResize = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsCompactLayout(e.matches)

      // Only override with mobile default if no explicit defaultView was provided
      if (!defaultView && e.matches) {
        setInitialView('timeGridDay')
      } else if (!defaultView && !e.matches) {
        setInitialView('dayGridMonth')
      }
    }

    // Initial check
    handleResize(mql)

    // Add listener for future changes
    if (mql.addEventListener) {
      mql.addEventListener('change', handleResize)
    } else {
      // Legacy support
      mql.addListener(handleResize)
    }

    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener('change', handleResize)
      } else {
        mql.removeListener(handleResize)
      }
    }
  }, [defaultView])

  useEffect(() => {
    if (tasks.length === 0) {
      setSelectedDateIso(todayIso)
      return
    }

    if (tasks.some((task) => task.fecha === selectedDateIso)) {
      return
    }

    const fallbackDate = tasks.some((task) => task.fecha === todayIso) ? todayIso : tasks[0].fecha
    setSelectedDateIso(fallbackDate)
  }, [selectedDateIso, tasks, todayIso])

  const countFormatter = new Intl.NumberFormat(getCurrentLocale())
  const completedCount = tasks.filter((task) => task.completado).length
  const pendingCount = Math.max(tasks.length - completedCount, 0)
  const todayCount = tasks.filter((task) => task.fecha === todayIso).length
  const events = useMemo(() => {
    return tasks
      .map((task) => buildEvent(task, timezone))
      .filter((event): event is EventInput => event !== null)
  }, [tasks, timezone])

  const selectedTasks = useMemo(() => {
    return tasks
      .filter((task) => task.fecha === selectedDateIso)
      .map((task) => ({ task, meta: parseTaskMeta(task.notas) }))
      .sort((a, b) => (a.meta.hora || '').localeCompare(b.meta.hora || ''))
      .map((item) => item.task)
  }, [tasks, selectedDateIso])

  const selectedDateLabel = DateTime.fromISO(selectedDateIso, { zone: timezone })
    .setLocale(getCurrentLocale())
    .toFormat('cccc d LLL')
  const selectedPendingCount = selectedTasks.filter((task) => !task.completado).length
  const toolbarConfig = isCompactLayout
    ? {
        left: 'title',
        center: '',
        right: 'prev,next today'
      }
    : {
        left: 'prev,next today',
        center: 'title',
        right: variant === 'light' && !showHeader ? '' : 'multiMonthYear,dayGridMonth,timeGridWeek,timeGridDay'
      }

  const shellClass = `${styles.calendarShell} ${variant === 'light' ? styles.calendarShellLight : ''} ${!showHeader ? styles.noHeader : ''}`

  return (
    <section className={shellClass} aria-labelledby="dashboard-calendar-title">
      {showHeader && (
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
      )}

      {events.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>{t('dashboard.calendar_panel.empty_title')}</strong>
          <p>{t('dashboard.calendar_panel.empty_copy')}</p>
        </div>
      ) : (
        <FullCalendar
          ref={internalRef}
          plugins={[multiMonthPlugin, dayGridPlugin, timeGridPlugin, interactionPlugin, scrollGridPlugin]}
          locale={esLocale}
          initialView={initialView}
          headerToolbar={toolbarConfig}
          buttonText={{
            today: t('dashboard.calendar_panel.toolbar.today')
          }}
          views={{
            multiMonthYear: {
              buttonText: t('dashboard.calendar_panel.toolbar.year')
            },
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
          dayMaxEventRows={isCompactLayout ? 2 : 3}
          stickyHeaderDates
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          dayMinWidth={isCompactLayout ? 84 : undefined}
          multiMonthMaxColumns={isCompactLayout ? 1 : 4}
          multiMonthMinWidth={isCompactLayout ? 260 : 180}
          fixedWeekCount={false}
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
          dateClick={(info) => {
            setSelectedDateIso(info.dateStr)
          }}
          eventClick={(info) => {
            const eventDate = info.event.start
              ? DateTime.fromJSDate(info.event.start, { zone: timezone }).toISODate()
              : info.event.startStr.slice(0, 10)

            if (eventDate) {
              setSelectedDateIso(eventDate)
            }
          }}
          dayCellClassNames={(info) => {
            const isoDate = DateTime.fromJSDate(info.date, { zone: timezone }).toISODate()
            return isoDate === selectedDateIso ? [styles.daySelected] : []
          }}
          eventDidMount={(info) => {
            const categoryLabel = String(info.event.extendedProps.categoryLabel || '')
            const statusLabel = String(info.event.extendedProps.statusLabel || '')
            const timeLabel = info.timeText || String(info.event.extendedProps.timeLabel || '')
            info.el.setAttribute('title', [timeLabel, info.event.title, categoryLabel, statusLabel].filter(Boolean).join(' | '))
          }}
        />
      )}

      <div className={styles.agenda}>
        <div className={styles.agendaHeader}>
          <div className={styles.agendaCopy}>
            <span className={styles.label}>{t('dashboard.calendar_panel.selected_label')}</span>
            <h4 className={styles.agendaTitle}>{selectedDateLabel}</h4>
          </div>
          <div className={styles.agendaStats}>
            <span className={styles.footerChip}>{t('dashboard.calendar_panel.selected_count', { count: countFormatter.format(selectedTasks.length) })}</span>
            <span className={styles.footerChip}>
              {selectedTasks.length === 0
                ? t('dashboard.calendar_panel.selected_empty_short')
                : selectedPendingCount === 0
                  ? t('dashboard.calendar_panel.selected_all_done')
                  : t('dashboard.calendar_panel.selected_pending', { count: countFormatter.format(selectedPendingCount) })}
            </span>
          </div>
        </div>

        {selectedTasks.length === 0 ? (
          <p className={styles.agendaEmpty}>{t('dashboard.calendar_panel.selected_empty')}</p>
        ) : (
          <ul className={styles.agendaList}>
            {selectedTasks.map((task) => {
              const meta = parseTaskMeta(task.notas)
              const category = meta.categoria || 'otro'
              const timeText = meta.hora || '09:00'
              const durationText = typeof meta.duracion === 'number'
                ? t('dashboard.minutes', { min: meta.duracion })
                : ''
              const categoryText = t(`dashboard.category.${category}`)

              return (
                <li key={task.id} className={styles.agendaItem}>
                  <div className={styles.agendaTimeBlock}>
                    <strong className={styles.agendaTime}>{timeText}</strong>
                    <span className={styles.agendaDuration}>{durationText || categoryText}</span>
                  </div>
                  <div className={styles.agendaInfo}>
                    <div className={styles.agendaTaskCopy}>
                      <strong className={styles.agendaTaskTitle}>{task.descripcion}</strong>
                      <span className={styles.agendaTaskMeta}>
                        {durationText ? `${durationText} / ${categoryText}` : categoryText}
                      </span>
                    </div>
                    <span className={`${styles.agendaStatus} ${task.completado ? styles.agendaStatusDone : ''}`}>
                      {task.completado ? t('dashboard.completed') : t('dashboard.pending')}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

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

export default React.memo(PlanCalendar)
