'use client';

import React from 'react';

import { t } from '../../src/i18n';
import type { AdaptiveOutput } from '../../src/lib/pipeline/v5/phase-io-v5';
import styles from './AdaptiveChangesPanel.module.css';

interface AdaptiveChangesPanelProps {
  adaptive: AdaptiveOutput | null;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function humanize(value: string): string {
  return value
    .replace(/^goal-/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildFriendlyRecommendations(adaptive: AdaptiveOutput): string[] {
  if (adaptive.mode === 'ABSORB') {
    return [t('planV5.adaptive.recommendationSteady')];
  }

  if (adaptive.mode === 'REBASE') {
    return [
      t('planV5.adaptive.recommendationReset'),
      t('planV5.adaptive.recommendationLightStart'),
    ];
  }

  return [
    t('planV5.adaptive.recommendationEase'),
    t('planV5.adaptive.recommendationMinimum'),
  ];
}

function buildFriendlyChanges(adaptive: AdaptiveOutput): string[] {
  const changeLines = adaptive.dispatch.activityAdjustments.flatMap((adjustment) => {
    const assessment = adaptive.assessments.find((item) => item.activityIds.includes(adjustment.activityId));
    const habit = humanize(assessment?.progressionKey ?? adjustment.activityId);
    const lines: string[] = [];

    if (adjustment.minimumViableMinutes) {
      lines.push(
        t('planV5.adaptive.changeMinimum', {
          habit,
          minutes: adjustment.minimumViableMinutes,
        }),
      );
    } else if (adjustment.suggestedDurationMin) {
      lines.push(
        t('planV5.adaptive.changeShorter', {
          habit,
          minutes: adjustment.suggestedDurationMin,
        }),
      );
    }

    if (adjustment.countsMinimumViableAsSuccess) {
      lines.push(
        t('planV5.adaptive.changeCountsMinimum', {
          habit,
        }),
      );
    }

    return lines;
  });

  if (adaptive.dispatch.allowSlackRecovery) {
    changeLines.push(t('planV5.adaptive.changeBreathingRoom'));
  }

  if (adaptive.mode === 'REBASE') {
    changeLines.push(t('planV5.adaptive.changeRebuildWeek'));
  }

  return unique(changeLines);
}

export function AdaptiveChangesPanel({ adaptive }: AdaptiveChangesPanelProps) {
  if (!adaptive) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.title}>{t('planV5.adaptive.title')}</h2>
        <p className={styles.copy}>{t('planV5.adaptive.noChanges')}</p>
      </section>
    );
  }

  const modeKey = adaptive.mode === 'ABSORB'
    ? 'absorb'
    : adaptive.mode === 'PARTIAL_REPAIR'
      ? 'partialRepair'
      : 'rebase';
  const friendlyRecommendations = buildFriendlyRecommendations(adaptive);
  const friendlyChanges = buildFriendlyChanges(adaptive);

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{t('planV5.adaptive.title')}</h2>
          <p className={styles.copy}>{t(`planV5.adaptive.${modeKey}`)}</p>
        </div>
      </div>

      <div className={styles.columns}>
        <div className={styles.card}>
          <h3 className={styles.subtitle}>{t('planV5.adaptive.recommendations')}</h3>
          {friendlyRecommendations.length === 0 ? (
            <p className={styles.copy}>{t('planV5.adaptive.noChanges')}</p>
          ) : (
            <ul className={styles.list}>
              {friendlyRecommendations.map((recommendation) => (
                <li key={recommendation}>{recommendation}</li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.card}>
          <h3 className={styles.subtitle}>{t('planV5.adaptive.changes')}</h3>
          {friendlyChanges.length === 0 ? (
            <p className={styles.copy}>{t('planV5.adaptive.noChanges')}</p>
          ) : (
            <ul className={styles.list}>
              {friendlyChanges.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className={styles.assessments}>
        {adaptive.assessments
          .filter((assessment) => assessment.risk !== 'SAFE')
          .map((assessment) => {
            const adjustment = adaptive.dispatch.activityAdjustments.find((item) =>
              assessment.activityIds.includes(item.activityId),
            );

            return (
              <article key={assessment.progressionKey} className={styles.assessment}>
                <strong className={styles.assessmentTitle}>
                  {t('planV5.adaptive.habit')}: {humanize(assessment.progressionKey)}
                </strong>
                {adjustment?.minimumViableDescription && (
                  <p className={styles.copy}>
                    {t('planV5.adaptive.recovery')}: {adjustment.minimumViableDescription}
                  </p>
                )}
                {adjustment?.suggestedDurationMin && (
                  <p className={styles.copy}>
                    {t('planV5.adaptive.adjustment')}: {adjustment.suggestedDurationMin} min
                  </p>
                )}
              </article>
            );
          })}
      </div>
    </section>
  );
}
