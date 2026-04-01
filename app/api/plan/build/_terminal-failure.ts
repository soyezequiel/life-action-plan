type V6AgentOutcomeLike = {
  agent: string
  phase?: string
  source: string
  errorCode: string | null
  errorMessage: string | null
}

type V6QualityIssueLike = {
  code: string
  severity: 'warning' | 'blocking'
  message: string
}

type V6FailurePackageLike = {
  warnings?: string[]
  qualityIssues?: V6QualityIssueLike[]
  qualityScore?: number
} | null

export type V6TerminalState = {
  publicationState?: string
  failureCode?: string | null
  degraded?: boolean
  agentOutcomes: V6AgentOutcomeLike[]
  blockingAgents?: V6AgentOutcomeLike[]
  package?: V6FailurePackageLike
  scratchpad: unknown[]
  customMessage?: string
}

export type V6TerminalFailurePayload = {
  success: false
  error: string
  scratchpad: unknown[]
  degraded: boolean
  publicationState: string
  failureCode: string | null
  agentOutcomes: V6AgentOutcomeLike[]
  blockingAgents: V6AgentOutcomeLike[]
  qualityIssues: V6QualityIssueLike[]
  warnings: string[]
  package: V6FailurePackageLike
  debug?: Record<string, any>
}

import { PHASE_LABELS_ES } from '@lib/pipeline/v6/types';

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

export function summarizeAgentOutcomes(outcomes: V6AgentOutcomeLike[]): string {
  return outcomes
    .map((outcome) => `${outcome.agent}${outcome.errorCode ? ` [${outcome.errorCode}]` : ''}: ${outcome.errorMessage ?? 'unknown'}`)
    .join('; ')
}

export function getBlockingAgents(state: V6TerminalState): V6AgentOutcomeLike[] {
  if (state.blockingAgents?.length) {
    return state.blockingAgents
  }

  const criticalAgents = new Set(['clarifier', 'planner', 'critic'])
  return state.agentOutcomes.filter(
    (outcome) => outcome.source === 'fallback' && criticalAgents.has(outcome.agent),
  )
}

function summarizeQualityIssues(issues: V6QualityIssueLike[]): string {
  return issues
    .map((issue) => `${issue.message}${issue.code ? ` [${issue.code}]` : ''}`)
    .join('; ')
}

function getTopQualityIssues(state: V6TerminalState): V6QualityIssueLike[] {
  return state.package?.qualityIssues?.filter((issue) => issue.severity === 'blocking')?.length
    ? state.package?.qualityIssues?.filter((issue) => issue.severity === 'blocking') ?? []
    : state.package?.qualityIssues ?? []
}

function buildQualityReviewFailureMessage(state: V6TerminalState): string {
  const mainIssue = state.package?.qualityIssues?.find((i) => i.code === 'FAILED_QUALITY_REVIEW')
  if (mainIssue?.message) return mainIssue.message;

  const lastPhase = state.agentOutcomes[state.agentOutcomes.length - 1]?.phase;
  const phaseLabel = lastPhase ? (PHASE_LABELS_ES[lastPhase] || lastPhase) : null;
  const stage = phaseLabel ? `[Etapa: ${phaseLabel}] ` : '[Crítica] ';
  
  const topIssues = (state.package?.qualityIssues ?? []).filter((i) => i.severity === 'blocking')
  const warnings = uniqueStrings(state.package?.warnings ?? [])
  const parts: string[] = []
  const blockingAgents = summarizeAgentOutcomes(getBlockingAgents(state))

  if (topIssues.length > 0) {
    parts.push(`Problema principal: ${summarizeQualityIssues(topIssues.slice(0, 2))}.`)
  }

  if (warnings.length > 0) {
    parts.push(`Advertencias: ${warnings.slice(0, 4).join(' | ')}.`)
  }

  if (blockingAgents.length > 0) {
    parts.push(`Agentes implicados: ${blockingAgents}.`)
  }

  const baseMessage = `${stage}No publicamos este plan porque la revisión final no pasó la calidad.`
  return parts.length > 0 ? `${baseMessage} ${parts.join(' ')}` : baseMessage
}

function buildRegenerationFailureMessage(state: V6TerminalState): string {
  const mainIssue = state.package?.qualityIssues?.find((i) => i.code === 'CRITICAL_AGENT_FAILURE')
  if (mainIssue?.message) return mainIssue.message;

  const lastPhase = state.agentOutcomes[state.agentOutcomes.length - 1]?.phase;
  const phaseLabel = lastPhase ? (PHASE_LABELS_ES[lastPhase] || lastPhase) : null;
  const stage = phaseLabel ? `[Etapa: ${phaseLabel}] ` : '[Agente] ';

  const blockingAgents = summarizeAgentOutcomes(getBlockingAgents(state))
  const parts: string[] = []

  if (blockingAgents.length > 0) {
    parts.push(`Agentes implicados: ${blockingAgents}.`)
  }

  const warnings = uniqueStrings(state.package?.warnings ?? [])
  if (warnings.length > 0) {
    parts.push(`Advertencias: ${warnings.slice(0, 4).join(' | ')}.`)
  }

  const baseMessage = `${stage}No publicamos este plan porque la revisión crítica falló y requiere regeneración.`
  return parts.length > 0 ? `${baseMessage} ${parts.join(' ')}` : baseMessage
}

function buildSupervisionFailureMessage(state: V6TerminalState): string {
  const safetyIssue = state.package?.qualityIssues?.find((i) => i.code === 'HEALTH_SAFETY_SUPERVISION_MISSING' || i.code === 'health_safety_gap')
  if (safetyIssue?.message) return safetyIssue.message;
  
  // Si no encontramos el issue pero sabemos el codigo, intentamos reconstruir la etapa
  const lastPhase = state.agentOutcomes[state.agentOutcomes.length - 1]?.phase;
  const phaseLabel = lastPhase ? (PHASE_LABELS_ES[lastPhase] || lastPhase) : null;
  const stage = phaseLabel ? `[Etapa: ${phaseLabel}] ` : '[Seguridad] ';
  
  return `${stage}No publicamos este plan porque es un objetivo de salud de alto riesgo y falta una referencia clara a supervisión profesional.`
}

function buildDegradedFailureMessage(state: V6TerminalState): string {
  const fallbackAgents = summarizeAgentOutcomes(
    state.agentOutcomes.filter((outcome) => outcome.source === 'fallback'),
  )

  return fallbackAgents.length > 0
    ? `[Agente] El plan no pudo publicarse con normalidad porque hubo fallos parciales en el pipeline. Agentes con fallback: ${fallbackAgents}.`
    : '[Agente] El plan no pudo publicarse con normalidad porque hubo fallos parciales en el pipeline.'
}

function buildTechnicalMetadata(state: V6TerminalState): Record<string, any> {
  const metadata: Record<string, any> = {
    code: state.failureCode || 'unknown',
    state: state.publicationState || 'unknown',
    score: state.package?.qualityScore ?? null,
  }

  // Identificar el rastro de agentes
  const failingAgents = state.agentOutcomes
    .filter((o) => o.source === 'fallback' || (o.errorCode && o.errorCode !== 'null'))
    .map((o) => ({
      agent: o.agent,
      errorCode: o.errorCode || 'error',
      message: o.errorMessage || 'unknown'
    }))
  
  if (failingAgents.length > 0) {
    metadata.agents = failingAgents
  }

  return metadata
}

export function buildTerminalErrorMessage(state: V6TerminalState): string {
  if (state.customMessage) return state.customMessage;

  if (state.failureCode === 'requires_supervision') {
    return buildSupervisionFailureMessage(state)
  } else if (state.failureCode === 'failed_for_quality_review') {
    return buildQualityReviewFailureMessage(state)
  } else if (state.publicationState === 'blocked' || state.failureCode === 'requires_regeneration') {
    return buildRegenerationFailureMessage(state)
  } else if (state.degraded) {
    return buildDegradedFailureMessage(state)
  }

  return 'V6 pipeline failed'
}

export function buildTerminalFailurePayload(state: V6TerminalState): V6TerminalFailurePayload {
  const blockingAgents = getBlockingAgents(state)
  const warnings = uniqueStrings(state.package?.warnings ?? [])
  const qualityIssues = state.package?.qualityIssues ?? []

  return {
    success: false,
    error: buildTerminalErrorMessage(state),
    scratchpad: state.scratchpad,
    degraded: state.degraded ?? false,
    publicationState: state.publicationState ?? 'failed',
    failureCode: state.failureCode ?? null,
    agentOutcomes: state.agentOutcomes,
    blockingAgents,
    qualityIssues,
    warnings,
    package: state.package ?? null,
    debug: buildTechnicalMetadata(state),
  }
}

function shouldEmitBlockedEvent(state: V6TerminalState): boolean {
  return state.publicationState === 'blocked'
    || state.failureCode === 'requires_regeneration'
    || state.failureCode === 'requires_supervision'
    || state.failureCode === 'failed_for_quality_review'
}

export function sendTerminalFailure(
  send: (payload: unknown) => void,
  state: V6TerminalState,
): void {
  const payload = buildTerminalFailurePayload(state)

  if (shouldEmitBlockedEvent(state)) {
    send({
      type: 'v6:blocked',
      data: {
        message: payload.error,
        failureCode: payload.failureCode ?? 'requires_regeneration',
        blockingAgents: payload.blockingAgents,
        agentOutcomes: payload.agentOutcomes,
        degraded: payload.degraded,
        qualityIssues: payload.qualityIssues,
        warnings: payload.warnings,
        package: payload.package,
        debug: payload.debug,
      },
    })
  } else if (state.degraded) {
    send({
      type: 'v6:degraded',
      data: {
        message: buildDegradedFailureMessage(state),
        failedAgents: summarizeAgentOutcomes(
          state.agentOutcomes.filter((outcome) => outcome.source === 'fallback'),
        ),
        agentOutcomes: state.agentOutcomes,
        blocked: false,
        qualityIssues: payload.qualityIssues,
        warnings: payload.warnings,
      },
    })
  }

  send({
    type: 'result',
    result: {
      ...payload,
    },
  })
}
