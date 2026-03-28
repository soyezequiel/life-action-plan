'use client';

import React, { useState } from 'react';

import type { MilestoneItem } from '../../src/lib/domain/plan-item';
import type { AdaptiveOutput, AdaptiveStatus, PlanPackage } from '../../src/lib/pipeline/v5/phase-io-v5';
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

interface PlanDashboardV5ContentProps {
  pkg: PlanPackage;
  adaptive: AdaptiveOutput | null;
  adaptiveStatus: AdaptiveStatus;
}

export function PlanDashboardV5Content({
  pkg,
  adaptive,
  adaptiveStatus,
}: PlanDashboardV5ContentProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('week');
  const [tradeoffOpen, setTradeoffOpen] = useState(false);
  const [showAdaptive, setShowAdaptive] = useState(false);

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
          <WeekView operational={pkg.plan.operational} goalIds={pkg.plan.goalIds} items={pkg.items} />
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
