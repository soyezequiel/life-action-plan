import { useState, useEffect, useCallback } from 'react'
import type { JSX } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { getCurrentLocale, t } from '../../../i18n'
import { DateTime } from 'luxon'
import type {
  CostSummary,
  PlanRow,
  PlanSimulationSnapshot,
  ProgressRow,
  SimulationMode,
  StreakResult,
  WalletStatus,
  SimulationFinding
} from '../../../shared/types/ipc'

interface DashboardProps {
  profileId: string
  onStartIntake: () => void
  onBuildPlan: (provider: 'openai' | 'ollama') => void
  buildError: string
}

interface TaskMeta {
  hora?: string
  duracion?: number
  categoria?: string
}

interface PlanManifestMeta {
  fallbackUsed?: boolean
  ultimaSimulacion?: PlanSimulationSnapshot | null
}

const cardTransition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as const
}

const simulationStageKeys = ['schedule', 'work', 'load', 'summary'] as const

function parseMeta(notas: string | null): TaskMeta {
  if (!notas) return {}

  try {
    return JSON.parse(notas)
  } catch {
    return {}
  }
}

function parseManifestMeta(manifest: string): PlanManifestMeta {
  try {
    const parsed = JSON.parse(manifest) as PlanManifestMeta
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
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

function Dashboard({
  profileId,
  onStartIntake,
  onBuildPlan,
  buildError
}: DashboardProps): JSX.Element {
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [tasks, setTasks] = useState<ProgressRow[]>([])
  const [streak, setStreak] = useState<StreakResult>({ current: 0, best: 0 })
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null)
  const [walletStatus, setWalletStatus] = useState<WalletStatus>({
    configured: false,
    connected: false,
    canUseSecureStorage: true
  })
  const [loading, setLoading] = useState(true)
  const [nombre, setNombre] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState<'success' | 'error' | null>(null)
  const [walletConnection, setWalletConnection] = useState('')
  const [isWalletEditorOpen, setIsWalletEditorOpen] = useState(false)
  const [isWalletSaving, setIsWalletSaving] = useState(false)
  const [walletNotice, setWalletNotice] = useState<'connected' | 'disconnected' | 'error' | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [simulationError, setSimulationError] = useState('')
  const [simulationMode, setSimulationMode] = useState<SimulationMode>('interactive')
  const [simulationStageIndex, setSimulationStageIndex] = useState(0)

  const hasPlan = plans.length > 0
  const latestPlan = hasPlan ? plans[plans.length - 1] : null
  const latestPlanMeta = latestPlan ? parseManifestMeta(latestPlan.manifest) : {}
  const latestSimulation = latestPlanMeta.ultimaSimulacion ?? null
  const activeSimulationStageKey = simulationStageKeys[Math.min(simulationStageIndex, simulationStageKeys.length - 1)]

  const loadData = useCallback(async () => {
    setLoading(true)

    try {
      const [profile, planList, nextWalletStatus] = await Promise.all([
        window.api.profile.get(profileId),
        window.api.plan.list(profileId),
        window.api.wallet.status()
      ])

      let today = DateTime.now().toISODate() ?? '2026-03-18'

      if (profile) {
        setNombre(profile.participantes[0]?.datosPersonales?.nombre || '')
        const timezone = profile.participantes[0]?.datosPersonales?.ubicacion?.zonaHoraria
        if (timezone) {
          today = DateTime.now().setZone(timezone).toISODate() ?? today
        }
      }

      setPlans(planList)
      setWalletStatus(nextWalletStatus)

      if (planList.length > 0) {
        const nextPlan = planList[planList.length - 1]
        const [progressList, streakResult] = await Promise.all([
          window.api.progress.list(nextPlan.id, today),
          window.api.streak.get(nextPlan.id)
        ])
        setTasks(progressList)
        setStreak(streakResult)

        try {
          setCostSummary(await window.api.cost.summary(nextPlan.id))
        } catch {
          setCostSummary(null)
        }
      } else {
        setTasks([])
        setStreak({ current: 0, best: 0 })
        setCostSummary(null)
      }
    } finally {
      setLoading(false)
    }
  }, [profileId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!isSimulating) {
      setSimulationStageIndex(0)
      return
    }

    setSimulationStageIndex(0)

    const intervalId = window.setInterval(() => {
      setSimulationStageIndex((current) => (
        current >= simulationStageKeys.length - 1 ? current : current + 1
      ))
    }, 650)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isSimulating])

  useEffect(() => {
    if (latestSimulation?.mode) {
      setSimulationMode(latestSimulation.mode)
    }
  }, [latestSimulation?.mode])

  async function handleToggle(taskId: string): Promise<void> {
    const toggledTask = tasks.find((task) => task.id === taskId)
    const result = await window.api.progress.toggle(taskId)
    if (result.success) {
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, completado: result.completado } : task))
      )

      if (toggledTask?.tipo === 'habito') {
        const nextStreak = await window.api.streak.get(toggledTask.planId)
        setStreak(nextStreak)
      }
    }
  }

  async function handleExportCalendar(): Promise<void> {
    if (!latestPlan) return

    setIsExporting(true)
    setExportStatus(null)

    try {
      const result = await window.api.plan.exportCalendar(latestPlan.id)
      if (result.success) {
        setExportStatus('success')
      } else if (!result.cancelled) {
        setExportStatus('error')
      }
    } catch {
      setExportStatus('error')
    } finally {
      setIsExporting(false)
    }
  }

  async function handleSimulatePlan(): Promise<void> {
    if (!latestPlan) return

    setIsSimulating(true)
    setSimulationError('')

    try {
      const result = await window.api.plan.simulate(latestPlan.id, simulationMode)
      if (result.success) {
        await loadData()
      } else {
        setSimulationError(result.error || t('errors.generic'))
      }
    } catch {
      setSimulationError(t('errors.connection_busy'))
    } finally {
      setIsSimulating(false)
    }
  }

  async function handleConnectWallet(): Promise<void> {
    if (!walletConnection.trim()) return

    setIsWalletSaving(true)
    setWalletNotice(null)

    try {
      const result = await window.api.wallet.connect(walletConnection.trim())
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
      const result = await window.api.wallet.disconnect()
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

  if (loading) {
    return (
      <div id="app" className="app-shell app-shell--centered">
        <div className="dashboard-layout dashboard-layout--loading">
          <p className="app-status">{t('ui.loading')}</p>
        </div>
      </div>
    )
  }

  const doneCount = tasks.filter((task) => task.completado).length
  const progressMessage = doneCount === tasks.length
    ? t('dashboard.all_done')
    : t('dashboard.done_count', { done: doneCount, total: tasks.length })
  const sortedTasks = [...tasks].sort((a, b) => {
    const metaA = parseMeta(a.notas)
    const metaB = parseMeta(b.notas)
    return (metaA.hora || '').localeCompare(metaB.hora || '')
  })
  const numberFormatter = new Intl.NumberFormat(getCurrentLocale())
  const formattedWalletBalance = typeof walletStatus.balanceSats === 'number'
    ? numberFormatter.format(walletStatus.balanceSats)
    : null

  function renderWalletCard(): JSX.Element {
    const walletLabel = walletStatus.connected
      ? walletStatus.alias || t('dashboard.wallet_ready')
      : t('dashboard.wallet_not_connected')

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
            <div
              className="dashboard-simulation__progress-bar"
              aria-hidden="true"
            >
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

  return (
    <div id="app" className="app-shell dashboard-shell">
      <div className="dashboard-layout">
        <header className="dashboard-header">
          <h1 className="dashboard-greeting">{nombre ? t('dashboard.greeting', { nombre }) : t('app.name')}</h1>
          <h2 className="dashboard-title">{t('dashboard.title')}</h2>
        </header>

        {!hasPlan ? (
          <section className="dashboard-panel dashboard-panel--empty">
            <p className="dashboard-copy">{t('dashboard.empty')}</p>
            <div className="dashboard-actions">
              <button className="app-button app-button--primary" onClick={() => onBuildPlan('openai')}>
                {t('dashboard.build_openai')}
              </button>
              <button className="app-button app-button--secondary" onClick={() => onBuildPlan('ollama')}>
                {t('dashboard.build_ollama')}
              </button>
            </div>
            <div className="dashboard-summary-grid dashboard-summary-grid--single">
              {renderWalletCard()}
            </div>
            {buildError && <p className="status-message status-message--warning">{buildError}</p>}
          </section>
        ) : (
          <section className="dashboard-panel">
            <p className="dashboard-plan-name">{t('dashboard.plan_name', { nombre: latestPlan!.nombre })}</p>
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
                <p className="dashboard-progress">
                  <AnimatePresence initial={false} mode="wait">
                    <motion.span
                      key={`${doneCount}-${tasks.length}`}
                      className="dashboard-progress-value"
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.98 }}
                      transition={cardTransition}
                    >
                      {progressMessage}
                    </motion.span>
                  </AnimatePresence>
                </p>

                <motion.ul layout className="task-list">
                  {sortedTasks.map((task) => {
                    const meta = parseMeta(task.notas)
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
                        transition={cardTransition}
                      >
                        <div className="task-card__row">
                          <div className="task-card__text">
                            <strong className="task-card__title">{task.descripcion}</strong>
                            <small className="task-card__meta">
                              {meta.hora && `${meta.hora} · `}
                              {meta.duracion && t('dashboard.minutes', { min: meta.duracion })}
                              {` · ${t(`dashboard.category.${categoria}`)}`}
                            </small>
                          </div>

                          <AnimatePresence initial={false} mode="wait">
                            <motion.button
                              key={`${task.id}-${task.completado ? 'done' : 'todo'}`}
                              layout
                              className={toggleClassName}
                              onClick={() => {
                                void handleToggle(task.id)
                              }}
                              initial={{ opacity: 0.55, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.86 }}
                              transition={cardTransition}
                              whileTap={{ scale: 0.96 }}
                            >
                              {task.completado ? t('dashboard.undo') : t('dashboard.check_in')}
                            </motion.button>
                          </AnimatePresence>
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
              <button className="app-button app-button--primary" onClick={() => onBuildPlan('openai')}>
                {t('dashboard.build_openai')}
              </button>
              <button className="app-button app-button--secondary" onClick={() => onBuildPlan('ollama')}>
                {t('dashboard.build_ollama')}
              </button>
              <button className="app-button app-button--secondary" onClick={onStartIntake}>
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
            {buildError && <p className="status-message status-message--warning">{buildError}</p>}
          </section>
        )}
      </div>
    </div>
  )
}

export default Dashboard
