'use client'

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import scrollGridPlugin from '@fullcalendar/scrollgrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import multiMonthPlugin from '@fullcalendar/multimonth'
import esLocale from '@fullcalendar/core/locales/es'
import type { CalendarApi, DatesSetArg, EventContentArg, EventInput, EventMountArg } from '@fullcalendar/core'
import { DateTime } from 'luxon'
import { getCurrentLocale, t } from '../src/i18n'
import type { ProgressRow } from '../src/shared/types/lap-api'
import styles from './PlanCalendar.module.css'

export type CalendarView = 'multiMonthYear' | 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'

const DEFAULT_TIME_GRID_MIN = '06:00:00'
const DEFAULT_TIME_GRID_MAX = '23:00:00'
const TIME_GRID_STEP_MINUTES = 30
const MINUTES_PER_DAY = 24 * 60

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
  localStart: DateTime
  localEnd: DateTime
}

interface CalendarEventClassNamesArg {
  event: {
    id: string
  }
}

interface VisibleCalendarWindow {
  viewType: CalendarView
  activeStartIso: string
  activeEndIso: string
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

function minutesToSlotTime(totalMinutes: number): string {
  const boundedMinutes = Math.max(0, Math.min(totalMinutes, MINUTES_PER_DAY))
  const hours = Math.floor(boundedMinutes / 60)
  const minutes = boundedMinutes % 60

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
}

function snapMinutesToSlot(totalMinutes: number, mode: 'floor' | 'ceil'): number {
  if (mode === 'floor') {
    return Math.floor(totalMinutes / TIME_GRID_STEP_MINUTES) * TIME_GRID_STEP_MINUTES
  }

  return Math.ceil(totalMinutes / TIME_GRID_STEP_MINUTES) * TIME_GRID_STEP_MINUTES
}

function buildTimeGridBoundary(candidate: DateTime, referenceDateIso: string, mode: 'floor' | 'ceil'): number {
  const referenceDay = DateTime.fromISO(referenceDateIso, { zone: candidate.zoneName ?? 'utc' }).startOf('day')
  const minutesFromReference = candidate.diff(referenceDay, 'minutes').minutes ?? 0
  const boundedMinutes = Math.max(0, Math.min(minutesFromReference, MINUTES_PER_DAY))

  return Math.max(0, Math.min(snapMinutesToSlot(boundedMinutes, mode), MINUTES_PER_DAY))
}

function buildTimeGridBounds(
  eventModels: CalendarEventModel[],
  timezone: string,
  visibleWindow: VisibleCalendarWindow | null
): { slotMinTime: string; slotMaxTime: string } {
  if (!visibleWindow || (visibleWindow.viewType !== 'timeGridDay' && visibleWindow.viewType !== 'timeGridWeek')) {
    return {
      slotMinTime: DEFAULT_TIME_GRID_MIN,
      slotMaxTime: DEFAULT_TIME_GRID_MAX
    }
  }

  const windowStart = DateTime.fromISO(visibleWindow.activeStartIso, { zone: timezone })
  const windowEnd = DateTime.fromISO(visibleWindow.activeEndIso, { zone: timezone })

  if (!windowStart.isValid || !windowEnd.isValid) {
    return {
      slotMinTime: DEFAULT_TIME_GRID_MIN,
      slotMaxTime: DEFAULT_TIME_GRID_MAX
    }
  }

  const visibleEvents = eventModels.filter((model) => model.localStart < windowEnd && model.localEnd > windowStart)

  if (visibleEvents.length === 0) {
    return {
      slotMinTime: DEFAULT_TIME_GRID_MIN,
      slotMaxTime: DEFAULT_TIME_GRID_MAX
    }
  }

  const slotMinMinutes = visibleEvents.reduce((earliest, model) => {
    const candidate = buildTimeGridBoundary(model.localStart.minus({ minutes: TIME_GRID_STEP_MINUTES }), model.localStart.toISODate() ?? '', 'floor')
    return Math.min(earliest, candidate)
  }, MINUTES_PER_DAY)

  const slotMaxMinutes = visibleEvents.reduce((latest, model) => {
    const candidate = buildTimeGridBoundary(model.localEnd.plus({ minutes: TIME_GRID_STEP_MINUTES }), model.localStart.toISODate() ?? '', 'ceil')
    return Math.max(latest, candidate)
  }, 0)

  return {
    slotMinTime: minutesToSlotTime(slotMinMinutes),
    slotMaxTime: minutesToSlotTime(slotMaxMinutes)
  }
}

function buildEventModel(task: ProgressRow, timezone: string): CalendarEventModel | null {
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
        task.completado ? styles.eventCompleted : ''
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
    },
    localStart: start,
    localEnd: end
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
  const initialView = defaultView ?? 'dayGridMonth'
  const [isCompactLayout, setIsCompactLayout] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [visibleWindow, setVisibleWindow] = useState<VisibleCalendarWindow | null>(null)
  const internalRef = useRef<FullCalendar>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const pendingVisibleWindowRef = useRef<VisibleCalendarWindow | null>(null)
  const visibleWindowUpdateQueuedRef = useRef(false)
  const detailTitleId = useId()
  const detailDescriptionId = useId()
  const currentLocale = getCurrentLocale()

  // Expose the FullCalendar API via the provided ref so the parent can imperatively switch views
  useEffect(() => {
    if (calendarRef && internalRef.current) {
      (calendarRef as React.MutableRefObject<CalendarApi | null>).current = internalRef.current.getApi()
    }
  }, [calendarRef])

  useEffect(() => {
    if (!defaultView) {
      return
    }

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
      if (!defaultView) {
        const nextView = e.matches ? 'timeGridDay' : 'dayGridMonth'
        const api = internalRef.current?.getApi()

        if (api && api.view.type !== nextView) {
          api.changeView(nextView)
        }
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
      .map((task) => buildEventModel(task, timezone))
      .filter((model): model is CalendarEventModel => model !== null)
  }, [tasks, timezone])

  useEffect(() => {
    return () => {
      pendingVisibleWindowRef.current = null
      visibleWindowUpdateQueuedRef.current = false
    }
  }, [])

  const handleDatesSet = useCallback((info: DatesSetArg) => {
    const activeStartIso = DateTime.fromJSDate(info.start, { zone: timezone }).toISO()
    const activeEndIso = DateTime.fromJSDate(info.end, { zone: timezone }).toISO()

    if (!activeStartIso || !activeEndIso) {
      return
    }

    const nextWindow: VisibleCalendarWindow = {
      viewType: info.view.type as CalendarView,
      activeStartIso,
      activeEndIso
    }

    pendingVisibleWindowRef.current = nextWindow

    if (visibleWindowUpdateQueuedRef.current) {
      return
    }

    visibleWindowUpdateQueuedRef.current = true

    queueMicrotask(() => {
      visibleWindowUpdateQueuedRef.current = false

      const pendingWindow = pendingVisibleWindowRef.current
      pendingVisibleWindowRef.current = null

      if (!pendingWindow) {
        return
      }

      setVisibleWindow((current) => {
        if (
          current?.viewType === pendingWindow.viewType &&
          current.activeStartIso === pendingWindow.activeStartIso &&
          current.activeEndIso === pendingWindow.activeEndIso
        ) {
          return current
        }

        return pendingWindow
      })
    })
  }, [timezone])

  const eventDetailsById = useMemo(() => {
    return new Map(eventModels.map((model) => [model.detail.id, model.detail]))
  }, [eventModels])

  useEffect(() => {
    if (selectedEventId && !eventDetailsById.has(selectedEventId)) {
      setSelectedEventId(null)
    }
  }, [eventDetailsById, selectedEventId])

  const selectedEventDetail = selectedEventId ? eventDetailsById.get(selectedEventId) ?? null : null

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

  const countFormatter = useMemo(() => new Intl.NumberFormat(currentLocale), [currentLocale])
  const completedCount = tasks.filter((task) => task.completado).length
  const pendingCount = Math.max(tasks.length - completedCount, 0)
  const todayCount = tasks.filter((task) => task.fecha === todayIso).length
  const events = useMemo(() => {
    return eventModels.map((model) => model.event)
  }, [eventModels])

  const timeGridBounds = useMemo(() => buildTimeGridBounds(eventModels, timezone, visibleWindow), [eventModels, timezone, visibleWindow])

  const eventClassNames = useCallback((info: CalendarEventClassNamesArg) => {
    return [
      styles.event,
      selectedEventId === info.event.id ? styles.eventSelected : ''
    ].filter(Boolean)
  }, [selectedEventId])

  const selectedTasks = useMemo(() => {
    return tasks
      .filter((task) => task.fecha === selectedDateIso)
      .map((task) => ({ task, meta: parseTaskMeta(task.notas) }))
      .sort((a, b) => (a.meta.hora || '').localeCompare(b.meta.hora || ''))
      .map((item) => item.task)
  }, [tasks, selectedDateIso])

  const selectedDateLabel = DateTime.fromISO(selectedDateIso, { zone: timezone })
    .setLocale(currentLocale)
    .toFormat('cccc d LLL')
  const selectedPendingCount = selectedTasks.filter((task) => !task.completado).length

  const shellClass = `${styles.calendarShell} ${variant === 'light' ? styles.calendarShellLight : ''} ${!showHeader ? styles.noHeader : ''}`
  const views = useMemo(() => ({
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
  }), [currentLocale])
  const buttonText = useMemo(() => ({
    today: t('dashboard.calendar_panel.toolbar.today')
  }), [currentLocale])
  const toolbarConfig = useMemo(() => (
    isCompactLayout
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
  ), [isCompactLayout, showHeader, variant])

  const openEventDetail = (eventId: string): void => {
    if (!eventDetailsById.has(eventId)) {
      return
    }

    const detail = eventDetailsById.get(eventId)!
    setSelectedDateIso(detail.dateIso)
    setSelectedEventId(eventId)
  }

  const closeEventDetail = (): void => {
    setSelectedEventId(null)
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
          buttonText={buttonText}
          views={views}
          firstDay={1}
          weekends
          nowIndicator
          allDaySlot={false}
          height="auto"
          dayMaxEventRows={isCompactLayout ? 2 : 3}
          stickyHeaderDates
          slotMinTime={timeGridBounds.slotMinTime}
          slotMaxTime={timeGridBounds.slotMaxTime}
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
          eventClassNames={eventClassNames}
          datesSet={handleDatesSet}
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
