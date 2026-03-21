'use client'

import React from 'react'
import { t } from '../../src/i18n'
import styles from '../SettingsPageContent.module.css'
import type { LlmMode } from './types'

interface LlmModeSelectorProps {
  value: LlmMode
  advancedVisible: boolean
  onChange: (value: LlmMode) => void
  onToggleAdvanced: () => void
}

export default function LlmModeSelector({
  value,
  advancedVisible,
  onChange,
  onToggleAdvanced
}: LlmModeSelectorProps) {
  return (
    <section className={`${styles.card} ${styles.fullWidthCard}`}>
      <div className={styles.sectionHeader}>
        <span className="app-status app-status--eyebrow">{t('settings.llm_mode.title')}</span>
        <p className="app-copy">{t('settings.llm_mode.selector_hint')}</p>
      </div>

      <div className={styles.laneCard}>
        <div className={styles.laneCopy}>
          <span className={styles.laneBadge}>{t('settings.normal_lane.badge')}</span>
          <strong>{t('settings.normal_lane.title')}</strong>
          <p>{t('settings.normal_lane.copy')}</p>
        </div>
        <p className="status-message status-message--neutral">{t('settings.normal_lane.cost_hint')}</p>
      </div>

      <button
        type="button"
        className="app-button app-button--secondary"
        onClick={onToggleAdvanced}
        aria-expanded={advancedVisible}
      >
        {advancedVisible ? t('settings.normal_lane.advanced_close') : t('settings.normal_lane.advanced_open')}
      </button>

      {advancedVisible && (
        <div className={styles.advancedPanel}>
          <p className={styles.helperCopy}>{t('settings.llm_mode.advanced_hint')}</p>

          <div className={styles.modeSelector}>
            <button
              type="button"
              className={[styles.modeCard, value === 'service' ? styles.modeCardActive : ''].join(' ')}
              onClick={() => onChange('service')}
            >
              <strong>{t('settings.llm_mode.service_title')}</strong>
              <span>{t('settings.llm_mode.service_hint')}</span>
            </button>
            <button
              type="button"
              className={[styles.modeCard, value === 'own' ? styles.modeCardActive : ''].join(' ')}
              onClick={() => onChange('own')}
            >
              <strong>{t('settings.llm_mode.own_key_title')}</strong>
              <span>{t('settings.llm_mode.own_key_hint')}</span>
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
