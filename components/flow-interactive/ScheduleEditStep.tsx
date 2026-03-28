'use client'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import timeGridPlugin from '@fullcalendar/timegrid'
import esLocale from '@fullcalendar/core/locales/es'
import type { EventChangeArg, EventInput } from '@fullcalendar/core'
import { DateTime } from 'luxon'

import type { TimeEventItem } from '../../src/lib/domain/plan-item'
import type { SchedulerOutput } from '../../src/lib/scheduler/types'
import { t } from '../../src/i18n'
import styles from './InteractiveFlowPage.module.css'

interface ScheduleEditStepProps {
  schedule: SchedulerOutput
  events: TimeEventItem[]
  onEventsChange: (events: TimeEventItem[]) => void
  onReset: () => void
  onSubmit: () => void
  busy: boolean
}

function formatEventRange(event: TimeEventItem): string {
  const start = DateTime.fromISO(event.startAt, { zone: 'utc' })
  if (!start.isValid) {
    return event.startAt
  }

  const end = start.plus({ minutes: event.durationMin })
  return `${start.setLocale('es').toFormat('ccc dd/LL HH:mm')} - ${end.toFormat('HH:mm')}`
}

function toCalendarEvents(events: TimeEventItem[]): EventInput[] {
  return events.map((event) => {
    const start = DateTime.fromISO(event.startAt, { zone: 'utc' })
    const end = start.plus({ minutes: event.durationMin })

    return {
      id: event.id,
      title: event.title,
      start: start.toISO() ?? event.startAt,
      end: end.toISO() ?? end.toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"),
      classNames: [event.rigidity === 'hard' ? styles.calendarEventHard : styles.calendarEventSoft]
    } satisfies EventInput
  })
}

function applyCalendarMutation(events: TimeEventItem[], mutation: EventChangeArg['event']): TimeEventItem[] {
  const nextStart = mutation.start
    ? DateTime.fromJSDate(mutation.start, { zone: 'utc' })
    : null
  const nextEnd = mutation.end
    ? DateTime.fromJSDate(mutation.end, { zone: 'utc' })
    : null

  return events.map((event) => {
    if (event.id !== mutation.id || !nextStart?.isValid) {
      return event
    }

    const durationMin = nextEnd?.isValid
      ? Math.max(Math.round(nextEnd.diff(nextStart, 'minutes').minutes), 15)
      : event.durationMin

    return {
      ...event,
      startAt: nextStart.toISO() ?? event.startAt,
      durationMin
    }
  })
}

export function ScheduleEditStep(props: ScheduleEditStepProps) {
  return (
    <div className={styles.contentSurface}>
      <div className={styles.banner}>
        <p className={styles.eyebrow}>{t('flowInteractive.pauseLabel')}</p>
        <h2 className={styles.sectionTitle}>{t('flowInteractive.schedule.title')}</h2>
        <p className={styles.sectionCopy}>{t('flowInteractive.schedule.copy')}</p>
      </div>

      <div className={styles.scheduleColumns}>
        <div className={styles.calendarShell}>
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            locale={esLocale}
            initialView="timeGridWeek"
            timeZone="UTC"
            editable={!props.busy}
            selectable={false}
            firstDay={1}
            height="auto"
            weekends
            eventChange={(change) => props.onEventsChange(applyCalendarMutation(props.events, change.event))}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek'
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
              }
            }}
            slotMinTime="06:00:00"
            slotMaxTime="23:00:00"
            eventTimeFormat={{
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            }}
            events={toCalendarEvents(props.events)}
          />
        </div>

        <div className={styles.stackTight}>
          <div className={styles.detailItem}>
            <h3 className={styles.detailTitle}>{t('flowInteractive.schedule.currentEvents')}</h3>
            {props.events.length === 0 ? (
              <div className={styles.emptyState}>{t('flowInteractive.schedule.noEvents')}</div>
            ) : (
              <div className={styles.scheduleList}>
                {props.events.map((event) => (
                  <div key={event.id} className={styles.scheduleItem}>
                    <div className={styles.stack}>
                      <h4 className={styles.scheduleTitle}>{event.title}</h4>
                      <span className={styles.chip}>{t(`flowInteractive.schedule.rigidity.${event.rigidity}`)}</span>
                    </div>
                    <div className={styles.eventMeta}>
                      <span>{formatEventRange(event)}</span>
                      <span>{t('flowInteractive.schedule.durationValue', { count: event.durationMin })}</span>
                    </div>
                    <button
                      type="button"
                      className="app-button app-button--secondary"
                      onClick={() => props.onEventsChange(props.events.filter((candidate) => candidate.id !== event.id))}
                      disabled={props.busy}
                    >
                      {t('flowInteractive.schedule.removeEvent')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.detailItem}>
            <h3 className={styles.detailTitle}>{t('flowInteractive.schedule.unscheduled')}</h3>
            {props.schedule.unscheduled.length === 0 ? (
              <div className={styles.emptyState}>{t('flowInteractive.schedule.noUnscheduled')}</div>
            ) : (
              <ul className={styles.plainList}>
                {props.schedule.unscheduled.map((item) => (
                  <li key={item.activityId}>
                    <strong>{item.activityId}</strong>: {item.suggestion_esAR}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.detailItem}>
            <h3 className={styles.detailTitle}>{t('flowInteractive.schedule.tradeoffs')}</h3>
            {props.schedule.tradeoffs && props.schedule.tradeoffs.length > 0 ? (
              <ul className={styles.plainList}>
                {props.schedule.tradeoffs.map((tradeoff, index) => (
                  <li key={`${tradeoff.question_esAR}-${index}`}>{tradeoff.question_esAR}</li>
                ))}
              </ul>
            ) : (
              <div className={styles.emptyState}>{t('flowInteractive.schedule.noTradeoffs')}</div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.stepFooter}>
        <button
          type="button"
          className="app-button app-button--secondary"
          onClick={props.onReset}
          disabled={props.busy}
        >
          {t('flowInteractive.schedule.reset')}
        </button>
        <button
          type="button"
          className="app-button app-button--primary"
          onClick={props.onSubmit}
          disabled={props.busy}
        >
          {props.busy ? t('flowInteractive.busy') : t('flowInteractive.continue')}
        </button>
      </div>
    </div>
  )
}
