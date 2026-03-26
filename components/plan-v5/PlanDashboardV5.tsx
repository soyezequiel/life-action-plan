'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { usePlanV5 } from '../../src/lib/client/use-plan-v5';
import type { MilestoneItem } from '../../src/lib/domain/plan-item';
import { t } from '../../src/i18n';
import { AdaptiveChangesPanel } from './AdaptiveChangesPanel';
import { CalendarView } from './CalendarView';
import { HabitTracker } from './HabitTracker';
import { PlanSummaryBar } from './PlanSummaryBar';
import { ProgressView } from './ProgressView';
import { TradeoffDialog } from './TradeoffDialog';
import { WeekView } from './WeekView';
import styles from './PlanDashboardV5.module.css';

type DashboardTab = 'week' | 'calendar' | 'habits' | 'progress';

const TABS: DashboardTab[] = ['week', 'calendar', 'habits', 'progress'];

export function PlanDashboardV5() {
  const searchParams = useSearchParams();
  const planId = searchParams?.get('planId') ?? undefined;
  const { package: pkg, adaptive, adaptiveStatus, loading, error, refetch } = usePlanV5(planId);
  const [activeTab, setActiveTab] = useState<DashboardTab>('week');
  const [tradeoffOpen, setTradeoffOpen] = useState(false);
  const [showAdaptive, setShowAdaptive] = useState(false);

  if (loading) {
    return (
      <div className={styles.stateCard}>
        <p className="app-status app-status--busy">{t('planV5.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.stateCard}>
        <p className="app-status">{error}</p>
        <button type="button" className="app-button app-button--primary" onClick={refetch}>
          {t('planV5.refresh')}
        </button>
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className={styles.stateCard}>
        <p className="app-status">{t('planV5.empty')}</p>
        <button type="button" className="app-button app-button--primary" onClick={refetch}>
          {t('planV5.refresh')}
        </button>
      </div>
    );
  }

  const milestones = pkg.items.filter((item): item is MilestoneItem => item.kind === 'milestone');

  return (
    <section className={styles.dashboard}>
      <PlanSummaryBar
        package={pkg}
        adaptive={adaptive}
        adaptiveStatus={adaptiveStatus}
        onOpenChanges={() => setShowAdaptive((current) => !current)}
        onOpenTradeoffs={() => setTradeoffOpen(true)}
      />

      {showAdaptive && adaptive && (
        <AdaptiveChangesPanel adaptive={adaptive} />
      )}

      <div className={styles.tabBar} role="tablist" aria-label={t('planV5.page.title')}>
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {t(`planV5.tabs.${tab}`)}
          </button>
        ))}
      </div>

      <div className={styles.viewCard}>
        {activeTab === 'week' && (
          <WeekView operational={pkg.plan.operational} goalIds={pkg.plan.goalIds} />
        )}
        {activeTab === 'calendar' && (
          <CalendarView detail={pkg.plan.detail} milestones={milestones} goalIds={pkg.plan.goalIds} />
        )}
        {activeTab === 'habits' && (
          <HabitTracker habitStates={pkg.habitStates} assessments={adaptive?.assessments ?? []} />
        )}
        {activeTab === 'progress' && (
          <ProgressView package={pkg} />
        )}
      </div>

      <TradeoffDialog
        open={tradeoffOpen}
        tradeoffs={pkg.tradeoffs ?? []}
        onClose={() => setTradeoffOpen(false)}
      />
    </section>
  );
}
