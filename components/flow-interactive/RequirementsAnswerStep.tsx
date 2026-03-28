'use client'

import { t } from '../../src/i18n'
import styles from './InteractiveFlowPage.module.css'

interface RequirementsAnswerStepProps {
  questions: string[]
  answers: Record<string, string>
  onAnswerChange: (key: string, value: string) => void
  onSubmit: () => void
  busy: boolean
}

export function RequirementsAnswerStep(props: RequirementsAnswerStepProps) {
  return (
    <div className={styles.contentSurface}>
      <div className={styles.banner}>
        <p className={styles.eyebrow}>{t('flowInteractive.pauseLabel')}</p>
        <h2 className={styles.sectionTitle}>{t('flowInteractive.requirements.title')}</h2>
        <p className={styles.sectionCopy}>{t('flowInteractive.requirements.copy')}</p>
      </div>

      <div className={styles.questionList}>
        {props.questions.map((question, index) => (
          <div key={`${index}-${question}`} className={styles.questionItem}>
            <div className={styles.stack}>
              <span className={styles.stepBadge}>{t('flowInteractive.questionNumber', { count: index + 1 })}</span>
              <h3 className={styles.questionTitle}>{question}</h3>
            </div>
            <textarea
              className={styles.textarea}
              value={props.answers[String(index)] ?? ''}
              onChange={(event) => props.onAnswerChange(String(index), event.currentTarget.value)}
              placeholder={t('flowInteractive.requirements.answerPlaceholder')}
              disabled={props.busy}
            />
          </div>
        ))}
      </div>

      <div className={styles.stepFooter}>
        <p className={styles.miniText}>{t('flowInteractive.requirements.footer')}</p>
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
