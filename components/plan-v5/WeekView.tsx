'use client';

import React, { useState } from 'react';
import { DateTime } from 'luxon';

import type { TimeEventItem } from '../../src/lib/domain/plan-item';
import type { OperationalBuffer, V5Operational } from '../../src/lib/domain/rolling-wave-plan';
import { getCurrentLocale, t } from '../../src/i18n';
import { humanize } from '../../src/lib/client/utils/humanize';
import styles from './WeekView.module.css';

const START_HOUR = 6;
const END_HOUR = 23;
const HOUR_HEIGHT = 64;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => START_HOUR + index);
const TOTAL_HEIGHT = HOURS.length * HOUR_HEIGHT;

interface WeekViewProps {
  operational: V5Operational;
  goalIds: string[];
}

interface ScheduledEntry {
  id: string;
  kind: 'event' | 'buffer';
  startAt: string;
  durationMin: number;
  title: string;
  goalIds: string[];
  rigidity?: TimeEventItem['rigidity'];
  bufferKind?: OperationalBuffer['kind'];
}

function getGoalTone(goalId: string, goalIds: string[]): string {
  const index = Math.max(goalIds.indexOf(goalId), 0) % 4;
  return styles[`goal${index}`];
}

function formatClock(iso: string): string {
  return DateTime.fromISO(iso, { zone: 'UTC' })
    .setLocale(getCurrentLocale())
    .toFormat('HH:mm');
}

function buildEntries(day: V5Operational['days'][number]): ScheduledEntry[] {
  const eventEntries = day.scheduledEvents.map((event) => ({
    id: event.id,
    kind: 'event' as const,
    startAt: event.startAt,
    durationMin: event.durationMin,
    title: event.title,
    goalIds: event.goalIds,
    rigidity: event.rigidity,
  }));
  const bufferEntries = day.buffers.map((buffer) => ({
    id: buffer.id,
    kind: 'buffer' as const,
    startAt: buffer.startAt,
    durationMin: buffer.durationMin,
    title: buffer.label ?? t(`planV5.bufferKind.${buffer.kind}`),
    goalIds: [],
    bufferKind: buffer.kind,
  }));

  return [...eventEntries, ...bufferEntries].sort((left, right) =>
    DateTime.fromISO(left.startAt, { zone: 'UTC' }).toMillis() -
    DateTime.fromISO(right.startAt, { zone: 'UTC' }).toMillis(),
  );
}

function getBlockStyle(entry: ScheduledEntry) {
  const start = DateTime.fromISO(entry.startAt, { zone: 'UTC' });
  const startMinutes = start.hour * 60 + start.minute;
  const top = ((startMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max((entry.durationMin / 60) * HOUR_HEIGHT, 22);

  return {
    top: `${top}px`,
    height: `${height}px`,
  };
}

export function WeekView({ operational, goalIds }: WeekViewProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const selectedEvent = operational.scheduledEvents.find((event) => event.id === selectedEventId) ?? null;

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{t('planV5.week.title')}</h2>
          <p className={styles.copy}>{t('planV5.week.subtitle')}</p>
        </div>
      </div>

      {operational.days.every((day) => day.scheduledEvents.length === 0 && day.buffers.length === 0) ? (
        <p className={styles.empty}>{t('planV5.week.empty')}</p>
      ) : (
        <div className={styles.grid} role="grid">
          <div className={styles.corner} />
          {operational.days.map((day) => (
            <div key={day.date} className={styles.dayHeader}>
              {DateTime.fromISO(day.date, { zone: 'UTC' })
                .setLocale(getCurrentLocale())
                .toFormat('ccc d')}
            </div>
          ))}

          <div className={styles.hours}>
            {HOURS.map((hour) => (
              <span key={hour} className={styles.hourLabel}>
                {DateTime.fromObject({ hour }, { zone: 'UTC' }).toFormat('HH:mm')}
              </span>
            ))}
          </div>

          {operational.days.map((day) => (
            <div key={`${day.date}-column`} className={styles.dayColumn}>
              <div className={styles.dayCanvas} style={{ height: `${TOTAL_HEIGHT}px` }}>
                {buildEntries(day).map((entry) => {
                  const start = DateTime.fromISO(entry.startAt, { zone: 'UTC' });
                  const blockTone = entry.kind === 'event'
                    ? getGoalTone(entry.goalIds[0] ?? goalIds[0] ?? '', goalIds)
                    : styles.buffer;
                  const label = entry.kind === 'buffer'
                    ? t(`planV5.bufferKind.${entry.bufferKind}`)
                    : entry.title;

                  if (entry.kind === 'buffer') {
                    return (
                      <div
                        key={entry.id}
                        className={`${styles.block} ${styles.blockBuffer} ${blockTone}`}
                        style={getBlockStyle(entry)}
                        data-testid={`week-buffer-${entry.id}`}
                        data-start-hour={start.hour}
                        data-start-minute={start.minute}
                      >
                        <span className={styles.blockLabel}>{label}</span>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`${styles.block} ${styles.blockEvent} ${blockTone} ${styles[`rigidity-${entry.rigidity ?? 'soft'}`]}`}
                      style={getBlockStyle(entry)}
                      onClick={() => setSelectedEventId(entry.id)}
                      data-testid={`week-block-${entry.id}`}
                      data-start-hour={start.hour}
                      data-start-minute={start.minute}
                    >
                      <strong className={styles.blockTitle}>{label}</strong>
                      <span className={styles.blockMeta}>{formatClock(entry.startAt)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedEvent && (
        <aside className={styles.detailCard}>
          <div className={styles.detailHeader}>
            <div>
              <strong className={styles.detailTitle}>{selectedEvent.title}</strong>
              <p className={styles.detailMeta}>
                {t('planV5.week.time')}: {formatClock(selectedEvent.startAt)}{' '}
                {t('planV5.event.until', {
                  time: formatClock(
                    DateTime.fromISO(selectedEvent.startAt, { zone: 'UTC' })
                      .plus({ minutes: selectedEvent.durationMin })
                      .toISO() ?? selectedEvent.startAt,
                  ),
                })}
              </p>
            </div>
            <button type="button" className={styles.closeButton} onClick={() => setSelectedEventId(null)}>
              {t('planV5.week.close')}
            </button>
          </div>
          <div className={styles.detailGrid}>
            <p className={styles.detailRow}>
              <span>{t('planV5.week.goal')}</span>
              <strong>{selectedEvent.goalIds.map(humanize).join(', ')}</strong>
            </p>
            <p className={styles.detailRow}>
              <span>{t('planV5.week.rigidity')}</span>
              <strong>{t(`planV5.rigidity.${selectedEvent.rigidity}`)}</strong>
            </p>
          </div>
        </aside>
      )}
    </section>
  );
}
