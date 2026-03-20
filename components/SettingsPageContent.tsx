'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MotionConfig, motion } from 'framer-motion'
import { t } from '../src/i18n'
import { useLapClient } from '../src/lib/client/app-services'
import { extractErrorMessage, toUserFacingErrorMessage } from '../src/lib/client/error-utils'
import type { DeploymentMode } from '../src/lib/env/deployment'
import type { PlanBuildProgress } from '../src/shared/types/lap-api'

const buildStages: PlanBuildProgress['stage'][] = ['preparing', 'generating', 'validating', 'saving']

const settingsTransition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as const
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
  const requiresApiKey = requestedProvider !== 'ollama' || localProviderBlocked

  const [apiKey, setApiKey] = useState('')
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const [walletConnection, setWalletConnection] = useState('')
  const [walletStatus, setWalletStatus] = useState({
    configured: false,
    connected: false,
    canUseSecureStorage: true
  })
  const [walletBusy, setWalletBusy] = useState(false)
  const [walletNotice, setWalletNotice] = useState<'connected' | 'disconnected' | 'error' | null>(null)
  const [buildProgress, setBuildProgress] = useState<PlanBuildProgress | null>(null)
  const [buildError, setBuildError] = useState('')
  const [buildNotice, setBuildNotice] = useState('')
  const [buildBusy, setBuildBusy] = useState(false)
  const [buildDone, setBuildDone] = useState(false)

  useEffect(() => {
    void fetch('/api/settings/api-key')
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
  }, [client])

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
            body: JSON.stringify({ apiKey: nextKey })
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
          body: JSON.stringify({ apiKey: nextKey })
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

      const provider = localProviderBlocked
        ? 'openai:gpt-4o-mini'
        : requestedProvider === 'ollama'
          ? 'ollama:qwen3:8b'
          : 'openai:gpt-4o-mini'

      const result = await client.plan.build(profileId, '', provider)
      if (result.success) {
        setBuildDone(true)
        if (result.fallbackUsed) {
          setBuildNotice(t('builder.route_fallback_done'))
        } else if (provider.startsWith('ollama:')) {
          setBuildNotice(t('builder.route_local_done'))
        } else {
          setBuildNotice(t('builder.route_online_done'))
        }
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

    try {
      const result = await client.wallet.connect(walletConnection.trim())
      setWalletStatus(result.status)
      setWalletNotice(result.success ? 'connected' : 'error')
    } catch {
      setWalletNotice('error')
    } finally {
      setWalletBusy(false)
    }
  }

  async function handleDisconnectWallet(): Promise<void> {
    setWalletBusy(true)
    setWalletNotice(null)

    try {
      const result = await client.wallet.disconnect()
      if (result.success) {
        setWalletStatus({
          configured: false,
          connected: false,
          canUseSecureStorage: walletStatus.canUseSecureStorage
        })
        setWalletConnection('')
        setWalletNotice('disconnected')
      } else {
        setWalletNotice('error')
      }
    } catch {
      setWalletNotice('error')
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

          <h1 className="app-title">{t('settings.apikey_title')}</h1>
          <p className="app-copy">{t('settings.apikey_hint')}</p>
          {localProviderBlocked && (
            <p className="status-message status-message--warning">{t('builder.local_unavailable_deploy')}</p>
          )}
          <input
            className="app-input"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={t('settings.apikey_placeholder')}
            autoFocus
          />

          <div className="app-actions">
            <button
              className="app-button app-button--primary"
              onClick={() => {
                void handleSaveApiKey()
              }}
              disabled={buildBusy || (requiresApiKey && !apiKey.trim() && !apiKeyConfigured)}
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

          {shouldBuild && (
            <section className="dashboard-simulation" style={{ marginTop: '1.25rem' }}>
              <div className="dashboard-simulation__header">
                <div className="dashboard-simulation__heading">
                  <span className="dashboard-simulation__label">{t('builder.progress_title')}</span>
                  <span className="dashboard-simulation__hint">
                    {t(`builder.progress_steps.${currentStage}`)}
                  </span>
                </div>
              </div>
              <div className="dashboard-simulation__progress">
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
              {buildDone && <p className="status-message status-message--success">{t('builder.done')}</p>}
              {buildNotice && <p className="status-message status-message--success">{buildNotice}</p>}
              {buildError && <p className="status-message status-message--warning">{buildError}</p>}
            </section>
          )}

          <hr className="dashboard-divider" />

          <h2 className="app-title app-title--section">{t('settings.wallet_title')}</h2>
          <p className="app-copy">{t('settings.wallet_hint')}</p>
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
          {walletNotice && (
            <p className={[
              'status-message',
              walletNotice === 'error' ? 'status-message--warning' : 'status-message--success'
            ].join(' ')}
            >
              {walletNotice === 'connected' && t('settings.wallet_success')}
              {walletNotice === 'disconnected' && t('settings.wallet_disconnect_success')}
              {walletNotice === 'error' && t('settings.wallet_error')}
            </p>
          )}
        </motion.div>
      </div>
    </MotionConfig>
  )
}
