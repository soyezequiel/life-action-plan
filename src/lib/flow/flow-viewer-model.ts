import { DateTime } from 'luxon'

import { t } from '../../i18n'
import type { PipelinePhaseV5 } from '../pipeline/v5/runner'
import { FLOW_PHASE_GROUPS, FLOW_PHASES } from './flow-definition'
import type {
  FlowNodeRuntimeStatus,
  FlowPhase,
  FlowPhaseGroup
} from './types'
import type {
  PipelineRuntimeData,
  PipelineRuntimePhaseTiming,
  PipelineRuntimeRepairCycle,
  RepairTimelinePhase
} from './pipeline-runtime-data'

export type FlowViewerMasterStatus = 'idle' | 'running' | 'success' | 'error' | 'partial'
export type FlowViewerPhaseStatus = FlowNodeRuntimeStatus | 'exhausted'

export interface FlowViewerTimelineBar {
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
  startPercent: number | null
  widthPercent: number | null
  isRunning: boolean
}

export interface FlowViewerRepairPhase {
  phase: RepairTimelinePhase
  label: string
  status: FlowViewerPhaseStatus
  summaryLabel: string | null
  timeline: FlowViewerTimelineBar
}

export interface FlowViewerRepairCycle {
  cycle: number
  status: PipelineRuntimeRepairCycle['status']
  findings: PipelineRuntimeRepairCycle['findings']
  scoreBefore: number | null
  scoreAfter: number | null
  timeline: FlowViewerTimelineBar
  phases: FlowViewerRepairPhase[]
}

export interface FlowViewerPhaseItem {
  id: PipelinePhaseV5
  index: number
  name: string
  color: string
  groupId: FlowPhase['groupId']
  groupLabel: string
  status: FlowViewerPhaseStatus
  kpi: string
  progressMessage: string | null
  timeline: FlowViewerTimelineBar | null
  repairCycles: FlowViewerRepairCycle[]
  input: Record<string, unknown>
  output: Record<string, unknown>
  raw: Record<string, unknown>
  processing: string | null
  durationMs: number | null
}

export interface FlowViewerFooter {
  qualityScore: number | null
  findings: {
    fail: number
    warn: number
    info: number
  }
  repairCycles: number
  domainLabel: string | null
  tokensTotal: number | null
}

export interface FlowViewerModel {
  hasData: boolean
  hasTimingData: boolean
  masterStatus: FlowViewerMasterStatus
  runLabel: string
  runMetaLabel: string | null
  totalDurationMs: number | null
  phases: FlowViewerPhaseItem[]
  groups: Array<FlowPhaseGroup & { phases: FlowViewerPhaseItem[] }>
  progressToast: string | null
  footer: FlowViewerFooter
  source: string | null
  modelId: string | null
  domainChip: string | null
}

function toMillis(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }

  const date = DateTime.fromISO(value)
  return date.isValid ? date.toMillis() : null
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function getNowMillis(now: number | DateTime): number {
  if (typeof now === 'number') {
    return now
  }

  return now.toMillis()
}

function buildEmptyBar(): FlowViewerTimelineBar {
  return {
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    startPercent: null,
    widthPercent: null,
    isRunning: false
  }
}

function buildTimelineBar(
  timing: PipelineRuntimePhaseTiming | null | undefined,
  isRunning: boolean,
  runStartMs: number | null,
  totalDurationMs: number | null,
  nowMs: number
): FlowViewerTimelineBar | null {
  if (!timing || !timing.startedAt) {
    return null
  }

  const startedAtMs = toMillis(timing.startedAt)
  const finishedAtMs = timing.finishedAt ? toMillis(timing.finishedAt) : (isRunning ? nowMs : null)

  if (startedAtMs === null) {
    return null
  }

  const durationMs = typeof timing.durationMs === 'number'
    ? timing.durationMs
    : finishedAtMs !== null
      ? Math.max(0, finishedAtMs - startedAtMs)
      : null

  const hasTimeline = runStartMs !== null && totalDurationMs !== null && totalDurationMs > 0

  return {
    startedAt: timing.startedAt,
    finishedAt: timing.finishedAt,
    durationMs,
    startPercent: hasTimeline ? clampPercent(((startedAtMs - runStartMs) / totalDurationMs) * 100) : null,
    widthPercent: hasTimeline && durationMs !== null
      ? clampPercent((durationMs / totalDurationMs) * 100)
      : null,
    isRunning
  }
}

function getPhaseGroup(groupId: FlowPhase['groupId']): FlowPhaseGroup {
  return FLOW_PHASE_GROUPS.find((group) => group.id === groupId) ?? FLOW_PHASE_GROUPS[0]
}

function getPhaseLabel(phaseId: PipelinePhaseV5): string {
  return t(`debug.flow.phase_name_${phaseId}`)
}

function getGroupLabel(groupId: FlowPhase['groupId']): string {
  return t(`debug.flow.group_${groupId}`)
}

function getPhaseTiming(snapshot: PipelineRuntimeData | null, phaseId: PipelinePhaseV5): PipelineRuntimePhaseTiming | null {
  if (!snapshot) {
    return null
  }

  const timelineEntry = snapshot.phaseTimeline?.[phaseId]
  if (timelineEntry) {
    return timelineEntry
  }

  const phaseIo = snapshot.phases?.[phaseId]
  if (!phaseIo) {
    return null
  }

  return {
    startedAt: phaseIo.startedAt,
    finishedAt: phaseIo.finishedAt,
    durationMs: phaseIo.durationMs
  }
}

function getPhaseOutput(snapshot: PipelineRuntimeData | null, phaseId: PipelinePhaseV5): Record<string, unknown> {
  if (!snapshot) {
    return {}
  }

  const output = (snapshot.phases?.[phaseId]?.output ?? {}) as Record<string, unknown>

  if (phaseId === 'classify' && snapshot.domainCardMeta) {
    return {
      ...output,
      domainCard: `${snapshot.domainCardMeta.domainLabel} (${snapshot.domainCardMeta.method}, ${(snapshot.domainCardMeta.confidence * 100).toFixed(0)}%)`
    }
  }

  if (phaseId === 'repair') {
    return {
      ...output,
      repairCycles: snapshot.repairCycles,
      repairExhausted: snapshot.repairExhausted,
      repairAttempts: snapshot.repairAttempts
    }
  }

  return output
}

function countFindings(
  snapshot: PipelineRuntimeData | null
): FlowViewerFooter['findings'] {
  const findings = {
    fail: 0,
    warn: 0,
    info: 0
  }

  if (!snapshot) {
    return findings
  }

  const hardFindings = Array.isArray((snapshot.phases.hardValidate?.output as Record<string, unknown> | undefined)?.findings)
    ? ((snapshot.phases.hardValidate?.output as Record<string, unknown>).findings as Array<Record<string, unknown>>)
    : []
  findings.fail += hardFindings.length

  const softFindings = Array.isArray((snapshot.phases.softValidate?.output as Record<string, unknown> | undefined)?.findings)
    ? ((snapshot.phases.softValidate?.output as Record<string, unknown>).findings as Array<Record<string, unknown>>)
    : []
  const coveFindings = Array.isArray((snapshot.phases.coveVerify?.output as Record<string, unknown> | undefined)?.findings)
    ? ((snapshot.phases.coveVerify?.output as Record<string, unknown>).findings as Array<Record<string, unknown>>)
    : []

  for (const finding of [...softFindings, ...coveFindings]) {
    if (finding.severity === 'FAIL') {
      findings.fail += 1
      continue
    }

    if (finding.severity === 'WARN') {
      findings.warn += 1
      continue
    }

    findings.info += 1
  }

  return findings
}

function formatQualityScore(score: number | null | undefined): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return '--'
  }

  const normalized = score > 1 ? score / 100 : score
  return normalized.toFixed(2)
}

function formatDuration(durationMs: number | null | undefined): string {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) {
    return '--'
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`
  }

  return `${(durationMs / 1000).toFixed(1)}s`
}

function buildPhaseKpi(snapshot: PipelineRuntimeData | null, phaseId: PipelinePhaseV5): string {
  if (!snapshot) {
    return '--'
  }

  const output = getPhaseOutput(snapshot, phaseId)

  if (phaseId === 'classify') {
    return typeof output.goalType === 'string' ? output.goalType : '--'
  }

  if (phaseId === 'requirements') {
    const questions = Array.isArray(output.questions) ? output.questions : []
    return t('debug.flow.kpi_questions', { count: questions.length })
  }

  if (phaseId === 'profile') {
    const weekday = typeof output.freeHoursWeekday === 'number' ? output.freeHoursWeekday : 0
    const weekend = typeof output.freeHoursWeekend === 'number' ? output.freeHoursWeekend : 0
    return t('debug.flow.kpi_profile', { weekday, weekend })
  }

  if (phaseId === 'strategy') {
    const phases = Array.isArray(output.phases) ? output.phases.length : 0
    const milestones = Array.isArray(output.milestones) ? output.milestones.length : 0
    return t('debug.flow.kpi_strategy', { phases, milestones })
  }

  if (phaseId === 'template') {
    const activities = Array.isArray(output.activities) ? output.activities.length : 0
    return t('debug.flow.kpi_activities', { count: activities })
  }

  if (phaseId === 'schedule') {
    const events = Array.isArray(output.events) ? output.events.length : 0
    const unscheduled = Array.isArray(output.unscheduled) ? output.unscheduled.length : 0
    return t('debug.flow.kpi_schedule', { events, unscheduled })
  }

  if (phaseId === 'hardValidate') {
    const findings = Array.isArray(output.findings) ? output.findings.length : 0
    return t('debug.flow.kpi_failures', { count: findings })
  }

  if (phaseId === 'softValidate') {
    const findings = Array.isArray(output.findings) ? output.findings as Array<Record<string, unknown>> : []
    const warnCount = findings.filter((finding) => finding.severity === 'WARN').length
    return t('debug.flow.kpi_warnings', { count: warnCount })
  }

  if (phaseId === 'coveVerify') {
    const findings = Array.isArray(output.findings) ? output.findings as Array<Record<string, unknown>> : []
    const failCount = findings.filter((finding) => finding.severity === 'FAIL').length
    return t('debug.flow.kpi_failures', { count: failCount })
  }

  if (phaseId === 'repair') {
    if (snapshot.repairExhausted) {
      return t('debug.flow.kpi_repair_exhausted', { count: snapshot.repairCycles })
    }

    const repairOutput = snapshot.phases.repair?.output as Record<string, unknown> | undefined
    if (typeof repairOutput?.scoreAfter === 'number' && snapshot.repairCycles > 0) {
      return t('debug.flow.kpi_repair_score', {
        count: snapshot.repairCycles,
        score: formatQualityScore(repairOutput.scoreAfter)
      })
    }

    if (snapshot.phaseStatuses.repair === 'running') {
      const cycle = snapshot.progress?.details?.cycle
      const cycleNumber = typeof cycle === 'number' ? cycle : Math.max(snapshot.repairCycles, 1)
      return t('debug.flow.kpi_repair_running', { current: cycleNumber, total: 3 })
    }

    return snapshot.repairCycles > 0
      ? t('debug.flow.kpi_repair_cycles', { count: snapshot.repairCycles })
      : t('debug.flow.kpi_not_applicable')
  }

  if (phaseId === 'package') {
    const qualityScore = typeof output.qualityScore === 'number' ? output.qualityScore : null
    return t('debug.flow.kpi_quality', { score: formatQualityScore(qualityScore) })
  }

  if (phaseId === 'adapt') {
    const mode = typeof output.mode === 'string' ? output.mode : t('debug.flow.status_skipped')
    const risk = typeof output.overallRisk === 'string' ? output.overallRisk : '--'
    return t('debug.flow.kpi_adapt', { mode, risk })
  }

  return '--'
}

function derivePhaseStatus(snapshot: PipelineRuntimeData | null, phaseId: PipelinePhaseV5): FlowViewerPhaseStatus {
  if (!snapshot) {
    return 'pending'
  }

  if (phaseId === 'repair') {
    if (snapshot.repairExhausted) {
      return 'exhausted'
    }

    if (snapshot.phaseStatuses.repair === 'running') {
      return 'running'
    }

    if (snapshot.repairCycles > 0) {
      return 'success'
    }
  }

  return snapshot.phaseStatuses[phaseId] ?? 'pending'
}

function buildRepairCycles(
  snapshot: PipelineRuntimeData | null,
  runStartMs: number | null,
  totalDurationMs: number | null,
  nowMs: number
): FlowViewerRepairCycle[] {
  if (!snapshot) {
    return []
  }

  return (snapshot.repairTimeline ?? []).map((cycle) => {
    const phaseBars = cycle.phases.map((phase) => ({
      phase: phase.phase,
      label: getPhaseLabel(phase.phase),
      status: phase.status,
      summaryLabel: phase.summaryLabel,
      timeline: buildTimelineBar(phase, phase.status === 'running', runStartMs, totalDurationMs, nowMs) ?? buildEmptyBar()
    }))

    const cycleStart = phaseBars
      .map((phase) => phase.timeline.startedAt)
      .find(Boolean) ?? null
    const cycleFinished = phaseBars
      .map((phase) => phase.timeline.finishedAt)
      .filter(Boolean)
      .slice(-1)[0] ?? null
    const durationMs = phaseBars.reduce((total, phase) => {
      return total + (phase.timeline.durationMs ?? 0)
    }, 0)

    return {
      cycle: cycle.cycle,
      status: cycle.status,
      findings: cycle.findings,
      scoreBefore: cycle.scoreBefore,
      scoreAfter: cycle.scoreAfter,
      timeline: buildTimelineBar({
        startedAt: cycleStart,
        finishedAt: cycleFinished,
        durationMs
      }, false, runStartMs, totalDurationMs, nowMs) ?? buildEmptyBar(),
      phases: phaseBars
    }
  })
}

function getRunLabel(snapshot: PipelineRuntimeData | null): string {
  if (!snapshot?.run.startedAt) {
    return t('debug.flow.run_label_empty')
  }

  const startedAt = DateTime.fromISO(snapshot.run.startedAt)
  if (!startedAt.isValid) {
    return snapshot.run.startedAt
  }

  return startedAt.setZone('America/Argentina/Buenos_Aires').toFormat('dd/LL HH:mm:ss')
}

function getMasterStatus(snapshot: PipelineRuntimeData | null): FlowViewerMasterStatus {
  if (!snapshot) {
    return 'idle'
  }

  if (snapshot.run.status === 'error') {
    return 'error'
  }

  if (snapshot.run.status === 'running') {
    return 'running'
  }

  if (snapshot.repairExhausted && snapshot.run.status === 'success') {
    return 'partial'
  }

  return 'success'
}

export function buildFlowViewerModel(
  snapshot: PipelineRuntimeData | null,
  now: number | DateTime = DateTime.utc()
): FlowViewerModel {
  const nowMs = getNowMillis(now)
  const runStartMs = toMillis(snapshot?.run.startedAt)
  const runEndMs = snapshot?.run.finishedAt ? toMillis(snapshot.run.finishedAt) : (snapshot ? nowMs : null)
  const totalDurationMs = runStartMs !== null && runEndMs !== null
    ? Math.max(0, runEndMs - runStartMs)
    : null

  const phases = FLOW_PHASES.map((phase, index) => {
    const status = derivePhaseStatus(snapshot, phase.id as PipelinePhaseV5)
    const timing = getPhaseTiming(snapshot, phase.id as PipelinePhaseV5)
    const group = getPhaseGroup(phase.groupId)
    const repairCycles = phase.id === 'repair'
      ? buildRepairCycles(snapshot, runStartMs, totalDurationMs, nowMs)
      : []
    const phaseTimeline = buildTimelineBar(
      timing,
      status === 'running',
      runStartMs,
      totalDurationMs,
      nowMs
    )

    return {
      id: phase.id as PipelinePhaseV5,
      index,
      name: getPhaseLabel(phase.id as PipelinePhaseV5),
      color: phase.color,
      groupId: phase.groupId,
      groupLabel: getGroupLabel(group.id),
      status,
      kpi: buildPhaseKpi(snapshot, phase.id as PipelinePhaseV5),
      progressMessage: snapshot?.progress?.phase === phase.id ? snapshot.progress.message : null,
      timeline: phaseTimeline,
      repairCycles,
      input: (snapshot?.phases?.[phase.id as PipelinePhaseV5]?.input ?? {}) as Record<string, unknown>,
      output: getPhaseOutput(snapshot, phase.id as PipelinePhaseV5),
      raw: {
        phase: snapshot?.phases?.[phase.id as PipelinePhaseV5] ?? null,
        progress: snapshot?.progress?.phase === phase.id ? snapshot.progress : null,
        status: snapshot?.phaseStatuses?.[phase.id as PipelinePhaseV5] ?? 'pending'
      },
      processing: snapshot?.phases?.[phase.id as PipelinePhaseV5]?.processing ?? null,
      durationMs: phaseTimeline?.durationMs ?? snapshot?.phases?.[phase.id as PipelinePhaseV5]?.durationMs ?? null
    } satisfies FlowViewerPhaseItem
  })

  const hasTimingData = phases.some((phase) => Boolean(phase.timeline?.startedAt))
    || phases.some((phase) => phase.repairCycles.some((cycle) => Boolean(cycle.timeline.startedAt)))

  const footerFindings = countFindings(snapshot)
  const footerQualityScore = typeof (snapshot?.phases.package?.output as Record<string, unknown> | undefined)?.qualityScore === 'number'
    ? (snapshot?.phases.package?.output as Record<string, unknown>).qualityScore as number
    : null
  const footerTokens = snapshot?.run.tokensUsed
    ? snapshot.run.tokensUsed.input + snapshot.run.tokensUsed.output
    : null
  const footerDomain = snapshot?.domainCardMeta
    ? `${snapshot.domainCardMeta.domainLabel} (${snapshot.domainCardMeta.method}, ${(snapshot.domainCardMeta.confidence * 100).toFixed(0)}%)`
    : null

  return {
    hasData: Boolean(snapshot),
    hasTimingData,
    masterStatus: getMasterStatus(snapshot),
    runLabel: getRunLabel(snapshot),
    runMetaLabel: snapshot?.run.goalText ?? null,
    totalDurationMs,
    phases,
    groups: FLOW_PHASE_GROUPS.map((group) => ({
      ...group,
      label: getGroupLabel(group.id),
      phases: phases.filter((phase) => phase.groupId === group.id)
    })),
    progressToast: snapshot?.progress?.message ?? null,
    footer: {
      qualityScore: footerQualityScore,
      findings: footerFindings,
      repairCycles: snapshot?.repairCycles ?? 0,
      domainLabel: footerDomain,
      tokensTotal: footerTokens
    },
    source: snapshot?.run.source ?? null,
    modelId: snapshot?.run.modelId ?? null,
    domainChip: snapshot?.domainCardMeta
      ? `${snapshot.domainCardMeta.method} · ${(snapshot.domainCardMeta.confidence * 100).toFixed(0)}%`
      : null
  }
}

export function getDefaultSelectedPhaseId(model: FlowViewerModel): PipelinePhaseV5 {
  const runningPhase = model.phases.find((phase) => phase.status === 'running')
  if (runningPhase) {
    return runningPhase.id
  }

  const lastCompleted = model.phases
    .slice()
    .reverse()
    .find((phase) => phase.status !== 'pending')

  return lastCompleted?.id ?? 'classify'
}

export function formatViewerDuration(durationMs: number | null | undefined): string {
  return formatDuration(durationMs)
}

export function formatViewerQualityScore(score: number | null | undefined): string {
  return formatQualityScore(score)
}
