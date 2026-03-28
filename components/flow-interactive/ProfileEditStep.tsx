'use client'

import type { UserProfileV5 } from '../../src/lib/pipeline/v5/phase-io-v5'
import { t } from '../../src/i18n'
import { energyLabel } from './labels'
import styles from './InteractiveFlowPage.module.css'

interface ProfileEditStepProps {
  profile: UserProfileV5
  draft: UserProfileV5
  onDraftChange: (draft: UserProfileV5) => void
  onSubmit: () => void
  busy: boolean
}

function updateList(value: string): string[] {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function ProfileEditStep(props: ProfileEditStepProps) {
  return (
    <div className={styles.contentSurface}>
      <div className={styles.banner}>
        <p className={styles.eyebrow}>{t('flowInteractive.pauseLabel')}</p>
        <h2 className={styles.sectionTitle}>{t('flowInteractive.profile.title')}</h2>
        <p className={styles.sectionCopy}>{t('flowInteractive.profile.copy')}</p>
      </div>

      <div className={styles.sliderRow}>
        <div className={styles.stack}>
          <strong>{t('flowInteractive.profile.weekdayHours')}</strong>
          <span className={styles.chip}>{t('flowInteractive.profile.hoursValue', { count: props.draft.freeHoursWeekday })}</span>
        </div>
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={12}
          value={props.draft.freeHoursWeekday}
          onChange={(event) => props.onDraftChange({
            ...props.draft,
            freeHoursWeekday: Number(event.currentTarget.value)
          })}
          disabled={props.busy}
        />
        <span className={styles.sliderValue}>{t('flowInteractive.profile.weekdayHint')}</span>
      </div>

      <div className={styles.sliderRow}>
        <div className={styles.stack}>
          <strong>{t('flowInteractive.profile.weekendHours')}</strong>
          <span className={styles.chip}>{t('flowInteractive.profile.hoursValue', { count: props.draft.freeHoursWeekend })}</span>
        </div>
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={16}
          value={props.draft.freeHoursWeekend}
          onChange={(event) => props.onDraftChange({
            ...props.draft,
            freeHoursWeekend: Number(event.currentTarget.value)
          })}
          disabled={props.busy}
        />
        <span className={styles.sliderValue}>{t('flowInteractive.profile.weekendHint')}</span>
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('flowInteractive.profile.energyLabel')}</span>
        <div className={styles.stackTight}>
          {(['low', 'medium', 'high'] as const).map((energy) => (
            <button
              key={energy}
              type="button"
              className={`${styles.tagButton} ${props.draft.energyLevel === energy ? styles.tagButtonActive : ''}`}
              onClick={() => props.onDraftChange({
                ...props.draft,
                energyLevel: energy
              })}
              disabled={props.busy}
            >
              {energyLabel(energy)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('flowInteractive.profile.commitmentsLabel')}</span>
        <textarea
          className={styles.textarea}
          value={props.draft.fixedCommitments.join('\n')}
          onChange={(event) => props.onDraftChange({
            ...props.draft,
            fixedCommitments: updateList(event.currentTarget.value)
          })}
          placeholder={t('flowInteractive.profile.commitmentsPlaceholder')}
          disabled={props.busy}
        />
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('flowInteractive.profile.constraintsLabel')}</span>
        <textarea
          className={styles.textarea}
          value={props.draft.scheduleConstraints.join('\n')}
          onChange={(event) => props.onDraftChange({
            ...props.draft,
            scheduleConstraints: updateList(event.currentTarget.value)
          })}
          placeholder={t('flowInteractive.profile.constraintsPlaceholder')}
          disabled={props.busy}
        />
      </div>

      <div className={styles.stepFooter}>
        <p className={styles.miniText}>
          {t('flowInteractive.profile.footer', {
            weekday: props.profile.freeHoursWeekday,
            weekend: props.profile.freeHoursWeekend
          })}
        </p>
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
