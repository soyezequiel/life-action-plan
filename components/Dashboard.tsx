'use client'

import React, { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { DateTime } from 'luxon'
import { useRouter } from 'next/navigation'
import { getCurrentLocale, t } from '../src/i18n'
import { useLapClient } from '../src/lib/client/app-services'
import { toUserFacingErrorMessage } from '../src/lib/client/error-utils'
import { getResourceUsageDisplay } from '../src/lib/client/resource-usage-copy'
import type { DeploymentMode } from '../src/lib/env/deployment'
import {
  DEFAULT_OLLAMA_BUILD_MODEL,
  getBuildRouteLabelKey,
  getProviderLabelKey,
  isCloudModel,
  isLocalModel
} from '../src/lib/providers/provider-metadata'
import type {
  CostSummary,
  OperationChargeSummary,
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
import PlanCalendar from './PlanCalendar'
import styles from './Dashboard.module.css'

const springTransition = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
  mass: 1
}

const viewTransition = springTransition

const buildStages: PlanBuildProgress['stage'][] = ['preparing', 'generating', 'validating', 'saving']
const simulationStages: PlanSimulationProgress['stage'][] = ['schedule', 'work', 'load', 'summary']

interface PlanManifestMeta {
  fallbackUsed?: boolean
  ultimoModeloUsado?: string
  ultimaSimulacion?: PlanSimulationSnapshot | null
  ultimoCobro?: OperationChargeSummary | null
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

interface TaskMeta {
  hora?: string
  duracion?: number
  categoria?: string
}

function parseTaskMeta(notas: string | null): TaskMeta {
  if (!notas) {
    return {}
  }

  try {
    return JSON.parse(notas) as TaskMeta
  } catch {
    return {}
  }
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(getCurrentLocale()).format(value)
}

function formatUsd(value: number): string {
  const precision = value > 0 && value < 0.01 ? 4 : 2

  return new Intl.NumberFormat(getCurrentLocale(), {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  }).format(value)
}

function formatTaskMeta(meta: TaskMeta, categoria: string): string {
  const parts: string[] = []

  if (meta.hora) {
    parts.push(meta.hora)
  }

  if (typeof meta.duracion === 'number') {
    parts.push(t('dashboard.minutes', { min: meta.duracion }))
  }

  parts.push(t(`dashboard.category.${categoria}`))

  return parts.join(' · ')
}

type ShellIconName = 'home' | 'calendar' | 'spark' | 'settings' | 'bell'

function ShellIcon({ name }: { name: ShellIconName }): JSX.Element {
  switch (name) {
    case 'calendar':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M7 3v4" strokeLinecap="round" />
          <path d="M17 3v4" strokeLinecap="round" />
          <rect x="4" y="6" width="16" height="14" rx="3" />
          <path d="M4 10h16" strokeLinecap="round" />
        </svg>
      )
    case 'spark':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z" strokeLinejoin="round" />
          <path d="M19 4v2" strokeLinecap="round" />
          <path d="M20 5h-2" strokeLinecap="round" />
        </svg>
      )
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M10 4h4l.7 2.3 2.3.9 2.1-1.2 2 3.5-1.6 1.7.2 2.5 2 1.5-2 3.5-2.3-.8-2.1 1-1 2.1h-4l-.9-2.1-2.2-.9-2.3.7-2-3.5 1.8-1.6-.1-2.5-1.8-1.5 2-3.5 2.2 1 2.3-.9L10 4Z" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
      )
    case 'bell':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M6 9a6 6 0 1 1 12 0v4.3l1.5 2.2a1 1 0 0 1-.8 1.5H5.3a1 1 0 0 1-.8-1.5L6 13.3V9Z" strokeLinejoin="round" />
          <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H10v6H4V6.5Z" />
          <path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5V10h-6V4Z" />
          <path d="M4 14h6v6H6.5A2.5 2.5 0 0 1 4 17.5V14Z" />
          <path d="M14 14h6v3.5a2.5 2.5 0 0 1-2.5 2.5H14v-6Z" />
        </svg>
      )
  }
}

function compareTasksByTime(a: ProgressRow, b: ProgressRow): number {
  const metaA = parseTaskMeta(a.notas)
  const metaB = parseTaskMeta(b.notas)

  return (metaA.hora || '').localeCompare(metaB.hora || '')
}

function getWalletStatusLabel(status: WalletStatus): string {
  if (status.connected) {
    return t('dashboard.wallet_ready')
  }

  if (status.configured) {
    return t('dashboard.wallet_saved')
  }

  return t('dashboard.wallet_not_connected')
}

function isUserFriendlyAlias(alias: string | undefined | null): boolean {
  if (!alias) {
    return false
  }

  const trimmed = alias.trim()

  if (trimmed.length <= 5 && trimmed === trimmed.toUpperCase()) {
    return false
  }

  return true
}

function getWalletHint(status: WalletStatus): string {
  if (status.connected) {
    return ''
  }

  if (status.configured) {
    return t('dashboard.wallet_saved_hint')
  }

  return t('dashboard.wallet_connect_hint')
}

function getWalletBudgetUsage(status: WalletStatus):
  | { total: number; used: number; remaining: number; progress: number }
  | null {
  if (typeof status.budgetSats !== 'number') {
    return null
  }

  const total = Math.max(status.budgetSats, 0)
  const used = Math.max(Math.min(status.budgetUsedSats ?? 0, total), 0)
  const remaining = Math.max(total - used, 0)
  const progress = total > 0 ? Math.min(Math.max((used / total) * 100, 0), 100) : 0

  return {
    total,
    used,
    remaining,
    progress
  }
}

function getReasonLabel(prefix: string, reasonCode: string | null | undefined, fallbackKey: string): string {
  const translationKey = reasonCode ? `${prefix}.${reasonCode}` : fallbackKey
  const translated = t(translationKey)

  if (translated !== translationKey) {
    return translated
  }

  return t(fallbackKey)
}

function getWalletChargeReadiness(status: WalletStatus): {
  label: string
  hint: string
  tone: 'success' | 'warning'
} | null {
  if (typeof status.planBuildChargeSats !== 'number' || status.planBuildChargeSats <= 0) {
    return null
  }

  if (status.planBuildChargeReady) {
    return {
      label: t('dashboard.wallet_build_ready'),
      hint: t('dashboard.wallet_build_ready_hint', {
        sats: formatCount(status.planBuildChargeSats)
      }),
      tone: 'success'
    }
  }

  return {
    label: t('dashboard.wallet_build_not_ready'),
    hint: getReasonLabel(
      'dashboard.wallet_build_blocked',
      status.planBuildChargeReasonCode,
      'dashboard.wallet_build_blocked.other'
    ),
    tone: 'warning'
  }
}

function getChargeHeadline(charge: OperationChargeSummary | null, summary: CostSummary | null): string {
  if (!charge) {
    return summary && summary.costSats > 0
      ? t('dashboard.cost_sats_estimated', { sats: formatCount(summary.costSats) })
      : t('dashboard.cost_empty')
  }

  if (charge.status === 'paid') {
    return t('dashboard.charge_paid', { sats: formatCount(charge.chargedSats) })
  }

  if (charge.status === 'skipped' && charge.reasonCode === 'free_local_operation') {
    return t('dashboard.cost_local_free')
  }

  if (charge.status === 'skipped') {
    return t('dashboard.charge_skipped')
  }

  if (charge.status === 'rejected') {
    return t('dashboard.charge_rejected')
  }

  if (charge.status === 'failed') {
    return t('dashboard.charge_failed')
  }

  return t('dashboard.cost_empty')
}

function getChargeHint(charge: OperationChargeSummary | null, summary: CostSummary | null): string {
  if (!charge) {
    return summary && summary.costSats > 0
      ? t('dashboard.cost_estimated_hint')
      : t('dashboard.cost_empty_hint')
  }

  if (charge.status === 'paid') {
    return t('dashboard.charge_paid_hint')
  }

  if (charge.status === 'skipped' && charge.reasonCode === 'free_local_operation') {
    return t('dashboard.cost_local_hint')
  }

  if (charge.status === 'skipped') {
    return t('dashboard.charge_skipped_hint')
  }

  if (charge.status === 'rejected') {
    return t('dashboard.charge_rejected_hint')
  }

  if (charge.status === 'failed') {
    return t('dashboard.charge_failed_hint')
  }

  return t('dashboard.cost_empty_hint')
}

function getOperationChargeValue(operation: CostSummary['operations'][number]): string {
  if (operation.latestChargeStatus === 'paid') {
    return t('dashboard.charge_operation_paid', {
      sats: formatCount(operation.chargedSats ?? 0)
    })
  }

  if (operation.latestChargeStatus === 'rejected') {
    return t('dashboard.charge_operation_rejected')
  }

  if (operation.latestChargeStatus === 'failed') {
    return t('dashboard.charge_operation_failed')
  }

  if (operation.latestChargeStatus === 'skipped') {
    return operation.latestChargeReasonCode === 'free_local_operation'
      ? t('dashboard.cost_operation_free')
      : t('dashboard.charge_operation_skipped')
  }

  return operation.costSats > 0
    ? t('dashboard.cost_operation_estimated', {
        sats: formatCount(operation.costSats)
      })
    : t('dashboard.cost_operation_free')
}

function getCostOperationLabel(operation: string): string {
  const translationKey = `dashboard.cost_operation.${operation}`
  const translated = t(translationKey)

  if (translated !== translationKey) {
    return translated
  }

  return t('dashboard.cost_operation.other')
}

type BuildRouteStatus = 'online' | 'local' | 'fallback' | 'unknown'

function getBuildRouteStatus(modelId: string | undefined, fallbackUsed: boolean | undefined): BuildRouteStatus {
  if (fallbackUsed) {
    return 'fallback'
  }

  if (isLocalModel(modelId)) {
    return 'local'
  }

  if (isCloudModel(modelId)) {
    return 'online'
  }

  return 'unknown'
}

function getBuildRouteLabel(modelId: string | undefined, fallbackUsed = false): string {
  const routeStatus = getBuildRouteStatus(modelId, fallbackUsed)
  return routeStatus === 'unknown' ? '' : t(getBuildRouteLabelKey(modelId, fallbackUsed))
}

function getBuildProviderLabel(modelId: string | undefined): string {
  return t(getProviderLabelKey(modelId))
}

interface DashboardProps {
  deploymentMode?: DeploymentMode
}

export default function Dashboard({ deploymentMode = 'local' }: DashboardProps): JSX.Element {
  const client = useLapClient()
  const router = useRouter()
  const localAssistantAvailable = deploymentMode === 'local'
  const [loading, setLoading] = useState(true)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [profileName, setProfileName] = useState('')
  const [profileTimezone, setProfileTimezone] = useState('America/Argentina/Buenos_Aires')
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [allTasks, setAllTasks] = useState<ProgressRow[]>([])
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
  const todayIso = DateTime.now().setZone(profileTimezone).toISODate() ?? ''
  const tasks = allTasks.filter((task) => task.fecha === todayIso)
  const sortedTasks = [...tasks].sort(compareTasksByTime)
  const pendingTasks = sortedTasks.filter((task) => !task.completado)
  const nextPendingTask = pendingTasks[0] ?? null
  const completedTaskCount = tasks.filter((task) => task.completado).length
  const pendingTaskCount = Math.max(tasks.length - completedTaskCount, 0)
  const todayProgress = tasks.length > 0 ? Math.round((completedTaskCount / tasks.length) * 100) : 0
  const todayLabel = DateTime.now()
    .setZone(profileTimezone)
    .setLocale(getCurrentLocale())
    .toFormat('cccc d LLL')
  const monthLabel = DateTime.now()
    .setZone(profileTimezone)
    .setLocale(getCurrentLocale())
    .toFormat('LLLL')
  const latestBuildRouteLabel = latestPlan
    ? getBuildRouteLabel(latestPlanMeta.ultimoModeloUsado, latestPlanMeta.fallbackUsed)
    : ''
  const latestBuildProviderLabel = latestPlan ? getBuildProviderLabel(latestPlanMeta.ultimoModeloUsado) : ''
  const simulationStageIndex = Math.min(
    Math.max((simulationProgress?.current ?? 1) - 1, 0),
    simulationStages.length - 1
  )
  const activeSimulationStageKey = simulationProgress?.stage ?? simulationStages[0]
  const todayNarrative = tasks.length === 0
    ? t('dashboard.hero_overview_empty')
    : t('dashboard.hero_overview_ready', {
        done: completedTaskCount,
        pending: pendingTaskCount
      })
  const todaySummaryLabel = pendingTaskCount === 1
    ? t('dashboard.today_summary_one')
    : t('dashboard.today_summary_other', { count: pendingTaskCount })
  const profileInitial = (profileName.trim().charAt(0) || 'L').toUpperCase()
  const topNavItems = [
    { href: '#lap-top', label: t('dashboard.shell_nav.today') },
    { href: '#lap-calendar', label: t('dashboard.shell_nav.calendar') },
    { href: '#lap-review', label: t('dashboard.shell_nav.plan') }
  ] as const
  const railNavItems = [
    {
      href: '#lap-top',
      label: t('dashboard.shell_nav.today'),
      icon: 'home' as const,
      active: true
    },
    {
      href: '#lap-calendar',
      label: t('dashboard.shell_nav.calendar'),
      icon: 'calendar' as const,
      active: false
    },
    {
      href: '#lap-review',
      label: t('dashboard.shell_nav.plan'),
      icon: 'spark' as const,
      active: false
    }
  ]

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

        if (!nextProfileId) {
          setProfileId(null)
          setProfileName('')
          setPlans([])
          setAllTasks([])
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
        setProfileTimezone(nextProfile?.participantes[0]?.datosPersonales?.ubicacion?.zonaHoraria || 'America/Argentina/Buenos_Aires')

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
          const [progressList, streakResult] = await Promise.all([
            client.progress.list(nextPlan.id),
            client.streak.get(nextPlan.id)
          ])

          if (!active) {
            return
          }

          setAllTasks(progressList)
          setStreak(streakResult)

          try {
            setCostSummary(await client.cost.summary(nextPlan.id))
          } catch {
            setCostSummary(null)
          }
        } else {
          setAllTasks([])
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
    const toggledTask = allTasks.find((task) => task.id === taskId)
    const result = await client.progress.toggle(taskId)

    if (result.success) {
      setAllTasks((prev) =>
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

  async function handleBuildPlan(provider: 'openai' | 'openrouter' | 'ollama'): Promise<void> {
    if (!profileId) {
      return
    }

    if (provider === 'openai' || provider === 'openrouter') {
      router.push(`/settings?intent=build&provider=${provider}`)
      return
    }

    setIsBuilding(true)
    setBuildError('')
    setBuildNotice('')
    setBuildProgress({
      profileId,
      provider: DEFAULT_OLLAMA_BUILD_MODEL,
      stage: 'preparing',
      current: 1,
      total: buildStages.length,
      charCount: 0
    })

    try {
      const result = await client.plan.build(profileId, '', DEFAULT_OLLAMA_BUILD_MODEL)

      if (result.success) {
        setBuildNotice(getBuildRouteLabel(DEFAULT_OLLAMA_BUILD_MODEL, result.fallbackUsed))
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
    const walletLabel = getWalletStatusLabel(walletStatus)
    const walletBudget = getWalletBudgetUsage(walletStatus)
    const formattedWalletBalance = typeof walletStatus.balanceSats === 'number'
      ? formatCount(walletStatus.balanceSats)
      : null
    const walletHint = getWalletHint(walletStatus)
    const walletChargeReadiness = getWalletChargeReadiness(walletStatus)

    return (
      <div className="dashboard-wallet">
        <span className="dashboard-wallet__label">{t('dashboard.wallet_title')}</span>
        <strong className="dashboard-wallet__value">{walletLabel}</strong>
        {isUserFriendlyAlias(walletStatus.alias) && walletStatus.connected && (
          <span className="dashboard-wallet__meta">
            {t('dashboard.wallet_alias', { alias: walletStatus.alias! })}
          </span>
        )}
        {formattedWalletBalance !== null && (
          <span className="dashboard-wallet__meta">
            {t('dashboard.wallet_balance', { sats: formattedWalletBalance })}
          </span>
        )}
        {walletBudget ? (
          <div className="dashboard-wallet__budget">
            <div className="dashboard-wallet__budget-bar" aria-hidden="true">
              <span
                className="dashboard-wallet__budget-fill"
                style={{ width: `${walletBudget.progress}%` }}
              />
            </div>
            <span className="dashboard-wallet__meta">
              {t('dashboard.wallet_budget', {
                used: formatCount(walletBudget.used),
                total: formatCount(walletBudget.total)
              })}
            </span>
            <span className="dashboard-wallet__meta">
              {t('dashboard.wallet_budget_remaining', {
                sats: formatCount(walletBudget.remaining)
              })}
            </span>
          </div>
        ) : walletStatus.connected ? (
          <span className="dashboard-wallet__meta">{t('dashboard.wallet_budget_open')}</span>
        ) : walletHint ? (
          <span className="dashboard-wallet__meta">{walletHint}</span>
        ) : null}
        {walletChargeReadiness && (
          <>
            <span className="dashboard-wallet__meta">
              {walletChargeReadiness.label}
            </span>
            <p
              className={[
                'status-message',
                walletChargeReadiness.tone === 'warning'
                  ? 'status-message--warning'
                  : 'status-message--success'
              ].join(' ')}
            >
              {walletChargeReadiness.hint}
            </p>
          </>
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
                  aria-label={t('settings.wallet_title')}
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
                  aria-label={walletStatus.connected ? t('dashboard.wallet_change') : t('dashboard.wallet_connect')}
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
    const hasTrackedOperations = Boolean(costSummary && costSummary.operations.length > 0)
    const latestCharge = costSummary?.latestCharge ?? latestPlanMeta.ultimoCobro ?? null
    const hasEstimatedCost = Boolean(costSummary && costSummary.costSats > 0)
    const latestUsageDisplay = getResourceUsageDisplay(latestCharge?.resourceUsage ?? null)

    return (
      <div className="dashboard-cost">
        <span className="dashboard-cost__label">{t('dashboard.cost_title')}</span>
        {hasTrackedOperations && costSummary ? (
          <>
            <strong className="dashboard-cost__value">{getChargeHeadline(latestCharge, costSummary)}</strong>
            <span className="dashboard-cost__meta">{getChargeHint(latestCharge, costSummary)}</span>
            {hasEstimatedCost && (
              <span className="dashboard-cost__meta">
                {t('dashboard.cost_usd', { usd: formatUsd(costSummary.costUsd) })}
              </span>
            )}
            {latestUsageDisplay && (
              <>
                <span className="dashboard-cost__meta">
                  {`${latestUsageDisplay.label}: ${latestUsageDisplay.detail}`}
                </span>
                <span className="dashboard-cost__meta">{latestUsageDisplay.billing}</span>
              </>
            )}
            <ul className="dashboard-cost__operations">
              {costSummary.operations.map((operation) => {
                const label = getCostOperationLabel(operation.operation)

                return (
                  <li key={operation.operation} className="dashboard-cost__operation">
                    <span className="dashboard-cost__operation-name">
                      {operation.count > 1
                        ? t('dashboard.cost_operation_repeat', { label, count: operation.count })
                        : label}
                    </span>
                    <span className="dashboard-cost__operation-value">
                      {getOperationChargeValue(operation)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <>
            <strong className="dashboard-cost__value">{t('dashboard.cost_empty')}</strong>
            <span className="dashboard-cost__meta">{t('dashboard.cost_empty_hint')}</span>
          </>
        )}
      </div>
    )
  }

  function renderPlanSystemCard(): JSX.Element | null {
    if (!latestPlan) {
      return null
    }

    return (
      <div className={styles.systemCard}>
        <div className={styles.surfaceHeader}>
          <span className={styles.surfaceEyebrow}>{t('dashboard.plan_panel.label')}</span>
          <h3 className={styles.surfaceTitle}>{t('dashboard.plan_panel.title')}</h3>
          <p className={styles.surfaceCopy}>{t('dashboard.plan_panel.copy')}</p>
        </div>

        <strong className={styles.systemPlanName}>{latestPlan.nombre}</strong>

        <div className={styles.systemGrid}>
          <div className={styles.systemMetric}>
            <span className={styles.systemMetricLabel}>{t('dashboard.plan_panel.route_label')}</span>
            <strong className={styles.systemMetricValue}>
              {latestBuildRouteLabel || t('dashboard.plan_panel.route_unknown')}
            </strong>
          </div>
          <div className={styles.systemMetric}>
            <span className={styles.systemMetricLabel}>{t('dashboard.plan_panel.provider_label')}</span>
            <strong className={styles.systemMetricValue}>
              {latestBuildProviderLabel || t('dashboard.plan_panel.provider_unknown')}
            </strong>
          </div>
          <div className={styles.systemMetric}>
            <span className={styles.systemMetricLabel}>{t('dashboard.plan_panel.total_label')}</span>
            <strong className={styles.systemMetricValue}>{formatCount(allTasks.length)}</strong>
          </div>
          <div className={styles.systemMetric}>
            <span className={styles.systemMetricLabel}>{t('dashboard.plan_panel.month_label')}</span>
            <strong className={styles.systemMetricValue}>{monthLabel}</strong>
          </div>
        </div>

        {latestPlanMeta.fallbackUsed && (
          <p className="status-message status-message--success">{t('builder.fallback_notice')}</p>
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
      <div className="dashboard-simulation" role="status" aria-live="polite" aria-atomic="true">
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
          <div className="dashboard-simulation__progress" role="status" aria-live="polite" aria-atomic="true">
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
          <div className={styles.welcomeFrame}>
            <section className={styles.welcomeHero}>
              <span className={styles.welcomeEyebrow}>{t('app.tagline')}</span>
              <h1 className={styles.welcomeTitle}>{t('app.name')}</h1>
              <p className={styles.welcomeCopy}>{t('dashboard.empty')}</p>
              <div className={styles.heroActions}>
                <button className="app-button app-button--primary" onClick={() => router.push('/intake')}>
                  {t('dashboard.start')}
                </button>
              </div>
            </section>

            <section className={styles.welcomePreviewGrid}>
              <article className={styles.welcomePreviewCard}>
                <span className={styles.welcomePreviewLabel}>{t('dashboard.welcome.today_label')}</span>
                <strong>{t('dashboard.welcome.today_title')}</strong>
                <p>{t('dashboard.welcome.today_copy')}</p>
              </article>
              <article className={styles.welcomePreviewCard}>
                <span className={styles.welcomePreviewLabel}>{t('dashboard.welcome.calendar_label')}</span>
                <strong>{t('dashboard.welcome.calendar_title')}</strong>
                <p>{t('dashboard.welcome.calendar_copy')}</p>
              </article>
              <article className={styles.welcomePreviewCard}>
                <span className={styles.welcomePreviewLabel}>{t('dashboard.welcome.system_label')}</span>
                <strong>{t('dashboard.welcome.system_title')}</strong>
                <p>{t('dashboard.welcome.system_copy')}</p>
              </article>
            </section>
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
                {!hasPlan ? (
                  <section className={`dashboard-panel dashboard-panel--empty ${styles.emptyPlan}`}>
                    <div className={styles.surfaceHeader}>
                      <span className={styles.surfaceEyebrow}>{t('dashboard.empty_plan_label')}</span>
                      <h1 className={styles.emptyPlanTitle}>{t('dashboard.empty_plan_title')}</h1>
                      <p className={styles.emptyPlanCopy}>{t('dashboard.empty')}</p>
                    </div>
                    {renderBuildProgressCard()}
                    <div className={styles.heroActions}>
                      <button
                        className="app-button app-button--primary"
                        onClick={() => router.push('/settings?intent=build&provider=openai')}
                      >
                        {t('dashboard.build_openai')}
                      </button>
                      <button
                        className="app-button app-button--secondary"
                        onClick={() => router.push('/settings?intent=build&provider=openrouter')}
                      >
                        {t('dashboard.build_openrouter')}
                      </button>
                      {localAssistantAvailable && (
                        <button
                          className="app-button app-button--secondary"
                          onClick={() => {
                            void handleBuildPlan('ollama')
                          }}
                          disabled={isBuilding}
                        >
                          {t('dashboard.build_ollama')}
                        </button>
                      )}
                    </div>
                    {!localAssistantAvailable && (
                      <p className="status-message status-message--warning">{t('builder.local_unavailable_deploy')}</p>
                    )}
                    <div className={styles.emptyPlanGrid}>
                      <article className={styles.emptyPlanFeature}>
                        <span className={styles.welcomePreviewLabel}>{t('dashboard.welcome.today_label')}</span>
                        <strong>{t('dashboard.empty_plan_feature.today_title')}</strong>
                        <p>{t('dashboard.empty_plan_feature.today_copy')}</p>
                      </article>
                      <article className={styles.emptyPlanFeature}>
                        <span className={styles.welcomePreviewLabel}>{t('dashboard.welcome.calendar_label')}</span>
                        <strong>{t('dashboard.empty_plan_feature.calendar_title')}</strong>
                        <p>{t('dashboard.empty_plan_feature.calendar_copy')}</p>
                      </article>
                    </div>
                    <div className="dashboard-summary-grid dashboard-summary-grid--single">
                      {renderWalletCard()}
                    </div>
                    {buildNotice && <p className="status-message status-message--success">{buildNotice}</p>}
                    {buildError && <p className="status-message status-message--warning">{buildError}</p>}
                  </section>
                ) : (
                  <section className="dashboard-panel">
                    <div className={styles.shell}>
                      <aside className={styles.shellRail}>
                        <div className={styles.shellBrand}>
                          <span className={styles.shellBrandMark}>LAP</span>
                        </div>

                        <nav className={styles.shellRailNav} aria-label={t('dashboard.title')}>
                          {railNavItems.map((item) => (
                            <a
                              key={item.label}
                              href={item.href}
                              className={[
                                styles.shellRailItem,
                                item.active ? styles.shellRailItemActive : ''
                              ].join(' ')}
                              aria-current={item.active ? 'page' : undefined}
                            >
                              <span className={styles.shellIcon}>
                                <ShellIcon name={item.icon} />
                              </span>
                              <span className={styles.shellRailLabel}>{item.label}</span>
                            </a>
                          ))}
                        </nav>

                        <div className={styles.shellRailMeta}>
                          <button
                            className={styles.shellRailItem}
                            onClick={() => {
                              router.push('/settings')
                            }}
                          >
                            <span className={styles.shellIcon}>
                              <ShellIcon name="settings" />
                            </span>
                            <span className={styles.shellRailLabel}>{t('dashboard.shell_nav.system')}</span>
                          </button>
                        </div>
                      </aside>

                      <div className={styles.shellMain}>
                        <header className={styles.shellTopbar}>
                          <nav className={styles.shellTopNav} aria-label={t('dashboard.title')}>
                            {topNavItems.map((item, index) => (
                              <a
                                key={item.label}
                                href={item.href}
                                className={[
                                  styles.shellTopLink,
                                  index === 0 ? styles.shellTopLinkActive : ''
                                ].join(' ')}
                              >
                                {item.label}
                              </a>
                            ))}
                          </nav>

                          <div className={styles.shellActions}>
                            <button
                              className={styles.shellIconButton}
                              aria-label={t('debug.panel_title')}
                              onClick={() => setDebugPanelVisible((visible) => !visible)}
                            >
                              <span className={styles.shellIcon}>
                                <ShellIcon name="bell" />
                              </span>
                            </button>
                            <button
                              className={styles.shellIconButton}
                              aria-label={t('dashboard.shell_nav.system')}
                              onClick={() => router.push('/settings')}
                            >
                              <span className={styles.shellIcon}>
                                <ShellIcon name="settings" />
                              </span>
                            </button>
                            <span className={styles.shellAvatar} aria-hidden="true">{profileInitial}</span>
                          </div>
                        </header>

                        <div className={styles.shellContent}>
                    <div id="lap-top" className={styles.dashboardHero}>
                      <div className={styles.heroCopy}>
                        <span className={styles.heroEyebrow}>{todayLabel}</span>
                        <h1 className={styles.heroTitle}>
                          {profileName ? t('dashboard.greeting', { nombre: profileName }) : t('app.name')}
                        </h1>
                        <p className={styles.heroNarrative}>{todayNarrative}</p>
                        <div className={styles.heroActions}>
                          <button
                            className="app-button app-button--primary"
                            onClick={() => {
                              void handleSimulatePlan()
                            }}
                            disabled={isSimulating}
                          >
                            {isSimulating ? t('dashboard.reviewing_plan') : t('dashboard.review_plan')}
                          </button>
                          <button
                            className="app-button app-button--secondary"
                            onClick={() => {
                              void handleExportCalendar()
                            }}
                            disabled={isExporting}
                          >
                            {isExporting ? t('dashboard.exporting_calendar') : t('dashboard.export_calendar')}
                          </button>
                        </div>
                      </div>

                      <div className={styles.heroPanel}>
                        <div className={styles.heroTrackHeader}>
                          <span className={styles.heroTrackLabel}>{t('dashboard.title')}</span>
                          <strong className={styles.heroTrackValue}>{todayProgress}%</strong>
                        </div>
                        <div className={styles.heroTrack} aria-hidden="true">
                          <span className={styles.heroTrackFill} style={{ width: `${todayProgress}%` }} />
                        </div>
                        <div className={styles.heroStatGrid}>
                          <article className={styles.heroStat}>
                            <span className={styles.heroStatLabel}>{t('dashboard.welcome.today_label')}</span>
                            <strong className={styles.heroStatValue}>{formatCount(pendingTaskCount)}</strong>
                            <span className={styles.heroStatMeta}>{t('dashboard.focus_panel.progress_label')}</span>
                          </article>
                          <article className={styles.heroStat}>
                            <span className={styles.heroStatLabel}>{t('dashboard.streak_title')}</span>
                            <strong className={styles.heroStatValue}>
                              {streak.current > 0
                                ? formatCount(streak.current)
                                : streak.best > 0
                                  ? formatCount(streak.best)
                                  : '0'}
                            </strong>
                            <span className={styles.heroStatMeta}>
                              {streak.current > 0
                                ? t('dashboard.streak_current', { count: streak.current })
                                : streak.best > 0
                                  ? t('dashboard.streak_best', { count: streak.best })
                                  : t('dashboard.streak_empty')}
                            </span>
                            {streak.current > 0 && streak.best > 0 && (
                              <span className={styles.heroStatMetaSecondary}>
                                {t('dashboard.streak_best', { count: streak.best })}
                              </span>
                            )}
                          </article>
                          <article className={styles.heroStat}>
                            <span className={styles.heroStatLabel}>{t('dashboard.calendar_panel.total_label')}</span>
                            <strong className={styles.heroStatValue}>{formatCount(allTasks.length)}</strong>
                            <span className={styles.heroStatMeta}>{t('dashboard.plan_name', { nombre: latestPlan!.nombre })}</span>
                          </article>
                        </div>
                      </div>
                    </div>

                    {renderBuildProgressCard()}

                    <div className={styles.dashboardGrid}>
                      <div className={styles.mainColumn}>
                        <section className={styles.surface}>
                          <div className={styles.surfaceHeader}>
                            <span className={styles.surfaceEyebrow}>{todayLabel}</span>
                            <h2 className={styles.surfaceTitle}>{t('dashboard.today_tasks')}</h2>
                            <p className={styles.surfaceCopy}>{todaySummaryLabel}</p>
                          </div>

                          <div className={styles.focusCard}>
                            <div className={styles.focusCopy}>
                              <span className={styles.focusEyebrow}>{t('dashboard.focus_panel.label')}</span>
                              {nextPendingTask ? (
                                <>
                                  <strong className={styles.focusTitle}>{nextPendingTask.descripcion}</strong>
                                  <span className={styles.focusMeta}>
                                    {formatTaskMeta(
                                      parseTaskMeta(nextPendingTask.notas),
                                      parseTaskMeta(nextPendingTask.notas).categoria || 'otro'
                                    )}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <strong className={styles.focusTitle}>{t('dashboard.focus_panel.empty_title')}</strong>
                                  <span className={styles.focusMeta}>{t('dashboard.focus_panel.empty_copy')}</span>
                                </>
                              )}
                            </div>

                            <div className={styles.focusAside}>
                              <span className={styles.focusAsideLabel}>{t('dashboard.focus_panel.progress_label')}</span>
                              <strong className={styles.focusAsideValue}>
                                {completedTaskCount === tasks.length && tasks.length > 0
                                  ? t('dashboard.focus_panel.complete_value')
                                  : t('dashboard.focus_panel.pending_value', {
                                      count: pendingTaskCount
                                    })}
                              </strong>
                            </div>
                          </div>

                          {tasks.length === 0 ? (
                            <p className="dashboard-copy">{t('dashboard.no_tasks_today')}</p>
                          ) : (
                            <>
                              <p className="dashboard-progress" aria-live="polite" aria-atomic="true">
                                <AnimatePresence initial={false} mode="wait">
                                  <motion.span
                                    key={`${completedTaskCount}-${tasks.length}`}
                                    className="dashboard-progress-value"
                                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -10, scale: 0.98 }}
                                    transition={viewTransition}
                                  >
                                    {completedTaskCount === tasks.length
                                      ? t('dashboard.all_done')
                                      : t('dashboard.done_count', {
                                          done: completedTaskCount,
                                          total: tasks.length
                                        })}
                                  </motion.span>
                                </AnimatePresence>
                              </p>

                              <motion.ul layout className="task-list">
                                {sortedTasks.map((task) => {
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
                                          <small className="task-card__meta">{formatTaskMeta(meta, categoria)}</small>
                                        </div>

                                        <button
                                          className={toggleClassName}
                                          aria-label={`${task.completado ? t('dashboard.undo') : t('dashboard.check_in')}: ${task.descripcion}`}
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
                        </section>

                        <div id="lap-review">
                          {renderSimulationCard()}
                        </div>
                        <div id="lap-calendar">
                          <PlanCalendar tasks={allTasks} timezone={profileTimezone} />
                        </div>
                      </div>

                      <aside id="lap-system" className={styles.sideColumn}>
                        {renderPlanSystemCard()}
                        {renderWalletCard()}
                        {renderCostCard()}

                        <section className={styles.surface}>
                          <div className={styles.surfaceHeader}>
                            <span className={styles.surfaceEyebrow}>{t('dashboard.actions_surface.label')}</span>
                            <h3 className={styles.surfaceTitle}>{t('dashboard.actions_title')}</h3>
                            <p className={styles.surfaceCopy}>
                              {localAssistantAvailable
                                ? t('dashboard.actions_hint_local')
                                : t('builder.local_unavailable_deploy')}
                            </p>
                          </div>

                          <div className="dashboard-actions">
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
                                void handleBuildPlan('openrouter')
                              }}
                              disabled={isBuilding}
                            >
                              {t('dashboard.build_openrouter')}
                            </button>
                            {localAssistantAvailable && (
                              <button
                                className="app-button app-button--secondary"
                                onClick={() => {
                                  void handleBuildPlan('ollama')
                                }}
                                disabled={isBuilding}
                              >
                                {t('dashboard.build_ollama')}
                              </button>
                            )}
                            <button className="app-button app-button--secondary" onClick={() => router.push('/intake')}>
                              {t('dashboard.redo_intake')}
                            </button>
                          </div>

                          {!localAssistantAvailable && (
                            <p className="status-message status-message--warning">{t('builder.local_unavailable_deploy')}</p>
                          )}
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
                      </aside>
                    </div>

                          <nav className={styles.mobileNav} aria-label={t('dashboard.title')}>
                            <a href="#lap-top" className={[styles.mobileNavItem, styles.mobileNavActive].join(' ')}>
                              <span className={styles.shellIcon}>
                                <ShellIcon name="home" />
                              </span>
                              <span className={styles.shellRailLabel}>{t('dashboard.shell_nav.today')}</span>
                            </a>
                            <a href="#lap-calendar" className={styles.mobileNavItem}>
                              <span className={styles.shellIcon}>
                                <ShellIcon name="calendar" />
                              </span>
                              <span className={styles.shellRailLabel}>{t('dashboard.shell_nav.calendar')}</span>
                            </a>
                            <a href="#lap-review" className={styles.mobileNavItem}>
                              <span className={styles.shellIcon}>
                                <ShellIcon name="spark" />
                              </span>
                              <span className={styles.shellRailLabel}>{t('dashboard.shell_nav.plan')}</span>
                            </a>
                            <button className={styles.mobileNavItem} onClick={() => router.push('/settings')}>
                              <span className={styles.shellIcon}>
                                <ShellIcon name="settings" />
                              </span>
                              <span className={styles.shellRailLabel}>{t('dashboard.shell_nav.system')}</span>
                            </button>
                          </nav>
                        </div>
                      </div>
                    </div>
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
