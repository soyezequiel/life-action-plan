'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { t } from '../src/i18n'
import { useLapClient } from '../src/lib/client/app-services'
import { extractErrorMessage, toUserFacingErrorMessage } from '../src/lib/client/error-utils'
import {
  createStoredApiKey,
  decryptStoredApiKey,
  deleteStoredApiKey,
  listStoredApiKeys,
  replaceStoredApiKeys,
  type StoredApiKey
} from '../src/lib/client/local-key-vault'
import { decryptBlob, deriveKeyFromPassword, encryptBlob, generateSalt } from '../src/lib/client/client-crypto'
import { downloadVaultBackup, uploadVaultBackup } from '../src/lib/client/vault-sync'
import type { DeploymentMode } from '../src/lib/env/deployment'
import {
  DEFAULT_OPENAI_BUILD_MODEL,
  getDefaultBuildModelForProvider,
  getProviderLabelKey,
  isLocalModel,
  supportsOllamaThinking,
  resolveBuildModel
} from '../src/lib/providers/provider-metadata'
import type { BuildUsagePreviewResult, PlanBuildProgress, WalletStatus } from '../src/shared/types/lap-api'
import styles from './SettingsPageContent.module.css'
import AccountSection from './settings/AccountSection'
import BuildSection from './settings/BuildSection'
import DebugPanel from './DebugPanel'
import LlmModeSelector from './settings/LlmModeSelector'
import OwnKeyManager from './settings/OwnKeyManager'
import ServiceAiSelector from './settings/ServiceAiSelector'
import type { AuthState, AuthUser, LlmMode, ServiceModelOption } from './settings/types'
import WalletSection from './settings/WalletSection'

const settingsTransition = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
  mass: 1
}

const initialWalletStatus: WalletStatus = {
  configured: false,
  connected: false,
  canUseSecureStorage: true,
  planBuildChargeReady: false,
  planBuildChargeReasonCode: 'wallet_not_connected'
}

const initialAuthState: AuthState = {
  loading: true,
  authenticated: false,
  user: null
}
const OLLAMA_THINKING_STORAGE_KEY = 'lap.ollama-thinking-enabled'

interface SettingsPageContentProps {
  deploymentMode: DeploymentMode
}

function resolveRequestedBuildResourceMode(input: {
  activeBuildModel: string
  llmMode: LlmMode
  localBuildIntent: boolean
}): 'auto' | 'backend' | 'user' | 'codex' {
  if (input.localBuildIntent) {
    return 'auto'
  }

  if (input.llmMode === 'own') {
    return 'user'
  }

  if (input.llmMode === 'codex') {
    return 'codex'
  }

  return isLocalModel(input.activeBuildModel) ? 'auto' : 'backend'
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
  const intent = searchParams?.get('intent')
  const requestedMode = searchParams?.get('mode')
  const requestedProvider = searchParams?.get('provider')
  const shouldBuild = intent === 'build'
  const localProviderBlocked = requestedProvider === 'ollama' && deploymentMode !== 'local'
  const localBuildIntent = shouldBuild && requestedProvider === 'ollama' && !localProviderBlocked
  const codexModeVisible = deploymentMode === 'local'
  const requestedBuildModel = localProviderBlocked
    ? DEFAULT_OPENAI_BUILD_MODEL
    : resolveBuildModel(requestedProvider)

  const [llmMode, setLlmMode] = useState<LlmMode>('service')
  const [advancedVisible, setAdvancedVisible] = useState(requestedMode === 'own')
  const [authState, setAuthState] = useState<AuthState>(initialAuthState)
  const [walletConnection, setWalletConnection] = useState('')
  const [walletStatus, setWalletStatus] = useState<WalletStatus>(initialWalletStatus)
  const [walletBusy, setWalletBusy] = useState(false)
  const [walletNotice, setWalletNotice] = useState('')
  const [walletError, setWalletError] = useState('')
  const [serviceModels, setServiceModels] = useState<ServiceModelOption[]>([])
  const [selectedServiceModelId, setSelectedServiceModelId] = useState('')
  const [localKeys, setLocalKeys] = useState<StoredApiKey[]>([])
  const [selectedLocalKeyId, setSelectedLocalKeyId] = useState('')
  const [protectionPassword, setProtectionPassword] = useState('')
  const [vaultBusy, setVaultBusy] = useState(false)
  const [vaultNotice, setVaultNotice] = useState('')
  const [vaultError, setVaultError] = useState('')
  const [buildProgress, setBuildProgress] = useState<PlanBuildProgress | null>(null)
  const [buildUsage, setBuildUsage] = useState<BuildUsagePreviewResult['usage'] | null>(null)
  const [buildUsageLoading, setBuildUsageLoading] = useState(false)
  const [buildBusy, setBuildBusy] = useState(false)
  const [buildNotice, setBuildNotice] = useState('')
  const [buildError, setBuildError] = useState('')
  const [debugPanelVisible, setDebugPanelVisible] = useState(false)
  const [ollamaThinkingEnabled, setOllamaThinkingEnabled] = useState(false)

  const selectedLocalKey = localKeys.find((record) => record.id === selectedLocalKeyId) ?? null
  const selectedServiceModel = serviceModels.find((model) => model.modelId === selectedServiceModelId) ?? null
  const activeBuildModel = localBuildIntent
    ? requestedBuildModel
    : llmMode === 'own'
      ? getDefaultBuildModelForProvider(selectedLocalKey?.provider ?? '') ?? requestedBuildModel
      : selectedServiceModel?.modelId ?? requestedBuildModel
  const selectedProviderLabel = localBuildIntent
    ? t(getProviderLabelKey(activeBuildModel))
    : llmMode === 'own'
      ? t('settings.llm_mode.own_key_title')
      : llmMode === 'codex'
        ? t('settings.llm_mode.codex_title')
      : t('settings.llm_mode.service_title')
  const requestedBuildResourceMode = resolveRequestedBuildResourceMode({
    activeBuildModel,
    llmMode,
    localBuildIntent
  })
  const canToggleOllamaThinking = supportsOllamaThinking(activeBuildModel)
  const requestedThinkingMode = canToggleOllamaThinking
    ? (ollamaThinkingEnabled ? 'enabled' : 'disabled')
    : undefined
  const canBuild = shouldBuild && (
    localBuildIntent
      ? buildUsage?.canExecute === true
      : llmMode === 'own'
        ? Boolean(selectedLocalKey && protectionPassword.trim() && buildUsage?.canExecute)
        : Boolean((selectedServiceModel || serviceModels.length > 0) && buildUsage?.canExecute)
  )

  useEffect(() => {
    void refreshAuthState()
  }, [])

  useEffect(() => {
    setLocalKeys(listStoredApiKeys())
    void client.wallet.status()
      .then(setWalletStatus)
      .catch(() => setWalletStatus(initialWalletStatus))
  }, [client])

  useEffect(() => {
    const storedValue = window.localStorage.getItem(OLLAMA_THINKING_STORAGE_KEY)
    setOllamaThinkingEnabled(storedValue === '1')
  }, [])

  useEffect(() => {
    window.localStorage.setItem(OLLAMA_THINKING_STORAGE_KEY, ollamaThinkingEnabled ? '1' : '0')
  }, [ollamaThinkingEnabled])

  useEffect(() => {
    let active = true

    void fetch('/api/models/available')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(extractErrorMessage(await response.text()))
        }

        return response.json() as Promise<{ models?: ServiceModelOption[] }>
      })
      .then((payload) => {
        if (!active) {
          return
        }

        setServiceModels(Array.isArray(payload.models) ? payload.models : [])
      })
      .catch(() => {
        if (!active) {
          return
        }

        setServiceModels([])
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (requestedMode === 'own') {
      setAdvancedVisible(true)
      setLlmMode('own')
      return
    }

    if (requestedMode === 'codex' && codexModeVisible) {
      setAdvancedVisible(true)
      setLlmMode('codex')
      return
    }

    if (requestedMode === 'service') {
      setLlmMode('service')
    }
  }, [codexModeVisible, requestedMode])

  useEffect(() => {
    if (localKeys.length > 0 && !selectedLocalKeyId) {
      setSelectedLocalKeyId(localKeys[0]?.id ?? '')
    }

    if (serviceModels.length > 0 && !selectedServiceModelId) {
      const providerMatch = serviceModels.find((model) => model.providerId === requestedProvider)
      setSelectedServiceModelId(providerMatch?.modelId ?? serviceModels[0]?.modelId ?? '')
    }

    if (localKeys.length > 0 && serviceModels.length === 0) {
      setAdvancedVisible(true)
      setLlmMode('own')
    }
  }, [localKeys, requestedProvider, selectedLocalKeyId, selectedServiceModelId, serviceModels])

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
    const params = new URLSearchParams({
      provider: activeBuildModel,
      resourceMode: requestedBuildResourceMode
    })

    if (!localBuildIntent) {
      params.set('hasUserApiKey', llmMode === 'own' && selectedLocalKey ? '1' : '0')
    }

    setBuildUsageLoading(true)

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
  }, [activeBuildModel, llmMode, localBuildIntent, requestedBuildResourceMode, selectedLocalKey, shouldBuild])

  async function refreshAuthState(nextUser?: AuthUser | null): Promise<void> {
    if (typeof nextUser !== 'undefined') {
      setAuthState({
        loading: false,
        authenticated: Boolean(nextUser),
        user: nextUser
      })
      return
    }

    setAuthState((current) => ({ ...current, loading: true }))

    try {
      const response = await fetch('/api/auth/me')
      const payload = await response.json() as { authenticated?: boolean; user?: AuthUser | null }

      setAuthState({
        loading: false,
        authenticated: Boolean(payload.authenticated && payload.user),
        user: payload.user ?? null
      })
    } catch {
      setAuthState({
        loading: false,
        authenticated: false,
        user: null
      })
    }
  }

  async function handleAddLocalKey(input: { provider: string; alias: string; value: string }): Promise<void> {
    setVaultBusy(true)
    setVaultNotice('')
    setVaultError('')

    try {
      const record = await createStoredApiKey({
        provider: input.provider,
        alias: input.alias,
        value: input.value,
        protectionPassword
      })
      const nextKeys = listStoredApiKeys()

      setLocalKeys(nextKeys)
      setSelectedLocalKeyId(record.id)
      setVaultNotice(t('ui.save'))
    } catch (error) {
      setVaultError(toUserFacingErrorMessage(error))
    } finally {
      setVaultBusy(false)
    }
  }

  function handleDeleteLocalKey(id: string): void {
    deleteStoredApiKey(id)
    const nextKeys = listStoredApiKeys()

    setLocalKeys(nextKeys)
    setSelectedLocalKeyId((current) => (current === id ? nextKeys[0]?.id ?? '' : current))
  }

  async function handleBackupVault(): Promise<void> {
    setVaultBusy(true)
    setVaultNotice('')
    setVaultError('')

    try {
      const salt = generateSalt()
      const key = await deriveKeyFromPassword(protectionPassword, salt)
      const encrypted = await encryptBlob(JSON.stringify(localKeys), key)

      await uploadVaultBackup(JSON.stringify(encrypted), salt)
      setVaultNotice(t('settings.own_keys.backup_toggle'))
    } catch (error) {
      setVaultError(toUserFacingErrorMessage(error))
    } finally {
      setVaultBusy(false)
    }
  }

  async function handleRestoreVault(): Promise<void> {
    setVaultBusy(true)
    setVaultNotice('')
    setVaultError('')

    try {
      const backup = await downloadVaultBackup()

      if (!backup) {
        setVaultNotice(t('settings.own_keys.restore_title'))
        return
      }

      const payload = JSON.parse(backup.encryptedBlob) as { iv?: string; ciphertext?: string }

      if (!payload.iv || !payload.ciphertext) {
        throw new Error('INVALID_VAULT_BACKUP')
      }

      const key = await deriveKeyFromPassword(protectionPassword, backup.salt)
      const decrypted = await decryptBlob(payload.iv, payload.ciphertext, key)
      const records = JSON.parse(decrypted) as StoredApiKey[]

      replaceStoredApiKeys(records)
      setLocalKeys(listStoredApiKeys())
      setSelectedLocalKeyId(records[0]?.id ?? '')
      setVaultNotice(t('settings.own_keys.restore_title'))
    } catch (error) {
      setVaultError(toUserFacingErrorMessage(error))
    } finally {
      setVaultBusy(false)
    }
  }

  async function handleConnectWallet(): Promise<void> {
    if (!walletConnection.trim()) {
      return
    }

    setWalletBusy(true)
    setWalletNotice('')
    setWalletError('')

    try {
      const result = await client.wallet.connect(walletConnection.trim())
      setWalletStatus(result.status)

      if (!result.success) {
        throw new Error(result.error || 'WALLET_CONNECT_FAILED')
      }

      setWalletNotice(t('settings.wallet_success'))
    } catch (error) {
      setWalletError(toUserFacingErrorMessage(error, 'settings.wallet_error'))
    } finally {
      setWalletBusy(false)
    }
  }

  async function handleDisconnectWallet(): Promise<void> {
    setWalletBusy(true)
    setWalletNotice('')
    setWalletError('')

    try {
      await client.wallet.disconnect()
      setWalletConnection('')
      setWalletStatus({
        ...walletStatus,
        configured: false,
        connected: false,
        planBuildChargeReady: false,
        planBuildChargeReasonCode: 'wallet_not_connected'
      })
      setWalletNotice(t('settings.wallet_disconnect_success'))
    } catch (error) {
      setWalletError(toUserFacingErrorMessage(error, 'settings.wallet_error'))
    } finally {
      setWalletBusy(false)
    }
  }

  async function handleBuild(): Promise<void> {
    setBuildBusy(true)
    setBuildNotice('')
    setBuildError('')

    try {
      const profileId = await client.profile.latest()

      if (!profileId) {
        throw new Error('PROFILE_NOT_FOUND')
      }

      const apiKey = llmMode === 'own' && selectedLocalKey
        ? await decryptStoredApiKey(selectedLocalKey, protectionPassword)
        : ''
      const provider = localBuildIntent ? requestedBuildModel : activeBuildModel
      const result = await client.plan.build(
        profileId,
        apiKey,
        provider,
        undefined,
        requestedBuildResourceMode,
        requestedThinkingMode
      )

      if (!result.success) {
        throw new Error(result.error || 'BUILD_FAILED')
      }

      setBuildNotice(t('builder.done'))
      router.push('/')
    } catch (error) {
      setBuildError(toUserFacingErrorMessage(error))
    } finally {
      setBuildBusy(false)
    }
  }

  function handleToggleAdvanced(): void {
    setAdvancedVisible((current) => {
      const next = !current

      if (!next) {
        setLlmMode('service')
      }

      return next
    })
  }

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
            <button className="app-button app-button--secondary" onClick={() => router.push('/flow?entry=redo-profile')}>
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

          {!localBuildIntent && (
            <LlmModeSelector
              value={llmMode}
              advancedVisible={advancedVisible}
              showCodexMode={codexModeVisible}
              onChange={setLlmMode}
              onToggleAdvanced={handleToggleAdvanced}
            />
          )}

          <div className={styles.grid}>
            <BuildSection
              title={localBuildIntent ? t('settings.local_build_title') : t('settings.apikey_title')}
              hint={localBuildIntent ? t('settings.local_build_hint') : t('settings.apikey_hint')}
              selectedProviderLabel={selectedProviderLabel}
              showThinkingControl={canToggleOllamaThinking}
              thinkingEnabled={ollamaThinkingEnabled}
              inspectorVisible={debugPanelVisible}
              shouldBuild={shouldBuild}
              localProviderBlocked={localProviderBlocked}
              buildBusy={buildBusy}
              buildUsageLoading={buildUsageLoading}
              canBuild={canBuild}
              buildNotice={buildNotice}
              buildError={buildError}
              buildProgress={buildProgress}
              buildUsage={buildUsage}
              showAdvancedDetails={advancedVisible || localBuildIntent}
              walletStatus={walletStatus}
              onThinkingChange={setOllamaThinkingEnabled}
              onToggleInspector={() => setDebugPanelVisible((visible) => !visible)}
              onBuild={handleBuild}
            />

            {!localBuildIntent && advancedVisible && llmMode === 'own' ? (
              <OwnKeyManager
                keys={localKeys}
                selectedKeyId={selectedLocalKeyId}
                protectionPassword={protectionPassword}
                isAuthenticated={authState.authenticated}
                notice={vaultNotice}
                error={vaultError}
                busy={vaultBusy}
                onSelectKey={setSelectedLocalKeyId}
                onProtectionPasswordChange={setProtectionPassword}
                onAddKey={handleAddLocalKey}
                onDeleteKey={handleDeleteLocalKey}
                onBackup={handleBackupVault}
                onRestore={handleRestoreVault}
              />
            ) : !localBuildIntent && advancedVisible ? (
              <ServiceAiSelector
                models={serviceModels}
                selectedModelId={selectedServiceModelId}
                onSelect={setSelectedServiceModelId}
              />
            ) : null}

            <WalletSection
              walletConnection={walletConnection}
              walletStatus={walletStatus}
              walletBusy={walletBusy}
              walletNotice={walletNotice}
              walletError={walletError}
              onWalletConnectionChange={setWalletConnection}
              onConnect={handleConnectWallet}
              onDisconnect={handleDisconnectWallet}
            />

            <AccountSection authState={authState} onAuthChange={refreshAuthState} />
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {debugPanelVisible && (
          <DebugPanel
            onClose={() => {
              setDebugPanelVisible(false)
            }}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}
