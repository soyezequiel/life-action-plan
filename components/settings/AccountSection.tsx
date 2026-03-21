'use client'

import React, { useState } from 'react'
import { t } from '../../src/i18n'
import { validateRegisterSubmission } from '../../src/lib/auth/register-validation'
import { extractErrorMessage, toUserFacingErrorMessage } from '../../src/lib/client/error-utils'
import { LOCAL_PROFILE_ID_STORAGE_KEY } from '../../src/lib/client/storage-keys'
import styles from '../SettingsPageContent.module.css'
import type { AuthState, AuthUser } from './types'

interface AccountSectionProps {
  authState: AuthState
  onAuthChange: (user: AuthUser | null) => Promise<void>
}

type AccountMode = 'login' | 'register'

export default function AccountSection({ authState, onAuthChange }: AccountSectionProps) {
  const [mode, setMode] = useState<AccountMode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function claimLocalDataIfPresent(): Promise<void> {
    const localProfileId = window.localStorage.getItem(LOCAL_PROFILE_ID_STORAGE_KEY)?.trim() || ''

    if (!localProfileId) {
      return
    }

    const response = await fetch('/api/auth/claim-local-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        localProfileId
      })
    })

    if (!response.ok) {
      const message = extractErrorMessage(await response.text())

      if (message === 'LOCAL_PROFILE_NOT_FOUND') {
        window.localStorage.removeItem(LOCAL_PROFILE_ID_STORAGE_KEY)
        return
      }

      throw new Error(message)
    }

    window.localStorage.removeItem(LOCAL_PROFILE_ID_STORAGE_KEY)
  }

  async function handleAuthSubmit(): Promise<void> {
    setBusy(true)
    setError('')
    setNotice('')

    try {
      if (mode === 'register') {
        const validation = validateRegisterSubmission(username, password)

        if (!validation.ok) {
          throw new Error(validation.errorCode)
        }
      }

      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username,
          password
        })
      })

      if (!response.ok) {
        throw new Error(extractErrorMessage(await response.text()))
      }

      const payload = await response.json() as { user?: AuthUser | null }

      if (payload.user) {
        await claimLocalDataIfPresent()
      }

      await onAuthChange(payload.user ?? null)
      setPassword('')
      setNotice(mode === 'login' ? t('auth.login_success') : t('auth.register_success'))
    } catch (nextError) {
      setError(toUserFacingErrorMessage(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout(): Promise<void> {
    setBusy(true)
    setError('')
    setNotice('')

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error(extractErrorMessage(await response.text()))
      }

      await onAuthChange(null)
    } catch (nextError) {
      setError(toUserFacingErrorMessage(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteAccount(): Promise<void> {
    setBusy(true)
    setError('')
    setNotice('')

    try {
      const response = await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          confirmation: deleteConfirmation
        })
      })

      if (!response.ok) {
        throw new Error(extractErrorMessage(await response.text()))
      }

      setDeleteConfirmation('')
      await onAuthChange(null)
      setNotice(t('auth.delete_success'))
    } catch (nextError) {
      setError(toUserFacingErrorMessage(nextError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.sectionHeader}>
        <span className="app-status app-status--eyebrow">
          {authState.authenticated ? t('auth.login_title') : mode === 'login' ? t('auth.login_title') : t('auth.register_title')}
        </span>
        {authState.authenticated && authState.user ? (
          <p className="app-copy">{t('auth.account_info', { username: authState.user.username })}</p>
        ) : (
          <p className="app-copy">{mode === 'login' ? t('auth.or_register') : t('auth.or_login')}</p>
        )}
      </div>

      {authState.loading ? (
        <p className="dashboard-wallet__meta">{t('ui.loading')}</p>
      ) : authState.authenticated && authState.user ? (
        <>
          <div className="app-actions">
            <button className="app-button app-button--secondary" type="button" onClick={() => void handleLogout()} disabled={busy}>
              {t('auth.logout_button')}
            </button>
          </div>

          <label className={styles.fieldGroup}>
            <span>{t('auth.delete_confirm_label')}</span>
            <input
              className="app-input"
              type="text"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              placeholder={t('auth.delete_confirm_label')}
            />
          </label>

          <small className={styles.helperCopy}>{t('auth.delete_hint')}</small>

          <button
            className="app-button app-button--secondary"
            type="button"
            onClick={() => {
              void handleDeleteAccount()
            }}
            disabled={busy || deleteConfirmation.trim() !== 'ELIMINAR'}
          >
            {t('auth.delete_button')}
          </button>
        </>
      ) : (
        <>
          <label className={styles.fieldGroup}>
            <span>{t('auth.username_label')}</span>
            <input
              className="app-input"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={t('auth.username_placeholder')}
            />
          </label>

          <label className={styles.fieldGroup}>
            <span>{t('auth.password_label')}</span>
            <input
              className="app-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('auth.password_placeholder')}
            />
          </label>

          {mode === 'register' ? (
            <small className={styles.helperCopy}>{t('auth.password_requirements')}</small>
          ) : null}

          <div className="app-actions">
            <button
              className="app-button app-button--primary"
              type="button"
              onClick={() => {
                void handleAuthSubmit()
              }}
              disabled={busy || !username.trim() || !password.trim()}
            >
              {mode === 'login' ? t('auth.login_button') : t('auth.register_button')}
            </button>
            <button
              className="app-button app-button--secondary"
              type="button"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              disabled={busy}
            >
              {mode === 'login' ? t('auth.register_button') : t('auth.login_button')}
            </button>
          </div>
        </>
      )}

      {notice && <p className="status-message status-message--success">{notice}</p>}
      {error && <p className="status-message status-message--warning">{error}</p>}
    </section>
  )
}
