'use client'

import React from 'react'
import { t } from '../../src/i18n'
import styles from '../SettingsPageContent.module.css'
import type { LlmMode } from './types'

interface LlmModeSelectorProps {
  value: LlmMode
  onChange: (value: LlmMode) => void
}

export default function LlmModeSelector({ value, onChange }: LlmModeSelectorProps) {
  return (
    <section className={`${styles.card} ${styles.fullWidthCard}`}>
      <div className={styles.sectionHeader}>
        <span className="app-status app-status--eyebrow">{t('settings.llm_mode.title')}</span>
        <p className="app-copy">{t('settings.llm_mode.selector_hint')}</p>
      </div>

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
    </section>
  )
}
