'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MotionConfig, motion } from 'framer-motion'
import { getCurrentLocale, t } from '../src/i18n'
import { useLapClient } from '../src/lib/client/app-services'
import { extractErrorMessage, toUserFacingErrorMessage } from '../src/lib/client/error-utils'
import { getResourceUsageDisplay } from '../src/lib/client/resource-usage-copy'
import type { DeploymentMode } from '../src/lib/env/deployment'
import { DEFAULT_CREDENTIAL_LABEL } from '../src/shared/schemas'
import {
  DEFAULT_OPENAI_BUILD_MODEL,
  getDefaultBuildModelForProvider,
  getBuildRouteLabelKey,
  getModelProviderName,
  getProviderLabelKey,
  resolveBuildModel
} from '../src/lib/providers/provider-metadata'
import type { BuildUsagePreviewResult, PlanBuildProgress, WalletStatus } from '../src/shared/types/lap-api'
import type { CredentialRecordView } from '../src/shared/types/credential-registry'
import type { ResourceUsageSummary } from '../src/shared/types/resource-usage'
import styles from './SettingsPageContent.module.css'

const buildStages: PlanBuildProgress['stage'][] = ['preparing', 'generating', 'validating', 'saving']
type CloudCredentialMode = 'backend' | 'user'
type CloudCredentialProvider = 'openai' | 'openrouter'

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

function getCredentialLabel(label: string): string {
  return label === DEFAULT_CREDENTIAL_LABEL
    ? t('settings.backend_credential_default_label')
    : label
}

function getCredentialDisplayName(credential: Pick<CredentialRecordView, 'providerId' | 'label'>): string {
  const providerLabel = t(getProviderLabelKey(getDefaultBuildModelForProvider(credential.providerId) ?? credential.providerId))
  const label = getCredentialLabel(credential.label)
  const defaultLabel = t('settings.backend_credential_default_label')

  return label === defaultLabel ? providerLabel : `${providerLabel} - ${label}`
}

function getCredentialStatusLabel(status: CredentialRecordView['status']): string {
  return t(`settings.backend_credential_status.${status}`)
}

function markBuildCredentialModeSelection(
  nextMode: CloudCredentialMode,
  setTouched: React.Dispatch<React.SetStateAction<boolean>>,
  setMode: React.Dispatch<React.SetStateAction<CloudCredentialMode>>
): void {
  setTouched(true)
  setMode(nextMode)
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
  const requestedBuildModel = localProviderBlocked
    ? DEFAULT_OPENAI_BUILD_MODEL
    : resolveBuildModel(requestedProvider)
  const selectedCloudApiProvider = getModelProviderName(requestedBuildModel) === 'openrouter'
    ? 'openrouter'
    : 'openai'

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
  const [buildUsage, setBuildUsage] = useState<ResourceUsageSummary | null>(null)
  const [buildUsageLoading, setBuildUsageLoading] = useState(false)
  const [buildCredentialMode, setBuildCredentialMode] = useState<CloudCredentialMode>('user')
  const [buildCredentialModeTouched, setBuildCredentialModeTouched] = useState(false)
  const [backendCredentials, setBackendCredentials] = useState<CredentialRecordView[]>([])
  const [backendCredentialsLoading, setBackendCredentialsLoading] = useState(false)
  const [selectedBackendCredentialId, setSelectedBackendCredentialId] = useState('')
  const [backendCredentialProvider, setBackendCredentialProvider] = useState<CloudCredentialProvider>(selectedCloudApiProvider)
  const [backendCredentialLabelInput, setBackendCredentialLabelInput] = useState('')
  const [backendCredentialSecretInput, setBackendCredentialSecretInput] = useState('')
  const [backendCredentialBusy, setBackendCredentialBusy] = useState(false)
  const [backendCredentialNotice, setBackendCredentialNotice] = useState<'saved' | 'error' | null>(null)
  const [backendCredentialError, setBackendCredentialError] = useState('')
  const [backendCredentialsRefreshNonce, setBackendCredentialsRefreshNonce] = useState(0)
  const buildUsageDisplay = getResourceUsageDisplay(buildUsage)
  const availableBackendCredentials = backendCredentials.filter((credential) => (
    credential.secretType === 'api-key'
    && credential.status === 'active'
    && (credential.providerId === 'openai' || credential.providerId === 'openrouter')
  ))
  const selectedBackendCredential = availableBackendCredentials.find((credential) => credential.id === selectedBackendCredentialId) ?? null
  const effectiveBuildModel = shouldBuild && !localBuildIntent && buildCredentialMode === 'backend' && selectedBackendCredential?.providerId
    ? getDefaultBuildModelForProvider(selectedBackendCredential.providerId) ?? requestedBuildModel
    : requestedBuildModel
  const selectedProviderLabel = t(getProviderLabelKey(effectiveBuildModel))
  const buildNeedsCharge = shouldBuild && buildUsage?.chargeable === true
  const buildExecutionBlocked = shouldBuild && buildUsage?.canExecute === false
  const buildChargeBlocked = buildNeedsCharge && walletStatus.planBuildChargeReady === false
  const buildChargeAmount = typeof buildUsage?.estimatedCostSats === 'number'
    ? formatCount(buildUsage.estimatedCostSats)
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
    let active = true

    setBackendCredentialsLoading(true)

    void fetch('/api/settings/credentials?owner=backend&secretType=api-key')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(extractErrorMessage(await response.text()))
        }

        return response.json() as Promise<{ credentials?: CredentialRecordView[] }>
      })
      .then((payload) => {
        if (!active) {
          return
        }

        setBackendCredentials(Array.isArray(payload.credentials) ? payload.credentials : [])
      })
      .catch(() => {
        if (!active) {
          return
        }

        setBackendCredentials([])
      })
      .finally(() => {
        if (active) {
          setBackendCredentialsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [backendCredentialsRefreshNonce])

  useEffect(() => {
    setBackendCredentialProvider(selectedCloudApiProvider)
  }, [selectedCloudApiProvider])

  useEffect(() => {
    setBuildCredentialModeTouched(false)
  }, [requestedProvider, shouldBuild, localBuildIntent])

  useEffect(() => {
    if (availableBackendCredentials.length === 0) {
      setSelectedBackendCredentialId('')

      if (buildCredentialMode === 'backend') {
        setBuildCredentialMode('user')
      }

      return
    }

    if (!buildCredentialModeTouched && !apiKeyConfigured && !apiKey.trim() && !localBuildIntent && shouldBuild) {
      setBuildCredentialMode('backend')
    }

    if (!availableBackendCredentials.some((credential) => credential.id === selectedBackendCredentialId)) {
      setSelectedBackendCredentialId(availableBackendCredentials[0]?.id ?? '')
    }
  }, [
    apiKey,
    apiKeyConfigured,
    availableBackendCredentials,
    buildCredentialMode,
    buildCredentialModeTouched,
    localBuildIntent,
    selectedBackendCredentialId,
    shouldBuild
  ])

  useEffect(() => {
    return client.plan.onBuildProgress((progress) => {
      setBuildProgress(progress)
    })
  }, [client])

  useEffect(() => {
    if (!shouldBuild) {
      setBuildUsage(null)
      setBuildUsageLoading(false)
      return
    }

    let active = true
    const hasUserApiKey = buildCredentialMode === 'user' && (apiKey.trim().length > 0 || apiKeyConfigured)
    const previewBackendCredentialId = buildCredentialMode === 'backend'
      ? selectedBackendCredentialId.trim()
      : ''

    if (!localBuildIntent && buildCredentialMode === 'backend' && !previewBackendCredentialId) {
      setBuildUsage(null)
      setBuildUsageLoading(false)
      return
    }

    setBuildUsageLoading(true)

    const params = new URLSearchParams({
      provider: effectiveBuildModel,
      hasUserApiKey: hasUserApiKey ? '1' : '0',
      resourceMode: localBuildIntent ? 'auto' : buildCredentialMode
    })

    if (previewBackendCredentialId) {
      params.set('backendCredentialId', previewBackendCredentialId)
    }

    void fetch(`/api/settings/build-preview?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(extractErrorMessage(await response.text()))
        }

        return response.json() as Promise<BuildUsagePreviewResult>
      })
      .then((payload) => {
        if (!active) {
          return
        }

        setBuildUsage(payload.usage)
      })
      .catch(() => {
        if (!active) {
          return
        }

        setBuildUsage(null)
      })
      .finally(() => {
        if (active) {
          setBuildUsageLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [apiKey, apiKeyConfigured, buildCredentialMode, effectiveBuildModel, localBuildIntent, selectedBackendCredentialId, shouldBuild])

  async function handleSaveApiKey(): Promise<void> {
    const nextKey = apiKey.trim()
    const usingBackendCredential = shouldBuild && buildCredentialMode === 'backend' && !localBuildIntent

    if (!usingBackendCredential && requiresApiKey && !nextKey && !apiKeyConfigured) {
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

      if (usingBackendCredential && !selectedBackendCredentialId.trim()) {
        setBuildError(t('settings.backend_credential_missing_for_build'))
        return
      }

      const provider = effectiveBuildModel
      const backendCredentialId = usingBackendCredential ? selectedBackendCredentialId.trim() : undefined
      const result = await client.plan.build(profileId, '', provider, backendCredentialId, localBuildIntent ? 'auto' : buildCredentialMode)
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

  async function handleSaveBackendCredential(): Promise<void> {
    const nextSecret = backendCredentialSecretInput.trim()
    const nextLabel = backendCredentialLabelInput.trim() || DEFAULT_CREDENTIAL_LABEL

    if (!nextSecret) {
      return
    }

    setBackendCredentialBusy(true)
    setBackendCredentialNotice(null)
    setBackendCredentialError('')

    try {
      const saveResponse = await fetch('/api/settings/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          owner: 'backend',
          providerId: backendCredentialProvider,
          secretType: 'api-key',
          label: nextLabel,
          secretValue: nextSecret
        })
      })

      if (!saveResponse.ok) {
        throw new Error(extractErrorMessage(await saveResponse.text()))
      }

      const payload = await saveResponse.json() as { credential?: CredentialRecordView }
      const credentialId = payload.credential?.id

      if (credentialId) {
        await fetch(`/api/settings/credentials/${encodeURIComponent(credentialId)}/validate`, {
          method: 'POST'
        }).catch(() => null)
      }

      setBackendCredentialSecretInput('')
      setBackendCredentialLabelInput('')
      setBackendCredentialNotice('saved')
      setBackendCredentialsRefreshNonce((current) => current + 1)
    } catch (error) {
      setBackendCredentialNotice('error')
      setBackendCredentialError(toUserFacingErrorMessage(error, 'settings.backend_credential_error'))
    } finally {
      setBackendCredentialBusy(false)
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
          className={styles.settingsFrame}
          initial={{ opacity: 0, y: 16, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={settingsTransition}
        >
          <div className={styles.topbar}>
            <button className="app-button app-button--secondary" onClick={() => router.push('/')}>
              {t('ui.cancel')}
            </button>
            <button className="app-button app-button--secondary" onClick={() => router.push('/intake')}>
              {t('dashboard.redo_intake')}
            </button>
          </div>

          <div className={styles.hero}>
            <div className={styles.heroCopy}>
              <span className="app-status app-status--eyebrow">{t('dashboard.actions_title')}</span>
              <h1 className="app-title">
                {localBuildIntent ? t('settings.local_build_title') : t('settings.apikey_title')}
              </h1>
              <p className="app-copy">
                {localBuildIntent ? t('settings.local_build_hint') : t('settings.apikey_hint')}
              </p>
            </div>
          </div>

          <div className={styles.grid}>
            <section className={`${styles.card} ${styles.primaryCard}`}>
              <div className="settings-section__header">
                <p className="status-message status-message--neutral">
                  {t('settings.build_route_hint', { provider: selectedProviderLabel })}
                </p>
                {shouldBuild && !localBuildIntent && availableBackendCredentials.length > 0 && (
                  <div className={styles.choiceGroup}>
                    <span className="app-status app-status--eyebrow">{t('settings.build_resource_choice_title')}</span>
                    <div className={styles.choiceList}>
                      <label className={styles.choiceOption}>
                        <input
                          type="radio"
                          name="build-credential-mode"
                          checked={buildCredentialMode === 'backend'}
                          onClick={() => markBuildCredentialModeSelection('backend', setBuildCredentialModeTouched, setBuildCredentialMode)}
                          onChange={() => markBuildCredentialModeSelection('backend', setBuildCredentialModeTouched, setBuildCredentialMode)}
                        />
                        <span>{t('settings.build_resource_choice_backend')}</span>
                      </label>
                      <label className={styles.choiceOption}>
                        <input
                          type="radio"
                          name="build-credential-mode"
                          checked={buildCredentialMode === 'user'}
                          onClick={() => markBuildCredentialModeSelection('user', setBuildCredentialModeTouched, setBuildCredentialMode)}
                          onChange={() => markBuildCredentialModeSelection('user', setBuildCredentialModeTouched, setBuildCredentialMode)}
                        />
                        <span>{t('settings.build_resource_choice_user')}</span>
                      </label>
                    </div>
                  </div>
                )}
                {shouldBuild && !localBuildIntent && buildCredentialMode === 'backend' && (
                  <>
                    <select
                      className="app-input"
                      value={selectedBackendCredentialId}
                      onChange={(event) => setSelectedBackendCredentialId(event.target.value)}
                      disabled={availableBackendCredentials.length === 0}
                    >
                      {availableBackendCredentials.length === 0 && (
                        <option value="">{t('settings.backend_credential_select_empty')}</option>
                      )}
                      {availableBackendCredentials.map((credential) => (
                        <option key={credential.id} value={credential.id}>
                          {getCredentialDisplayName(credential)}
                        </option>
                      ))}
                    </select>
                    {selectedBackendCredential && (
                      <p className="status-message status-message--neutral">
                        {t('settings.backend_credential_selected', {
                          name: getCredentialDisplayName(selectedBackendCredential)
                        })}
                      </p>
                    )}
                  </>
                )}
                {shouldBuild && buildUsageDisplay && (
                  <>
                    <p className="status-message status-message--neutral">
                      {`${buildUsageDisplay.label}: ${buildUsageDisplay.detail}`}
                    </p>
                    <p className="status-message status-message--neutral">
                      {buildUsageDisplay.source}
                    </p>
                    <p
                      className={[
                        'status-message',
                        buildUsageDisplay.tone === 'warning'
                          ? 'status-message--warning'
                          : buildUsageDisplay.tone === 'success'
                            ? 'status-message--success'
                            : 'status-message--neutral'
                      ].join(' ')}
                    >
                      {buildUsageDisplay.billing}
                    </p>
                  </>
                )}
                {buildNeedsCharge && buildChargeAmount && (
                  <p className="status-message status-message--neutral">
                    {t('settings.build_charge_hint', { sats: buildChargeAmount })}
                  </p>
                )}
                {buildNeedsCharge && walletStatus.planBuildChargeReady && (
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

              {!localBuildIntent && (!shouldBuild || buildCredentialMode === 'user') && (
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
                  disabled={
                    buildBusy
                    || buildUsageLoading
                    || buildChargeBlocked
                    || (shouldBuild && (!buildUsage || buildExecutionBlocked))
                    || (shouldBuild && buildCredentialMode === 'backend' && !selectedBackendCredentialId.trim())
                    || (!shouldBuild && requiresApiKey && !apiKey.trim() && !apiKeyConfigured)
                  }
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
                <section className="dashboard-simulation">
                  <div className="dashboard-simulation__header">
                    <div className="dashboard-simulation__heading">
                      <span className="dashboard-simulation__label">{t('builder.progress_title')}</span>
                      <span className="dashboard-simulation__hint">
                        {t(`builder.progress_steps.${currentStage}`)}
                      </span>
                      <span className="dashboard-simulation__hint">
                        {t('builder.progress_provider', {
                          provider: t(getProviderLabelKey(buildProgress?.provider ?? effectiveBuildModel))
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
            </section>

            <section className={`${styles.card} ${styles.secondaryCard}`}>
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

          <section className={`${styles.card} ${styles.fullWidthCard}`}>
            <div className="settings-section__header">
              <span className="app-status app-status--eyebrow">{t('settings.backend_credentials_eyebrow')}</span>
              <h2 className="app-title app-title--section">{t('settings.backend_credentials_title')}</h2>
              <p className="app-copy">{t('settings.backend_credentials_hint')}</p>
            </div>

            <div className={styles.credentialFormGrid}>
              <select
                className="app-input"
                value={backendCredentialProvider}
                onChange={(event) => setBackendCredentialProvider(event.target.value as CloudCredentialProvider)}
              >
                <option value="openai">{t('builder.provider_openai')}</option>
                <option value="openrouter">{t('builder.provider_openrouter')}</option>
              </select>
              <input
                className="app-input"
                type="text"
                value={backendCredentialLabelInput}
                onChange={(event) => setBackendCredentialLabelInput(event.target.value)}
                placeholder={t('settings.backend_credential_label_placeholder')}
              />
              <input
                className="app-input"
                type="password"
                value={backendCredentialSecretInput}
                onChange={(event) => setBackendCredentialSecretInput(event.target.value)}
                placeholder={t('settings.backend_credential_key_placeholder')}
              />
            </div>

            <div className="app-actions">
              <button
                className="app-button app-button--primary"
                onClick={() => {
                  void handleSaveBackendCredential()
                }}
                disabled={!backendCredentialSecretInput.trim() || backendCredentialBusy}
              >
                {backendCredentialBusy ? t('settings.backend_credential_saving') : t('settings.backend_credential_save')}
              </button>
            </div>

            {backendCredentialNotice === 'saved' && (
              <p className="status-message status-message--success">{t('settings.backend_credential_saved')}</p>
            )}
            {backendCredentialNotice === 'error' && (
              <p className="status-message status-message--warning">
                {backendCredentialError || t('settings.backend_credential_error')}
              </p>
            )}

            {backendCredentialsLoading ? (
              <p className="dashboard-wallet__meta">{t('ui.loading')}</p>
            ) : backendCredentials.length === 0 ? (
              <p className="dashboard-wallet__meta">{t('settings.backend_credentials_empty')}</p>
            ) : (
              <ul className={styles.credentialList}>
                {backendCredentials.map((credential) => (
                  <li key={credential.id} className={styles.credentialListItem}>
                    <strong>{getCredentialDisplayName(credential)}</strong>
                    <span>{getCredentialStatusLabel(credential.status)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          </div>
        </motion.div>
      </div>
    </MotionConfig>
  )
}
