'use client';

import React, { useMemo, useState } from 'react';

import type { MilestoneItem } from '../../src/lib/domain/plan-item';
import type { AdaptiveOutput, AdaptiveStatus, PlanPackage } from '../../src/lib/pipeline/shared/phase-io';
import { t } from '../../src/i18n';
import { CalendarView } from '@/components/plan-viewer/CalendarView';
import { AdaptiveChangesPanel } from './AdaptiveChangesPanel';
import { PlanSummaryBar } from './PlanSummaryBar';
import { ProgressView } from './ProgressView';
import { TradeoffDialog } from './TradeoffDialog';
import { WeekView } from './WeekView';
import styles from './PlanDashboardV5.module.css';

type DashboardTab = 'calendar' | 'tasks' | 'progress';
type CalendarViewMode = 'day' | 'week' | 'month' | 'year';

const TABS: DashboardTab[] = ['calendar', 'tasks', 'progress'];

interface PlanDashboardV5ContentProps {
  pkg: PlanPackage;
  adaptive: AdaptiveOutput | null;
  adaptiveStatus: AdaptiveStatus;
  activeTab: DashboardTab;
  calendarView: CalendarViewMode;
  onTabChange: (tab: DashboardTab) => void;
  onCalendarViewChange: (view: CalendarViewMode) => void;
}

export function PlanDashboardV5Content({
  pkg,
  adaptive,
  adaptiveStatus,
  activeTab,
  calendarView,
  onTabChange,
  onCalendarViewChange,
}: PlanDashboardV5ContentProps) {
  const [tradeoffOpen, setTradeoffOpen] = useState(false);
  const [showAdaptive, setShowAdaptive] = useState(false);

  const milestones = useMemo(() => pkg.items.filter((item): item is MilestoneItem => item.kind === 'milestone'), [pkg.items]);

  return (
    <section className={styles.dashboard}>
      <PlanSummaryBar
        package={pkg}
        adaptive={adaptive}
        adaptiveStatus={adaptiveStatus}
        onOpenChanges={() => setShowAdaptive((current) => !current)}
        onOpenTradeoffs={() => setTradeoffOpen(true)}
      />

      {showAdaptive && adaptive && <AdaptiveChangesPanel adaptive={adaptive} />}

      <div className={styles.tabBar} role="tablist" aria-label={t('planV5.page.title')}>
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            aria-selected={activeTab === tab}
            onClick={() => onTabChange(tab)}
          >
            {t(`planV5.tabs.${tab}`)}
          </button>
        ))}
      </div>

      <div className={styles.viewCard}>
        {activeTab === 'calendar' && (
          <CalendarView
            detail={pkg.plan.detail}
            milestones={milestones}
            goalIds={pkg.plan.goalIds}
            timezone={pkg.plan.timezone}
            activeView={calendarView}
            onViewChange={onCalendarViewChange}
          />
        )}

        {activeTab === 'tasks' && (
          <WeekView operational={pkg.plan.operational} goalIds={pkg.plan.goalIds} items={pkg.items} />
        )}

        {activeTab === 'progress' && <ProgressView package={pkg} />}
      </div>

      <TradeoffDialog
        open={tradeoffOpen}
        tradeoffs={pkg.tradeoffs ?? []}
        onClose={() => setTradeoffOpen(false)}
      />
    </section>
  );
}
