'use client';

import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import esLocale from '@fullcalendar/core/locales/es';
import type { EventInput } from '@fullcalendar/core';
import { DateTime } from 'luxon';

import type { MilestoneItem } from '../../src/lib/domain/plan-item';
import type { V5Detail } from '../../src/lib/domain/rolling-wave-plan';
import { t } from '../../src/i18n';
import styles from './CalendarView.module.css';

interface CalendarViewProps {
  detail: V5Detail;
  milestones: MilestoneItem[];
  goalIds: string[];
}

function getGoalTone(goalId: string, goalIds: string[]): string {
  const index = Math.max(goalIds.indexOf(goalId), 0) % 4;
  return styles[`goal${index}`];
}

function toEventInputs(detail: V5Detail, milestones: MilestoneItem[], goalIds: string[]): EventInput[] {
  const scheduledEvents = detail.scheduledEvents.map((event) => {
    const start = DateTime.fromISO(event.startAt, { zone: 'UTC' });
    const end = start.plus({ minutes: event.durationMin });

    return {
      id: event.id,
      title: event.title,
      start: start.toISO() ?? event.startAt,
      end: end.toISO() ?? end.toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"),
      classNames: [styles.event, getGoalTone(event.goalIds[0] ?? goalIds[0] ?? '', goalIds)],
    } satisfies EventInput;
  });

  const milestoneEvents = milestones.map((milestone) => ({
    id: milestone.id,
    title: `${t('planV5.calendar.milestonePrefix')}: ${milestone.title}`,
    start: milestone.dueDate,
    allDay: true,
    classNames: [styles.event, styles.milestone],
  }) satisfies EventInput);

  return [...scheduledEvents, ...milestoneEvents];
}

export function CalendarView({ detail, milestones, goalIds }: CalendarViewProps) {
  const events = toEventInputs(detail, milestones, goalIds);

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{t('planV5.calendar.title')}</h2>
          <p className={styles.copy}>{t('planV5.calendar.subtitle')}</p>
        </div>
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.goal0}`} />
            {t('planV5.calendar.legendEvents')}
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.milestone}`} />
            {t('planV5.calendar.legendMilestones')}
          </span>
        </div>
      </header>

      <div className={styles.calendarShell}>
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin]}
          locale={esLocale}
          initialView="dayGridMonth"
          timeZone="UTC"
          firstDay={1}
          weekends
          nowIndicator
          height="auto"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek',
          }}
          buttonText={{
            today: t('dashboard.calendar_panel.toolbar.today'),
          }}
          views={{
            dayGridMonth: {
              buttonText: t('dashboard.calendar_panel.toolbar.month'),
            },
            timeGridWeek: {
              buttonText: t('dashboard.calendar_panel.toolbar.week'),
            },
          }}
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          eventTimeFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }}
          events={events}
          eventDidMount={(info) => {
            const start = info.event.startStr
              ? DateTime.fromISO(info.event.startStr, { zone: 'UTC' }).toFormat('dd/LL HH:mm')
              : '';
            info.el.setAttribute('title', [info.event.title, start].filter(Boolean).join(' · '));
          }}
        />
      </div>
    </section>
  );
}
