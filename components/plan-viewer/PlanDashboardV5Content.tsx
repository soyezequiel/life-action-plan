'use client';

import React, { useState } from 'react';

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

type DashboardTab = 'overview' | 'calendar' | 'tasks' | 'progress';
type CalendarViewMode = 'day' | 'week' | 'month' | 'year';

const TABS: DashboardTab[] = ['overview', 'calendar', 'tasks', 'progress'];

interface PlanDashboardV5ContentProps {
  pkg: PlanPackage;
  adaptive: AdaptiveOutput | null;
  adaptiveStatus: AdaptiveStatus;
  activeTab: DashboardTab;
  calendarView: CalendarViewMode;
  onTabChange: (tab: DashboardTab) => void;
  onCalendarViewChange: (view: CalendarViewMode) => void;
}

function OverviewView({ pkg, adaptive, adaptiveStatus }: Pick<PlanDashboardV5ContentProps, 'pkg' | 'adaptive' | 'adaptiveStatus'>) {
  const milestones = pkg.items.filter((item): item is MilestoneItem => item.kind === 'milestone');
  const metricCount = pkg.items.filter((item) => item.kind === 'metric').length;
  const warningCount = pkg.warnings.length;
  const phaseCount = pkg.plan.skeleton.phases.length;
  const goalCount = pkg.plan.goalIds.length;

  return (
    <section className={styles.overviewLayout}>
      <article className={styles.overviewHero}>
        <span className={styles.overviewKicker}>{t('planV5.progress.summaryTitle')}</span>
        <h2 className={styles.overviewTitle}>{pkg.summary_esAR}</h2>
        <p className={styles.overviewCopy}>{t('planV5.summary.caption')}</p>

        <div className={styles.overviewStats}>
          <div className={styles.overviewStat}>
            <span>{t('planV5.goals.multiple', { count: goalCount })}</span>
            <strong>{goalCount}</strong>
          </div>
          <div className={styles.overviewStat}>
            <span>{t('planV5.progress.phasesTitle')}</span>
            <strong>{phaseCount}</strong>
          </div>
          <div className={styles.overviewStat}>
            <span>{t('planV5.progress.metricsTitle')}</span>
            <strong>{metricCount}</strong>
          </div>
        </div>
      </article>

      <div className={styles.overviewGrid}>
        <article className={styles.overviewCard}>
          <span className={styles.overviewCardLabel}>{t('planV5.progress.currentPhase')}</span>
          <strong className={styles.overviewCardTitle}>
            {adaptiveStatus === 'pending'
              ? t('planV5.summary.pendingPill')
              : adaptive
                ? t(`planV5.summary.mode.${adaptive.mode}`)
                : t('planV5.summary.safe')}
          </strong>
          <p className={styles.overviewCardCopy}>
            {adaptiveStatus === 'pending'
              ? t('planV5.summary.pendingDetail')
              : adaptive?.changesMade.length
                ? t('planV5.summary.adaptiveAvailable')
                : t('planV5.summary.adaptiveUnavailable')}
          </p>
        </article>

        <article className={styles.overviewCard}>
          <span className={styles.overviewCardLabel}>{t('planV5.progress.milestonesTitle')}</span>
          <strong className={styles.overviewCardTitle}>{milestones.length}</strong>
          <p className={styles.overviewCardCopy}>
            {milestones.length > 0
              ? milestones[0]?.title ?? t('planV5.progress.emptyMilestones')
              : t('planV5.progress.emptyMilestones')}
          </p>
        </article>

        <article className={styles.overviewCard}>
          <span className={styles.overviewCardLabel}>{t('planV5.progress.warningsTitle')}</span>
          <strong className={styles.overviewCardTitle}>{warningCount}</strong>
          <p className={styles.overviewCardCopy}>
            {warningCount > 0 ? pkg.warnings[0] : t('planV5.progress.noWarnings')}
          </p>
        </article>
      </div>
    </section>
  );
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
        {activeTab === 'overview' && (
          <OverviewView pkg={pkg} adaptive={adaptive} adaptiveStatus={adaptiveStatus} />
        )}

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
