'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { DateTime } from 'luxon'
import { t } from '../src/i18n'
import { flowClient } from '../src/lib/client/flow-client'
import {
  connectWalletInline,
  disconnectWalletInline,
  fetchWalletStatus,
  type WalletStatusResult
} from '../src/lib/client/plan-client'

import type { DeploymentMode } from '../src/lib/env/deployment'
import {
  ACTIVE_WORKFLOW_ID_STORAGE_KEY,
  LOCAL_PROFILE_ID_STORAGE_KEY
} from '../src/lib/client/storage-keys'
import type { FlowSessionIntent, FlowTaskProgress } from '../src/shared/types/flow-api'
import type { SimTree, SimNode } from '../src/shared/schemas/simulation-tree'
import type {
  AvailabilityGrid,
  FlowCheckpoint,
  RealityCheckResult,
  FlowSession,
  FlowStep,
  PresentationDraft,
  StrategicPlanDraft
} from '../src/shared/types/flow'
import DebugPanel from './DebugPanel'
import styles from './FlowPageContent.module.css'

const STEP_ORDER: FlowStep[] = [
  'gate',
  'objectives',
  'intake',
  'strategy',
  'reality-check',
  'simulation',
  'presentation',
  'calendar',
  'topdown',
  'activation',
  'done'
]

const DAY_LABELS: Array<{ key: keyof AvailabilityGrid; label: string }> = [
  { key: 'monday', label: 'Lun' },
  { key: 'tuesday', label: 'Mar' },
  { key: 'wednesday', label: 'Mié' },
  { key: 'thursday', label: 'Jue' },
  { key: 'friday', label: 'Vie' },
  { key: 'saturday', label: 'Sáb' },
  { key: 'sunday', label: 'Dom' }
]

function defaultGrid(): AvailabilityGrid {
  return {
    monday: { morning: false, afternoon: false, evening: true },
    tuesday: { morning: true, afternoon: false, evening: true },
    wednesday: { morning: false, afternoon: false, evening: true },
    thursday: { morning: true, afternoon: false, evening: true },
    friday: { morning: false, afternoon: false, evening: true },
    saturday: { morning: true, afternoon: true, evening: false },
    sunday: { morning: false, afternoon: true, evening: false }
  }
}

function stepIndex(step: FlowStep | undefined): number {
  return Math.max(STEP_ORDER.indexOf(step ?? 'gate'), 0)
}

function stepLabel(step: FlowStep): string {
  const labels: Record<FlowStep, string> = {
    gate: t('flow.step.gate'),
    objectives: t('flow.step.objectives'),
    intake: t('flow.step.intake'),
    strategy: t('flow.step.strategy'),
    'reality-check': t('flow.step.reality'),
    simulation: t('flow.step.simulation'),
    presentation: t('flow.step.presentation'),
    calendar: t('flow.step.calendar'),
    topdown: t('flow.step.topdown'),
    activation: t('flow.step.activation'),
    done: t('flow.step.done')
  }

  return labels[step]
}

function checkpointTime(value: string): string {
  const date = DateTime.fromISO(value)
  return date.isValid ? date.toFormat('dd/LL HH:mm') : value
}

function planTitle(session: FlowSession | null): string {
  return session?.state.strategy?.title || t('flow.title')
}

function stepBannerCopy(step: FlowStep): string {
  const labels: Record<FlowStep, string> = {
    gate: t('flow.banner.gate'),
    objectives: t('flow.banner.objectives'),
    intake: t('flow.banner.intake'),
    strategy: t('flow.banner.strategy'),
    'reality-check': t('flow.banner.reality'),
    simulation: t('flow.banner.simulation'),
    presentation: t('flow.banner.presentation'),
    calendar: t('flow.banner.calendar'),
    topdown: t('flow.banner.topdown'),
    activation: t('flow.banner.activation'),
    done: t('flow.banner.done')
  }

  return labels[step]
}

function nextStep(step: FlowStep): FlowStep | null {
  const index = STEP_ORDER.indexOf(step)
  const next = STEP_ORDER[index + 1]
  return next ?? null
}

function cleanGoalLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function translateErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message.trim() : ''

  if (!raw) {
    return t('errors.generic')
  }

  if (raw.startsWith('FLOW_')) {
    return t('errors.generic')
  }

  if (raw === 'REQUEST_FAILED' || raw.startsWith('<!DOCTYPE') || raw.startsWith('<html')) {
    return t('errors.generic')
  }

  return raw
}

function monthWindowLabel(startMonth: number, endMonth: number): string {
  if (startMonth === endMonth) {
    return t('flow.strategy.phase_window_single', { month: String(startMonth) })
  }

  return t('flow.strategy.phase_window_range', {
    start: String(startMonth),
    end: String(endMonth)
  })
}

function resolveEntryIntent(value: string | null): FlowSessionIntent {
  if (value === 'redo-profile' || value === 'change-objectives' || value === 'restart-flow') {
    return value
  }

  return 'default'
}

interface FlowPageContentProps {
  deploymentMode: DeploymentMode
}

export default function FlowPageContent({ deploymentMode }: FlowPageContentProps): JSX.Element {
  const router = useRouter()
  const initialized = useRef(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [debugPanelVisible, setDebugPanelVisible] = useState(false)
  const [progress, setProgress] = useState<FlowTaskProgress | null>(null)
  const [session, setSession] = useState<FlowSession | null>(null)
  const [checkpoints, setCheckpoints] = useState<FlowCheckpoint[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [gateChoice, setGateChoice] = useState<'pulso' | 'advanced'>('pulso')
  const [llmMode, setLlmMode] = useState<'service' | 'own' | 'codex'>('service')
  const [provider, setProvider] = useState('openai')
  const [hasUserApiKey, setHasUserApiKey] = useState(false)
  const [objectivesText, setObjectivesText] = useState('')
  const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string>>({})
  const [intakeDirty, setIntakeDirty] = useState(false)
  const [changeSummary, setChangeSummary] = useState('')
  const [feedbackText, setFeedbackText] = useState('')
  const [presentationEdits, setPresentationEdits] = useState<Record<string, { label: string; detail: string }>>({})
  const [presentationDirty, setPresentationDirty] = useState(false)
  const [calendarNotes, setCalendarNotes] = useState('')
  const [icsText, setIcsText] = useState('')
  const [calendarGrid, setCalendarGrid] = useState<AvailabilityGrid>(defaultGrid())
  const [simTree, setSimTree] = useState<SimTree | null>(null)
  const [simTreeLoading, setSimTreeLoading] = useState(false)
  const [gateWalletUrl, setGateWalletUrl] = useState('')
  const [gateWalletBusy, setGateWalletBusy] = useState(false)
  const [gateWalletError, setGateWalletError] = useState('')
  const [gateWalletStatus, setGateWalletStatus] = useState<WalletStatusResult | null>(null)


  const currentStep = session?.currentStep ?? 'gate'
  const codexModeVisible = deploymentMode === 'local'
  const currentStepIndex = stepIndex(currentStep)
  const strategy = session?.state.strategy ?? null
  const realityCheck = session?.state.realityCheck ?? null
  const simulation = session?.state.simulation ?? null
  const presentation = session?.state.presentation ?? null
  const topdown = session?.state.topdown ?? null
  const currentTopLevel = topdown?.levels[topdown.currentLevelIndex] ?? null

  const reloadSession = useCallback(async (workflowId: string): Promise<void> => {
    const result = await flowClient.createSession(workflowId)

    if (!result.success || !result.session) {
      throw new Error(result.error || 'FLOW_SESSION_NOT_FOUND')
    }

    setSession(result.session)
    setCheckpoints((result.checkpoints ?? []).slice().reverse())
    window.localStorage.setItem(ACTIVE_WORKFLOW_ID_STORAGE_KEY, result.session.id)
  }, [])

  const bootstrapSession = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError('')

    try {
      const storedWorkflowId = window.localStorage.getItem(ACTIVE_WORKFLOW_ID_STORAGE_KEY) || undefined
      const searchParams = new URLSearchParams(window.location.search)
      const entryIntent = resolveEntryIntent(searchParams.get('entry'))
      const result = await flowClient.createSession(entryIntent !== 'default'
        ? {
            intent: entryIntent,
            sourceWorkflowId: storedWorkflowId
          }
        : storedWorkflowId)

      if (!result.success || !result.session) {
        throw new Error(result.error || 'FLOW_SESSION_CREATE_FAILED')
      }

      setSession(result.session)
      setCheckpoints((result.checkpoints ?? []).slice().reverse())
      window.localStorage.setItem(ACTIVE_WORKFLOW_ID_STORAGE_KEY, result.session.id)

      if (entryIntent !== 'default') {
        router.replace('/flow')
      }
    } catch (cause) {
      setError(translateErrorMessage(cause))
    } finally {
      setLoading(false)
    }
  }, [router])

  const saveIntake = useCallback(async (silent = false): Promise<void> => {
    const sessionId = session?.id
    if (!sessionId) return

    if (!silent) {
      setError('')
      setNotice('')
      setProgress(null)
    }

    setBusy(true)

    try {
      const result = await flowClient.saveIntake(sessionId, {
        answers: intakeAnswers,
        isAutoSave: silent
      })

      if (!result.success || !result.session) {
        throw new Error(result.error || 'FLOW_INTAKE_FAILED')
      }

      if (result.profileId) {
        window.localStorage.setItem(LOCAL_PROFILE_ID_STORAGE_KEY, result.profileId)
      }

      await reloadSession(result.session.id)
      setIntakeDirty(false)

      if (!silent) {
        setNotice(t('flow.notice.intake'))
      }
    } catch (cause) {
      setError(translateErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }, [intakeAnswers, reloadSession, session?.id])

  const submitPresentation = useCallback(async (accept = false, silent = false): Promise<void> => {
    const sessionId = session?.id
    if (!sessionId) return

    if (!silent) {
      setError('')
      setNotice('')
      setProgress(null)
    }

    setBusy(true)

    try {
      const edits = Object.entries(presentationEdits).map(([id, edit]) => ({
        id,
        label: edit.label,
        detail: edit.detail
      }))
      const result = await flowClient.applyPresentationFeedback(sessionId, {
        accept,
        feedback: silent ? '' : feedbackText,
        edits
      }, setProgress)

      if (!result.success || !result.session) {
        throw new Error(result.error || 'FLOW_PRESENTATION_FEEDBACK_FAILED')
      }

      await reloadSession(result.session.id)
      setPresentationDirty(false)

      if (!silent) {
        setFeedbackText('')
        setNotice(accept ? t('flow.notice.accepted') : t('flow.notice.presentation'))
      }
    } catch (cause) {
      setError(translateErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }, [feedbackText, presentationEdits, reloadSession, session?.id])

  useEffect(() => {
    if (initialized.current) {
      return
    }

    initialized.current = true
    void bootstrapSession()
  }, [bootstrapSession])

  useEffect(() => {
    if (!session) {
      return
    }

    setGateChoice(session.state.gate?.choice ?? 'pulso')
    const persistedLlmMode = session.state.gate?.llmMode
    setLlmMode(persistedLlmMode === 'codex' && !codexModeVisible
      ? 'service'
      : persistedLlmMode === 'own' || persistedLlmMode === 'codex' || persistedLlmMode === 'service'
        ? persistedLlmMode
        : 'service')
    setProvider(session.state.gate?.provider?.includes('openrouter') ? 'openrouter' : 'openai')
    setHasUserApiKey(session.state.gate?.hasUserApiKey ?? false)
    setObjectivesText(session.state.goals.map((goal) => goal.text).join('\n'))
    setIntakeAnswers(session.state.intakeAnswers)
    setCalendarGrid(session.state.calendar?.grid ?? defaultGrid())
    setCalendarNotes(session.state.calendar?.notes ?? '')
    setPresentationEdits(buildPresentationEdits(session.state.presentation))
    setIntakeDirty(false)
    setPresentationDirty(false)
  }, [codexModeVisible, session])

  useEffect(() => {
    if (!session || currentStep !== 'intake' || !intakeDirty || busy) {
      return
    }

    const timer = window.setTimeout(() => {
      void saveIntake(true)
    }, 900)

    return () => window.clearTimeout(timer)
  }, [busy, currentStep, intakeAnswers, intakeDirty, saveIntake, session])

  useEffect(() => {
    if (!session || currentStep !== 'presentation' || !presentationDirty || busy) {
      return
    }

    const timer = window.setTimeout(() => {
      void submitPresentation(false, true)
    }, 5000)

    return () => window.clearTimeout(timer)
  }, [busy, currentStep, presentationDirty, presentationEdits, session, submitPresentation])

  useEffect(() => {
    const workflowId = session?.id
    if (!workflowId) return
    setSimTreeLoading(true)
    flowClient.initializeSimTree(workflowId)
      .then(result => { if (result.tree) setSimTree(result.tree) })
      .catch(() => {})
      .finally(() => setSimTreeLoading(false))
  }, [session?.id])

  useEffect(() => {
    if (!session || currentStep !== 'gate') return
    if (!session.state.gate?.walletRequired) return
    void fetchWalletStatus().then((status) => setGateWalletStatus(status.connected ? status : null))
  }, [currentStep, session])

  const checkpointSummary = useMemo(() => checkpoints.slice(0, 3), [checkpoints])

  function buildPresentationEdits(draft: PresentationDraft | null): Record<string, { label: string; detail: string }> {
    if (!draft) {
      return {}
    }

    const edits: Record<string, { label: string; detail: string }> = {}

    for (const item of draft.timeline) {
      edits[item.id] = {
        label: item.label,
        detail: item.detail
      }
    }

    for (const item of draft.cards) {
      edits[item.id] = {
        label: item.title,
        detail: item.body
      }
    }

    return edits
  }

  function resetStatus(): void {
    setError('')
    setNotice('')
    setProgress(null)
  }

  function chooseGateChoice(choice: 'pulso' | 'advanced'): void {
    setGateChoice(choice)

    if (choice === 'pulso') {
      setLlmMode('service')
      setProvider('openai')
      setHasUserApiKey(false)
    }
  }

  function gatePrimaryLabel(): string {
    return session?.state.gate?.ready ? t('flow.actions.continue') : t('flow.actions.check_gate')
  }

  function gateRequirements(): string[] {
    const gateState = session?.state.gate

    if (!gateState) {
      return []
    }

    if (gateState.ready) {
      return [t('flow.gate.requirement_ready')]
    }

    if (gateChoice === 'advanced' && llmMode === 'own' && !hasUserApiKey) {
      return [t('flow.gate.requirement_key')]
    }

    if (gateState.walletRequired) {
      return [t('flow.gate.requirement_wallet')]
    }

    return gateState.summary ? [gateState.summary] : []
  }

  async function saveGate(): Promise<void> {
    if (!session) return
    resetStatus()
    setBusy(true)

    try {
      const result = await flowClient.saveGate(session.id, {
        choice: gateChoice,
        llmMode,
        provider,
        hasUserApiKey
      })

      if (!result.success || !result.session) {
        throw new Error(result.error || 'FLOW_GATE_FAILED')
      }

      await reloadSession(result.session.id)
      setNotice(result.session.state.gate?.ready ? t('flow.notice.gate_ready') : t('flow.notice.gate_saved'))
    } catch (cause) {
      setError(translateErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function saveObjectives(): Promise<void> {
    if (!session) return
    resetStatus()
    setBusy(true)
    setProgress({
      workflowId: session.id,
      step: 'objectives',
      stage: 'planning-intake',
      current: 1,
      total: 1,
      message: t('flow.notice.objectives_preparing')
    })

    try {
      const objectives = cleanGoalLines(objectivesText)

      const result = await flowClient.saveObjectives(session.id, { objectives })

      if (!result.success || !result.session) {
        throw new Error(result.error || 'FLOW_OBJECTIVES_FAILED')
      }

      await reloadSession(result.session.id)
      setProgress(null)
      setNotice(t('flow.notice.objectives'))
    } catch (cause) {
      setProgress(null)
      setError(translateErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function runStrategy(): Promise<void> {
    if (!session) return
    resetStatus()
    setBusy(true)

    try {
      const result = await flowClient.runStrategy(session.id, setProgress)

      if (!result.success || !result.session) {
        throw new Error(result.error || 'FLOW_STRATEGY_FAILED')
      }

      await reloadSession(result.session.id)
      setNotice(t('flow.notice.strategy'))
    } catch (cause) {
      setError(translateErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function applyReality(adjustment: 'keep' | 'reduce_load' | 'extend_timeline' | 'auto_prioritize'): Promise<void> {
    if (!session) return
    resetStatus()
    setBusy(true)

    try {
      const result = await flowClient.saveRealityCheck(session.id, { adjustment })

      if (!result.success || !result.session) {
        throw new Error(result.error || 'FLOW_REALITY_FAILED')
      }

      await reloadSession(result.session.id)
      setNotice(t('flow.notice.reality'))
    } catch (cause) {
      setError(translateErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function runSimulation(): Promise<void> {
    if (!session) return
    resetStatus()
    setBusy(true)

    try {
      const result = await flowClient.runSimulation(session.id, setProgress)

      if (!result.success || !result.session) {
        throw new Error(result.error || 'FLOW_SIMULATION_FAILED')
      }

      await reloadSession(result.session.id)
      setNotice(t('flow.notice.simulation'))
    } catch (cause) {
      setError(translateErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function handleExportSimulation(format: 'json' | 'csv') {
    if (!session || busy) return
    setBusy(true)
    try {
      await flowClient.exportSimulation(session.id, format)
    } catch {
      setNotice(t('simulation.tree.export.error'))
    } finally {
      setBusy(false)
    }
  }

  async function loadPresentation(): Promise<void> {
    if (!session) return
    resetStatus()
    setBusy(true)

    try {
      const result = await flowClient.loadPresentation(session.id)

      if (!result.success || !result.session) {
        throw new Error(result.error || 'FLOW_PRESENTATION_FAILED')
      }

      await reloadSession(result.session.id)
    } catch (cause) {
      setError(translateErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function saveCalendar(): Promise<void> {
    if (!session) return
    resetStatus()
    setBusy(true)

    try {
      const result = await flowClient.saveCalendar(session.id, {
        grid: calendarGrid,
        notes: calendarNotes,
        icsText
      })

      if (!result.success || !result.session) {
        throw new Error(result.error || 'FLOW_CALENDAR_FAILED')
      }

      await reloadSession(result.session.id)
      setNotice(t('flow.notice.calendar'))
    } catch (cause) {
      setError(translateErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function runTopDown(action: 'generate' | 'confirm' | 'revise' | 'back'): Promise<void> {
    if (!session) return
    resetStatus()
    setBusy(true)

    try {
      const result = await flowClient.runTopDown(session.id, { action }, setProgress)

      if (!result.success || !result.session) {
        throw new Error(result.error || 'FLOW_TOPDOWN_FAILED')
      }

      await reloadSession(result.session.id)
      setNotice(t('flow.notice.topdown'))
    } catch (cause) {
      setError(translateErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function activatePlan(): Promise<void> {
    if (!session) return
    resetStatus()
    setBusy(true)

    try {
      const result = await flowClient.activate(session.id)

      if (!result.success || !result.session || !result.planId) {
        throw new Error(result.error || 'FLOW_ACTIVATION_FAILED')
      }

      if (result.profileId) {
        window.localStorage.setItem(LOCAL_PROFILE_ID_STORAGE_KEY, result.profileId)
      }

      await reloadSession(result.session.id)
      setNotice(t('flow.notice.activated'))
    } catch (cause) {
      setError(translateErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function applyResume(): Promise<void> {
    if (!session) return
    resetStatus()
    setBusy(true)

    try {
      const result = await flowClient.applyResumePatch(session.id, {
        changeSummary
      })

      if (!result.success || !result.session) {
        throw new Error(result.error || 'FLOW_RESUME_FAILED')
      }

      await reloadSession(result.session.id)
      setNotice(result.patchSummary || t('flow.notice.saved'))
      setChangeSummary('')
    } catch (cause) {
      setError(translateErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function startNewFlow(): Promise<void> {
    window.localStorage.removeItem(ACTIVE_WORKFLOW_ID_STORAGE_KEY)
    setSession(null)
    setCheckpoints([])
    setProgress(null)
    setNotice('')
    setError('')
    await bootstrapSession()
  }

  function updateCalendarSlot(day: keyof AvailabilityGrid, slot: 'morning' | 'afternoon' | 'evening', value: boolean): void {
    setCalendarGrid((current) => ({
      ...current,
      [day]: {
        ...current[day],
        [slot]: value
      }
    }))
  }

  function updatePresentationEdit(id: string, field: 'label' | 'detail', value: string): void {
    setPresentationEdits((current) => ({
      ...current,
      [id]: {
        label: current[id]?.label || '',
        detail: current[id]?.detail || '',
        [field]: value
      }
    }))
    setPresentationDirty(true)
  }

  function renderStrategyOverview(draft: StrategicPlanDraft): JSX.Element {
    return (
      <div className={styles.strategyStack}>
        <div className={styles.summaryBox}>
          <div className={styles.blockMeta}>
            <span className={styles.pill}>{t('flow.strategy.duration', { count: String(draft.totalMonths) })}</span>
            <span className={styles.pill}>{t('flow.strategy.weekly_load', { count: String(draft.estimatedWeeklyHours) })}</span>
            <span className={styles.pill}>{t('flow.strategy.phase_count', { count: String(draft.phases.length) })}</span>
          </div>
          <strong>{draft.title}</strong>
          <p>{draft.summary}</p>
        </div>

        <div className={styles.sectionBlock}>
          <strong className={styles.sectionTitle}>{t('flow.strategy.phases_title')}</strong>
          <div className={styles.phaseList}>
            {draft.phases.map((phase) => (
              <article key={phase.id} className={styles.phaseCard}>
                <div className={styles.phaseHeader}>
                  <div className={styles.phaseHeading}>
                    <strong>{phase.title}</strong>
                    <small>{monthWindowLabel(phase.startMonth, phase.endMonth)}</small>
                  </div>
                  <span className={styles.pill}>{t('flow.strategy.phase_hours', { count: String(phase.hoursPerWeek) })}</span>
                </div>
                <p>{phase.summary}</p>
                <div className={styles.phaseMeta}>
                  <strong>{t('flow.strategy.milestone_label')}</strong>
                  <p>{phase.milestone}</p>
                </div>
                <div className={styles.phaseMeta}>
                  <strong>{t('flow.strategy.metrics_label')}</strong>
                  <ul className={styles.helperList}>
                    {phase.metrics.map((metric) => (
                      <li key={`${phase.id}-${metric}`}>{metric}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>

        {draft.conflicts.length > 0 && (
          <div className={styles.summaryBox}>
            <strong>{t('flow.strategy.conflicts_title')}</strong>
            <ul className={styles.flatList}>
              {draft.conflicts.map((conflict) => (
                <li key={conflict}>{conflict}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  function renderRealityOverview(reality: RealityCheckResult): JSX.Element {
    const isBalanced = reality.status === 'ok'

    return (
      <div className={styles.strategyStack}>
        <div className={styles.summaryBox}>
          <div className={styles.phaseHeader}>
            <strong>{reality.summary}</strong>
            <span className={`${styles.statusBadge} ${isBalanced ? styles.statusBadgeOk : styles.statusBadgeWarn}`}>
              {isBalanced ? t('flow.reality.badge_ok') : t('flow.reality.badge_adjustment')}
            </span>
          </div>
          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <span>{t('flow.reality.stat_need')}</span>
              <strong>{String(reality.neededHours)}</strong>
            </div>
            <div className={styles.statCard}>
              <span>{t('flow.reality.stat_have')}</span>
              <strong>{String(reality.availableHours)}</strong>
            </div>
          </div>
        </div>

        <div className={styles.summaryBox}>
          <strong>{t('flow.reality.recommendations_title')}</strong>
          <ul className={styles.flatList}>
            {reality.recommendations.map((recommendation) => (
              <li key={recommendation}>{recommendation}</li>
            ))}
          </ul>
        </div>

        {reality.adjustmentsApplied.length > 0 && (
          <div className={styles.summaryBox}>
            <strong>{t('flow.reality.applied_title')}</strong>
            <ul className={styles.flatList}>
              {reality.adjustmentsApplied.map((adjustment) => (
                <li key={adjustment}>{adjustment}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="app-shell app-shell--centered">
        <div className="app-screen app-screen--card app-screen--compact">
          <p className="app-copy">{t('ui.loading')}</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="app-shell app-shell--centered">
        <div className="app-screen app-screen--card app-screen--compact">
          <p className="status-message status-message--warning">{error || t('errors.generic')}</p>
        </div>
      </div>
    )
  }

  const activeSession = session
  const intakeBlock = activeSession.state.intakeBlocks.find((block) => !block.completed) ?? activeSession.state.intakeBlocks[activeSession.state.intakeBlocks.length - 1] ?? null
  const totalTaskSteps = STEP_ORDER.length - 1
  const displayStepIndex = Math.min(currentStepIndex + 1, totalTaskSteps)
  const upcomingStep = currentStep === 'done' ? null : nextStep(currentStep)
  const goalLines = cleanGoalLines(objectivesText)
  const intakeBlockIndex = intakeBlock ? activeSession.state.intakeBlocks.findIndex((block) => block.id === intakeBlock.id) : -1
  const intakeBlockReady = Boolean(intakeBlock?.questions.every((question) => (intakeAnswers[question.key] || '').trim()))
  const showResumeCard =
    (currentStepIndex >= stepIndex('strategy') || Boolean(activeSession.state.resume.askedAt))
    && currentStep !== 'done'
  const showAdvancedGate = gateChoice === 'advanced'
  const topdownHasLevels = Boolean(currentTopLevel)
  const isLastTopdownLevel = Boolean(topdown && topdown.currentLevelIndex >= topdown.levels.length - 1)

  function renderSimTree() {
    if (!simTree && !simTreeLoading) return null
    const workflowId = session?.id

    const monthNodes = simTree
      ? Object.values(simTree.nodes)
          .filter(n => n.granularity === 'month')
          .sort((a, b) => a.period.start.localeCompare(b.period.start))
      : []

    async function handleSimulateAll() {
      if (!workflowId || !simTree || busy) return
      setBusy(true)
      try {
        const result = await flowClient.simulateRange(
          workflowId,
          { treeVersion: simTree.version },
          (p) => { if (p.step === 'simulation-tree') setNotice(p.message) }
        )
        if (result.tree) setSimTree(result.tree)
      } catch { /* silenciar */ } finally { setBusy(false); setNotice('') }
    }

    async function handleSimulateNode(nodeId: string) {
      if (!workflowId || !simTree || busy) return
      setBusy(true)
      try {
        const result = await flowClient.simulateNode(
          workflowId, nodeId, simTree.version,
          (p) => { if (p.step === 'simulation-tree') setNotice(p.message) }
        )
        if (result.tree) setSimTree(result.tree)
      } catch { /* silenciar */ } finally { setBusy(false); setNotice('') }
    }

    async function handleLockNode(nodeId: string) {
      if (!workflowId || !simTree || busy) return
      setBusy(true)
      try {
        const result = await flowClient.lockSimNode(workflowId, nodeId, simTree.version)
        if (result.tree) setSimTree(result.tree)
      } catch { /* silenciar */ } finally { setBusy(false) }
    }

    function statusBadgeClass(status: SimNode['status']) {
      if (status === 'simulated') return styles.statusBadgeOk
      if (status === 'stale' || status === 'affected') return styles.statusBadgeWarn
      return styles.statusBadge
    }

    return (
      <div className={styles.summaryBox}>
        <div className={styles.phaseHeader}>
          <strong>{t('simulation.tree.title')}</strong>
          <div className={styles.buttonRow}>
            {monthNodes.some(n => n.status !== 'locked') && (
              <button
                className="app-button app-button--primary"
                type="button"
                disabled={busy || simTreeLoading}
                onClick={() => void handleSimulateAll()}
              >
                {t('simulation.tree.action.simulate_all')}
              </button>
            )}
            <button
              className="app-button app-button--secondary"
              type="button"
              disabled={busy || simTreeLoading}
              onClick={() => void handleExportSimulation('json')}
            >
              {t('simulation.tree.export.format_json')}
            </button>
            <button
              className="app-button app-button--ghost"
              type="button"
              disabled={busy || simTreeLoading}
              onClick={() => void handleExportSimulation('csv')}
            >
              {t('simulation.tree.export.format_csv')}
            </button>
          </div>
        </div>

        {simTreeLoading && <p className="app-copy">{t('flow.loading')}</p>}

        {simTree?.globalFindings?.filter(f => f.severity === 'critical').map(f => (
          <div key={f.id} className={styles.summaryBox}>
            <p className="app-copy">
              <span className={styles.statusBadgeFail}>{t('simulation.tree.severity.critical')}</span>
              {' '}{f.message}
            </p>
            {f.suggestedFix && <p className={styles.inlineHint}>{f.suggestedFix}</p>}
          </div>
        ))}

        <div className={styles.phaseList}>
          {monthNodes.map(node => (
            <article key={node.id} className={styles.phaseCard}>
              <div className={styles.phaseHeader}>
                <strong>{node.label}</strong>
                <span className={`${styles.statusBadge} ${statusBadgeClass(node.status)}`}>
                  {t(`simulation.tree.status.${node.status}`)}
                </span>
              </div>

              {node.status === 'simulated' && (
                <>
                  <div className={styles.blockMeta}>
                    <span className={styles.pill}>{node.actualHours ?? 0}h</span>
                    {node.quality != null && (
                      <span className={styles.pill}>{node.quality}% {t('simulation.tree.quality')}</span>
                    )}
                  </div>
                  {node.disruptions.length > 0 && (
                    <ul className={styles.helperList}>
                      {node.disruptions.map(d => (
                        <li key={d.id}>{d.description} (−{d.impactHours}h)</li>
                      ))}
                    </ul>
                  )}
                  {node.findings.length > 0 && (
                    <ul className={styles.flatList}>
                      {node.findings.map(f => (
                        <li key={f.id}>
                          <span className={
                            f.severity === 'critical' ? styles.statusBadgeFail : styles.statusBadgeWarn
                          }>
                            {t(`simulation.tree.severity.${f.severity}`)}
                          </span>
                          {' '}{f.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              <div className={styles.buttonRow}>
                {node.status !== 'locked' && (
                  <button
                    className="app-button app-button--secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSimulateNode(node.id)}
                  >
                    {node.status === 'simulated' ? 'Re-simular' : t('simulation.tree.action.simulate')}
                  </button>
                )}
                <button
                  className="app-button app-button--ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => void handleLockNode(node.id)}
                >
                  {node.status === 'locked'
                    ? t('simulation.tree.action.unlock')
                    : t('simulation.tree.action.lock')}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    )
  }

  function renderStepContent(): JSX.Element {
    if (currentStep === 'gate') {
      return (
        <section className={styles.card}>
          <h2 className="app-title app-title--section">{t('flow.gate.title')}</h2>
          <p className="app-copy">{t('flow.gate.copy')}</p>
          <div className={styles.optionGrid}>
            <button
              className={`${styles.optionCard} ${gateChoice === 'pulso' ? styles.optionCardActive : ''}`}
              type="button"
              onClick={() => chooseGateChoice('pulso')}
            >
              <strong className={styles.optionTitle}>{t('flow.gate.recommended_title')}</strong>
              <span className={styles.optionCopy}>{t('flow.gate.recommended_copy')}</span>
            </button>
            <button
              className={`${styles.optionCard} ${gateChoice === 'advanced' ? styles.optionCardActive : ''}`}
              type="button"
              onClick={() => chooseGateChoice('advanced')}
            >
              <strong className={styles.optionTitle}>{t('flow.gate.advanced_title')}</strong>
              <span className={styles.optionCopy}>{t('flow.gate.advanced_copy')}</span>
            </button>
          </div>
          {!showAdvancedGate ? (
            <p className={styles.inlineHint}>{t('flow.gate.simple_hint')}</p>
          ) : (
            <>
              <p className={styles.inlineHint}>{t('flow.gate.advanced_hint')}</p>
              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span>{t('flow.gate.mode')}</span>
                  <select
                    className="intake-control"
                    value={llmMode}
                    onChange={(event) => {
                      const nextMode = event.target.value as typeof llmMode
                      setLlmMode(nextMode)
                      if (nextMode === 'codex') {
                        setProvider('openai')
                        setHasUserApiKey(false)
                        return
                      }

                      if (nextMode !== 'own') {
                        setHasUserApiKey(false)
                      }
                    }}
                  >
                    <option value="service">{t('flow.gate.mode_service')}</option>
                    <option value="own">{t('flow.gate.mode_own')}</option>
                    {codexModeVisible && <option value="codex">{t('flow.gate.mode_codex')}</option>}
                  </select>
                </label>
                {llmMode !== 'codex' && (
                  <label className={styles.field}>
                    <span>{t('flow.gate.provider')}</span>
                    <select className="intake-control" value={provider} onChange={(event) => setProvider(event.target.value)}>
                      <option value="openai">{t('flow.gate.provider_openai')}</option>
                      <option value="openrouter">{t('flow.gate.provider_openrouter')}</option>
                    </select>
                  </label>
                )}
              </div>
            </>
          )}
          {showAdvancedGate && llmMode === 'own' && (
            <label className={styles.checkbox}>
              <input type="checkbox" checked={hasUserApiKey} onChange={(event) => setHasUserApiKey(event.target.checked)} />
              <span>{t('flow.gate.have_own_key')}</span>
            </label>
          )}
          {activeSession.state.gate && (
            <div className={styles.summaryBox}>
              <strong>{t('flow.gate.estimate', { sats: String(activeSession.state.gate.estimatedCostSats) })}</strong>
              <p>{activeSession.state.gate.summary}</p>
              <strong>{t('flow.gate.requirements')}</strong>
              <ul className={styles.helperList}>
                {gateRequirements().map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
            </div>
          )}
          {activeSession.state.gate?.walletRequired && !gateWalletStatus?.connected && (
            <div className={styles.summaryBox}>
              <strong>{t('gate.wallet_inline.title')}</strong>
              <p className={styles.inlineHint}>{t('gate.wallet_inline.hint')}</p>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!gateWalletUrl.trim() || gateWalletBusy) return
                  setGateWalletBusy(true)
                  setGateWalletError('')
                  void connectWalletInline(gateWalletUrl.trim())
                    .then((result) => {
                      if (result.success) {
                        setGateWalletStatus(result.status)
                        setGateWalletUrl('')
                        setNotice(t('gate.wallet_inline.connected'))
                      } else {
                        const errorKey = result.error === 'INVALID_NWC_URL'
                          ? 'gate.wallet_inline.error_invalid_url'
                          : result.error === 'NWC_INCOMPATIBLE'
                            ? 'gate.wallet_inline.error_incompatible'
                            : 'gate.wallet_inline.error_generic'
                        setGateWalletError(t(errorKey))
                      }
                    })
                    .finally(() => setGateWalletBusy(false))
                }}
              >
                <input
                  className="app-input"
                  type="password"
                  value={gateWalletUrl}
                  onChange={(event) => setGateWalletUrl(event.target.value)}
                  placeholder={t('gate.wallet_inline.placeholder')}
                />
                <div className="app-actions">
                  <button
                    className="app-button app-button--primary"
                    type="submit"
                    disabled={!gateWalletUrl.trim() || gateWalletBusy}
                  >
                    {gateWalletBusy ? t('gate.wallet_inline.connecting') : t('gate.wallet_inline.connect')}
                  </button>
                </div>
              </form>
              {gateWalletError && <p className="status-message status-message--warning">{gateWalletError}</p>}
            </div>
          )}
          {gateWalletStatus?.connected && (
            <div className={styles.summaryBox}>
              <strong>{t('gate.wallet_inline.connected')}</strong>
              {typeof gateWalletStatus.balanceSats === 'number' && (
                <p>{t('gate.wallet_inline.balance', { sats: String(gateWalletStatus.balanceSats) })}</p>
              )}
              <div className="app-actions">
                <button
                  className="app-button app-button--ghost"
                  type="button"
                  disabled={gateWalletBusy}
                  onClick={() => {
                    setGateWalletBusy(true)
                    void disconnectWalletInline()
                      .then(() => {
                        setGateWalletStatus(null)
                        setNotice('')
                      })
                      .finally(() => setGateWalletBusy(false))
                  }}
                >
                  {t('gate.wallet_inline.disconnect')}
                </button>
              </div>
            </div>
          )}
          <div className="app-actions">
            <button className="app-button app-button--primary" type="button" disabled={busy} onClick={() => void saveGate()}>
              {gatePrimaryLabel()}
            </button>
          </div>

        </section>
      )
    }

    if (currentStep === 'objectives') {
      return (
        <section className={styles.card}>
          <h2 className="app-title app-title--section">{t('flow.objectives.title')}</h2>
          <p className="app-copy">{t('flow.objectives.copy')}</p>
          <p className={styles.inlineHint}>{t('flow.objectives.helper')}</p>
          <textarea
            className={`intake-control intake-control--textarea ${styles.largeTextarea}`}
            value={objectivesText}
            onChange={(event) => setObjectivesText(event.target.value)}
            placeholder={t('flow.objectives.placeholder')}
            rows={8}
          />
          {goalLines.length > 0 && (
            <div className={styles.pillRow}>
              <span className={styles.pill}>{t('flow.objectives.count', { count: String(goalLines.length) })}</span>
              <span className={styles.pill}>{t('flow.objectives.priority')}</span>
            </div>
          )}
          <div className="app-actions">
            {!objectivesText.trim() && (
              <button
                className="app-button app-button--secondary"
                type="button"
                onClick={() => setObjectivesText('Entrar a trabajar en Google')}
              >
                Precargar dato de prueba
              </button>
            )}
            <button className="app-button app-button--primary" type="button" disabled={busy || !objectivesText.trim()} onClick={() => void saveObjectives()}>
              {t('flow.actions.save_objectives')}
            </button>
          </div>
        </section>
      )
    }

    if (currentStep === 'intake') {
      return (
        <section className={styles.card}>
          <h2 className="app-title app-title--section">{intakeBlock?.title || t('flow.intake.title')}</h2>
          <p className="app-copy">{intakeBlock?.description || t('flow.intake.copy')}</p>
          <div className={styles.blockMeta}>
            <span className={styles.pill}>
              {t('flow.intake.block_progress', {
                current: String(Math.max(intakeBlockIndex + 1, 1)),
                total: String(activeSession.state.intakeBlocks.length)
              })}
            </span>
            <span className={styles.pill}>{t('flow.intake.autosave')}</span>
          </div>
          <p className={styles.inlineHint}>{t('flow.intake.block_hint')}</p>
          {intakeBlock?.questions.map((question) => (
            <label key={question.id} className={styles.field}>
              <span>{question.label}</span>
              {question.type === 'textarea' ? (
                <textarea
                  className="intake-control intake-control--textarea"
                  rows={4}
                  value={intakeAnswers[question.key] || ''}
                  placeholder={question.placeholder || ''}
                  onChange={(event) => {
                    setIntakeAnswers((current) => ({ ...current, [question.key]: event.target.value }))
                    setIntakeDirty(true)
                  }}
                />
              ) : question.type === 'select' ? (
                <select
                  className="intake-control"
                  value={intakeAnswers[question.key] || ''}
                  onChange={(event) => {
                    setIntakeAnswers((current) => ({ ...current, [question.key]: event.target.value }))
                    setIntakeDirty(true)
                  }}
                >
                  <option value="">{t('flow.intake.select_placeholder')}</option>
                  {question.options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              ) : question.type === 'range' ? (
                <div className={styles.rangeField}>
                  <div className={styles.rangeHeader}>
                    <strong className={styles.rangeValue}>
                      {intakeAnswers[question.key]
                        ? t('flow.intake.range_value', {
                            value: intakeAnswers[question.key],
                            unit: question.unit || ''
                          })
                        : t('flow.intake.range_empty')}
                    </strong>
                    <span className={styles.rangeBounds}>
                      {`${question.min ?? 0} - ${question.max ?? 10}${question.unit ? ` ${question.unit}` : ''}`}
                    </span>
                  </div>
                  <input
                    className={styles.rangeInput}
                    type="range"
                    min={question.min ?? 0}
                    max={question.max ?? 10}
                    step={question.step ?? 1}
                    value={intakeAnswers[question.key] || String(question.min ?? 0)}
                    onPointerDown={() => {
                      if (!intakeAnswers[question.key]) {
                        setIntakeAnswers((current) => ({ ...current, [question.key]: String(question.min ?? 0) }))
                        setIntakeDirty(true)
                      }
                    }}
                    onKeyDown={() => {
                      if (!intakeAnswers[question.key]) {
                        setIntakeAnswers((current) => ({ ...current, [question.key]: String(question.min ?? 0) }))
                        setIntakeDirty(true)
                      }
                    }}
                    onChange={(event) => {
                      setIntakeAnswers((current) => ({ ...current, [question.key]: event.target.value }))
                      setIntakeDirty(true)
                    }}
                  />
                </div>
              ) : (
                <input
                  className="intake-control"
                  type={question.type === 'number' ? 'number' : question.type === 'time' ? 'time' : 'text'}
                  value={intakeAnswers[question.key] || ''}
                  placeholder={question.placeholder || ''}
                  min={question.type === 'number' ? question.min ?? undefined : undefined}
                  max={question.type === 'number' ? question.max ?? undefined : undefined}
                  step={question.type === 'number' ? question.step ?? 1 : undefined}
                  inputMode={question.type === 'number' ? 'numeric' : undefined}
                  onChange={(event) => {
                    setIntakeAnswers((current) => ({ ...current, [question.key]: event.target.value }))
                    setIntakeDirty(true)
                  }}
                />
              )}
            </label>
          ))}
          <div className="app-actions">
            {!intakeBlockReady && (
              <button
                className="app-button app-button--secondary"
                type="button"
                onClick={() => {
                  if (!intakeBlock) return
                  const nextAnswers = { ...intakeAnswers }
                  intakeBlock.questions.forEach((q) => {
                    if (!nextAnswers[q.key]) {
                      nextAnswers[q.key] = q.type === 'number' ? String(q.min ?? 1) : q.type === 'time' ? '09:00' : 'Texto de prueba'
                    }
                  })
                  setIntakeAnswers(nextAnswers)
                  setIntakeDirty(true)
                }}
              >
                Precargar form
              </button>
            )}
            <button className="app-button app-button--primary" type="button" disabled={busy || !intakeBlockReady} onClick={() => void saveIntake(false)}>
              {t('flow.actions.save_continue')}
            </button>
          </div>
        </section>
      )
    }

    if (currentStep === 'strategy') {
      return (
        <section className={styles.card}>
          <h2 className="app-title app-title--section">{t('flow.strategy.title')}</h2>
          <p className="app-copy">{t('flow.strategy.copy')}</p>
          <div className={styles.summaryBox}>
            <strong>{t('flow.strategy.includes_title')}</strong>
            <ul className={styles.helperList}>
              <li>{t('flow.strategy.includes_1')}</li>
              <li>{t('flow.strategy.includes_2')}</li>
              <li>{t('flow.strategy.includes_3')}</li>
            </ul>
          </div>
          <div className="app-actions">
            <button className="app-button app-button--primary" type="button" disabled={busy} onClick={() => void runStrategy()}>
              {t('flow.actions.generate_strategy')}
            </button>
          </div>
        </section>
      )
    }

    if (currentStep === 'reality-check') {
      return (
        <section className={styles.card}>
          <h2 className="app-title app-title--section">{t('flow.reality.title')}</h2>
          <p className="app-copy">{t('flow.reality.copy')}</p>
          {strategy && renderStrategyOverview(strategy)}
          {realityCheck && renderRealityOverview(realityCheck)}
          <p className={styles.inlineHint}>{t('flow.reality.action_hint')}</p>
          <div className={styles.buttonRow}>
            <button className="app-button app-button--primary" type="button" disabled={busy} onClick={() => void applyReality('keep')}>
              {t('flow.actions.keep')}
            </button>
            <button className="app-button app-button--secondary" type="button" disabled={busy} onClick={() => void applyReality('reduce_load')}>
              {t('flow.actions.reduce_load')}
            </button>
            <button className="app-button app-button--secondary" type="button" disabled={busy} onClick={() => void applyReality('extend_timeline')}>
              {t('flow.actions.extend_timeline')}
            </button>
            <button className="app-button app-button--secondary" type="button" disabled={busy} onClick={() => void applyReality('auto_prioritize')}>
              {t('flow.actions.auto_prioritize')}
            </button>
          </div>
        </section>
      )
    }

    if (currentStep === 'simulation') {
      return (
        <section className={styles.card}>
          <h2 className="app-title app-title--section">{t('flow.simulation.title')}</h2>
          <p className="app-copy">{t('flow.simulation.copy')}</p>
          {strategy && (
            <div className={styles.summaryBox}>
              <strong>{t('flow.simulation.current_plan_title')}</strong>
              <p>{strategy.summary}</p>
              <div className={styles.blockMeta}>
                <span className={styles.pill}>{t('flow.strategy.weekly_load', { count: String(strategy.estimatedWeeklyHours) })}</span>
                <span className={styles.pill}>{t('flow.strategy.phase_count', { count: String(strategy.phases.length) })}</span>
              </div>
            </div>
          )}
          {realityCheck && (
            <div className={styles.summaryBox}>
              <strong>{t('flow.simulation.reality_title')}</strong>
              <p>{realityCheck.summary}</p>
            </div>
          )}
          <div className={styles.summaryBox}>
            <strong>{t('flow.simulation.review_title')}</strong>
            <ul className={styles.helperList}>
              <li>{t('flow.simulation.review_1')}</li>
              <li>{t('flow.simulation.review_2')}</li>
              <li>{t('flow.simulation.review_3')}</li>
            </ul>
          </div>
          {simulation && (
            <>
              <div className={styles.summaryBox}>
                <div className={styles.phaseHeader}>
                  <strong>{t('flow.simulation.method_title')}</strong>
                  <span className={styles.pill}>
                    {simulation.method === 'hybrid-llm'
                      ? t('flow.simulation.method_hybrid')
                      : t('flow.simulation.method_rules')}
                  </span>
                </div>
                <p>{simulation.reviewSummary}</p>
              </div>
              <div className={styles.summaryBox}>
                <strong>{t('flow.simulation.checked_title')}</strong>
                <ul className={styles.helperList}>
                  {simulation.checkedAreas.map((area) => (
                    <li key={area}>{area}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.phaseList}>
                {simulation.iterations.map((iteration) => (
                  <article key={iteration.index} className={styles.phaseCard}>
                    <div className={styles.phaseHeader}>
                      <strong>{t('flow.simulation.iteration_title', { count: String(iteration.index) })}</strong>
                      <span
                        className={`${styles.statusBadge} ${
                          iteration.status === 'PASS'
                            ? styles.statusBadgeOk
                            : iteration.status === 'WARN'
                              ? styles.statusBadgeWarn
                              : styles.statusBadgeFail
                        }`}
                      >
                        {t(`flow.simulation.status_${iteration.status.toLowerCase()}`)}
                      </span>
                    </div>
                    <p>{iteration.summary}</p>
                    <ul className={styles.helperList}>
                      {iteration.changes.map((change) => (
                        <li key={`${iteration.index}-${change}`}>{change}</li>
                      ))}
                    </ul>
                  </article>
                ))}
                {simulation.findings.length > 0 && (
                  <div className={styles.summaryBox}>
                    <strong>{t('flow.simulation.findings_title')}</strong>
                    <ul className={styles.flatList}>
                      {simulation.findings.map((finding) => (
                        <li key={finding}>{finding}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
          {renderSimTree()}
          <div className={styles.buttonRow}>
            <button className="app-button app-button--primary" type="button" disabled={busy} onClick={() => void runSimulation()}>
              {t('flow.actions.run_simulation')}
            </button>
            {simulation && (
              <button className="app-button app-button--secondary" type="button" disabled={busy} onClick={() => void loadPresentation()}>
                {t('flow.actions.continue_presentation')}
              </button>
            )}
          </div>
        </section>
      )
    }

    if (currentStep === 'presentation') {
      return (
        <section className={styles.card}>
          <h2 className="app-title app-title--section">{t('flow.presentation.title')}</h2>
          <p className="app-copy">{presentation?.summary || t('flow.presentation.copy')}</p>
          <p className={styles.inlineHint}>{t('flow.presentation.autosave')}</p>
          {!presentation ? (
            <div className="app-actions">
              <button className="app-button app-button--primary" type="button" disabled={busy} onClick={() => void loadPresentation()}>
                {t('flow.actions.prepare_presentation')}
              </button>
            </div>
          ) : (
            <>
              <div className={styles.summaryBox}>
                <strong>{t('flow.presentation.rounds', { count: String(presentation.feedbackRounds) })}</strong>
                <p>{presentation.latestFeedback || t('flow.presentation.copy')}</p>
              </div>
              <div className={styles.timeline}>
                {presentation.timeline.map((item) => (
                  <article key={item.id} className={styles.timelineItem}>
                    <input
                      className="intake-control"
                      value={presentationEdits[item.id]?.label || item.label}
                      disabled={busy}
                      onChange={(event) => updatePresentationEdit(item.id, 'label', event.target.value)}
                    />
                    <small>{item.window}</small>
                    <textarea
                      className="intake-control intake-control--textarea"
                      rows={3}
                      value={presentationEdits[item.id]?.detail || item.detail}
                      disabled={busy}
                      onChange={(event) => updatePresentationEdit(item.id, 'detail', event.target.value)}
                    />
                  </article>
                ))}
              </div>
              <label className={styles.field}>
                <span>{t('flow.presentation.feedback')}</span>
                <textarea
                  className="intake-control intake-control--textarea"
                  rows={4}
                  value={feedbackText}
                  disabled={busy}
                  onChange={(event) => setFeedbackText(event.target.value)}
                />
              </label>
              <div className={styles.buttonRow}>
                <button className="app-button app-button--secondary" type="button" disabled={busy} onClick={() => void submitPresentation(false, false)}>
                  {t('flow.actions.apply_feedback')}
                </button>
                <button className="app-button app-button--primary" type="button" disabled={busy} onClick={() => void submitPresentation(true, false)}>
                  {t('flow.actions.accept_plan')}
                </button>
              </div>
            </>
          )}
        </section>
      )
    }

    if (currentStep === 'calendar') {
      return (
        <section className={styles.card}>
          <h2 className="app-title app-title--section">{t('flow.calendar.title')}</h2>
          <p className="app-copy">{t('flow.calendar.copy')}</p>
          <p className={styles.inlineHint}>{t('flow.calendar.helper')}</p>
          <div className={styles.gridTable}>
            <div />
            <div>Mañana</div>
            <div>Tarde</div>
            <div>Noche</div>
            {DAY_LABELS.map((day) => (
              <React.Fragment key={day.key}>
                <div>{day.label}</div>
                <label className={styles.cell}><input type="checkbox" checked={calendarGrid[day.key].morning} onChange={(event) => updateCalendarSlot(day.key, 'morning', event.target.checked)} /></label>
                <label className={styles.cell}><input type="checkbox" checked={calendarGrid[day.key].afternoon} onChange={(event) => updateCalendarSlot(day.key, 'afternoon', event.target.checked)} /></label>
                <label className={styles.cell}><input type="checkbox" checked={calendarGrid[day.key].evening} onChange={(event) => updateCalendarSlot(day.key, 'evening', event.target.checked)} /></label>
              </React.Fragment>
            ))}
          </div>
          <label className={styles.field}>
            <span>{t('flow.calendar.notes')}</span>
            <textarea className="intake-control intake-control--textarea" rows={3} value={calendarNotes} onChange={(event) => setCalendarNotes(event.target.value)} />
          </label>
          <label className={styles.field}>
            <span>{t('flow.calendar.ics')}</span>
            <textarea className="intake-control intake-control--textarea" rows={3} value={icsText} onChange={(event) => setIcsText(event.target.value)} />
          </label>
          <p className={styles.inlineHint}>{t('flow.calendar.ics_hint')}</p>
          <div className="app-actions">
            <button className="app-button app-button--primary" type="button" disabled={busy} onClick={() => void saveCalendar()}>
              {t('flow.actions.save_calendar')}
            </button>
          </div>
        </section>
      )
    }

    if (currentStep === 'topdown') {
      return (
        <section className={styles.card}>
          <h2 className="app-title app-title--section">{t('flow.topdown.title')}</h2>
          <p className="app-copy">{t('flow.topdown.copy')}</p>
          {!topdownHasLevels ? (
            <div className={styles.summaryBox}>
              <strong>{t('flow.topdown.empty')}</strong>
            </div>
          ) : (
            <>
              <div className={styles.blockMeta}>
                <span className={styles.pill}>
                  {t('flow.topdown.progress', {
                    current: String((topdown?.currentLevelIndex ?? 0) + 1),
                    total: String(topdown?.levels.length ?? 0)
                  })}
                </span>
                {isLastTopdownLevel && <span className={styles.pill}>{t('flow.topdown.last')}</span>}
              </div>
              {currentTopLevel && (
                <div className={styles.summaryBox}>
                  <strong>{currentTopLevel.title}</strong>
                  <p>{currentTopLevel.summary}</p>
                  <div className={styles.phaseList}>
                    {currentTopLevel.samples.map((sample) => (
                      <div key={sample.id} className={styles.phaseCard}>
                        <strong>{sample.label}</strong>
                        <ul className={styles.flatList}>
                          {sample.items.map((item) => (
                            <li key={`${sample.id}-${item}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          <div className={styles.buttonRow}>
            {!topdownHasLevels ? (
              <button className="app-button app-button--primary" type="button" disabled={busy} onClick={() => void runTopDown('generate')}>
                {t('flow.actions.generate_breakdown')}
              </button>
            ) : (
              <>
                {Boolean(topdown && topdown.currentLevelIndex > 0) && (
                  <button className="app-button app-button--secondary" type="button" disabled={busy} onClick={() => void runTopDown('back')}>
                    {t('flow.actions.back_level')}
                  </button>
                )}
                <button className="app-button app-button--secondary" type="button" disabled={busy} onClick={() => void runTopDown('revise')}>
                  {t('flow.actions.revise_level')}
                </button>
                <button className="app-button app-button--primary" type="button" disabled={busy} onClick={() => void runTopDown('confirm')}>
                  {isLastTopdownLevel ? t('flow.actions.confirm_last_level') : t('flow.actions.confirm_level')}
                </button>
              </>
            )}
          </div>
        </section>
      )
    }

    if (currentStep === 'activation') {
      return (
        <section className={styles.card}>
          <h2 className="app-title app-title--section">{t('flow.activation.title')}</h2>
          <p className="app-copy">{t('flow.activation.copy')}</p>
          <div className="app-actions">
            <button className="app-button app-button--primary" type="button" disabled={busy} onClick={() => void activatePlan()}>
              {t('flow.actions.activate')}
            </button>
          </div>
        </section>
      )
    }

    return (
      <section className={styles.card}>
        <h2 className="app-title app-title--section">{t('flow.done.title')}</h2>
        <p className="app-copy">{t('flow.done.copy')}</p>
        
        <div className={styles.summaryBox}>
          <h3 className="app-title app-title--subsection">Árbol de Simulación Creado</h3>
          <p className="app-copy">Puedes revisar el resultado, exportarlo o volver a la simulación si quieres probar con otros parámetros.</p>
          {renderSimTree()}
        </div>

        <div className="app-actions">
          <button className="app-button app-button--primary" type="button" onClick={() => router.push('/')}>
            {t('flow.actions.go_dashboard')}
          </button>
          <button className="app-button app-button--secondary" type="button" onClick={() => void startNewFlow()}>
            {t('flow.actions.start_new')}
          </button>
        </div>
      </section>
    )
  }

  return (
    <>
      <div className="app-shell">
        <div className={`app-screen ${styles.layout}`}>
          <aside className={styles.sidebar}>
          <span className="app-status app-status--eyebrow">{t('flow.eyebrow')}</span>
          <h1 className="app-title">{planTitle(session)}</h1>
          <p className="app-copy">{t('flow.subtitle')}</p>
          <button
            className={`app-button app-button--secondary ${styles.inspectorButton}`}
            type="button"
            onClick={() => setDebugPanelVisible((visible) => !visible)}
          >
            {debugPanelVisible ? t('debug.disable') : t('debug.panel_title')}
          </button>
          <ol className={styles.stepRail}>
            {STEP_ORDER.map((step, index) => (
              <li
                key={step}
                className={`${styles.stepItem} ${index < currentStepIndex ? styles.stepItemDone : ''} ${index === currentStepIndex ? styles.stepItemCurrent : ''} ${index > currentStepIndex ? styles.stepItemUpcoming : ''}`}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{stepLabel(step)}</strong>
              </li>
            ))}
          </ol>
          {checkpointSummary.length > 0 && (
            <div className={styles.summaryBox}>
              <strong>{t('flow.checkpoints.title')}</strong>
              <ul className={styles.flatList}>
                {checkpointSummary.map((checkpoint) => (
                  <li key={checkpoint.id}>{`${checkpoint.code} · ${checkpointTime(checkpoint.createdAt)}`}</li>
                ))}
              </ul>
            </div>
          )}

          {currentStepIndex >= 5 && (
            <div className={styles.summaryBox}>
              <strong>Descargar datos completos</strong>
              <p className={styles.inlineHint} style={{ marginBottom: '1rem', marginTop: '0.25rem' }}>Podés descargar tu árbol de simulación intermedio en cualquier momento.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button
                  className="app-button app-button--secondary"
                  type="button"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                  disabled={busy}
                  onClick={() => void handleExportSimulation('json')}
                >
                  {t('simulation.tree.export.format_json')}
                </button>
                <button
                  className="app-button app-button--ghost"
                  type="button"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                  disabled={busy}
                  onClick={() => void handleExportSimulation('csv')}
                >
                  {t('simulation.tree.export.format_csv')}
                </button>
              </div>
            </div>
          )}
        </aside>

          <main className={styles.mainColumn}>
          <section className={`${styles.card} ${styles.stepBanner}`}>
            <div className={styles.stepBannerMeta}>
              <span className={styles.pill}>{t('flow.banner.step', { current: String(displayStepIndex), total: String(totalTaskSteps) })}</span>
              {upcomingStep && <span className={styles.pill}>{t('flow.banner.next', { step: stepLabel(upcomingStep) })}</span>}
            </div>
            <h2 className={`app-title app-title--section ${styles.stepBannerTitle}`}>{stepLabel(currentStep)}</h2>
            <p className={`app-copy ${styles.stepBannerHint}`}>{stepBannerCopy(currentStep)}</p>
          </section>

          {progress && (
            <p className="status-message status-message--neutral" role="status" aria-live="polite">
              {`${progress.message} (${progress.current}/${progress.total})`}
            </p>
          )}
          {notice && <p className="status-message status-message--success" role="status" aria-live="polite">{notice}</p>}
          {error && <p className="status-message status-message--warning" role="alert">{error}</p>}
          {renderStepContent()}
          {showResumeCard && session.lastCheckpointCode && (
            <section className={styles.card}>
              <h2 className="app-title app-title--section">{t('flow.resume.title')}</h2>
              <p className="app-copy">{t('flow.resume.copy')}</p>
              <textarea
                className="intake-control intake-control--textarea"
                rows={3}
                value={changeSummary}
                placeholder={t('flow.resume.placeholder')}
                onChange={(event) => setChangeSummary(event.target.value)}
              />
              <div className="app-actions">
                <button className="app-button app-button--secondary" type="button" disabled={busy || !changeSummary.trim()} onClick={() => void applyResume()}>
                  {t('flow.actions.apply_resume')}
                </button>
              </div>
            </section>
          )}
          </main>
        </div>
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
    </>
  )
}
