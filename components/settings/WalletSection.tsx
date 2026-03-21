'use client'

import React from 'react'
import { t } from '../../src/i18n'
import type { WalletStatus } from '../../src/shared/types/lap-api'
import styles from '../SettingsPageContent.module.css'

interface WalletSectionProps {
  walletConnection: string
  walletStatus: WalletStatus
  walletBusy: boolean
  walletNotice: string
  walletError: string
  onWalletConnectionChange: (value: string) => void
  onConnect: () => Promise<void>
  onDisconnect: () => Promise<void>
}

export default function WalletSection(props: WalletSectionProps) {
  const walletStatusMessage = props.walletStatus.connected
    ? t('settings.wallet_success')
    : t('dashboard.wallet_not_connected')
  const showWalletNotice = Boolean(props.walletNotice && props.walletNotice !== walletStatusMessage)

  return (
    <section className={styles.card}>
      <div className={styles.sectionHeader}>
        <span className="app-status app-status--eyebrow">{t('dashboard.wallet_title')}</span>
        <h2 className="app-title app-title--section">{t('settings.wallet_title')}</h2>
        <p className="app-copy">{t('settings.wallet_hint')}</p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void props.onConnect()
        }}
      >
        <input
          className="app-input"
          type="password"
          value={props.walletConnection}
          onChange={(event) => props.onWalletConnectionChange(event.target.value)}
          placeholder={t('settings.wallet_placeholder')}
        />

        <div className="app-actions">
          <button
            className="app-button app-button--primary"
            type="submit"
            disabled={!props.walletConnection.trim() || props.walletBusy}
          >
            {props.walletBusy ? t('settings.wallet_connecting') : t('settings.wallet_confirm')}
          </button>
          <button
            className="app-button app-button--secondary"
            type="button"
            onClick={() => {
              void props.onDisconnect()
            }}
            disabled={props.walletBusy || !props.walletStatus.configured}
          >
            {t('settings.wallet_disconnect')}
          </button>
        </div>
      </form>

      <p className="dashboard-wallet__meta">
        {walletStatusMessage}
      </p>
      {typeof props.walletStatus.balanceSats === 'number' && (
        <p className="dashboard-wallet__meta">
          {t('dashboard.wallet_balance', { sats: String(props.walletStatus.balanceSats) })}
        </p>
      )}
      {showWalletNotice && <p className="status-message status-message--success">{props.walletNotice}</p>}
      {props.walletError && <p className="status-message status-message--warning">{props.walletError}</p>}
    </section>
  )
}
