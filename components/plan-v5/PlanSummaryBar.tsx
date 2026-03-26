'use client';

import React from 'react';

import { t } from '../../src/i18n';
import type { AdaptiveOutput, PlanPackage } from '../../src/lib/pipeline/v5/phase-io-v5';
import styles from './PlanSummaryBar.module.css';

interface PlanSummaryBarProps {
  package: PlanPackage;
  adaptive: AdaptiveOutput | null;
  onOpenChanges: () => void;
  onOpenTradeoffs: () => void;
}

function riskTone(risk: AdaptiveOutput['overallRisk'] | 'SAFE'): 'safe' | 'warning' | 'danger' {
  if (risk === 'CRITICAL') {
    return 'danger';
  }

  if (risk === 'AT_RISK') {
    return 'warning';
  }

  return 'safe';
}

export function PlanSummaryBar({ package: pkg, adaptive, onOpenChanges, onOpenTradeoffs }: PlanSummaryBarProps) {
  const overallRisk = adaptive?.overallRisk ?? 'SAFE';
  const tone = riskTone(overallRisk);

  return (
    <section className={`${styles.bar} ${styles[`bar--${tone}`]}`} data-tone={tone}>
      <div className={styles.copy}>
        <span className={styles.eyebrow}>{t('planV5.goals.multiple', { count: pkg.plan.goalIds.length })}</span>
        <h1 className={styles.title}>{pkg.summary_esAR}</h1>
        <p className={styles.meta}>
          {adaptive
            ? t(`planV5.summary.mode.${adaptive.mode}`)
            : t('planV5.summary.adaptiveUnavailable')}
        </p>
      </div>

      <div className={styles.aside}>
        <span className={`${styles.pill} ${styles[`pill--${tone}`]}`}>
          {adaptive
            ? t(`planV5.summary.mode.${adaptive.mode}`)
            : t('planV5.summary.safe')}
        </span>
        <p className={styles.caption}>
          {overallRisk === 'SAFE'
            ? t('planV5.summary.safe')
            : overallRisk === 'AT_RISK'
              ? t('planV5.summary.atRisk')
              : t('planV5.summary.critical')}
        </p>
        <div className={styles.actions}>
          {adaptive && adaptive.changesMade.length > 0 && (
            <button className={styles.button} type="button" onClick={onOpenChanges}>
              {t('planV5.summary.changes')}
            </button>
          )}
          {(pkg.tradeoffs?.length ?? 0) > 0 && (
            <button className={styles.button} type="button" onClick={onOpenTradeoffs}>
              {t('planV5.summary.tradeoffs')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
