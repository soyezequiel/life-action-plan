'use client';

import React, { useMemo } from 'react';
import { DateTime } from 'luxon';

import type { MetricItem, MilestoneItem } from '../../src/lib/domain/plan-item';
import type { PlanPackage } from '../../src/lib/pipeline/shared/phase-io';
import { getCurrentLocale, t } from '../../src/i18n';
import styles from './ProgressView.module.css';

interface ProgressViewProps {
  package: PlanPackage;
}

function resolveQualityCopy(score: number): string {
  if (score > 70) {
    return t('planV5.quality.solid');
  }

  if (score >= 50) {
    return t('planV5.quality.tight');
  }

  return t('planV5.quality.risky');
}

function resolveCurrentPhaseIndex(pkg: PlanPackage): number {
  const today = DateTime.utc();
  const currentIndex = pkg.plan.skeleton.phases.findIndex((phase) => {
    const start = DateTime.fromISO(phase.startDate, { zone: 'UTC' }).startOf('day');
    const end = DateTime.fromISO(phase.endDate, { zone: 'UTC' }).endOf('day');
    return today >= start && today <= end;
  });

  return currentIndex >= 0 ? currentIndex : 0;
}

function getMetricValue(metric: MetricItem): number {
  return metric.series?.at(-1)?.value ?? 0;
}

function getDirectionLabel(metric: MetricItem): string {
  if (metric.direction === 'increase') {
    return t('planV5.progress.directionIncrease');
  }

  if (metric.direction === 'decrease') {
    return t('planV5.progress.directionDecrease');
  }

  return t('planV5.progress.directionMaintain');
}

export function ProgressView({ package: pkg }: ProgressViewProps) {
  const milestones = useMemo(() => pkg.items.filter((item): item is MilestoneItem => item.kind === 'milestone'), [pkg.items]);
  const metrics = useMemo(() => pkg.items.filter((item): item is MetricItem => item.kind === 'metric'), [pkg.items]);
  const currentPhaseIndex = resolveCurrentPhaseIndex(pkg);
  const qualityWidth = `${Math.max(8, pkg.qualityScore)}%`;

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t('planV5.progress.title')}</h2>
        <p className={styles.copy}>{t('planV5.progress.subtitle')}</p>
      </header>

      <div className={styles.card}>
        <div className={styles.summaryHeader}>
          <div>
            <span className={styles.kicker}>{t('planV5.progress.summaryTitle')}</span>
            <h3 className={styles.summaryTitle}>{pkg.summary_esAR}</h3>
          </div>
          <strong className={styles.qualityLabel}>{resolveQualityCopy(pkg.qualityScore)}</strong>
        </div>
        <div className={styles.qualityTrack} aria-label={resolveQualityCopy(pkg.qualityScore)}>
          <span className={styles.qualityFill} style={{ width: qualityWidth }} />
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.kicker}>{t('planV5.progress.currentPhase')}</span>
            <h3 className={styles.sectionTitle}>{t('planV5.progress.phasesTitle')}</h3>
          </div>
        </div>
        <div className={styles.timeline}>
          {pkg.plan.skeleton.phases.map((phase, index) => (
            <article
              key={phase.phaseId}
              className={`${styles.phase} ${index === currentPhaseIndex ? styles.phaseCurrent : ''}`}
            >
              <span className={styles.phaseRange}>
                {DateTime.fromISO(phase.startDate, { zone: 'UTC' })
                  .setLocale(getCurrentLocale())
                  .toFormat('d LLL')}
                {' - '}
                {DateTime.fromISO(phase.endDate, { zone: 'UTC' })
                  .setLocale(getCurrentLocale())
                  .toFormat('d LLL')}
              </span>
              <strong className={styles.phaseTitle}>{phase.title}</strong>
              <p className={styles.phaseCopy}>{phase.objectives[0] ?? ''}</p>
            </article>
          ))}
        </div>
      </div>

      <div className={styles.columns}>
        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>{t('planV5.progress.milestonesTitle')}</h3>
          {milestones.length === 0 ? (
            <p className={styles.copy}>{t('planV5.progress.emptyMilestones')}</p>
          ) : (
            <ul className={styles.list}>
              {milestones.map((milestone) => (
                <li key={milestone.id} className={styles.milestone}>
                  <span className={`${styles.statusDot} ${styles[`status-${milestone.status}`]}`} aria-hidden="true" />
                  <div>
                    <strong>{milestone.title}</strong>
                    <p className={styles.listCopy}>
                      {t(`planV5.milestone.${milestone.status}`)} ·{' '}
                      {DateTime.fromISO(milestone.dueDate, { zone: 'UTC' })
                        .setLocale(getCurrentLocale())
                        .toFormat('d LLL')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>{t('planV5.progress.metricsTitle')}</h3>
          {metrics.length === 0 ? (
            <p className={styles.copy}>{t('planV5.progress.emptyMetrics')}</p>
          ) : (
            <ul className={styles.list}>
              {metrics.map((metric) => {
                const current = getMetricValue(metric);
                const target = metric.target.targetValue;
                const progress = Math.max(0, Math.min(100, target > 0 ? (current / target) * 100 : 0));

                return (
                  <li key={metric.id} className={styles.metric}>
                    <div className={styles.metricHeader}>
                      <strong>{metric.title}</strong>
                      <span className={styles.metricDirection}>{getDirectionLabel(metric)}</span>
                    </div>
                    <p className={styles.listCopy}>
                      {t('planV5.progress.current')}: {current}
                      {metric.unit ? ` ${metric.unit}` : ''}
                      {' · '}
                      {t('planV5.progress.target')}: {target}
                      {metric.unit ? ` ${metric.unit}` : ''}
                    </p>
                    <div className={styles.metricTrack}>
                      <span className={styles.metricFill} style={{ width: `${progress}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className={styles.columns}>
        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>{t('planV5.progress.intentionsTitle')}</h3>
          <ul className={styles.list}>
            {pkg.implementationIntentions.map((intention) => (
              <li key={intention} className={styles.plainItem}>
                {intention}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>{t('planV5.progress.warningsTitle')}</h3>
          {pkg.warnings.length === 0 ? (
            <p className={styles.copy}>{t('planV5.progress.noWarnings')}</p>
          ) : (
            <ul className={styles.warningList}>
              {pkg.warnings.map((warning) => (
                <li key={warning} className={styles.warningItem}>
                  {warning}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
