'use client'

import React, { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { DateTime } from 'luxon'
import { useRouter } from 'next/navigation'
import { getCurrentLocale, t } from '../src/i18n'
import { useLapClient } from '../src/lib/client/app-services'
import { toUserFacingErrorMessage } from '../src/lib/client/error-utils'
import type {
  CostSummary,
  PlanBuildProgress,
  PlanRow,
  PlanSimulationProgress,
  PlanSimulationSnapshot,
  ProgressRow,
  SimulationMode,
  SimulationFinding,
  StreakResult,
  WalletStatus
} from '../src/shared/types/lap-api'
import type { Perfil } from '../src/shared/schemas/perfil'
import DebugPanel from './DebugPanel'

const viewTransition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as const
}

const buildStages: PlanBuildProgress['stage'][] = ['preparing', 'generating', 'validating', 'saving']
const simulationStages: PlanSimulationProgress['stage'][] = ['schedule', 'work', 'load', 'summary']

interface PlanManifestMeta {
  fallbackUsed?: boolean
  ultimoModeloUsado?: string
  ultimaSimulacion?: PlanSimulationSnapshot | null
}

function parseManifestMeta(manifest: string): PlanManifestMeta {
  try {
    const parsed = JSON.parse(manifest) as PlanManifestMeta
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function parseProfileName(profile: Perfil | null): string {
  return profile?.participantes[0]?.datosPersonales?.nombre ?? ''
}

function formatSimulationDate(value: string): string {
  const date = DateTime.fromISO(value).setLocale(getCurrentLocale())
  return date.isValid ? date.toFormat('dd/LL HH:mm') : value
}

function renderFindingTitle(finding: SimulationFinding): string {
  return t(`simulation.findings.${finding.code}.title`, finding.params)
}

function renderFindingDetail(finding: SimulationFinding): string {
  return t(`simulation.findings.${finding.code}.detail`, finding.params)
}

function parseTaskMeta(notas: string | null): { hora?: string; duracion?: number; categoria?: string } {
  if (!notas) {
    return {}
  }

  try {
    return JSON.parse(notas) as { hora?: string; duracion?: number; categoria?: string }
  } catch {
    return {}
  }
}

type BuildRouteStatus = 'online' | 'local' | 'fallback' | 'unknown'

function getBuildRouteStatus(modelId: string | undefined, fallbackUsed: boolean | undefined): BuildRouteStatus {
  if (fallbackUsed) {
    return 'fallback'
  }

  if (modelId?.startsWith('ollama:')) {
    return 'local'
  }

  if (modelId?.startsWith('openai:')) {
    return 'online'
  }

  return 'unknown'
}

function getBuildRouteLabel(modelId: string | undefined, fallbackUsed = false): string {
  const routeStatus = getBuildRouteStatus(modelId, fallbackUsed)

  if (routeStatus === 'fallback') {
    return t('builder.route_fallback_done')
  }

  if (routeStatus === 'local') {
    return t('builder.route_local_done')
  }

  if (routeStatus === 'online') {
    return t('builder.route_online_done')
  }

  return ''
}

function getBuildProviderLabel(modelId: string | undefined): string {
  if (modelId?.startsWith('ollama:')) {
    return t('builder.provider_local')
  }

  return t('builder.provider_online')
}

export default function Dashboard(): JSX.Element {
  const client = useLapClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [profileName, setProfileName] = useState('')
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [tasks, setTasks] = useState<ProgressRow[]>([])
  const [streak, setStreak] = useState<StreakResult>({ current: 0, best: 0 })
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null)
  const [walletStatus, setWalletStatus] = useState<WalletStatus>({
    configured: false,
    connected: false,
    canUseSecureStorage: true
  })
  const [buildError, setBuildError] = useState('')
  const [buildNotice, setBuildNotice] = useState('')
  const [buildProgress, setBuildProgress] = useState<PlanBuildProgress | null>(null)
  const [isBuilding, setIsBuilding] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState<'success' | 'error' | null>(null)
  const [walletConnection, setWalletConnection] = useState('')
  const [isWalletEditorOpen, setIsWalletEditorOpen] = useState(false)
  const [isWalletSaving, setIsWalletSaving] = useState(false)
  const [walletNotice, setWalletNotice] = useState<'connected' | 'disconnected' | 'error' | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [simulationError, setSimulationError] = useState('')
  const [simulationMode, setSimulationMode] = useState<SimulationMode>('interactive')
  const [simulationProgress, setSimulationProgress] = useState<PlanSimulationProgress | null>(null)
  const [debugPanelVisible, setDebugPanelVisible] = useState(false)
  const hasPlan = plans.length > 0
  const latestPlan = hasPlan ? plans[plans.length - 1] : null
  const latestPlanMeta = latestPlan ? parseManifestMeta(latestPlan.manifest) : {}
  const latestSimulation = latestPlanMeta.ultimaSimulacion ?? null
  const latestBuildRouteLabel = latestPlan
    ? getBuildRouteLabel(latestPlanMeta.ultimoModeloUsado, latestPlanMeta.fallbackUsed)
    : ''
  const simulationStageIndex = Math.min(
    Math.max((simulationProgress?.current ?? 1) - 1, 0),
    simulationStages.length - 1
  )
  const activeSimulationStageKey = simulationProgress?.stage ?? simulationStages[0]

  useEffect(() => {
    let active = true

    async function loadData(): Promise<void> {
      setLoading(true)

      try {
        const [nextProfileId, debugStatus] = await Promise.all([
          client.profile.latest().catch(() => null),
          client.debug.status().catch(() => ({ enabled: false, panelVisible: false }))
        ])

        if (!active) {
          return
        }

        setDebugPanelVisible(debugStatus.panelVisible)

        if (!nextProfileId) {
          setProfileId(null)
          setProfileName('')
          setPlans([])
          setTasks([])
          setStreak({ current: 0, best: 0 })
          setCostSummary(null)
          setWalletStatus({
            configured: false,
            connected: false,
            canUseSecureStorage: true
          })
          return
        }

        const nextProfile = await client.profile.get(nextProfileId)
        if (!active) {
          return
        }

        setProfileId(nextProfileId)
        setProfileName(parseProfileName(nextProfile))

        const nextPlans = await client.plan.list(nextProfileId)
        if (!active) {
          return
        }

        setPlans(nextPlans)
        const nextWalletStatus = await client.wallet.status().catch(() => ({
          configured: false,
          connected: false,
          canUseSecureStorage: true
        }))
        if (!active) {
          return
        }

        setWalletStatus(nextWalletStatus)

        if (nextPlans.length > 0 && nextProfile) {
          const nextPlan = nextPlans[nextPlans.length - 1]
          const timezone = nextProfile.participantes[0]?.datosPersonales?.ubicacion?.zonaHoraria
          const today = timezone
            ? DateTime.now().setZone(timezone).toISODate() ?? DateTime.now().toISODate() ?? ''
            : DateTime.now().toISODate() ?? ''

          const [progressList, streakResult] = await Promise.all([
            client.progress.list(nextPlan.id, today),
            client.streak.get(nextPlan.id)
          ])

          if (!active) {
            return
          }

          setTasks(progressList)
          setStreak(streakResult)

          try {
            setCostSummary(await client.cost.summary(nextPlan.id))
          } catch {
            setCostSummary(null)
          }
        } else {
          setTasks([])
          setStreak({ current: 0, best: 0 })
          setCostSummary(null)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadData()

    return () => {
      active = false
    }
  }, [client, refreshNonce])

  useEffect(() => {
    return client.plan.onBuildProgress((progress) => {
      if (!profileId || progress.profileId !== profileId) {
        return
      }

      setBuildProgress(progress)
      setIsBuilding(true)
    })
  }, [client, profileId])

  useEffect(() => {
    return client.plan.onSimulationProgress((progress) => {
      if (!latestPlan?.id || progress.planId !== latestPlan.id) {
        return
      }

      setSimulationProgress(progress)
      setIsSimulating(true)
    })
  }, [client, latestPlan?.id])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isToggleShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'd'

      if (!isToggleShortcut) {
        return
      }

      event.preventDefault()
      setDebugPanelVisible((current) => !current)
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  function reloadData(): void {
    setRefreshNonce((current) => current + 1)
  }

  async function handleToggle(taskId: string): Promise<void> {
    const toggledTask = tasks.find((task) => task.id === taskId)
    const result = await client.progress.toggle(taskId)

    if (result.success) {
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, completado: result.completado } : task))
      )

      if (toggledTask?.tipo === 'habito' && latestPlan) {
        const nextStreak = await client.streak.get(latestPlan.id)
        setStreak(nextStreak)
      }
    }
  }

  async function handleExportCalendar(): Promise<void> {
    if (!latestPlan) {
      return
    }

    setIsExporting(true)
    setExportStatus(null)

    try {
      const result = await client.plan.exportCalendar(latestPlan.id)
      setExportStatus(result.success ? 'success' : 'error')
    } catch {
      setExportStatus('error')
    } finally {
      setIsExporting(false)
    }
  }

  async function handleSimulatePlan(): Promise<void> {
    if (!latestPlan) {
      return
    }

    setIsSimulating(true)
    setSimulationError('')
    setSimulationProgress(null)

    try {
      const result = await client.plan.simulate(latestPlan.id, simulationMode)
      if (result.success) {
        reloadData()
      } else {
        setSimulationError(result.error || t('errors.generic'))
      }
    } catch (error) {
      setSimulationError(toUserFacingErrorMessage(error))
    } finally {
      setIsSimulating(false)
      setSimulationProgress(null)
    }
  }

  async function handleBuildPlan(provider: 'openai' | 'ollama'): Promise<void> {
    if (!profileId) {
      return
    }

    if (provider === 'openai') {
      router.push('/settings?intent=build&provider=openai')
      return
    }

    setIsBuilding(true)
    setBuildError('')
    setBuildNotice('')
    setBuildProgress({
      profileId,
      provider: 'ollama:qwen3:8b',
      stage: 'preparing',
      current: 1,
      total: buildStages.length,
      charCount: 0
    })

    try {
      const result = await client.plan.build(profileId, '', 'ollama:qwen3:8b')

      if (result.success) {
        setBuildNotice(getBuildRouteLabel('ollama:qwen3:8b', result.fallbackUsed))
        reloadData()
      } else {
        setBuildError(result.error || t('errors.generic'))
      }
    } catch (error) {
      setBuildError(toUserFacingErrorMessage(error))
    } finally {
      setIsBuilding(false)
      setBuildProgress(null)
    }
  }

  async function handleConnectWallet(): Promise<void> {
    if (!walletConnection.trim()) {
      return
    }

    setIsWalletSaving(true)
    setWalletNotice(null)

    try {
      const result = await client.wallet.connect(walletConnection.trim())
      if (result.success) {
        setWalletStatus(result.status)
        setWalletConnection('')
        setIsWalletEditorOpen(false)
        setWalletNotice('connected')
      } else {
        setWalletStatus(result.status)
        setWalletNotice('error')
      }
    } catch {
      setWalletNotice('error')
    } finally {
      setIsWalletSaving(false)
    }
  }

  async function handleDisconnectWallet(): Promise<void> {
    setIsWalletSaving(true)
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
        setIsWalletEditorOpen(false)
        setWalletNotice('disconnected')
      } else {
        setWalletNotice('error')
      }
    } catch {
      setWalletNotice('error')
    } finally {
      setIsWalletSaving(false)
    }
  }

  function renderWalletCard(): JSX.Element {
    const walletLabel = walletStatus.connected
      ? t('dashboard.wallet_ready')
      : t('dashboard.wallet_not_connected')
    const numberFormatter = new Intl.NumberFormat(getCurrentLocale())
    const formattedWalletBalance = typeof walletStatus.balanceSats === 'number'
      ? numberFormatter.format(walletStatus.balanceSats)
      : null

    return (
      <div className="dashboard-wallet">
        <span className="dashboard-wallet__label">{t('dashboard.wallet_title')}</span>
        <strong className="dashboard-wallet__value">{walletLabel}</strong>
        {formattedWalletBalance && (
          <span className="dashboard-wallet__meta">
            {t('dashboard.wallet_balance', { sats: formattedWalletBalance })}
          </span>
        )}
        {!walletStatus.canUseSecureStorage && (
          <p className="status-message status-message--warning">{t('settings.wallet_unavailable')}</p>
        )}
        {walletNotice && (
          <p
            className={[
              'status-message',
              walletNotice === 'error' ? 'status-message--warning' : 'status-message--success'
            ].join(' ')}
          >
            {walletNotice === 'connected' && t('settings.wallet_success')}
            {walletNotice === 'disconnected' && t('settings.wallet_disconnect_success')}
            {walletNotice === 'error' && t('settings.wallet_error')}
          </p>
        )}

        {walletStatus.canUseSecureStorage && (
          <>
            {isWalletEditorOpen ? (
              <div className="dashboard-wallet__form">
                <p className="dashboard-wallet__hint">{t('settings.wallet_hint')}</p>
                <input
                  className="app-input dashboard-wallet__input"
                  type="password"
                  value={walletConnection}
                  onChange={(event) => setWalletConnection(event.target.value)}
                  placeholder={t('settings.wallet_placeholder')}
                  autoFocus
                />
                <div className="dashboard-actions dashboard-actions--compact">
                  <button
                    className="app-button app-button--primary"
                    onClick={() => {
                      void handleConnectWallet()
                    }}
                    disabled={!walletConnection.trim() || isWalletSaving}
                  >
                    {isWalletSaving ? t('settings.wallet_connecting') : t('settings.wallet_confirm')}
                  </button>
                  <button
                    className="app-button app-button--secondary"
                    onClick={() => {
                      setIsWalletEditorOpen(false)
                      setWalletConnection('')
                    }}
                    disabled={isWalletSaving}
                  >
                    {t('ui.cancel')}
                  </button>
                  {walletStatus.configured && (
                    <button
                      className="app-button app-button--secondary"
                      onClick={() => {
                        void handleDisconnectWallet()
                      }}
                      disabled={isWalletSaving}
                    >
                      {t('settings.wallet_disconnect')}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="dashboard-actions dashboard-actions--compact">
                <button
                  className="app-button app-button--secondary"
                  onClick={() => {
                    setIsWalletEditorOpen(true)
                    setWalletNotice(null)
                  }}
                >
                  {walletStatus.connected ? t('dashboard.wallet_change') : t('dashboard.wallet_connect')}
                </button>
                {walletStatus.configured && (
                  <button
                    className="app-button app-button--secondary"
                    onClick={() => {
                      void handleDisconnectWallet()
                    }}
                    disabled={isWalletSaving}
                  >
                    {t('settings.wallet_disconnect')}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  function renderCostCard(): JSX.Element {
    const numberFormatter = new Intl.NumberFormat(getCurrentLocale())
    const hasCost = Boolean(costSummary && (costSummary.tokensInput > 0 || costSummary.tokensOutput > 0))

    return (
      <div className="dashboard-cost">
        <span className="dashboard-cost__label">{t('dashboard.cost_title')}</span>
        {hasCost && costSummary ? (
          <>
            <strong className="dashboard-cost__value">
              {t('dashboard.cost_sats', { sats: numberFormatter.format(costSummary.costSats) })}
            </strong>
            <span className="dashboard-cost__meta">
              {t('dashboard.cost_tokens', {
                input: numberFormatter.format(costSummary.tokensInput),
                output: numberFormatter.format(costSummary.tokensOutput)
              })}
            </span>
          </>
        ) : (
          <strong className="dashboard-cost__value">{t('dashboard.cost_empty')}</strong>
        )}
      </div>
    )
  }

  function renderBuildProgressCard(): JSX.Element | null {
    if (!buildProgress && !isBuilding) {
      return null
    }

    const currentStage = buildProgress?.stage ?? buildStages[0]
    const currentStageIndex = buildProgress
      ? Math.min(Math.max(buildProgress.current - 1, 0), buildStages.length - 1)
      : 0

    return (
      <div className="dashboard-simulation">
        <div className="dashboard-simulation__header">
          <div className="dashboard-simulation__heading">
            <span className="dashboard-simulation__label">{t('builder.progress_title')}</span>
            <span className="dashboard-simulation__hint">
              {t(`builder.progress_steps.${currentStage}`)}
            </span>
            {buildProgress && (
              <span className="dashboard-simulation__hint">
                {t('builder.progress_provider', {
                  provider: getBuildProviderLabel(buildProgress.provider)
                })}
              </span>
            )}
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
      </div>
    )
  }

  function renderSimulationCard(): JSX.Element {
    return (
      <div className="dashboard-simulation">
        <div className="dashboard-simulation__header">
          <div className="dashboard-simulation__heading">
            <span className="dashboard-simulation__label">{t('simulation.title')}</span>
            <div className="dashboard-simulation__modes" role="tablist" aria-label={t('simulation.mode_label')}>
              <button
                className={[
                  'dashboard-simulation__mode',
                  simulationMode === 'interactive' ? 'dashboard-simulation__mode--active' : ''
                ].join(' ')}
                onClick={() => setSimulationMode('interactive')}
                disabled={isSimulating}
              >
                {t('simulation.mode.interactive')}
              </button>
              <button
                className={[
                  'dashboard-simulation__mode',
                  simulationMode === 'automatic' ? 'dashboard-simulation__mode--active' : ''
                ].join(' ')}
                onClick={() => setSimulationMode('automatic')}
                disabled={isSimulating}
              >
                {t('simulation.mode.automatic')}
              </button>
            </div>
            <span className="dashboard-simulation__hint">{t(`simulation.mode_hint.${simulationMode}`)}</span>
          </div>
          <button
            className="app-button app-button--secondary"
            onClick={() => {
              void handleSimulatePlan()
            }}
            disabled={isSimulating}
          >
            {isSimulating ? t('dashboard.reviewing_plan') : t('dashboard.review_plan')}
          </button>
        </div>

        {isSimulating && (
          <div className="dashboard-simulation__progress">
            <div className="dashboard-simulation__progress-bar" aria-hidden="true">
              <span
                className={[
                  'dashboard-simulation__progress-fill',
                  `dashboard-simulation__progress-fill--${simulationStageIndex + 1}`
                ].join(' ')}
              />
            </div>
            <strong className="dashboard-simulation__progress-title">
              {t('simulation.progress.current')}
            </strong>
            <span className="dashboard-simulation__progress-step">
              {t(`simulation.progress.steps.${activeSimulationStageKey}`)}
            </span>
          </div>
        )}

        {latestSimulation ? (
          <>
            <strong className="dashboard-simulation__value">
              {t(`simulation.overall.${latestSimulation.summary.overallStatus}`)}
            </strong>
            <span className="dashboard-simulation__meta">
              {t(`simulation.mode_last.${latestSimulation.mode}`)}
            </span>
            <span className="dashboard-simulation__meta">
              {t('simulation.period', { period: latestSimulation.periodLabel })}
            </span>
            <span className="dashboard-simulation__meta">
              {t('simulation.last_review', { date: formatSimulationDate(latestSimulation.ranAt) })}
            </span>
            <div className="dashboard-simulation__counts">
              <span>{t('simulation.count_pass', { count: latestSimulation.summary.pass })}</span>
              <span>{t('simulation.count_warn', { count: latestSimulation.summary.warn })}</span>
              <span>{t('simulation.count_fail', { count: latestSimulation.summary.fail })}</span>
              <span>{t('simulation.count_missing', { count: latestSimulation.summary.missing })}</span>
            </div>
            <ul className="dashboard-simulation__list">
              {latestSimulation.findings.map((finding, index) => (
                <li
                  key={`${finding.code}-${index}`}
                  className={`dashboard-simulation__item dashboard-simulation__item--${finding.status.toLowerCase()}`}
                >
                  <span className="dashboard-simulation__badge">
                    {t(`simulation.finding_status.${finding.status}`)}
                  </span>
                  <div className="dashboard-simulation__copy">
                    <strong>{renderFindingTitle(finding)}</strong>
                    <span>{renderFindingDetail(finding)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <strong className="dashboard-simulation__value">{t('simulation.empty')}</strong>
        )}

        {simulationError && <p className="status-message status-message--warning">{simulationError}</p>}
      </div>
    )
  }

  if (loading) {
    return (
      <div id="app" className="app-shell app-shell--centered">
        <div className="dashboard-layout dashboard-layout--loading">
          <p className="app-status">{t('ui.loading')}</p>
        </div>
      </div>
    )
  }

  if (!profileId) {
    return (
      <MotionConfig reducedMotion="user">
        <div id="app" className="app-shell app-shell--centered">
          <div className="app-screen app-screen--card app-screen--hero">
            <h1 className="app-title">{t('app.name')}</h1>
            <p className="app-subtitle">{t('app.tagline')}</p>
            <p className="app-copy">{t('dashboard.empty')}</p>
            <div className="app-actions">
              <button className="app-button app-button--primary" onClick={() => router.push('/intake')}>
                {t('dashboard.start')}
              </button>
            </div>
          </div>
        </div>
      </MotionConfig>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      <>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key="dashboard"
            className="view-layer"
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.99 }}
            transition={viewTransition}
          >
            <div id="app" className="app-shell dashboard-shell">
              <div className="dashboard-layout">
                <header className="dashboard-header">
                  <h1 className="dashboard-greeting">
                    {profileName ? t('dashboard.greeting', { nombre: profileName }) : t('app.name')}
                  </h1>
                  <h2 className="dashboard-title">{t('dashboard.title')}</h2>
                </header>

                {!hasPlan ? (
                  <section className="dashboard-panel dashboard-panel--empty">
                    <p className="dashboard-copy">{t('dashboard.empty')}</p>
                    {renderBuildProgressCard()}
                    <div className="dashboard-actions">
                      <button
                        className="app-button app-button--primary"
                        onClick={() => router.push('/settings?intent=build&provider=openai')}
                      >
                        {t('dashboard.build_openai')}
                      </button>
                      <button
                        className="app-button app-button--secondary"
                        onClick={() => {
                          void handleBuildPlan('ollama')
                        }}
                        disabled={isBuilding}
                      >
                        {t('dashboard.build_ollama')}
                      </button>
                    </div>
                    <div className="dashboard-summary-grid dashboard-summary-grid--single">
                      {renderWalletCard()}
                    </div>
                    {buildNotice && <p className="status-message status-message--success">{buildNotice}</p>}
                    {buildError && <p className="status-message status-message--warning">{buildError}</p>}
                  </section>
                ) : (
                  <section className="dashboard-panel">
                    <p className="dashboard-plan-name">{t('dashboard.plan_name', { nombre: latestPlan!.nombre })}</p>
                    {latestBuildRouteLabel && (
                      <p className="status-message status-message--success">{latestBuildRouteLabel}</p>
                    )}
                    {renderBuildProgressCard()}
                    <div className="dashboard-summary-grid">
                      <div className="dashboard-streak">
                        <span className="dashboard-streak__label">{t('dashboard.streak_title')}</span>
                        <strong className="dashboard-streak__value">
                          {streak.current > 0
                            ? t('dashboard.streak_current', { count: streak.current })
                            : t('dashboard.streak_empty')}
                        </strong>
                        {streak.best > 0 && (
                          <span className="dashboard-streak__best">
                            {t('dashboard.streak_best', { count: streak.best })}
                          </span>
                        )}
                      </div>
                      <div className="dashboard-summary-stack">
                        {renderWalletCard()}
                        {renderCostCard()}
                      </div>
                    </div>
                    {renderSimulationCard()}

                    {latestPlanMeta.fallbackUsed && (
                      <p className="status-message status-message--success">{t('builder.fallback_notice')}</p>
                    )}

                    {tasks.length === 0 ? (
                      <p className="dashboard-copy">{t('dashboard.no_tasks_today')}</p>
                    ) : (
                      <>
                        <p className="dashboard-progress" aria-live="polite" aria-atomic="true">
                          <AnimatePresence initial={false} mode="wait">
                            <motion.span
                              key={`${tasks.filter((task) => task.completado).length}-${tasks.length}`}
                              className="dashboard-progress-value"
                              initial={{ opacity: 0, y: 10, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -10, scale: 0.98 }}
                              transition={viewTransition}
                            >
                              {tasks.filter((task) => task.completado).length === tasks.length
                                ? t('dashboard.all_done')
                                : t('dashboard.done_count', {
                                    done: tasks.filter((task) => task.completado).length,
                                    total: tasks.length
                                  })}
                            </motion.span>
                          </AnimatePresence>
                        </p>

                        <motion.ul layout className="task-list">
                          {[...tasks]
                            .sort((a, b) => {
                              const metaA = parseTaskMeta(a.notas)
                              const metaB = parseTaskMeta(b.notas)
                              return (metaA.hora || '').localeCompare(metaB.hora || '')
                            })
                            .map((task) => {
                              const meta = parseTaskMeta(task.notas)
                              const categoria = meta.categoria || 'otro'
                              const cardClassName = [
                                'task-card',
                                `task-card--${categoria}`,
                                task.completado ? 'task-card--completed' : ''
                              ].filter(Boolean).join(' ')
                              const toggleClassName = [
                                'app-button',
                                'task-toggle',
                                task.completado ? 'app-button--secondary' : 'app-button--primary'
                              ].join(' ')

                              return (
                                <motion.li
                                  key={task.id}
                                  layout
                                  className={cardClassName}
                                  initial={{ opacity: 0, y: 16, scale: 0.985 }}
                                  animate={{ opacity: task.completado ? 0.76 : 1, y: 0, scale: 1 }}
                                  transition={viewTransition}
                                >
                                  <div className="task-card__row">
                                    <div className="task-card__text">
                                      <strong className="task-card__title">{task.descripcion}</strong>
                                      <small className="task-card__meta">
                                        {meta.hora && `${meta.hora} · `}
                                        {meta.duracion && t('dashboard.minutes', { min: meta.duracion })}
                                        {meta.duracion ? ` · ${t(`dashboard.category.${categoria}`)}` : t(`dashboard.category.${categoria}`)}
                                      </small>
                                    </div>

                                    <button
                                      className={toggleClassName}
                                      onClick={() => {
                                        void handleToggle(task.id)
                                      }}
                                    >
                                      {task.completado ? t('dashboard.undo') : t('dashboard.check_in')}
                                    </button>
                                  </div>
                                </motion.li>
                              )
                            })}
                        </motion.ul>
                      </>
                    )}

                    <hr className="dashboard-divider" />
                    <div className="dashboard-actions">
                      <button
                        className="app-button app-button--secondary"
                        onClick={() => {
                          void handleExportCalendar()
                        }}
                        disabled={isExporting}
                      >
                        {isExporting ? t('dashboard.exporting_calendar') : t('dashboard.export_calendar')}
                      </button>
                      <button
                        className="app-button app-button--primary"
                        onClick={() => {
                          void handleBuildPlan('openai')
                        }}
                        disabled={isBuilding}
                      >
                        {t('dashboard.build_openai')}
                      </button>
                      <button
                        className="app-button app-button--secondary"
                        onClick={() => {
                          void handleBuildPlan('ollama')
                        }}
                        disabled={isBuilding}
                      >
                        {t('dashboard.build_ollama')}
                      </button>
                      <button className="app-button app-button--secondary" onClick={() => router.push('/intake')}>
                        {t('dashboard.redo_intake')}
                      </button>
                    </div>
                    {exportStatus && (
                      <p
                        className={[
                          'status-message',
                          exportStatus === 'success' ? 'status-message--success' : 'status-message--warning'
                        ].join(' ')}
                      >
                        {exportStatus === 'success'
                          ? t('dashboard.export_calendar_success')
                          : t('dashboard.export_calendar_error')}
                      </p>
                    )}
                    {buildNotice && <p className="status-message status-message--success">{buildNotice}</p>}
                    {buildError && <p className="status-message status-message--warning">{buildError}</p>}
                  </section>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <AnimatePresence>
          {debugPanelVisible && (
            <DebugPanel
              onClose={() => {
                setDebugPanelVisible(false)
              }}
            />
          )}
        </AnimatePresence>
      </>
    </MotionConfig>
  )
}
