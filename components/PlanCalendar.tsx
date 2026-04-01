'use client'

import React, { useEffect, useId, useRef, useState, useMemo } from 'react'
import type { JSX } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import scrollGridPlugin from '@fullcalendar/scrollgrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import multiMonthPlugin from '@fullcalendar/multimonth'
import esLocale from '@fullcalendar/core/locales/es'
import type { CalendarApi, EventContentArg, EventInput, EventMountArg } from '@fullcalendar/core'
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

interface EventDetail {
  id: string
  title: string
  dateIso: string
  dateLabel: string
  timeLabel: string
  durationLabel: string
  categoryLabel: string
  statusLabel: string
}

interface CalendarEventModel {
  event: EventInput
  detail: EventDetail
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

function buildEventModel(task: ProgressRow, timezone: string, selectedEventId: string | null): CalendarEventModel | null {
  const meta = parseTaskMeta(task.notas)
  const category = meta.categoria || 'otro'
  const hour = meta.hora || '09:00'
  const duration = typeof meta.duracion === 'number' && meta.duracion > 0 ? meta.duracion : 30
  const start = DateTime.fromISO(`${task.fecha}T${hour}`, { zone: timezone })

  if (!start.isValid) {
    return null
  }

  const end = start.plus({ minutes: duration })
  const locale = getCurrentLocale()
  const dateLabel = start.setLocale(locale).toFormat('cccc d LLL')
  const timeLabel = start.setLocale(locale).toFormat('HH:mm')
  const categoryLabel = t(`dashboard.category.${category}`)
  const statusLabel = task.completado ? t('dashboard.completed') : t('dashboard.pending')
  const durationLabel = t('dashboard.minutes', { min: duration })
  const summaryText = [timeLabel, task.descripcion, dateLabel, categoryLabel, statusLabel]
    .filter(Boolean)
    .join(' | ')

  return {
    event: {
      id: task.id,
      title: task.descripcion,
      start: start.toISO(),
      end: end.toISO(),
      classNames: [
        styles.event,
        getEventAccentClass(category),
        task.completado ? styles.eventCompleted : '',
        selectedEventId === task.id ? styles.eventSelected : ''
      ].filter(Boolean),
      extendedProps: {
        categoryLabel,
        statusLabel,
        timeLabel,
        dateLabel,
        durationLabel,
        summaryText
      }
    },
    detail: {
      id: task.id,
      title: task.descripcion,
      dateIso: task.fecha,
      dateLabel,
      timeLabel,
      durationLabel,
      categoryLabel,
      statusLabel
    }
  }
}

function renderEventContent(content: EventContentArg): JSX.Element {
  const timeLabel = String(content.event.extendedProps.timeLabel || content.timeText || '')
  const categoryLabel = String(content.event.extendedProps.categoryLabel || '')
  const showCategoryPreview = categoryLabel.length > 0 && categoryLabel.toLowerCase() !== t('dashboard.category.otro').toLowerCase()
  const isCompactView = content.view.type === 'dayGridMonth' || content.view.type === 'multiMonthYear'
  const isTimeGridView = content.view.type === 'timeGridWeek' || content.view.type === 'timeGridDay'

  if (content.view.type === 'multiMonthYear') {
    return (
      <div className={styles.eventBodyYear}>
        {timeLabel && <span className={styles.eventTime}>{timeLabel}</span>}
        <strong className={styles.eventTitleYear}>{content.event.title}</strong>
      </div>
    )
  }

  if (isCompactView) {
    return (
      <div className={styles.eventBodyCompact}>
        {timeLabel && <span className={styles.eventTime}>{timeLabel}</span>}
        <strong className={styles.eventTitleCompact}>{content.event.title}</strong>
      </div>
    )
  }

  return (
    <div className={`${styles.eventBody} ${isTimeGridView ? styles.eventBodyTimeGrid : ''}`.trim()}>
      {(timeLabel || (isTimeGridView && showCategoryPreview)) && (
        <div className={styles.eventEyebrow}>
          {timeLabel && <span className={styles.eventTime}>{timeLabel}</span>}
          {isTimeGridView && showCategoryPreview && (
            <span className={styles.eventCategoryPreview}>{categoryLabel}</span>
          )}
        </div>
      )}
      <strong className={`${styles.eventTitle} ${isTimeGridView ? styles.eventTitleTimeGrid : ''}`.trim()}>
        {content.event.title}
      </strong>
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
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [selectedEventDetail, setSelectedEventDetail] = useState<EventDetail | null>(null)
  const internalRef = useRef<FullCalendar>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const detailTitleId = useId()
  const detailDescriptionId = useId()

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

  useEffect(() => {
    if (defaultView) {
      return
    }

    const api = internalRef.current?.getApi()
    if (api && api.view.type !== initialView) {
      api.changeView(initialView)
    }
  }, [defaultView, initialView])

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
      setSelectedEventId(null)
      setSelectedEventDetail(null)
      return
    }

    if (tasks.some((task) => task.fecha === selectedDateIso)) {
      return
    }

    const fallbackDate = tasks.some((task) => task.fecha === todayIso) ? todayIso : tasks[0].fecha
    setSelectedDateIso(fallbackDate)
  }, [selectedDateIso, tasks, todayIso])

  const eventModels = useMemo(() => {
    return tasks
      .map((task) => buildEventModel(task, timezone, selectedEventId))
      .filter((model): model is CalendarEventModel => model !== null)
  }, [selectedEventId, tasks, timezone])

  const eventDetailsById = useMemo(() => {
    return new Map(eventModels.map((model) => [model.detail.id, model.detail]))
  }, [eventModels])

  useEffect(() => {
    if (!selectedEventId) {
      setSelectedEventDetail(null)
      return
    }

    const detail = eventDetailsById.get(selectedEventId) ?? null
    if (!detail) {
      setSelectedEventId(null)
      setSelectedEventDetail(null)
      return
    }

    setSelectedEventDetail(detail)
  }, [eventDetailsById, selectedEventId])

  useEffect(() => {
    if (!selectedEventDetail) {
      return
    }

    closeButtonRef.current?.focus()
  }, [selectedEventDetail])

  useEffect(() => {
    if (!selectedEventDetail || typeof document === 'undefined') {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [selectedEventDetail])

  useEffect(() => {
    if (!selectedEventDetail || typeof window === 'undefined') {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      closeEventDetail()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedEventDetail])

  const countFormatter = new Intl.NumberFormat(getCurrentLocale())
  const completedCount = tasks.filter((task) => task.completado).length
  const pendingCount = Math.max(tasks.length - completedCount, 0)
  const todayCount = tasks.filter((task) => task.fecha === todayIso).length
  const events = useMemo(() => {
    return eventModels.map((model) => model.event)
  }, [eventModels])

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

  const openEventDetail = (eventId: string): void => {
    const detail = eventDetailsById.get(eventId)
    if (!detail) {
      return
    }

    setSelectedDateIso(detail.dateIso)
    setSelectedEventId(eventId)
    setSelectedEventDetail(detail)
  }

  const closeEventDetail = (): void => {
    setSelectedEventId(null)
    setSelectedEventDetail(null)
  }

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
            closeEventDetail()
            setSelectedDateIso(info.dateStr)
          }}
          eventClick={(info) => {
            info.jsEvent.preventDefault()
            info.jsEvent.stopPropagation()
            const eventDate = info.event.start
              ? DateTime.fromJSDate(info.event.start, { zone: timezone }).toISODate()
              : info.event.startStr.slice(0, 10)

            if (eventDate) {
              setSelectedDateIso(eventDate)
            }

            openEventDetail(info.event.id)
          }}
          dayCellClassNames={(info) => {
            const isoDate = DateTime.fromJSDate(info.date, { zone: timezone }).toISODate()
            return isoDate === selectedDateIso ? [styles.daySelected] : []
          }}
          eventDidMount={(info: EventMountArg) => {
            const categoryLabel = String(info.event.extendedProps.categoryLabel || '')
            const statusLabel = String(info.event.extendedProps.statusLabel || '')
            const timeLabel = String(info.event.extendedProps.timeLabel || info.timeText || '')
            const summaryText = String(info.event.extendedProps.summaryText || [
              timeLabel,
              info.event.title,
              categoryLabel,
              statusLabel
            ].filter(Boolean).join(' | '))
            const element = info.el as HTMLElement & {
              __lapCalendarKeydownHandler?: (event: KeyboardEvent) => void
            }

            element.setAttribute('title', summaryText)
            element.setAttribute('aria-label', summaryText)
            element.setAttribute('tabindex', '0')
            element.setAttribute('role', 'button')
            element.setAttribute('aria-haspopup', 'dialog')

            const keydownHandler = (event: KeyboardEvent) => {
              if (event.key !== 'Enter' && event.key !== ' ') {
                return
              }

              event.preventDefault()
              event.stopPropagation()
              openEventDetail(info.event.id)
            }

            element.__lapCalendarKeydownHandler = keydownHandler
            element.addEventListener('keydown', keydownHandler)
          }}
          eventWillUnmount={(info: EventMountArg) => {
            const element = info.el as HTMLElement & {
              __lapCalendarKeydownHandler?: (event: KeyboardEvent) => void
            }

            if (element.__lapCalendarKeydownHandler) {
              element.removeEventListener('keydown', element.__lapCalendarKeydownHandler)
              delete element.__lapCalendarKeydownHandler
            }
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

      {selectedEventDetail && (
        <div
          className={styles.eventDetailOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby={detailTitleId}
          aria-describedby={detailDescriptionId}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeEventDetail()
            }
          }}
        >
          <div className={styles.eventDetailPanel} tabIndex={-1}>
            <div className={styles.eventDetailHeader}>
              <div className={styles.eventDetailHeaderCopy}>
                <span className={styles.eventDetailLabel}>{t('dashboard.calendar_panel.detail_label')}</span>
                <h4 id={detailTitleId} className={styles.eventDetailTitle}>
                  {selectedEventDetail.title}
                </h4>
                <p id={detailDescriptionId} className={styles.eventDetailDescription}>
                  {selectedEventDetail.dateLabel}
                </p>
              </div>

              <button
                ref={closeButtonRef}
                type="button"
                className={styles.eventDetailClose}
                onClick={closeEventDetail}
              >
                {t('dashboard.calendar_panel.detail_close')}
              </button>
            </div>

            <div className={styles.eventDetailMetaGrid}>
              <div className={styles.eventDetailMetaItem}>
                <span className={styles.eventDetailMetaLabel}>{t('dashboard.calendar_panel.detail_day')}</span>
                <strong className={styles.eventDetailMetaValue}>{selectedEventDetail.dateLabel}</strong>
              </div>
              <div className={styles.eventDetailMetaItem}>
                <span className={styles.eventDetailMetaLabel}>{t('dashboard.calendar_panel.detail_time')}</span>
                <strong className={styles.eventDetailMetaValue}>{selectedEventDetail.timeLabel}</strong>
              </div>
              <div className={styles.eventDetailMetaItem}>
                <span className={styles.eventDetailMetaLabel}>{t('dashboard.calendar_panel.detail_duration')}</span>
                <strong className={styles.eventDetailMetaValue}>{selectedEventDetail.durationLabel}</strong>
              </div>
              <div className={styles.eventDetailMetaItem}>
                <span className={styles.eventDetailMetaLabel}>{t('dashboard.calendar_panel.detail_category')}</span>
                <strong className={styles.eventDetailMetaValue}>{selectedEventDetail.categoryLabel}</strong>
              </div>
              <div className={styles.eventDetailMetaItem}>
                <span className={styles.eventDetailMetaLabel}>{t('dashboard.calendar_panel.detail_status')}</span>
                <strong className={styles.eventDetailMetaValue}>{selectedEventDetail.statusLabel}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default React.memo(PlanCalendar)
