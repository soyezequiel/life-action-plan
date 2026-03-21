'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MotionConfig, motion } from 'framer-motion'
import { getCurrentLocale, t } from '../src/i18n'
import { useLapClient } from '../src/lib/client/app-services'
import { extractErrorMessage, toUserFacingErrorMessage } from '../src/lib/client/error-utils'
import type { DeploymentMode } from '../src/lib/env/deployment'
import {
  DEFAULT_OPENAI_BUILD_MODEL,
  getBuildRouteLabelKey,
  getModelProviderName,
  getProviderLabelKey,
  resolveBuildModel
} from '../src/lib/providers/provider-metadata'
import type { PlanBuildProgress, WalletStatus } from '../src/shared/types/lap-api'

const buildStages: PlanBuildProgress['stage'][] = ['preparing', 'generating', 'validating', 'saving']

const settingsTransition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as const
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(getCurrentLocale()).format(value)
}

function getBuildChargeBlockedMessage(reasonCode: string | null | undefined): string {
  const translationKey = reasonCode
    ? `dashboard.wallet_build_blocked.${reasonCode}`
    : 'dashboard.wallet_build_blocked.other'
  const translated = t(translationKey)

  if (translated !== translationKey) {
    return translated
  }

  return t('dashboard.wallet_build_blocked.other')
}

interface SettingsPageContentProps {
  deploymentMode: DeploymentMode
}

export default function SettingsPageContent({ deploymentMode }: SettingsPageContentProps) {
  return (
    <Suspense fallback={(
      <div className="app-shell app-shell--centered">
        <div className="app-screen app-screen--card app-screen--compact">
          <p className="app-copy">{t('ui.loading')}</p>
        </div>
      </div>
    )}
    >
      <SettingsPageClient deploymentMode={deploymentMode} />
    </Suspense>
  )
}

function SettingsPageClient({ deploymentMode }: SettingsPageContentProps) {
  const client = useLapClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const intent = searchParams.get('intent')
  const requestedProvider = searchParams.get('provider')
  const shouldBuild = intent === 'build'
  const localProviderBlocked = requestedProvider === 'ollama' && deploymentMode !== 'local'
  const localBuildIntent = shouldBuild && requestedProvider === 'ollama' && !localProviderBlocked
  const requiresApiKey = requestedProvider !== 'ollama' || localProviderBlocked
  const resolvedBuildModel = localProviderBlocked
    ? DEFAULT_OPENAI_BUILD_MODEL
    : resolveBuildModel(requestedProvider)
  const selectedCloudApiProvider = getModelProviderName(resolvedBuildModel) === 'openrouter'
    ? 'openrouter'
    : 'openai'
  const selectedProviderLabel = t(getProviderLabelKey(resolvedBuildModel))

  const [apiKey, setApiKey] = useState('')
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const [walletConnection, setWalletConnection] = useState('')
  const [walletStatus, setWalletStatus] = useState<WalletStatus>({
    configured: false,
    connected: false,
    canUseSecureStorage: true,
    planBuildChargeReady: false,
    planBuildChargeReasonCode: 'wallet_not_connected'
  })
  const [walletBusy, setWalletBusy] = useState(false)
  const [walletNotice, setWalletNotice] = useState<'connected' | 'disconnected' | 'error' | null>(null)
  const [walletErrorMessage, setWalletErrorMessage] = useState('')
  const [buildProgress, setBuildProgress] = useState<PlanBuildProgress | null>(null)
  const [buildError, setBuildError] = useState('')
  const [buildNotice, setBuildNotice] = useState('')
  const [buildBusy, setBuildBusy] = useState(false)
  const [buildDone, setBuildDone] = useState(false)
  const onlineBuildRequiresCharge = shouldBuild && !localBuildIntent
  const buildChargeBlocked = onlineBuildRequiresCharge && walletStatus.planBuildChargeReady === false
  const buildChargeAmount = typeof walletStatus.planBuildChargeSats === 'number'
    ? formatCount(walletStatus.planBuildChargeSats)
    : null

  useEffect(() => {
    void fetch(`/api/settings/api-key?provider=${selectedCloudApiProvider}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(extractErrorMessage(await response.text()))
        }

        return response.json() as Promise<{ configured?: boolean }>
      })
      .then((payload) => {
        setApiKeyConfigured(Boolean(payload.configured))
      })
      .catch(() => {})

    void client.wallet.status()
      .then(setWalletStatus)
      .catch(() => {})
  }, [client, selectedCloudApiProvider])

  useEffect(() => {
    return client.plan.onBuildProgress((progress) => {
      setBuildProgress(progress)
    })
  }, [client])

  async function handleSaveApiKey(): Promise<void> {
    const nextKey = apiKey.trim()
    if (requiresApiKey && !nextKey && !apiKeyConfigured) {
      return
    }

    if (!shouldBuild) {
      setBuildBusy(true)
      setBuildError('')
      try {
        if (nextKey) {
          const response = await fetch('/api/settings/api-key', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ apiKey: nextKey, provider: selectedCloudApiProvider })
          })

          if (!response.ok) {
            throw new Error(extractErrorMessage(await response.text()))
          }
        }

        setApiKey('')
        setApiKeyConfigured(requiresApiKey || nextKey.length > 0)
        router.push('/')
      } catch (error) {
        setBuildError(toUserFacingErrorMessage(error, 'errors.save_failed'))
      } finally {
        setBuildBusy(false)
      }
      return
    }

    setBuildBusy(true)
    setBuildError('')
    setBuildNotice('')
    setBuildDone(false)

    try {
      if (nextKey) {
          const response = await fetch('/api/settings/api-key', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ apiKey: nextKey, provider: selectedCloudApiProvider })
          })

        if (!response.ok) {
          throw new Error(extractErrorMessage(await response.text()))
        }

        setApiKey('')
        setApiKeyConfigured(true)
      }

      const profileId = await client.profile.latest()
      if (!profileId) {
        setBuildError(t('errors.generic'))
        return
      }

      const provider = resolvedBuildModel

      const result = await client.plan.build(profileId, '', provider)
      if (result.success) {
        setBuildDone(true)
        setBuildNotice(t(getBuildRouteLabelKey(provider, result.fallbackUsed)))
        router.push('/')
      } else {
        setBuildError(result.error || t('errors.generic'))
      }
    } catch (error) {
      setBuildError(toUserFacingErrorMessage(error))
    } finally {
      setBuildBusy(false)
    }
  }

  async function handleConnectWallet(): Promise<void> {
    if (!walletConnection.trim()) {
      return
    }

    setWalletBusy(true)
    setWalletNotice(null)
    setWalletErrorMessage('')

    try {
      const result = await client.wallet.connect(walletConnection.trim())
      setWalletStatus(result.status)
      if (result.success) {
        setWalletNotice('connected')
        setWalletErrorMessage('')
      } else {
        setWalletNotice('error')
        setWalletErrorMessage(toUserFacingErrorMessage(result.error, 'settings.wallet_error'))
      }
    } catch (error) {
      setWalletNotice('error')
      setWalletErrorMessage(toUserFacingErrorMessage(error, 'settings.wallet_error'))
    } finally {
      setWalletBusy(false)
    }
  }

  async function handleDisconnectWallet(): Promise<void> {
    setWalletBusy(true)
    setWalletNotice(null)
    setWalletErrorMessage('')

    try {
      const result = await client.wallet.disconnect()
      if (result.success) {
        setWalletStatus({
          configured: false,
          connected: false,
          canUseSecureStorage: walletStatus.canUseSecureStorage,
          planBuildChargeSats: walletStatus.planBuildChargeSats,
          planBuildChargeReady: false,
          planBuildChargeReasonCode: 'wallet_not_connected'
        })
        setWalletConnection('')
        setWalletNotice('disconnected')
      } else {
        setWalletNotice('error')
        setWalletErrorMessage(t('settings.wallet_error'))
      }
    } catch (error) {
      setWalletNotice('error')
      setWalletErrorMessage(toUserFacingErrorMessage(error, 'settings.wallet_error'))
    } finally {
      setWalletBusy(false)
    }
  }

  const currentStage = buildProgress?.stage ?? buildStages[0]
  const currentStageIndex = Math.min(
    Math.max((buildProgress?.current ?? 1) - 1, 0),
    buildStages.length - 1
  )

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell app-shell--centered">
        <motion.div
          className="app-screen app-screen--card app-screen--compact"
          initial={{ opacity: 0, y: 16, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={settingsTransition}
        >
          <div className="app-actions" style={{ justifyContent: 'space-between', marginTop: 0 }}>
            <button className="app-button app-button--secondary" onClick={() => router.push('/')}>
              {t('ui.cancel')}
            </button>
            <button className="app-button app-button--secondary" onClick={() => router.push('/intake')}>
              {t('dashboard.redo_intake')}
            </button>
          </div>

          <section className="settings-section">
            <div className="settings-section__header">
              <span className="app-status app-status--eyebrow">{t('dashboard.actions_title')}</span>
              <h1 className="app-title">
                {localBuildIntent ? t('settings.local_build_title') : t('settings.apikey_title')}
              </h1>
              <p className="app-copy">
                {localBuildIntent ? t('settings.local_build_hint') : t('settings.apikey_hint')}
              </p>
              <p className="status-message status-message--neutral">
                {t('settings.build_route_hint', { provider: selectedProviderLabel })}
              </p>
              {onlineBuildRequiresCharge && buildChargeAmount && (
                <p className="status-message status-message--neutral">
                  {t('settings.build_charge_hint', { sats: buildChargeAmount })}
                </p>
              )}
              {onlineBuildRequiresCharge && walletStatus.planBuildChargeReady && (
                <p className="status-message status-message--success">{t('settings.build_charge_ready')}</p>
              )}
              {buildChargeBlocked && (
                <p className="status-message status-message--warning">
                  {getBuildChargeBlockedMessage(walletStatus.planBuildChargeReasonCode)}
                </p>
              )}
              {localProviderBlocked && (
                <p className="status-message status-message--warning">{t('builder.local_unavailable_deploy')}</p>
              )}
            </div>

            {!localBuildIntent && (
              <input
                className="app-input"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={t('settings.apikey_placeholder')}
                autoFocus
              />
            )}

            <div className="app-actions">
              <button
                className="app-button app-button--primary"
                onClick={() => {
                  void handleSaveApiKey()
                }}
                disabled={buildBusy || buildChargeBlocked || (requiresApiKey && !apiKey.trim() && !apiKeyConfigured)}
              >
                {buildBusy
                  ? t('builder.generating')
                  : shouldBuild
                    ? t('settings.apikey_confirm')
                    : t('ui.save')}
              </button>
              <button
                className="app-button app-button--secondary"
                onClick={() => {
                  router.push('/')
                }}
              >
                {t('ui.close')}
              </button>
            </div>
          </section>

          {shouldBuild && (
            <section className="dashboard-simulation" style={{ marginTop: '1.25rem' }}>
              <div className="dashboard-simulation__header">
                <div className="dashboard-simulation__heading">
                  <span className="dashboard-simulation__label">{t('builder.progress_title')}</span>
                  <span className="dashboard-simulation__hint">
                    {t(`builder.progress_steps.${currentStage}`)}
                  </span>
                  <span className="dashboard-simulation__hint">
                    {t('builder.progress_provider', {
                      provider: t(getProviderLabelKey(buildProgress?.provider ?? resolvedBuildModel))
                    })}
                  </span>
                </div>
              </div>
              <div className="dashboard-simulation__progress" role="status" aria-live="polite" aria-atomic="true">
                <div className="dashboard-simulation__progress-bar" aria-hidden="true">
                  <span
                    className={[
                      'dashboard-simulation__progress-fill',
                      `dashboard-simulation__progress-fill--${currentStageIndex + 1}`
                    ].join(' ')}
                  />
                </div>
                <strong className="dashboard-simulation__progress-title">
                  {t('builder.progress_current', {
                    current: buildProgress?.current ?? 1,
                    total: buildProgress?.total ?? buildStages.length
                  })}
                </strong>
                <span className="dashboard-simulation__progress-step">
                  {buildProgress?.chunk || t(`builder.progress_steps.${currentStage}`)}
                </span>
              </div>
              {buildDone && <p className="status-message status-message--success" role="status" aria-live="polite">{t('builder.done')}</p>}
              {buildNotice && <p className="status-message status-message--success" role="status" aria-live="polite">{buildNotice}</p>}
              {buildError && <p className="status-message status-message--warning" role="status" aria-live="polite">{buildError}</p>}
            </section>
          )}

          <hr className="dashboard-divider" />

          <section className="settings-section settings-section--wallet">
            <div className="settings-section__header">
              <span className="app-status app-status--eyebrow">{t('dashboard.wallet_title')}</span>
              <h2 className="app-title app-title--section">{t('settings.wallet_title')}</h2>
              <p className="app-copy">{t('settings.wallet_hint')}</p>
            </div>
            <input
              className="app-input"
              type="password"
              value={walletConnection}
              onChange={(event) => setWalletConnection(event.target.value)}
              placeholder={t('settings.wallet_placeholder')}
            />

            <div className="app-actions">
              <button
                className="app-button app-button--primary"
                onClick={() => {
                  void handleConnectWallet()
                }}
                disabled={!walletConnection.trim() || walletBusy}
              >
                {walletBusy ? t('settings.wallet_connecting') : t('settings.wallet_confirm')}
              </button>
              <button
                className="app-button app-button--secondary"
                onClick={() => {
                  void handleDisconnectWallet()
                }}
                disabled={walletBusy || !walletStatus.configured}
              >
                {t('settings.wallet_disconnect')}
              </button>
            </div>

            <p className="dashboard-wallet__meta">
              {walletStatus.connected
                ? t('settings.wallet_success')
                : t('dashboard.wallet_not_connected')}
            </p>
            {typeof walletStatus.balanceSats === 'number' && (
              <p className="dashboard-wallet__meta">
                {t('dashboard.wallet_balance', { sats: formatCount(walletStatus.balanceSats) })}
              </p>
            )}
            {typeof walletStatus.budgetSats === 'number' && (
              <p className="dashboard-wallet__meta">
                {t('dashboard.wallet_budget_remaining', {
                  sats: formatCount(Math.max(walletStatus.budgetSats - (walletStatus.budgetUsedSats ?? 0), 0))
                })}
              </p>
            )}
            {typeof walletStatus.planBuildChargeSats === 'number' && walletStatus.planBuildChargeSats > 0 && (
              <p className="dashboard-wallet__meta">
                {walletStatus.planBuildChargeReady
                  ? t('settings.build_charge_ready')
                  : getBuildChargeBlockedMessage(walletStatus.planBuildChargeReasonCode)}
              </p>
            )}
            {walletNotice && (
              <p className={[
                'status-message',
                walletNotice === 'error' ? 'status-message--warning' : 'status-message--success'
              ].join(' ')}
              >
                {walletNotice === 'connected' && t('settings.wallet_success')}
                {walletNotice === 'disconnected' && t('settings.wallet_disconnect_success')}
                {walletNotice === 'error' && (walletErrorMessage || t('settings.wallet_error'))}
              </p>
            )}
          </section>
        </motion.div>
      </div>
    </MotionConfig>
  )
}
