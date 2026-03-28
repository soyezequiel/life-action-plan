'use client'

import React from 'react'
import { startTransition, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import type { GoalClassification, GoalType } from '../../src/lib/domain/goal-taxonomy'
import type { TimeEventItem } from '../../src/lib/domain/plan-item'
import type { PackageOutput, UserProfileV5 } from '../../src/lib/pipeline/v5/phase-io-v5'
import type { SchedulerOutput } from '../../src/lib/scheduler/types'
import { interactiveFlowClient } from '../../src/lib/client/interactive-flow-client'
import {
  ACTIVE_WORKFLOW_ID_STORAGE_KEY,
  ACTIVE_INTERACTIVE_SESSION_ID_STORAGE_KEY,
  LOCAL_PROFILE_ID_STORAGE_KEY
} from '../../src/lib/client/storage-keys'
import type { DeploymentMode } from '../../src/lib/env/deployment'
import type {
  InteractivePauseFromPhase,
  InteractiveSessionResponsePayload,
  PausePointSnapshot
} from '../../src/shared/schemas/pipeline-interactive'
import { t } from '../../src/i18n'
import { ClassifyReviewStep } from './ClassifyReviewStep'
import { PackageReviewStep } from './PackageReviewStep'
import { ProfileEditStep } from './ProfileEditStep'
import { RequirementsAnswerStep } from './RequirementsAnswerStep'
import { ScheduleEditStep } from './ScheduleEditStep'
import { pausePhaseLabel } from './labels'
import styles from './InteractiveFlowPage.module.css'

const STEP_ORDER: Array<{
  phase: InteractivePauseFromPhase | 'package'
  type: PausePointSnapshot['type']
}> = [
  { phase: 'classify', type: 'classify_review' },
  { phase: 'requirements', type: 'requirements_answer' },
  { phase: 'profile', type: 'profile_edit' },
  { phase: 'schedule', type: 'schedule_edit' },
  { phase: 'package', type: 'package_review' }
]

const DEFAULT_PROFILE_DRAFT: UserProfileV5 = {
  freeHoursWeekday: 2,
  freeHoursWeekend: 4,
  energyLevel: 'medium',
  fixedCommitments: [],
  scheduleConstraints: []
}

function getStoredSessionId(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage.getItem(ACTIVE_INTERACTIVE_SESSION_ID_STORAGE_KEY)
}

function setStoredSessionId(sessionId: string | null): void {
  if (typeof window === 'undefined') {
    return
  }

  if (sessionId) {
    window.localStorage.setItem(ACTIVE_INTERACTIVE_SESSION_ID_STORAGE_KEY, sessionId)
    return
  }

  window.localStorage.removeItem(ACTIVE_INTERACTIVE_SESSION_ID_STORAGE_KEY)
}

function getLocalProfileId(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const value = window.localStorage.getItem(LOCAL_PROFILE_ID_STORAGE_KEY)?.trim()
  return value || undefined
}

function getActiveWorkflowId(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const value = window.localStorage.getItem(ACTIVE_WORKFLOW_ID_STORAGE_KEY)?.trim()
  return value || undefined
}

function translateClientError(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : ''
  if (!message || message === 'REQUEST_FAILED') {
    return t('errors.generic')
  }

  return message
}

function getSessionGoalText(session: InteractiveSessionResponsePayload | null, fallbackGoal: string): string {
  const snapshotGoal = session?.snapshot.run?.goalText?.trim()
  return snapshotGoal || fallbackGoal.trim()
}

function getCurrentStepIndex(session: InteractiveSessionResponsePayload | null): number {
  if (!session) {
    return 0
  }

  if (session.status === 'completed') {
    return STEP_ORDER.length - 1
  }

  const pauseType = session.pausePoint?.type
  const stepIndex = STEP_ORDER.findIndex((step) => step.type === pauseType)
  return stepIndex >= 0 ? stepIndex : 0
}

function getVisitedSteps(session: InteractiveSessionResponsePayload | null): Set<string> {
  return new Set((session?.snapshot.pauseHistory ?? []).map((pause) => pause.phase))
}

function diffProfile(base: UserProfileV5, draft: UserProfileV5): Partial<UserProfileV5> {
  const next: Partial<UserProfileV5> = {}

  if (base.freeHoursWeekday !== draft.freeHoursWeekday) {
    next.freeHoursWeekday = draft.freeHoursWeekday
  }

  if (base.freeHoursWeekend !== draft.freeHoursWeekend) {
    next.freeHoursWeekend = draft.freeHoursWeekend
  }

  if (base.energyLevel !== draft.energyLevel) {
    next.energyLevel = draft.energyLevel
  }

  if (base.fixedCommitments.join('|') !== draft.fixedCommitments.join('|')) {
    next.fixedCommitments = draft.fixedCommitments
  }

  if (base.scheduleConstraints.join('|') !== draft.scheduleConstraints.join('|')) {
    next.scheduleConstraints = draft.scheduleConstraints
  }

  return next
}

function extractSignals(classification: GoalClassification): string[] {
  return Object.entries(classification.extractedSignals)
    .filter(([, value]) => value)
    .map(([key]) => key)
}

interface InteractiveFlowPageProps {
  deploymentMode: DeploymentMode
}

export function InteractiveFlowPage({ deploymentMode }: InteractiveFlowPageProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [session, setSession] = useState<InteractiveSessionResponsePayload | null>(null)
  const [goalText, setGoalText] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [classifyDraft, setClassifyDraft] = useState<{ goalType: GoalType | null; context: string }>({
    goalType: null,
    context: ''
  })
  const [requirementsDraft, setRequirementsDraft] = useState<Record<string, string>>({})
  const [profileDraft, setProfileDraft] = useState<UserProfileV5>(DEFAULT_PROFILE_DRAFT)
  const [scheduleDraft, setScheduleDraft] = useState<TimeEventItem[]>([])
  const [regenerateFrom, setRegenerateFrom] = useState<InteractivePauseFromPhase | null>('schedule')

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const storedSessionId = getStoredSessionId()

      if (!storedSessionId) {
        setLoading(false)
        return
      }

      try {
        const nextSession = await interactiveFlowClient.getSession(storedSessionId)
        if (!cancelled) {
          setSession(nextSession)
          setGoalText(getSessionGoalText(nextSession, ''))
        }
      } catch {
        setStoredSessionId(null)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const pausePoint = session?.pausePoint
    if (!pausePoint) {
      return
    }

    if (pausePoint.type === 'classify_review') {
      const output = pausePoint.output as GoalClassification
      const userInput = pausePoint.userInput as { goalType?: GoalType; context?: string } | undefined
      setClassifyDraft({
        goalType: userInput?.goalType ?? output.goalType,
        context: userInput?.context ?? ''
      })
      return
    }

    if (pausePoint.type === 'requirements_answer') {
      const userInput = pausePoint.userInput as { answers?: Record<string, string> } | undefined
      setRequirementsDraft(userInput?.answers ?? {})
      return
    }

    if (pausePoint.type === 'profile_edit') {
      const output = pausePoint.output as UserProfileV5
      const userInput = pausePoint.userInput as Partial<UserProfileV5> | undefined
      setProfileDraft({
        ...output,
        ...(userInput ?? {})
      })
      return
    }

    if (pausePoint.type === 'schedule_edit') {
      const output = pausePoint.output as SchedulerOutput
      const userInput = pausePoint.userInput as { events?: TimeEventItem[] } | undefined
      setScheduleDraft(userInput?.events ?? output.events)
      return
    }

    if (pausePoint.type === 'package_review') {
      const userInput = pausePoint.userInput as { regenerateFrom?: InteractivePauseFromPhase } | undefined
      setRegenerateFrom(userInput?.regenerateFrom ?? 'schedule')
    }
  }, [session?.pausePoint?.id, session?.pausePoint?.type])

  async function handleCreateSession(): Promise<void> {
    const normalizedGoal = goalText.trim()
    if (!normalizedGoal) {
      setError(t('flowInteractive.createGoalRequired'))
      return
    }

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const workflowId = getActiveWorkflowId()
      const nextSession = await interactiveFlowClient.createSession({
        goalText: normalizedGoal,
        profileId: getLocalProfileId(),
        workflowId,
        ...(deploymentMode === 'local' && !workflowId
          ? {
              provider: 'ollama',
              resourceMode: 'auto' as const
            }
          : {})
      })

      setSession(nextSession)
      setStoredSessionId(nextSession.sessionId)
      setGoalText(getSessionGoalText(nextSession, normalizedGoal))
    } catch (cause) {
      setError(translateClientError(cause))
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteSession(): Promise<void> {
    if (!session) {
      return
    }

    setBusy(true)
    setError('')

    try {
      await interactiveFlowClient.deleteSession(session.sessionId)
      setSession(null)
      setNotice('')
      setStoredSessionId(null)
    } catch (cause) {
      setError(translateClientError(cause))
    } finally {
      setBusy(false)
    }
  }

  async function submitPauseInput(input: unknown): Promise<void> {
    if (!session?.pausePoint) {
      return
    }

    setBusy(true)
    setError('')
    setNotice(t('flowInteractive.noticeResuming'))

    try {
      const nextSession = await interactiveFlowClient.applyInput(session.sessionId, {
        pauseId: session.pausePoint.id,
        input
      })

      setSession(nextSession)
      setGoalText(getSessionGoalText(nextSession, goalText))

      if (nextSession.status === 'completed' && nextSession.planId) {
        setStoredSessionId(null)
        startTransition(() => {
          router.push(`/plan/v5?planId=${encodeURIComponent(nextSession.planId ?? '')}`)
        })
        return
      }

      setStoredSessionId(nextSession.status === 'active' ? nextSession.sessionId : null)
      setNotice(nextSession.pausePoint ? t('flowInteractive.noticePaused') : '')
    } catch (cause) {
      setError(translateClientError(cause))
      setNotice('')
    } finally {
      setBusy(false)
    }
  }

  const pausePoint = session?.pausePoint ?? null
  const currentStepIndex = getCurrentStepIndex(session)
  const visitedSteps = getVisitedSteps(session)
  const sessionGoalText = getSessionGoalText(session, goalText)

  if (loading) {
    return <p className="app-status app-status--busy">{t('flow.loading')}</p>
  }

  if (!session) {
    return (
      <section className={styles.entryLayout}>
        <div className={`${styles.surface} ${styles.entrySurface}`}>
          <p className={styles.eyebrow}>{t('flowInteractive.eyebrow')}</p>
          <h1 className={`app-title ${styles.title}`}>{t('flowInteractive.title')}</h1>
          <p className={styles.copy}>{t('flowInteractive.subtitle')}</p>

          {error && <div className={styles.errorBox}>{error}</div>}

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('flowInteractive.goalLabel')}</span>
            <textarea
              className={styles.goalInput}
              value={goalText}
              onChange={(event) => setGoalText(event.currentTarget.value)}
              placeholder={t('flowInteractive.goalPlaceholder')}
              disabled={busy}
            />
          </div>

          <ul className={styles.infoList}>
            <li>{t('flowInteractive.entryPointOne')}</li>
            <li>{t('flowInteractive.entryPointTwo')}</li>
            <li>{t('flowInteractive.entryPointThree')}</li>
          </ul>

          <div className={styles.entryActions}>
            <button
              type="button"
              className="app-button app-button--primary"
              onClick={() => void handleCreateSession()}
              disabled={busy}
            >
              {busy ? t('flowInteractive.busy') : t('flowInteractive.start')}
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (session.status === 'completed' && session.planId) {
    return (
      <section className={styles.entryLayout}>
        <div className={`${styles.surface} ${styles.entrySurface} ${styles.completedSurface}`}>
          <p className={styles.eyebrow}>{t('flowInteractive.completeEyebrow')}</p>
          <h1 className={styles.completedTitle}>{t('flowInteractive.completeTitle')}</h1>
          <p className={styles.copy}>{t('flowInteractive.completeCopy')}</p>
          <div className={styles.metaRow}>
            <span className={`${styles.statusChip} ${styles.statusChipDone}`}>{t('flowInteractive.status.completed')}</span>
            <span className={styles.chip}>{t('flowInteractive.planReady', { planId: session.planId })}</span>
          </div>
          <div className={styles.entryActions}>
            <button
              type="button"
              className="app-button app-button--primary"
              onClick={() => router.push(`/plan/v5?planId=${encodeURIComponent(session.planId ?? '')}`)}
            >
              {t('flowInteractive.openPlan')}
            </button>
            <button
              type="button"
              className="app-button app-button--secondary"
              onClick={() => {
                setSession(null)
                setGoalText('')
                setStoredSessionId(null)
              }}
            >
              {t('flowInteractive.startAnother')}
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={`${styles.surface} ${styles.sidebarSurface}`}>
          <p className={styles.eyebrow}>{t('flowInteractive.sidebarEyebrow')}</p>
          <h1 className={styles.sessionTitle}>{t('flowInteractive.workspaceTitle')}</h1>
          <p className={styles.sessionGoal}>{sessionGoalText}</p>

          <div className={styles.sessionMeta}>
            <span className={`${styles.statusChip} ${styles.statusChipActive}`}>{t('flowInteractive.status.active')}</span>
            <span className={styles.chip}>{t('flowInteractive.stepCounter', { current: currentStepIndex + 1, total: STEP_ORDER.length })}</span>
          </div>
        </div>

        <div className={`${styles.surface} ${styles.sidebarSurface}`}>
          <div className={styles.stepRail}>
            {STEP_ORDER.map((step, index) => {
              const isCurrent = pausePoint?.type === step.type
              const isDone = session.status === 'completed' || visitedSteps.has(step.phase)
              const canRegenerate = pausePoint?.type === 'package_review' && step.phase !== 'package' && isDone

              return (
                <button
                  key={step.phase}
                  type="button"
                  className={[
                    styles.stepButton,
                    isCurrent ? styles.stepButtonCurrent : '',
                    isDone ? styles.stepButtonDone : '',
                    canRegenerate ? styles.stepButtonClickable : '',
                    !canRegenerate && !isCurrent ? styles.stepButtonDisabled : ''
                  ].filter(Boolean).join(' ')}
                  onClick={() => {
                    if (canRegenerate && step.phase !== 'package') {
                      setRegenerateFrom(step.phase)
                      void submitPauseInput({
                        action: 'regenerate',
                        regenerateFrom: step.phase
                      })
                    }
                  }}
                  disabled={!canRegenerate || busy}
                >
                  <span className={`${styles.stepNumber} ${isCurrent ? styles.stepNumberCurrent : ''}`}>{index + 1}</span>
                  <span>
                    <strong className={styles.stepTitle}>{pausePhaseLabel(step.phase)}</strong>
                    <span className={styles.stepCopy}>
                      {isCurrent
                        ? t('flowInteractive.stepState.current')
                        : isDone
                          ? t('flowInteractive.stepState.done')
                          : t('flowInteractive.stepState.pending')}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      <div className={`${styles.surface} ${styles.contentSurface}`}>
        {notice && <div className={styles.noticeBox}>{notice}</div>}
        {error && <div className={styles.errorBox}>{error}</div>}

        {!pausePoint ? (
          <div className={styles.emptyState}>{t('flowInteractive.noPause')}</div>
        ) : pausePoint.type === 'classify_review' ? (
          <ClassifyReviewStep
            confidence={(pausePoint.output as GoalClassification).confidence}
            goalType={(pausePoint.output as GoalClassification).goalType}
            risk={(pausePoint.output as GoalClassification).risk}
            signals={extractSignals(pausePoint.output as GoalClassification)}
            draft={{
              goalType: classifyDraft.goalType ?? (pausePoint.output as GoalClassification).goalType,
              context: classifyDraft.context
            }}
            onGoalTypeChange={(goalType) => setClassifyDraft((current) => ({ ...current, goalType }))}
            onContextChange={(context) => setClassifyDraft((current) => ({ ...current, context }))}
            onSubmit={() => void submitPauseInput({
              goalType: classifyDraft.goalType ?? (pausePoint.output as GoalClassification).goalType,
              context: classifyDraft.context
            })}
            busy={busy}
          />
        ) : pausePoint.type === 'requirements_answer' ? (
          <RequirementsAnswerStep
            questions={Array.isArray((pausePoint.output as { questions?: unknown }).questions)
              ? ((pausePoint.output as { questions: unknown[] }).questions.filter((value): value is string => typeof value === 'string'))
              : []}
            answers={requirementsDraft}
            onAnswerChange={(key, value) => setRequirementsDraft((current) => ({ ...current, [key]: value }))}
            onSubmit={() => void submitPauseInput({ answers: requirementsDraft })}
            busy={busy}
          />
        ) : pausePoint.type === 'profile_edit' ? (
          <ProfileEditStep
            profile={pausePoint.output as UserProfileV5}
            draft={profileDraft}
            onDraftChange={setProfileDraft}
            onSubmit={() => void submitPauseInput(diffProfile(pausePoint.output as UserProfileV5, profileDraft))}
            busy={busy}
          />
        ) : pausePoint.type === 'schedule_edit' ? (
          <ScheduleEditStep
            schedule={pausePoint.output as SchedulerOutput}
            events={scheduleDraft}
            onEventsChange={setScheduleDraft}
            onReset={() => setScheduleDraft((pausePoint.output as SchedulerOutput).events)}
            onSubmit={() => void submitPauseInput({ events: scheduleDraft })}
            busy={busy}
          />
        ) : (
          <PackageReviewStep
            plan={pausePoint.output as PackageOutput}
            selectedRegenerateFrom={regenerateFrom}
            onSelectRegenerateFrom={setRegenerateFrom}
            onAccept={() => void submitPauseInput({ action: 'accept' })}
            onRegenerate={() => {
              if (!regenerateFrom) {
                setError(t('flowInteractive.regenerateRequired'))
                return
              }

              void submitPauseInput({
                action: 'regenerate',
                regenerateFrom
              })
            }}
            busy={busy}
          />
        )}

        <div className={styles.stepFooter}>
          <button
            type="button"
            className="app-button app-button--secondary"
            onClick={() => void handleDeleteSession()}
            disabled={busy}
          >
            {t('flowInteractive.deleteSession')}
          </button>
          {session.planId && (
            <button
              type="button"
              className="app-button app-button--ghost"
              onClick={() => router.push(`/plan/v5?planId=${encodeURIComponent(session.planId ?? '')}`)}
            >
              {t('flowInteractive.openPlan')}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
