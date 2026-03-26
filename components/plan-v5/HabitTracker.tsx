'use client';

import React from 'react';
import type { HabitState } from '../../src/lib/domain/habit-state';
import type { AdaptiveAssessment } from '../../src/lib/pipeline/v5/phase-io-v5';
import { t } from '../../src/i18n';
import { humanize } from '../../src/lib/client/utils/humanize';
import styles from './HabitTracker.module.css';

interface HabitTrackerProps {
  habitStates: HabitState[];
  assessments: AdaptiveAssessment[];
}

function resolveTone(assessment?: AdaptiveAssessment): 'safe' | 'warning' | 'danger' {
  if (!assessment) {
    return 'safe';
  }

  if (assessment.risk === 'CRITICAL' || assessment.adherence.meanProbability < 0.4) {
    return 'danger';
  }

  if (
    assessment.risk === 'AT_RISK' ||
    (assessment.adherence.meanProbability >= 0.4 && assessment.adherence.meanProbability < 0.7)
  ) {
    return 'warning';
  }

  return 'safe';
}

function resolveMessage(state: HabitState, assessment?: AdaptiveAssessment): string {
  if (!assessment || assessment.risk === 'SAFE') {
    return t('planV5.habits.safe');
  }

  if (assessment.risk === 'CRITICAL') {
    return t('planV5.habits.critical', {
      mvh: state.currentDose.minimumViable.description,
    });
  }

  return t('planV5.habits.atRisk', {
    mvh: `${state.currentDose.minimumViable.minutes} min`,
  });
}

export function HabitTracker({ habitStates, assessments }: HabitTrackerProps) {
  const assessmentByKey = new Map(assessments.map((assessment) => [assessment.progressionKey, assessment]));

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('planV5.habits.title')}</h2>
      </div>

      {habitStates.length === 0 ? (
        <p className={styles.empty}>{t('planV5.habits.empty')}</p>
      ) : (
        <div className={styles.grid}>
          {habitStates.map((state) => {
            const assessment = assessmentByKey.get(state.progressionKey);
            const tone = resolveTone(assessment);
            const sessionTotal = assessment?.adherence.observationCount || state.currentDose.sessionsPerWeek;
            const sessionDone = assessment?.adherence.successCount ?? 0;
            const probability = Math.round((assessment?.adherence.meanProbability ?? 0.8) * 100);

            return (
              <article key={state.progressionKey} className={`${styles.card} ${styles[`card--${tone}`]}`} data-tone={tone}>
                <div className={styles.cardHeader}>
                  <div>
                    <strong className={styles.name}>{humanize(state.progressionKey)}</strong>
                    <span className={styles.level}>{t('planV5.habits.level', { level: state.level })}</span>
                  </div>
                  <span className={`${styles.statusDot} ${styles[`statusDot--${tone}`]}`} aria-hidden="true" />
                </div>

                <div className={styles.progressRow}>
                  <div className={styles.progressBar} aria-hidden="true">
                    <span className={`${styles.progressFill} ${styles[`progressFill--${tone}`]}`} style={{ width: `${probability}%` }} />
                  </div>
                  <strong className={styles.percent}>{probability}%</strong>
                </div>

                <p className={styles.meta}>{t('planV5.habits.sessionsThisWeek', { done: sessionDone, total: sessionTotal })}</p>
                <p className={styles.meta}>{t('planV5.habits.streak', { weeks: state.weeksActive })}</p>
                <p className={styles.minimum}>{t('planV5.habits.minimumViable', { description: state.currentDose.minimumViable.description })}</p>
                <p className={styles.message}>{resolveMessage(state, assessment)}</p>
                {assessment && assessment.risk !== 'SAFE' && (
                  <p className={styles.banner}>{t('planV5.habits.lapseBanner')}</p>
                )}
                {state.protectedFromReset && (
                  <p className={styles.protected}>{t('planV5.habits.protected', { weeks: state.weeksActive })}</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
