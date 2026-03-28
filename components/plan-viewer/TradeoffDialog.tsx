'use client';

import React from 'react';

import { t } from '../../src/i18n';
import type { Tradeoff } from '../../src/lib/scheduler/types';
import styles from './TradeoffDialog.module.css';

interface TradeoffDialogProps {
  open: boolean;
  tradeoffs: Tradeoff[];
  onClose: () => void;
}

export function TradeoffDialog({ open, tradeoffs, onClose }: TradeoffDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="plan-v5-tradeoff-title">
      <div className={styles.dialog}>
        <div className={styles.header}>
          <div>
            <h2 id="plan-v5-tradeoff-title" className={styles.title}>{t('planV5.tradeoff.title')}</h2>
            <p className={styles.copy}>{t('planV5.tradeoff.choose')}</p>
          </div>
          <button className={styles.close} type="button" onClick={onClose}>
            {t('planV5.tradeoff.close')}
          </button>
        </div>

        <div className={styles.list}>
          {tradeoffs.map((tradeoff, index) => (
            <article key={`${tradeoff.question_esAR}-${index}`} className={styles.tradeoff}>
              <p className={styles.question}>{tradeoff.question_esAR}</p>
              <div className={styles.options}>
                <section className={styles.optionCard}>
                  <span className={styles.optionLabel}>{t('planV5.tradeoff.optionA')}</span>
                  <p className={styles.optionCopy}>{tradeoff.planA.description_esAR}</p>
                  <button
                    className={styles.optionButton}
                    type="button"
                    onClick={() => {
                      console.info(t('planV5.dialog.selected', { option: 'A' }), tradeoff);
                    }}
                  >
                    {t('planV5.tradeoff.select')}
                  </button>
                </section>

                <section className={styles.optionCard}>
                  <span className={styles.optionLabel}>{t('planV5.tradeoff.optionB')}</span>
                  <p className={styles.optionCopy}>{tradeoff.planB.description_esAR}</p>
                  <button
                    className={styles.optionButton}
                    type="button"
                    onClick={() => {
                      console.info(t('planV5.dialog.selected', { option: 'B' }), tradeoff);
                    }}
                  >
                    {t('planV5.tradeoff.select')}
                  </button>
                </section>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
