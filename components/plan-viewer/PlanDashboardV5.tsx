'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { usePlanV5 } from '../../src/lib/client/use-plan-v5';
import { t } from '../../src/i18n';
import { PlanDashboardV5Content } from './PlanDashboardV5Content';
import { AppShell } from '../layout/AppShell';
import styles from './PlanDashboardV5.module.css';

type DashboardTab = 'overview' | 'calendar' | 'tasks' | 'progress';
type CalendarView = 'day' | 'week' | 'month' | 'year';

function readTab(value: string | null): DashboardTab {
  if (value === 'calendar' || value === 'tasks' || value === 'progress') {
    return value;
  }

  return 'overview';
}

function readCalendarView(value: string | null): CalendarView {
  if (value === 'day' || value === 'week' || value === 'month' || value === 'year') {
    return value;
  }

  return 'week';
}

export function PlanDashboardV5() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const planId = searchParams?.get('planId') ?? undefined;
  const rawTab = searchParams?.get('tab') ?? null;
  const rawView = searchParams?.get('view') ?? null;
  const activeTab = rawTab ? readTab(rawTab) : rawView ? 'calendar' : 'overview';
  const calendarView = readCalendarView(rawView);
  const { package: pkg, adaptive, adaptiveStatus, loading, error, refetch } = usePlanV5(planId);

  function updateQuery(next: { tab?: DashboardTab; view?: CalendarView }): void {
    const params = new URLSearchParams(searchParams?.toString() ?? '');

    if (next.tab) {
      params.set('tab', next.tab);
    } else {
      params.delete('tab');
    }

    if (next.view) {
      params.set('view', next.view);
    } else {
      params.delete('view');
    }

    const query = params.toString();
    router.replace(query ? `/plan/v5?${query}` : '/plan/v5');
  }

  if (loading) {
    return (
      <AppShell
        eyebrow={t('dashboard.shell_nav.calendar')}
        title={t('planV5.page.title')}
        copy={t('planV5.page.copy')}
      >
        <div className={styles.stateCard}>
          <p className="app-status app-status--busy">{t('planV5.loading')}</p>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell
        eyebrow={t('dashboard.shell_nav.calendar')}
        title={t('planV5.page.title')}
        copy={t('planV5.page.copy')}
      >
        <div className={styles.stateCard}>
          <p className="app-status">{error}</p>
          <button type="button" className="app-button app-button--primary" onClick={refetch}>
            {t('planV5.refresh')}
          </button>
        </div>
      </AppShell>
    );
  }

  if (!pkg) {
    return (
      <AppShell
        eyebrow={t('dashboard.shell_nav.calendar')}
        title={t('planV5.page.title')}
        copy={t('planV5.page.copy')}
      >
        <div className={styles.stateCard}>
          <p className="app-status">{t('planV5.empty')}</p>
          <button type="button" className="app-button app-button--primary" onClick={refetch}>
            {t('planV5.refresh')}
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      eyebrow={t('dashboard.shell_nav.calendar')}
      title={t('planV5.page.title')}
      copy={t('planV5.page.copy')}
    >
      <PlanDashboardV5Content
        pkg={pkg}
        adaptive={adaptive}
        adaptiveStatus={adaptiveStatus}
        activeTab={activeTab}
        calendarView={calendarView}
        onTabChange={(nextTab) => updateQuery({ tab: nextTab, view: nextTab === 'calendar' ? calendarView : undefined })}
        onCalendarViewChange={(nextView) => updateQuery({ tab: 'calendar', view: nextView })}
      />
    </AppShell>
  );
}
