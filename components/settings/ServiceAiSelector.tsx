'use client'

import React from 'react'
import { t } from '../../src/i18n'
import styles from '../SettingsPageContent.module.css'
import type { ServiceModelOption } from './types'

interface ServiceAiSelectorProps {
  models: ServiceModelOption[]
  selectedModelId: string
  onSelect: (modelId: string) => void
}

export default function ServiceAiSelector({ models, selectedModelId, onSelect }: ServiceAiSelectorProps) {
  return (
    <section className={styles.card}>
      <div className={styles.sectionHeader}>
        <span className="app-status app-status--eyebrow">{t('settings.service_models.title')}</span>
        {selectedModelId && (
          <p className="app-copy">
            {t('settings.service_models.selected', {
              name: models.find((model) => model.modelId === selectedModelId)?.displayName ?? selectedModelId
            })}
          </p>
        )}
      </div>

      {models.length === 0 ? (
        <p className="dashboard-wallet__meta">{t('settings.service_models.empty')}</p>
      ) : (
        <div className={styles.serviceModelGrid}>
          {models.map((model) => (
            <button
              key={model.modelId}
              type="button"
              className={[styles.serviceModelCard, selectedModelId === model.modelId ? styles.serviceModelCardActive : ''].join(' ')}
              onClick={() => onSelect(model.modelId)}
            >
              <strong>{model.displayName}</strong>
              <span>{model.modelId}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
