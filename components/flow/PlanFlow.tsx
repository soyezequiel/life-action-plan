'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'

import { resumePlanBuild, startPlanBuild, type PlanStreamCallbacks } from '../../src/lib/client/plan-client'
import { t } from '../../src/i18n'
import type { ClarificationQuestion, ClarificationRound } from '../../src/lib/pipeline/v6/types'
import styles from './PlanFlow.module.css'

type FlowStep = 'input' | 'processing' | 'clarifying' | 'completed'

interface PlanFlowProps {
  profileId: string
  provider: string
}

interface GoalInputSectionProps {
  goalText: string
  busy: boolean
  profileReady: boolean
  onGoalTextChange: (value: string) => void
  onSubmit: () => void
}

interface ProgressSectionProps {
  phase: string
}

interface ClarificationSectionProps {
  round: number
  busy: boolean
  questions: ClarificationRound
  answers: Record<string, string>
  onAnswerChange: (questionId: string, value: string) => void
  onSubmit: () => void
}

interface CompletedSectionProps {
  completedPlanId: string | null
  completedScore: number
  completedIterations: number
}

interface DegradedState {
  message: string
  failedAgents: string
}

const COPY = {
  eyebrow: 'Plan guiado',
  inputTitle: 'Contanos qué querés lograr',
  inputCopy: 'Escribí tu objetivo en tus palabras. Después vamos a ordenar lo importante y, si hace falta, te haremos algunas preguntas breves.',
  missingProfile: 'Primero necesitamos tus datos guardados para poder armar el plan.',
  emptyGoal: 'Contanos qué querés lograr para empezar.',
  start: 'Crear mi plan',
  processingTitle: 'Estamos armando tu plan',
  processingCopy: 'Esto puede tardar un momento. Mientras tanto vamos revisando tu objetivo y ordenando los próximos pasos.',
  clarifyingTitle: 'Necesitamos un poco más de información',
  clarifyingTitleLater: 'Casi listo, unas preguntas más',
  clarifyingCopy: 'Respondé lo que puedas con tranquilidad. Con eso terminamos de ajustar el plan a tu realidad.',
  continue: 'Continuar',
  completedTitle: '¡Tu plan está listo!',
  completedCopy: 'Ya quedó preparado para que lo revises y sigas los próximos pasos.',
  openPlan: 'Abrir mi plan',
  openLatestPlan: 'Ver el plan disponible',
  genericError: 'No pudimos continuar en este momento. Probá de nuevo en unos minutos.',
  expiredSession: 'Estas preguntas ya se vencieron. Volvé a empezar y lo retomamos.',
  serviceUnavailable: 'Ahora mismo no pudimos usar el servicio que arma el plan. Probá de nuevo en unos minutos.',
  providerSetupRequired: 'Necesitás configurar esta conexión antes de usar este asistente.',
  missingAnswers: 'Falta responder algunas preguntas antes de continuar.',
  noPlanLink: 'El resultado ya quedó listo. Si todavía no ves el enlace exacto, podés abrir la vista del plan disponible.',
  answerHint: 'Respondé con el mayor detalle que te resulte cómodo.',
  numberRange: 'Rango sugerido: {min} a {max}',
  selectPlaceholder: 'Elegí una opción'
} as const

const PHASE_LABELS: Record<string, string> = {
  interpret: 'Analizando tu objetivo...',
  clarify: 'Preparando preguntas...',
  'clarify-resume': 'Procesando tus respuestas...',
  plan: 'Diseñando tu plan...',
  check: 'Verificando factibilidad...',
  schedule: 'Organizando tu calendario...',
  critique: 'Evaluando calidad...',
  revise: 'Mejorando el plan...',
  package: 'Preparando resultado final...'
}

const PHASE_PROGRESS_FLOORS: Record<string, number> = {
  interpret: 12,
  clarify: 24,
  'clarify-resume': 30,
  plan: 48,
  check: 62,
  schedule: 74,
  critique: 84,
  revise: 90,
  package: 96
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function getPhaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? 'Preparando tu plan...'
}

function getSidebarTitle(step: FlowStep): string {
  if (step === 'processing') {
    return COPY.processingTitle
  }

  if (step === 'clarifying') {
    return COPY.clarifyingTitle
  }

  if (step === 'completed') {
    return COPY.completedTitle
  }

  return COPY.inputTitle
}

function getSidebarCopy(step: FlowStep): string {
  if (step === 'processing') {
    return COPY.processingCopy
  }

  if (step === 'clarifying') {
    return COPY.clarifyingCopy
  }

  if (step === 'completed') {
    return COPY.completedCopy
  }

  return COPY.inputCopy
}

function getStatusLabel(step: FlowStep): string {
  if (step === 'processing') {
    return 'En curso'
  }

  if (step === 'clarifying') {
    return 'Esperando tus respuestas'
  }

  if (step === 'completed') {
    return 'Listo'
  }

  return 'Nuevo'
}

function getQualityLabel(score: number): string {
  if (score >= 85) {
    return 'Excelente plan'
  }

  if (score >= 70) {
    return 'Buen plan'
  }

  return 'Plan básico'
}

function getQuestionRangeText(question: ClarificationQuestion): string | null {
  if (typeof question.min !== 'number' || typeof question.max !== 'number') {
    return null
  }

  return COPY.numberRange
    .replace('{min}', String(question.min))
    .replace('{max}', String(question.max))
}

function buildInitialAnswers(round: ClarificationRound, currentAnswers: Record<string, string>): Record<string, string> {
  const nextAnswers: Record<string, string> = {}

  for (const question of round.questions) {
    const currentValue = currentAnswers[question.id]
    if (typeof currentValue === 'string') {
      nextAnswers[question.id] = currentValue
      continue
    }

    if (question.type === 'range') {
      if (typeof question.min === 'number' && typeof question.max === 'number') {
        nextAnswers[question.id] = String(Math.round((question.min + question.max) / 2))
        continue
      }

      if (typeof question.min === 'number') {
        nextAnswers[question.id] = String(question.min)
        continue
      }
    }

    nextAnswers[question.id] = ''
  }

  return nextAnswers
}

function isAnswerFilled(question: ClarificationQuestion, value: string | undefined): boolean {
  if (question.type === 'range') {
    return typeof value === 'string' && value.trim().length > 0
  }

  return typeof value === 'string' && value.trim().length > 0
}

function getFriendlyErrorMessage(message: string): string {
  const trimmed = message.trim()
  const normalized = trimmed.toLowerCase()

  if (!normalized) {
    return COPY.genericError
  }

  if (normalized.includes('session not found') || normalized.includes('expired')) {
    return COPY.expiredSession
  }

  if (
    normalized.includes('configurar tu conexion')
    || normalized.includes('configurar tu conexión')
    || normalized.includes('clave configurada')
    || normalized.includes('api key')
    || normalized.includes('provider_not_configured')
    || normalized.includes('credential_missing')
    || normalized.includes('codex_auth_missing')
  ) {
    return COPY.providerSetupRequired
  }

  if (
    normalized.includes('provider_quota_exceeded')
    || normalized.includes('usage limit')
    || normalized.includes('rate limit')
    || normalized.includes('insufficient_quota')
    || normalized.includes('quota')
    || normalized.includes('429')
  ) {
    return t('errors.budget_exceeded')
  }

  if (
    normalized.includes('local assistant unavailable')
    || normalized.includes('authentication')
    || normalized.includes('unauthorized')
  ) {
    return COPY.serviceUnavailable
  }

  if (normalized.includes('goaltext is required')) {
    return COPY.emptyGoal
  }

  if (normalized.includes('profile') && normalized.includes('not found')) {
    return COPY.missingProfile
  }

  if (
    trimmed.startsWith('No ')
    || trimmed.startsWith('Hay ')
    || trimmed.startsWith('Primero ')
    || trimmed.startsWith('Estas ')
    || trimmed.startsWith('Necesit')
  ) {
    return trimmed
  }

  return COPY.genericError
}

function getPlanHref(planId: string | null): string {
  if (!planId) {
    return '/plan/v5'
  }

  return `/plan/v5?planId=${encodeURIComponent(planId)}`
}

function GoalInputSection(props: GoalInputSectionProps) {
  return (
    <div className={styles.sectionStack}>
      <div className={styles.banner}>
        <p className={styles.eyebrow}>Objetivo</p>
        <h2 className={styles.sectionTitle}>{COPY.inputTitle}</h2>
        <p className={styles.sectionCopy}>{COPY.inputCopy}</p>
      </div>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>¿Qué te gustaría lograr?</span>
        <textarea
          className={styles.goalInput}
          value={props.goalText}
          onChange={(event) => props.onGoalTextChange(event.currentTarget.value)}
          placeholder="Ejemplo: Quiero ordenar mi rutina, mejorar mi energía y sostener un plan de estudio realista."
          disabled={props.busy}
        />
      </label>

      <div className={styles.helperList}>
        <p className={styles.miniText}>Cuanto más claro sea tu objetivo, más útil será el primer borrador.</p>
        {!props.profileReady && (
          <p className={styles.warningText}>{COPY.missingProfile}</p>
        )}
      </div>

      <div className={styles.stepFooter}>
        <button
          type="button"
          className="app-button app-button--primary"
          onClick={props.onSubmit}
          disabled={props.busy || !props.profileReady}
        >
          {props.busy ? 'Preparando...' : COPY.start}
        </button>
      </div>
    </div>
  )
}

function ProgressSection(props: ProgressSectionProps) {
  return (
    <div className={`${styles.sectionStack} ${styles.sectionStackCentered}`}>
      <div className={styles.banner}>
        <p className={styles.eyebrow}>Progreso</p>
        <h2 className={styles.sectionTitle}>{COPY.processingTitle}</h2>
        <p className={styles.sectionCopy}>{COPY.processingCopy}</p>
      </div>

      <div className={styles.processingState} role="status" aria-live="polite">
        <div className={styles.spinner} aria-hidden="true" />
        <p className={styles.progressLabel}>{getPhaseLabel(props.phase)}</p>
        <p className={styles.miniText}>Te mostramos preguntas solo si realmente hacen falta.</p>
      </div>
    </div>
  )
}

function QuestionField(props: {
  question: ClarificationQuestion
  value: string
  busy: boolean
  onAnswerChange: (questionId: string, value: string) => void
}) {
  const { question, value } = props
  const rangeText = getQuestionRangeText(question)

  if (question.type === 'number') {
    return (
      <label className={styles.field}>
        <span className={styles.questionTitle}>{question.text}</span>
        <input
          className={styles.inlineInput}
          type="number"
          min={question.min}
          max={question.max}
          value={value}
          disabled={props.busy}
          onChange={(event) => props.onAnswerChange(question.id, event.currentTarget.value)}
        />
        {rangeText && <span className={styles.miniText}>{rangeText}</span>}
      </label>
    )
  }

  if (question.type === 'select') {
    return (
      <label className={styles.field}>
        <span className={styles.questionTitle}>{question.text}</span>
        <select
          className={styles.selectInput}
          value={value}
          disabled={props.busy}
          onChange={(event) => props.onAnswerChange(question.id, event.currentTarget.value)}
        >
          <option value="">{COPY.selectPlaceholder}</option>
          {(question.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    )
  }

  if (question.type === 'range') {
    return (
      <label className={styles.field}>
        <span className={styles.questionTitle}>{question.text}</span>
        <input
          className={styles.rangeInput}
          type="range"
          min={question.min ?? 0}
          max={question.max ?? 100}
          value={value}
          disabled={props.busy}
          onChange={(event) => props.onAnswerChange(question.id, event.currentTarget.value)}
        />
        <div className={styles.rangeMeta}>
          <span>{question.min ?? 0}</span>
          <strong>{value}</strong>
          <span>{question.max ?? 100}</span>
        </div>
      </label>
    )
  }

  return (
    <label className={styles.field}>
      <span className={styles.questionTitle}>{question.text}</span>
      <textarea
        className={styles.textarea}
        value={value}
        disabled={props.busy}
        onChange={(event) => props.onAnswerChange(question.id, event.currentTarget.value)}
        placeholder={COPY.answerHint}
      />
    </label>
  )
}

function ClarificationSection(props: ClarificationSectionProps) {
  const confidence = clampProgress((props.questions.confidence ?? 0) * 100)

  return (
    <div className={styles.sectionStack}>
      <div className={styles.banner}>
        <p className={styles.eyebrow}>Ajuste final</p>
        <h2 className={styles.sectionTitle}>
          {props.round <= 1 ? COPY.clarifyingTitle : COPY.clarifyingTitleLater}
        </h2>
        <p className={styles.sectionCopy}>{COPY.clarifyingCopy}</p>
      </div>

      <div className={styles.summaryCard}>
        <span className={styles.summaryLabel}>Avance estimado</span>
        <strong className={styles.summaryValue}>Tu plan está {confidence}% listo</strong>
      </div>

      <div className={styles.questionList}>
        {props.questions.questions.map((question, index) => (
          <div key={question.id} className={styles.questionItem}>
            <div className={styles.questionHeader}>
              <span className={styles.stepBadge}>Pregunta {index + 1}</span>
            </div>
            <QuestionField
              question={question}
              value={props.answers[question.id] ?? ''}
              busy={props.busy}
              onAnswerChange={props.onAnswerChange}
            />
          </div>
        ))}
      </div>

      <div className={styles.stepFooter}>
        <p className={styles.miniText}>Respondé todo lo que puedas y seguimos enseguida.</p>
        <button
          type="button"
          className="app-button app-button--primary"
          onClick={props.onSubmit}
          disabled={props.busy}
        >
          {props.busy ? 'Procesando...' : COPY.continue}
        </button>
      </div>
    </div>
  )
}

function CompletedSection(props: CompletedSectionProps) {
  const planHref = getPlanHref(props.completedPlanId)
  const hasExactPlanLink = Boolean(props.completedPlanId)

  return (
    <div className={styles.sectionStack}>
      <div className={styles.banner}>
        <p className={styles.eyebrow}>Resultado</p>
        <h2 className={styles.sectionTitle}>{COPY.completedTitle}</h2>
        <p className={styles.sectionCopy}>{COPY.completedCopy}</p>
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Calidad del plan</span>
          <strong className={styles.summaryValue}>{getQualityLabel(props.completedScore)}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Puntaje final</span>
          <strong className={styles.summaryValue}>{clampProgress(props.completedScore)}%</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Vueltas de ajuste</span>
          <strong className={styles.summaryValue}>{Math.max(1, props.completedIterations)}</strong>
        </div>
      </div>

      {!hasExactPlanLink && (
        <p className={styles.miniText}>{COPY.noPlanLink}</p>
      )}

      <div className={styles.stepFooter}>
        <Link href={planHref} className="app-button app-button--primary">
          {hasExactPlanLink ? COPY.openPlan : COPY.openLatestPlan}
        </Link>
      </div>
    </div>
  )
}

export function PlanFlow({ profileId, provider }: PlanFlowProps) {
  const [step, setStep] = useState<FlowStep>('input')
  const [goalText, setGoalText] = useState('')
  const [currentPhase, setCurrentPhase] = useState('')
  const [, setProgressScore] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<ClarificationRound | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [clarifyRound, setClarifyRound] = useState(0)
  const [completedPlanId, setCompletedPlanId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [completedScore, setCompletedScore] = useState(0)
  const [completedIterations, setCompletedIterations] = useState(0)
  const [degraded, setDegraded] = useState<DegradedState | null>(null)
  const runIdRef = useRef(0)

  const profileReady = profileId.trim().length > 0
  const missingAnswers = questions?.questions.some((question) => !isAnswerFilled(question, answers[question.id])) ?? false
  const showFlowChrome = step === 'clarifying'

  function createCallbacks(origin: 'start' | 'resume', runId: number): PlanStreamCallbacks {
    const isCurrent = (): boolean => runIdRef.current === runId

    return {
      onPhase(phase) {
        if (!isCurrent()) {
          return
        }

        setCurrentPhase(phase)
        setProgressScore((current) => Math.max(current, PHASE_PROGRESS_FLOORS[phase] ?? 8))
      },
      onProgress(score) {
        if (!isCurrent()) {
          return
        }

        setProgressScore((current) => Math.max(current, clampProgress(score)))
      },
      onNeedsInput(nextSessionId, nextQuestions) {
        if (!isCurrent()) {
          return
        }

        setSessionId(nextSessionId)
        setQuestions(nextQuestions)
        setAnswers((current) => buildInitialAnswers(nextQuestions, current))
        setClarifyRound((current) => current + 1)
        setCurrentPhase('clarify')
        setProgressScore((current) => Math.max(current, clampProgress(nextQuestions.confidence * 100)))
        setError('')
        setBusy(false)
        setStep('clarifying')
      },
      onDegraded(data) {
        if (!isCurrent()) {
          return
        }

        setDegraded({
          message: data.message,
          failedAgents: data.failedAgents
        })
      },
      onComplete(planId, score, iterations) {
        if (!isCurrent()) {
          return
        }

        setCompletedPlanId(planId || null)
        setCompletedScore(clampProgress(score))
        setCompletedIterations(iterations)
        setQuestions(null)
        setProgressScore(clampProgress(score))
        setCurrentPhase('package')
        setError('')
        setBusy(false)
        setStep('completed')
      },
      onError(message) {
        if (!isCurrent()) {
          return
        }

        setError(getFriendlyErrorMessage(message))
        setBusy(false)
        setStep(origin === 'resume' && questions ? 'clarifying' : 'input')
      }
    }
  }

  async function handleStart(): Promise<void> {
    const normalizedGoal = goalText.trim()

    if (!profileReady) {
      setError(COPY.missingProfile)
      return
    }

    if (!normalizedGoal) {
      setError(COPY.emptyGoal)
      return
    }

    const runId = runIdRef.current + 1
    runIdRef.current = runId

    setBusy(true)
    setError('')
    setStep('processing')
    setCurrentPhase('interpret')
    setProgressScore(8)
    setSessionId(null)
    setQuestions(null)
    setAnswers({})
    setClarifyRound(0)
    setCompletedPlanId(null)
    setCompletedScore(0)
    setCompletedIterations(0)
    setDegraded(null)

    await startPlanBuild(normalizedGoal, profileId, provider, createCallbacks('start', runId))

    if (runIdRef.current === runId) {
      setBusy(false)
    }
  }

  async function handleResume(): Promise<void> {
    if (!sessionId || !questions) {
      return
    }

    if (missingAnswers) {
      setError(COPY.missingAnswers)
      return
    }

    const runId = runIdRef.current + 1
    runIdRef.current = runId

    setBusy(true)
    setError('')
    setStep('processing')
    setCurrentPhase('clarify-resume')
    setProgressScore((current) => Math.max(current, PHASE_PROGRESS_FLOORS['clarify-resume']))
    setDegraded(null)

    await resumePlanBuild(sessionId, answers, createCallbacks('resume', runId))

    if (runIdRef.current === runId) {
      setBusy(false)
    }
  }

  function handleAnswerChange(questionId: string, value: string): void {
    setAnswers((current) => ({
      ...current,
      [questionId]: value
    }))
  }

  return (
    <section className={`${styles.layout} ${!showFlowChrome ? styles.layoutMinimal : ''}`}>
      {showFlowChrome && (
        <aside className={styles.sidebar}>
        <div className={`${styles.surface} ${styles.sidebarSurface}`}>
          <p className={styles.eyebrow}>{COPY.eyebrow}</p>
          <h1 className={styles.title}>{getSidebarTitle(step)}</h1>
          <p className={styles.copy}>{getSidebarCopy(step)}</p>

          <div className={styles.metaRow}>
            <span className={`${styles.statusChip} ${styles.statusChipActive}`}>
              {getStatusLabel(step)}
            </span>
            <span className={styles.chip}>Ronda {Math.max(1, clarifyRound)}</span>
          </div>
        </div>

        <div className={`${styles.surface} ${styles.sidebarSurface}`}>
          <div className={styles.goalCard}>
            <span className={styles.fieldLabel}>Tu objetivo</span>
            <p className={styles.goalText}>{goalText.trim() || 'Todavía no escribiste un objetivo.'}</p>
          </div>

          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Estado actual</span>
            <strong className={styles.summaryValue}>{getPhaseLabel(currentPhase || 'interpret')}</strong>
          </div>
        </div>
        </aside>
      )}

      <div className={`${styles.surface} ${styles.contentSurface} ${!showFlowChrome ? styles.contentSurfaceMinimal : ''}`}>
        {error && <div className={styles.errorBox}>{error}</div>}
        {degraded && (
          <div className={styles.warningBox}>
            <strong>{t('planFlow.degraded.title')}</strong>
            <p className={styles.warningText}>{t('planFlow.degraded.body')}</p>
            {degraded.failedAgents && (
              <p className={styles.miniText}>
                {t('planFlow.degraded.agents', { agents: degraded.failedAgents })}
              </p>
            )}
          </div>
        )}

        {step === 'input' && (
          <GoalInputSection
            goalText={goalText}
            busy={busy}
            profileReady={profileReady}
            onGoalTextChange={setGoalText}
            onSubmit={() => void handleStart()}
          />
        )}

        {step === 'processing' && (
          <ProgressSection phase={currentPhase || 'interpret'} />
        )}

        {step === 'clarifying' && questions && (
          <ClarificationSection
            round={clarifyRound}
            busy={busy}
            questions={questions}
            answers={answers}
            onAnswerChange={handleAnswerChange}
            onSubmit={() => void handleResume()}
          />
        )}

        {step === 'completed' && (
          <CompletedSection
            completedPlanId={completedPlanId}
            completedScore={completedScore}
            completedIterations={completedIterations}
          />
        )}
      </div>
    </section>
  )
}
