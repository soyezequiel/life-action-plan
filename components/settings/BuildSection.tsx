'use client'

import React from 'react'
import { t } from '../../src/i18n'
import type { BuildUsagePreviewResult, PlanBuildProgress, WalletStatus } from '../../src/shared/types/lap-api'
import styles from '../SettingsPageContent.module.css'

interface BuildSectionProps {
  title: string
  hint: string
  selectedProviderLabel: string
  inspectorVisible: boolean
  shouldBuild: boolean
  buildBusy: boolean
  buildUsageLoading: boolean
  canBuild: boolean
  buildNotice: string
  buildError: string
  buildProgress: PlanBuildProgress | null
  buildUsage: BuildUsagePreviewResult['usage'] | null
  showAdvancedDetails: boolean
  walletStatus: WalletStatus
  onToggleInspector: () => void
  onBuild: () => Promise<void>
}

function getBlockedMessage(buildUsage: BuildSectionProps['buildUsage']): string | null {
  const blockReasonCode = buildUsage?.blockReasonCode

  if (!blockReasonCode) {
    return null
  }

  const translationKey = `resource_usage.blocked.${blockReasonCode}`
  const translation = t(translationKey)

  return translation === translationKey
    ? t('resource_usage.blocked.other')
    : translation
}

export default function BuildSection(props: BuildSectionProps) {
  const blockedMessage = getBlockedMessage(props.buildUsage)

  return (
    <section className={`${styles.card} ${styles.primaryCard}`}>
      <div className={styles.sectionHeader}>
        <span className="app-status app-status--eyebrow">{t('dashboard.actions_title')}</span>
        <h1 className="app-title">{props.title}</h1>
        <p className="app-copy">{props.hint}</p>
        {props.showAdvancedDetails && (
          <>
            <p className="status-message status-message--neutral">
              {t('settings.build_route_hint', { provider: props.selectedProviderLabel })}
            </p>
            {props.buildUsage && (
              <>
                <p className="status-message status-message--neutral">
                  {`${t('resource_usage.label')}: ${t(`resource_usage.mode.${props.buildUsage.mode}`)}`}
                </p>
                <p className="status-message status-message--neutral">
                  {t(`resource_usage.source.${props.buildUsage.credentialSource}`)}
                </p>
                <p className="status-message status-message--neutral">
                  {t(`resource_usage.billing.${props.buildUsage.chargeable ? 'charge' : props.buildUsage.billingReasonCode ?? 'operation_not_chargeable'}`)}
                </p>
              </>
            )}
          </>
        )}
        {blockedMessage && (
          <p className="status-message status-message--warning">{blockedMessage}</p>
        )}
      </div>

      {(props.shouldBuild || props.showAdvancedDetails) && (
        <div className="app-actions">
          <button
            className="app-button app-button--secondary"
            type="button"
            onClick={props.onToggleInspector}
          >
            {props.inspectorVisible ? t('debug.disable') : t('debug.panel_title')}
          </button>

          {props.shouldBuild && (
          <button
            className="app-button app-button--primary"
            type="button"
            onClick={() => {
              void props.onBuild()
            }}
            disabled={props.buildBusy || props.buildUsageLoading || !props.canBuild}
          >
            {props.buildBusy ? t('builder.generating') : t('settings.apikey_confirm')}
          </button>
          )}
        </div>
      )}

      {props.buildProgress && (
        <p className="status-message status-message--neutral">
          {t('builder.progress_current', {
            current: props.buildProgress.current,
            total: props.buildProgress.total
          })}
        </p>
      )}
      {props.buildNotice && <p className="status-message status-message--success">{props.buildNotice}</p>}
      {props.buildError && <p className="status-message status-message--warning">{props.buildError}</p>}
    </section>
  )
}
