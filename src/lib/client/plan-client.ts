import type { ClarificationRound } from '../pipeline/v6/types'
import { t } from '../../i18n'
import { extractErrorMessage } from './error-utils'

export interface PlanDegradedEvent {
  message: string
  failedAgents: string
  agentOutcomes: unknown[]
}
export interface PlanStreamCallbacks {
  onPhase: (phase: string, iteration: number) => void
  onProgress: (score: number, lastAction: string) => void
  onNeedsInput: (sessionId: string, questions: ClarificationRound) => void
  onDegraded?: (data: PlanDegradedEvent) => void
  onDebug?: (event: unknown) => void
  onComplete: (planId: string, score: number, iterations: number) => void
  onError: (message: string, debug?: any) => void
}

interface SseEnvelope {
  type?: unknown
  data?: unknown
  result?: unknown
}

interface ParsedSseBlock {
  eventType: string | null
  data: string
}

interface StreamInterruptionDebugPayload {
  structured: {
    code: string
    state: string
    score: number | null
  }
  raw: {
    interruption: 'unexpected_stream_end'
    lastKnownPhase: string | null
    lastKnownIteration: number | null
    lastKnownAction: string | null
    lastKnownScore: number | null
    lastDebugEvent: unknown
    cause?: string
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const rawText = (await response.text()).trim()

  if (!rawText) {
    return 'No pudimos continuar en este momento.'
  }

  try {
    const parsed = JSON.parse(rawText) as { error?: unknown; message?: unknown }

    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.error.trim()
    }

    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim()
    }
  } catch {
    // Keep the raw response when it is not valid JSON.
  }

  return rawText
}

function parseSseBlock(block: string): ParsedSseBlock | null {
  const normalized = block.trim()

  if (!normalized) {
    return null
  }

  const lines = normalized.split('\n')
  let eventType: string | null = null
  const dataLines: string[] = []

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      continue
    }

    const separatorIndex = line.indexOf(':')

    if (separatorIndex < 0) {
      dataLines.push(line.trim())
      continue
    }

    const field = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1)

    if (value.startsWith(' ')) {
      value = value.slice(1)
    }

    if (field === 'event') {
      eventType = value.trim() || null
    }

    if (field === 'data') {
      dataLines.push(value)
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  return {
    eventType,
    data: dataLines.join('\n').trim()
  }
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function pickStringValue(value: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return null
}

function pickNumberValue(value: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate
    }
  }

  return null
}

function createUnexpectedStreamDebugPayload(
  context: {
    lastKnownPhase: string | null
    lastKnownIteration: number | null
    lastKnownAction: string | null
    lastKnownScore: number | null
    lastDebugEvent: unknown
  },
  cause?: string
): StreamInterruptionDebugPayload {
  return {
    structured: {
      code: 'stream_interrupted',
      state: context.lastKnownPhase ?? 'stream_pending',
      score: context.lastKnownScore,
    },
    raw: {
      interruption: 'unexpected_stream_end',
      lastKnownPhase: context.lastKnownPhase,
      lastKnownIteration: context.lastKnownIteration,
      lastKnownAction: context.lastKnownAction,
      lastKnownScore: context.lastKnownScore,
      lastDebugEvent: context.lastDebugEvent,
      ...(cause ? { cause } : {}),
    },
  }
}

function dispatchSsePayload(payloadText: string, explicitEventType: string | null, callbacks: PlanStreamCallbacks): void {
  let parsed: unknown = payloadText
  let eventType = explicitEventType

  try {
    parsed = JSON.parse(payloadText) as SseEnvelope
  } catch {
    if (!eventType) {
      return
    }
  }

  if (parsed && typeof parsed === 'object') {
    const envelope = parsed as SseEnvelope
    if (!eventType && typeof envelope.type === 'string') {
      eventType = envelope.type
    }

    if (eventType === 'result') {
      const result = envelope.result
      if (
        result
        && typeof result === 'object'
        && 'success' in result
        && (result as { success?: unknown }).success === false
      ) {
        const resultObj = result as { error?: unknown; debug?: unknown }
        callbacks.onError(
          toStringValue(resultObj.error, 'No pudimos continuar en este momento.'),
          resultObj.debug
        )
      }
      return
    }

    const data = typeof envelope.data !== 'undefined' ? envelope.data : parsed

    if (eventType === 'v6:phase' && data && typeof data === 'object') {
      const value = data as { phase?: unknown; iteration?: unknown }
      callbacks.onPhase(toStringValue(value.phase), toNumber(value.iteration))
      return
    }

    if (eventType === 'v6:progress' && data && typeof data === 'object') {
      const value = data as { score?: unknown; lastAction?: unknown }
      callbacks.onProgress(toNumber(value.score), toStringValue(value.lastAction))
      return
    }

    if (eventType === 'v6:needs_input' && data && typeof data === 'object') {
      const value = data as { sessionId?: unknown; questions?: unknown }
      callbacks.onNeedsInput(
        toStringValue(value.sessionId),
        (value.questions ?? null) as ClarificationRound
      )
      return
    }

    if (eventType === 'v6:blocked' && data && typeof data === 'object') {
      const value = data as { message?: unknown; debug?: unknown; agentOutcomes?: unknown; blockingAgents?: unknown; qualityIssues?: unknown; warnings?: unknown; package?: unknown; failureCode?: unknown; degraded?: unknown }
      callbacks.onError(
        toStringValue(value.message, 'El plan fue bloqueado por políticas de seguridad o calidad.'),
        {
          structured: value.debug,
          raw: {
            failureCode: value.failureCode,
            degraded: value.degraded,
            agentOutcomes: value.agentOutcomes,
            blockingAgents: value.blockingAgents,
            qualityIssues: value.qualityIssues,
            warnings: value.warnings,
            package: value.package,
          },
        }
      )
      return
    }

    if (eventType === 'v6:debug' && data) {
      callbacks.onDebug?.(data)
      return
    }

    if (eventType === 'v6:degraded' && data && typeof data === 'object') {
      const value = data as { message?: unknown; failedAgents?: unknown; agentOutcomes?: unknown }
      callbacks.onDegraded?.({
        message: toStringValue(value.message),
        failedAgents: toStringValue(value.failedAgents),
        agentOutcomes: Array.isArray(value.agentOutcomes) ? value.agentOutcomes : []
      })
      return
    }

    if (eventType === 'v6:complete' && data && typeof data === 'object') {
      const value = data as { planId?: unknown; score?: unknown; iterations?: unknown }
      callbacks.onComplete(
        toStringValue(value.planId),
        toNumber(value.score),
        toNumber(value.iterations)
      )
    }
  }
}

async function consumeSseStream(response: Response, callbacks: PlanStreamCallbacks): Promise<void> {
  if (!response.body) {
    const payload = (await response.text()).trim()
    if (payload) {
      dispatchSsePayload(payload, null, callbacks)
    }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()

    if (value) {
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n')

      let boundaryIndex = buffer.indexOf('\n\n')
      while (boundaryIndex >= 0) {
        const block = buffer.slice(0, boundaryIndex)
        buffer = buffer.slice(boundaryIndex + 2)

        const parsed = parseSseBlock(block)
        if (parsed) {
          dispatchSsePayload(parsed.data, parsed.eventType, callbacks)
        }

        boundaryIndex = buffer.indexOf('\n\n')
      }
    }

    if (done) {
      break
    }
  }

  buffer += decoder.decode().replace(/\r\n/g, '\n')
  const tail = parseSseBlock(buffer)
  if (tail) {
    dispatchSsePayload(tail.data, tail.eventType, callbacks)
  }
}

async function postV6Stream(
  path: string,
  body: Record<string, unknown>,
  callbacks: PlanStreamCallbacks
): Promise<void> {
  let streamTerminatedCleanly = false
  let lastKnownPhase: string | null = null
  let lastKnownIteration: number | null = null
  let lastKnownAction: string | null = null
  let lastKnownScore: number | null = null
  let lastDebugEvent: unknown = null

  const getInterruptionContext = (cause?: string): StreamInterruptionDebugPayload => createUnexpectedStreamDebugPayload({
    lastKnownPhase,
    lastKnownIteration,
    lastKnownAction,
    lastKnownScore,
    lastDebugEvent,
  }, cause)

  const rememberDebugEvent = (event: unknown): void => {
    if (!event || typeof event !== 'object') {
      return
    }

    lastDebugEvent = event

    const value = event as Record<string, unknown>
    lastKnownPhase = pickStringValue(value, ['phase', 'currentPhase']) ?? lastKnownPhase
    lastKnownAction = pickStringValue(value, ['summary_es', 'currentSummary_es', 'lastEventSummary_es', 'action', 'currentAction']) ?? lastKnownAction
    lastKnownScore = pickNumberValue(value, ['progressScore', 'score']) ?? lastKnownScore
    lastKnownIteration = pickNumberValue(value, ['iteration', 'clarifyRounds']) ?? lastKnownIteration
  }

  const wrappedCallbacks: PlanStreamCallbacks = {
    ...callbacks,
    onPhase: (phase, iteration) => {
      lastKnownPhase = phase.trim() ? phase : lastKnownPhase
      lastKnownIteration = Number.isFinite(iteration) ? iteration : lastKnownIteration
      callbacks.onPhase(phase, iteration)
    },
    onProgress: (score, lastAction) => {
      lastKnownScore = Number.isFinite(score) ? score : lastKnownScore
      lastKnownAction = lastAction.trim() ? lastAction : lastKnownAction
      callbacks.onProgress(score, lastAction)
    },
    onDebug: (event) => {
      rememberDebugEvent(event)
      callbacks.onDebug?.(event)
    },
    onComplete: (planId, score, iterations) => {
      streamTerminatedCleanly = true
      callbacks.onComplete(planId, score, iterations)
    },
    onError: (msg, debug) => {
      streamTerminatedCleanly = true
      callbacks.onError(msg, debug)
    },
    onNeedsInput: (sid, questions) => {
      streamTerminatedCleanly = true
      callbacks.onNeedsInput(sid, questions)
    }
  }

  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      wrappedCallbacks.onError(await readErrorMessage(response))
      return
    }

    await consumeSseStream(response, wrappedCallbacks)

    if (!streamTerminatedCleanly) {
      streamTerminatedCleanly = true
      callbacks.onError(t('errors.plan_stream_interrupted'), getInterruptionContext())
      return
    }

    if (!streamTerminatedCleanly) {
      wrappedCallbacks.onError('La conexión se interrumpió inesperadamente por tiempo límite del servidor o red. Intentá de nuevo o revisá la cuota de tu cuenta (Codex/OpenAI).')
    }
  } catch (error) {
    if (!streamTerminatedCleanly) {
      const message = extractErrorMessage(error)
      callbacks.onError(message, getInterruptionContext(message))
    }
  }
}

export async function startPlanBuild(
  goal: string,
  profileId: string,
  resourceMode: string,
  callbacks: PlanStreamCallbacks,
  startDate?: string
): Promise<void> {
  const body = { goalText: goal, profileId, resourceMode, debug: true, startDate }
  await postV6Stream('/api/plan/build', body, callbacks)
}

export async function resumePlanBuild(
  sessionId: string,
  answers: Record<string, string>,
  callbacks: PlanStreamCallbacks
): Promise<void> {
  return postV6Stream('/api/plan/build/resume', {
    sessionId,
    answers,
    debug: true
  }, callbacks)
}

export interface CredentialCheckResult {
  success: boolean
  canExecute: boolean
  blockReasonCode: string | null
  blockReasonDetail: string | null
  mode: string | null
  credentialSource: string | null
  chargeable: boolean
  estimatedCostSats: number
  provider: string | null
}

export interface WalletStatusResult {
  configured: boolean
  connected: boolean
  canUseSecureStorage: boolean
  alias?: string
  balanceSats?: number
  budgetSats?: number
  budgetUsedSats?: number
}

export interface WalletBuildQuoteResult {
  planBuildChargeSats?: number
  planBuildChargeReady?: boolean
  planBuildChargeReasonCode?: string | null
}

export async function checkCredentialReadiness(provider?: string): Promise<CredentialCheckResult> {
  const params = new URLSearchParams()
  if (provider) {
    params.set('provider', provider)
  }

  const url = `/api/settings/credentials/check${params.toString() ? `?${params.toString()}` : ''}`

  try {
    const response = await fetch(url)

    if (!response.ok) {
      return {
        success: false,
        canExecute: false,
        blockReasonCode: 'request_failed',
        blockReasonDetail: null,
        mode: null,
        credentialSource: null,
        chargeable: false,
        estimatedCostSats: 0,
        provider: null
      }
    }

    return await response.json() as CredentialCheckResult
  } catch {
    return {
      success: false,
      canExecute: false,
      blockReasonCode: 'request_failed',
      blockReasonDetail: null,
      mode: null,
      credentialSource: null,
      chargeable: false,
      estimatedCostSats: 0,
      provider: null
    }
  }
}

export async function fetchWalletStatus(): Promise<WalletStatusResult> {
  try {
    const response = await fetch('/api/wallet/status')

    if (!response.ok) {
      return {
        configured: false,
        connected: false,
        canUseSecureStorage: false
      }
    }

    return await response.json() as WalletStatusResult
  } catch {
    return {
      configured: false,
      connected: false,
      canUseSecureStorage: false
    }
  }
}

export async function fetchWalletBuildQuote(): Promise<WalletBuildQuoteResult> {
  try {
    const response = await fetch('/api/wallet/quote')

    if (!response.ok) {
      return {
        planBuildChargeReady: false
      }
    }

    return await response.json() as WalletBuildQuoteResult
  } catch {
    return {
      planBuildChargeReady: false
    }
  }
}

export async function connectWalletInline(connectionUrl: string): Promise<{
  success: boolean
  status: WalletStatusResult
  error?: string
}> {
  try {
    const response = await fetch('/api/wallet/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionUrl })
    })

    return await response.json() as {
      success: boolean
      status: WalletStatusResult
      error?: string
    }
  } catch {
    return {
      success: false,
      status: {
        configured: false,
        connected: false,
        canUseSecureStorage: false
      },
      error: 'REQUEST_FAILED'
    }
  }
}

export async function disconnectWalletInline(): Promise<{ success: boolean }> {
  try {
    const response = await fetch('/api/wallet/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

    return await response.json() as { success: boolean }
  } catch {
    return { success: false }
  }
}

export async function chargePlanBuild(profileId: string): Promise<{
  success: boolean
  transactionId?: string
  chargedSats?: number
  error?: string
  detail?: string
}> {
  try {
    const response = await fetch('/api/plan/charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId })
    })

    const result = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: result.error || 'PAYMENT_FAILED',
        detail: result.detail
      }
    }

    return {
      success: true,
      transactionId: result.transactionId,
      chargedSats: result.chargedSats
    }
  } catch (error) {
    return {
      success: false,
      error: 'REQUEST_FAILED',
      detail: extractErrorMessage(error)
    }
  }
}
