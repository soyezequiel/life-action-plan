'use client'

import type { GoalType } from '../../src/lib/domain/goal-taxonomy'
import { t } from '../../src/i18n'
import { GOAL_TYPE_OPTIONS, goalTypeLabel, riskLabel, signalLabel } from './labels'
import styles from './InteractiveFlowPage.module.css'

interface ClassifyReviewStepProps {
  confidence: number
  goalType: GoalType
  risk: string
  signals: string[]
  draft: {
    goalType: GoalType
    context: string
  }
  onGoalTypeChange: (goalType: GoalType) => void
  onContextChange: (value: string) => void
  onSubmit: () => void
  busy: boolean
}

export function ClassifyReviewStep(props: ClassifyReviewStepProps) {
  const confidencePercent = Math.round(props.confidence * 100)
  const showRiskNotice = props.risk.startsWith('HIGH')

  return (
    <div className={styles.contentSurface}>
      <div className={styles.banner}>
        <p className={styles.eyebrow}>{t('flowInteractive.pauseLabel')}</p>
        <h2 className={styles.sectionTitle}>{t('flowInteractive.classify.title')}</h2>
        <p className={styles.sectionCopy}>{t('flowInteractive.classify.copy')}</p>
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('flowInteractive.classify.detectedType')}</span>
          <strong className={styles.summaryValue}>{goalTypeLabel(props.goalType)}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('flowInteractive.classify.detectedRisk')}</span>
          <strong className={styles.summaryValue}>{riskLabel(props.risk)}</strong>
        </div>
      </div>

      <div className={styles.confidenceMeter}>
        <div className={styles.stack}>
          <strong>{t('flowInteractive.classify.confidence')}</strong>
          <span className={styles.chip}>{t('flowInteractive.classify.confidenceValue', { percent: confidencePercent })}</span>
        </div>
        <div className={styles.confidenceTrack} aria-hidden="true">
          <div className={styles.confidenceFill} style={{ width: `${confidencePercent}%` }} />
        </div>
      </div>

      {showRiskNotice && (
        <div className={styles.warningBox}>
          <strong>{t('flowInteractive.classify.riskNoticeTitle')}</strong>
          <p className={styles.copy}>{t('flowInteractive.classify.riskNoticeCopy')}</p>
        </div>
      )}

      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('flowInteractive.classify.adjustType')}</span>
        <div className={styles.choiceGrid}>
          {GOAL_TYPE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`${styles.choiceButton} ${props.draft.goalType === option ? styles.choiceButtonActive : ''}`}
              onClick={() => props.onGoalTypeChange(option)}
              disabled={props.busy}
            >
              {goalTypeLabel(option)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('flowInteractive.classify.contextLabel')}</span>
        <p className={styles.fieldHint}>{t('flowInteractive.classify.contextHint')}</p>
        <textarea
          className={styles.textarea}
          value={props.draft.context}
          onChange={(event) => props.onContextChange(event.currentTarget.value)}
          placeholder={t('flowInteractive.classify.contextPlaceholder')}
          disabled={props.busy}
        />
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('flowInteractive.classify.signals')}</span>
        <div className={styles.signals}>
          {props.signals.map((signal) => (
            <span key={signal} className={styles.chip}>
              {signalLabel(signal)}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.stepFooter}>
        <p className={styles.miniText}>{t('flowInteractive.classify.footer')}</p>
        <button
          type="button"
          className="app-button app-button--primary"
          onClick={props.onSubmit}
          disabled={props.busy}
        >
          {props.busy ? t('flowInteractive.busy') : t('flowInteractive.continue')}
        </button>
      </div>
    </div>
  )
}
