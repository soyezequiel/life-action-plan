'use client'

import React, { useState } from 'react'
import { t } from '../../src/i18n'
import type { StoredApiKey } from '../../src/lib/client/local-key-vault'
import styles from '../SettingsPageContent.module.css'

interface OwnKeyManagerProps {
  keys: StoredApiKey[]
  selectedKeyId: string
  protectionPassword: string
  isAuthenticated: boolean
  notice: string
  error: string
  busy: boolean
  onSelectKey: (id: string) => void
  onProtectionPasswordChange: (value: string) => void
  onAddKey: (input: { provider: string; alias: string; value: string }) => Promise<void>
  onDeleteKey: (id: string) => void
  onBackup: () => Promise<void>
  onRestore: () => Promise<void>
}

function getProviderLabel(providerId: string): string {
  if (providerId === 'openrouter') {
    return t('settings.own_keys.provider_openrouter')
  }

  return t('settings.own_keys.provider_openai')
}

export default function OwnKeyManager(props: OwnKeyManagerProps) {
  const [provider, setProvider] = useState('openai')
  const [alias, setAlias] = useState('')
  const [value, setValue] = useState('')

  async function handleSubmit(): Promise<void> {
    if (!alias.trim() || !value.trim()) {
      return
    }

    await props.onAddKey({
      provider,
      alias,
      value
    })

    setAlias('')
    setValue('')
  }

  return (
    <section className={styles.card}>
      <div className={styles.sectionHeader}>
        <span className="app-status app-status--eyebrow">{t('settings.own_keys.title')}</span>
        <h2 className="app-title app-title--section">{t('settings.own_keys.add_title')}</h2>
      </div>

      <label className={styles.fieldGroup}>
        <span>{t('settings.own_keys.encryption_password_title')}</span>
        <input
          className="app-input"
          type="password"
          value={props.protectionPassword}
          onChange={(event) => props.onProtectionPasswordChange(event.target.value)}
          placeholder={t('settings.own_keys.encryption_password_placeholder')}
        />
        <small className={styles.helperCopy}>{t('settings.own_keys.encryption_password_hint')}</small>
      </label>

      <div className={styles.inlineFields}>
        <label className={styles.fieldGroup}>
          <span>{t('settings.own_keys.provider_label')}</span>
          <select className="app-input" value={provider} onChange={(event) => setProvider(event.target.value)}>
            <option value="openai">{t('settings.own_keys.provider_openai')}</option>
            <option value="openrouter">{t('settings.own_keys.provider_openrouter')}</option>
          </select>
        </label>
        <label className={styles.fieldGroup}>
          <span>{t('settings.own_keys.alias_label')}</span>
          <input
            className="app-input"
            type="text"
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            placeholder={t('settings.own_keys.alias_placeholder')}
          />
        </label>
      </div>

      <label className={styles.fieldGroup}>
        <span>{t('settings.own_keys.key_label')}</span>
        <input
          className="app-input"
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t('settings.own_keys.key_placeholder')}
        />
      </label>

      <div className="app-actions">
        <button
          className="app-button app-button--primary"
          type="button"
          onClick={() => {
            void handleSubmit()
          }}
          disabled={!props.protectionPassword.trim() || !alias.trim() || !value.trim() || props.busy}
        >
          {t('settings.own_keys.save')}
        </button>
        <button
          className="app-button app-button--secondary"
          type="button"
          onClick={() => {
            void props.onBackup()
          }}
          disabled={!props.isAuthenticated || !props.protectionPassword.trim() || props.keys.length === 0 || props.busy}
        >
          {t('settings.own_keys.backup_toggle')}
        </button>
        <button
          className="app-button app-button--secondary"
          type="button"
          onClick={() => {
            void props.onRestore()
          }}
          disabled={!props.isAuthenticated || !props.protectionPassword.trim() || props.busy}
        >
          {t('settings.own_keys.restore_title')}
        </button>
      </div>

      <small className={styles.helperCopy}>
        {props.isAuthenticated ? t('settings.own_keys.backup_hint') : t('settings.own_keys.restore_hint')}
      </small>

      {props.notice && <p className="status-message status-message--success">{props.notice}</p>}
      {props.error && <p className="status-message status-message--warning">{props.error}</p>}

      {props.keys.length === 0 ? (
        <p className="dashboard-wallet__meta">{t('settings.own_keys.empty')}</p>
      ) : (
        <ul className={styles.keyList}>
          {props.keys.map((record) => (
            <li key={record.id} className={styles.keyListItem}>
              <label className={styles.keyChoice}>
                <input
                  type="radio"
                  name="local-key"
                  checked={props.selectedKeyId === record.id}
                  onChange={() => props.onSelectKey(record.id)}
                />
                <span>
                  <strong>{record.alias}</strong>
                  <small>{getProviderLabel(record.provider)}</small>
                </span>
              </label>
              <button
                className="app-button app-button--secondary"
                type="button"
                onClick={() => props.onDeleteKey(record.id)}
              >
                {t('settings.own_keys.delete')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
