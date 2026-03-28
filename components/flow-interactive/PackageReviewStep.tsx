'use client'

import type { PackageOutput } from '../../src/lib/pipeline/v5/phase-io-v5'
import type { InteractivePauseFromPhase } from '../../src/shared/schemas/pipeline-interactive'
import { t } from '../../src/i18n'
import { pausePhaseLabel } from './labels'
import styles from './InteractiveFlowPage.module.css'

interface PackageReviewStepProps {
  plan: PackageOutput
  selectedRegenerateFrom: InteractivePauseFromPhase | null
  onSelectRegenerateFrom: (phase: InteractivePauseFromPhase) => void
  onAccept: () => void
  onRegenerate: () => void
  busy: boolean
}

const REGENERATE_OPTIONS: InteractivePauseFromPhase[] = ['classify', 'requirements', 'profile', 'schedule']

export function PackageReviewStep(props: PackageReviewStepProps) {
  return (
    <div className={styles.contentSurface}>
      <div className={styles.banner}>
        <p className={styles.eyebrow}>{t('flowInteractive.pauseLabel')}</p>
        <h2 className={styles.sectionTitle}>{t('flowInteractive.package.title')}</h2>
        <p className={styles.sectionCopy}>{t('flowInteractive.package.copy')}</p>
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('flowInteractive.package.quality')}</span>
          <strong className={styles.summaryValue}>{t('flowInteractive.package.qualityValue', { score: props.plan.qualityScore.toFixed(2) })}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('flowInteractive.package.items')}</span>
          <strong className={styles.summaryValue}>{t('flowInteractive.package.itemsValue', { count: props.plan.items.length })}</strong>
        </div>
      </div>

      <div className={styles.packageColumns}>
        <div className={styles.detailItem}>
          <h3 className={styles.detailTitle}>{t('flowInteractive.package.summary')}</h3>
          <p className={styles.sectionCopy}>{props.plan.summary_esAR}</p>

          <div className={styles.stackTight}>
            <strong>{t('flowInteractive.package.intentions')}</strong>
            {props.plan.implementationIntentions.length > 0 ? (
              <ul className={styles.plainList}>
                {props.plan.implementationIntentions.map((intention, index) => (
                  <li key={`${intention}-${index}`}>{intention}</li>
                ))}
              </ul>
            ) : (
              <div className={styles.emptyState}>{t('flowInteractive.package.noIntentions')}</div>
            )}
          </div>
        </div>

        <div className={styles.stackTight}>
          <div className={styles.detailItem}>
            <h3 className={styles.detailTitle}>{t('flowInteractive.package.warnings')}</h3>
            {props.plan.warnings.length > 0 ? (
              <ul className={styles.plainList}>
                {props.plan.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            ) : (
              <div className={styles.emptyState}>{t('flowInteractive.package.noWarnings')}</div>
            )}
          </div>

          <div className={styles.detailItem}>
            <h3 className={styles.detailTitle}>{t('flowInteractive.package.regenerateTitle')}</h3>
            <p className={styles.mutedText}>{t('flowInteractive.package.regenerateCopy')}</p>
            <div className={styles.stackTight}>
              {REGENERATE_OPTIONS.map((phase) => (
                <button
                  key={phase}
                  type="button"
                  className={`${styles.tagButton} ${props.selectedRegenerateFrom === phase ? styles.tagButtonActive : ''}`}
                  onClick={() => props.onSelectRegenerateFrom(phase)}
                  disabled={props.busy}
                >
                  {pausePhaseLabel(phase)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.stepFooter}>
        <button
          type="button"
          className="app-button app-button--secondary"
          onClick={props.onRegenerate}
          disabled={props.busy || !props.selectedRegenerateFrom}
        >
          {t('flowInteractive.package.regenerateButton')}
        </button>
        <button
          type="button"
          className="app-button app-button--primary"
          onClick={props.onAccept}
          disabled={props.busy}
        >
          {props.busy ? t('flowInteractive.busy') : t('flowInteractive.package.acceptButton')}
        </button>
      </div>
    </div>
  )
}
