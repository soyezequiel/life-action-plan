'use client';

import { useMemo } from 'react';
import { DateTime } from 'luxon';

import PlanCalendar, { type CalendarView as PlanCalendarView } from '../PlanCalendar';
import { t } from '../../src/i18n';
import type { TimeEventItem } from '../../src/lib/domain/plan-item';
import type { V5Detail } from '../../src/lib/domain/rolling-wave-plan';
import type { ProgressRow } from '../../src/shared/types/lap-api';
import styles from './CalendarView.module.css';

type CalendarViewMode = 'day' | 'week' | 'month' | 'year';
type CalendarCategory = 'estudio' | 'ejercicio' | 'trabajo' | 'habito' | 'descanso' | 'otro';

const CATEGORY_ROTATION: CalendarCategory[] = ['estudio', 'trabajo', 'habito', 'ejercicio', 'descanso', 'otro'];
const VIEW_OPTIONS: Array<{ key: CalendarViewMode; labelKey: string }> = [
  { key: 'year', labelKey: 'dashboard.calendar_panel.view_annual' },
  { key: 'month', labelKey: 'dashboard.calendar_panel.view_monthly' },
  { key: 'week', labelKey: 'dashboard.calendar_panel.view_weekly' },
  { key: 'day', labelKey: 'dashboard.calendar_panel.view_daily' }
];

interface CalendarViewProps {
  detail?: V5Detail | null;
  milestones?: unknown[];
  goalIds?: string[];
  timezone: string;
  activeView: CalendarViewMode;
  onViewChange?: (view: CalendarViewMode) => void;
}

function mapToPlanCalendarView(view: CalendarViewMode): PlanCalendarView {
  if (view === 'day') {
    return 'timeGridDay';
  }

  if (view === 'week') {
    return 'timeGridWeek';
  }

  if (view === 'year') {
    return 'multiMonthYear';
  }

  return 'dayGridMonth';
}

function resolveCategory(event: TimeEventItem, goalIds: string[] | undefined): CalendarCategory {
  const orderedGoalIds = goalIds ?? [];
  const matchedGoalId = event.goalIds.find((goalId) => orderedGoalIds.includes(goalId)) ?? event.goalIds[0] ?? null;

  if (!matchedGoalId) {
    return 'otro';
  }

  const orderIndex = orderedGoalIds.indexOf(matchedGoalId);
  const fallbackIndex = Math.max(event.goalIds.indexOf(matchedGoalId), 0);
  const index = orderIndex >= 0 ? orderIndex : fallbackIndex;
  return CATEGORY_ROTATION[index % CATEGORY_ROTATION.length] ?? 'otro';
}

function buildProgressRows(detail: V5Detail | null | undefined, timezone: string, goalIds: string[] | undefined): ProgressRow[] {
  const events = detail?.weeks.flatMap((week) => week.scheduledEvents) ?? detail?.scheduledEvents ?? [];

  return events.flatMap((event) => {
    const startAt = DateTime.fromISO(event.startAt, { zone: timezone });
    const fallbackDate = detail?.startDate ?? '';
    const fecha = startAt.isValid ? (startAt.toISODate() ?? fallbackDate) : fallbackDate;

    if (!fecha) {
      return [];
    }

    const notas = JSON.stringify({
      hora: startAt.isValid ? startAt.toFormat('HH:mm') : '09:00',
      duracion: event.durationMin,
      categoria: resolveCategory(event, goalIds)
    });

    return [{
      id: event.id,
      planId: 'plan-v5',
      fecha,
      tipo: event.kind,
      objetivoId: event.goalIds[0] ?? null,
      descripcion: event.title,
      completado: event.status === 'done',
      notas,
      createdAt: event.createdAt
    }];
  });
}

export function CalendarView({ detail, goalIds, timezone, activeView, onViewChange }: CalendarViewProps) {
  const tasks = useMemo(() => buildProgressRows(detail, timezone, goalIds), [detail, goalIds, timezone]);

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{t('dashboard.calendar_panel.title')}</h2>
          <p className={styles.copy}>{t('dashboard.calendar_panel.hint')}</p>
        </div>

        <div className={styles.viewSwitcher} role="tablist" aria-label={t('dashboard.calendar_panel.view_selector_label')}>
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={activeView === option.key}
              className={`${styles.viewButton} ${activeView === option.key ? styles.viewButtonActive : ''}`}
              onClick={() => onViewChange?.(option.key)}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.calendarShell}>
        <PlanCalendar
          tasks={tasks}
          timezone={timezone}
          defaultView={mapToPlanCalendarView(activeView)}
          variant="light"
          showHeader={false}
        />
      </div>
    </section>
  );
}
