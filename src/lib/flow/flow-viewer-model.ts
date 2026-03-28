import { DateTime } from 'luxon'

import { t } from '../../i18n'
import type { PausePointSnapshot } from '../../shared/schemas/pipeline-interactive'
import { FLOW_PHASE_GROUPS, FLOW_PHASES } from './flow-definition'
import type {
  FlowNodeRuntimeStatus,
  FlowPhase,
  FlowPhaseGroup
} from './types'
import type {
  PipelineRuntimeData,
  PipelinePhaseV5,
  PipelineRuntimePhaseTiming,
  PipelineRuntimeRepairCycle,
  RepairTimelinePhase
} from './pipeline-runtime-data'

export type FlowViewerMasterStatus = 'idle' | 'running' | 'success' | 'error' | 'partial'
export type FlowViewerPhaseStatus = FlowNodeRuntimeStatus | 'exhausted' | 'paused'
export type FlowViewerMode = 'inspect' | 'topology'
export type TopologyExecutionKind = 'llm' | 'deterministic' | 'hybrid'
export type TopologyNodeStatus = FlowViewerPhaseStatus | 'partial'
export type TopologyLoopVisualState = 'idle' | 'running' | 'clean' | 'repaired' | 'exhausted'
export type TopologyNodeId =
  | 'classify'
  | 'requirements'
  | 'profile'
  | 'strategy'
  | 'template'
  | 'schedule'
  | 'validation'
  | 'package'
  | 'repair'
  | 'adapt'

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
  executionKind: TopologyExecutionKind
  kpi: string
  progressMessage: string | null
  timeline: FlowViewerTimelineBar | null
  repairCycles: FlowViewerRepairCycle[]
  input: Record<string, unknown>
  output: Record<string, unknown>
  raw: Record<string, unknown>
  processing: string | null
  durationMs: number | null
  purpose: string
  simpleSummary: string
  example: string
  findings: string[]
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
  runId: string | null
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
  interactiveMode: boolean
  currentPausePoint: PausePointSnapshot | null
}

export interface TopologyNode {
  id: TopologyNodeId
  phaseId: PipelinePhaseV5 | null
  label: string
  shortLabel: string
  stepLabel: string
  status: TopologyNodeStatus
  executionKind: TopologyExecutionKind
  kpi: string
  isOptional: boolean
  isAsync: boolean
  highlight: boolean
  highlightLabel: string | null
}

export interface TopologyEdge {
  id: string
  from: TopologyNodeId
  to: TopologyNodeId
  style: 'solid' | 'dashed'
  label: string | null
  highlight: boolean
}

export interface TopologyLoopState {
  active: boolean
  status: TopologyLoopVisualState
  cycles: FlowViewerRepairCycle[]
  summary: string
}

export interface TopologyGlossaryItem {
  id: string
  label: string
  description: string
}

export interface PipelineTopologyModel {
  mainNodes: TopologyNode[]
  validationNode: TopologyNode
  validationPhases: FlowViewerPhaseItem[]
  repairNode: TopologyNode & { phase: FlowViewerPhaseItem; cycles: FlowViewerRepairCycle[] }
  adaptNode: TopologyNode & {
    phase: FlowViewerPhaseItem
    rerunTarget: Extract<PipelinePhaseV5, 'strategy' | 'schedule'> | null
    hasOutput: boolean
  }
  edges: TopologyEdge[]
  loopState: TopologyLoopState
  glossary: TopologyGlossaryItem[]
  rerunTarget: Extract<PipelinePhaseV5, 'strategy' | 'schedule'> | null
}

const PHASE_EXECUTION_KIND: Record<PipelinePhaseV5, TopologyExecutionKind> = {
  classify: 'hybrid',
  requirements: 'llm',
  profile: 'llm',
  strategy: 'llm',
  template: 'deterministic',
  schedule: 'deterministic',
  hardValidate: 'deterministic',
  softValidate: 'deterministic',
  coveVerify: 'llm',
  repair: 'hybrid',
  package: 'deterministic',
  adapt: 'deterministic'
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

function getPhaseExecutionKind(phaseId: PipelinePhaseV5): TopologyExecutionKind {
  return PHASE_EXECUTION_KIND[phaseId]
}

function getPhasePurpose(snapshot: PipelineRuntimeData | null, phaseId: PipelinePhaseV5): string {
  return snapshot?.phases?.[phaseId]?.processing
    ?? t(`debug.flow.phase_${phaseId}_purpose`)
}

function getPhaseSimpleSummary(phaseId: PipelinePhaseV5): string {
  return t(`debug.flow.phase_${phaseId}_simple`)
}

function getRepairCycleCount(snapshot: PipelineRuntimeData | null): number {
  if (!snapshot) {
    return 0
  }

  return Math.max(snapshot.repairCycles, snapshot.repairTimeline?.length ?? 0)
}

function formatFindingCounts(findings: FlowViewerFooter['findings']): string {
  return [
    `${t('debug.flow.finding_fail')}: ${findings.fail}`,
    `${t('debug.flow.finding_warn')}: ${findings.warn}`,
    `${t('debug.flow.finding_info')}: ${findings.info}`
  ].join(' · ')
}

function getCurrentPausePoint(snapshot: PipelineRuntimeData | null): PausePointSnapshot | null {
  return snapshot?.currentPausePoint ?? null
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

function getAdaptRerunTarget(
  snapshot: PipelineRuntimeData | null
): Extract<PipelinePhaseV5, 'strategy' | 'schedule'> | null {
  const output = (snapshot?.phases?.adapt?.output ?? {}) as Record<string, unknown>
  const dispatch = output.dispatch

  if (!dispatch || typeof dispatch !== 'object') {
    return null
  }

  const rerunFromPhase = (dispatch as Record<string, unknown>).rerunFromPhase
  return rerunFromPhase === 'strategy' || rerunFromPhase === 'schedule'
    ? rerunFromPhase
    : null
}

function getPhaseFindings(snapshot: PipelineRuntimeData | null, phaseId: PipelinePhaseV5): string[] {
  if (!snapshot) {
    return []
  }

  if (snapshot.lastError?.phase === phaseId) {
    return [snapshot.lastError.message]
  }

  const output = getPhaseOutput(snapshot, phaseId)

  if (phaseId === 'hardValidate') {
    return Array.isArray(output.findings)
      ? output.findings
        .map((finding) => (finding as Record<string, unknown>).description)
        .filter((finding): finding is string => typeof finding === 'string' && finding.trim().length > 0)
      : []
  }

  if (phaseId === 'softValidate') {
    return Array.isArray(output.findings)
      ? output.findings
        .map((finding) => (finding as Record<string, unknown>).suggestion_esAR)
        .filter((finding): finding is string => typeof finding === 'string' && finding.trim().length > 0)
      : []
  }

  if (phaseId === 'coveVerify') {
    return Array.isArray(output.findings)
      ? output.findings
        .map((finding) => (finding as Record<string, unknown>).answer)
        .filter((finding): finding is string => typeof finding === 'string' && finding.trim().length > 0)
      : []
  }

  if (phaseId === 'repair') {
    const repairCycleCount = getRepairCycleCount(snapshot)
    const remainingFindings = Array.isArray((output as Record<string, unknown>).remainingFindings)
      ? ((output as Record<string, unknown>).remainingFindings as Array<Record<string, unknown>>)
        .map((finding) => finding.message)
        .filter((finding): finding is string => typeof finding === 'string' && finding.trim().length > 0)
      : []

    if (remainingFindings.length > 0) {
      return remainingFindings
    }

    if (snapshot.repairExhausted) {
      return [t('debug.flow.topology_repair_residual')]
    }

    return repairCycleCount > 0
      ? [t('debug.flow.topology_repair_clean')]
      : []
  }

  if (phaseId === 'package') {
    return Array.isArray(output.warnings)
      ? output.warnings.filter((warning): warning is string => typeof warning === 'string' && warning.trim().length > 0)
      : []
  }

  if (phaseId === 'adapt') {
    const recommendations = Array.isArray(output.recommendations)
      ? output.recommendations.filter((recommendation): recommendation is string => typeof recommendation === 'string' && recommendation.trim().length > 0)
      : []
    return recommendations
  }

  return []
}

function buildPhaseExample(snapshot: PipelineRuntimeData | null, phaseId: PipelinePhaseV5): string {
  if (!snapshot) {
    return t('debug.flow.drawer_example_empty')
  }

  const output = getPhaseOutput(snapshot, phaseId)

  if (phaseId === 'classify') {
    if (typeof output.goalType === 'string') {
      return output.goalType
    }

    if (typeof output.domainCard === 'string') {
      return output.domainCard
    }
  }

  if (phaseId === 'requirements') {
    const firstQuestion = Array.isArray(output.questions) ? output.questions[0] : null
    if (typeof firstQuestion === 'string') {
      return firstQuestion
    }
  }

  if (phaseId === 'profile') {
    const weekday = typeof output.freeHoursWeekday === 'number' ? output.freeHoursWeekday : null
    const weekend = typeof output.freeHoursWeekend === 'number' ? output.freeHoursWeekend : null
    if (weekday !== null || weekend !== null) {
      return t('debug.flow.example_profile', {
        weekday: weekday ?? 0,
        weekend: weekend ?? 0
      })
    }
  }

  if (phaseId === 'strategy') {
    const firstMilestone = Array.isArray(output.milestones) ? output.milestones[0] : null
    if (typeof firstMilestone === 'string') {
      return firstMilestone
    }
  }

  if (phaseId === 'template') {
    const firstActivity = Array.isArray(output.activities) ? output.activities[0] : null
    if (firstActivity && typeof firstActivity === 'object') {
      const label = (firstActivity as Record<string, unknown>).label
      if (typeof label === 'string') {
        return label
      }
    }
  }

  if (phaseId === 'schedule') {
    const firstEvent = Array.isArray(output.events) ? output.events[0] : null
    if (firstEvent && typeof firstEvent === 'object') {
      const title = (firstEvent as Record<string, unknown>).title
      if (typeof title === 'string') {
        return title
      }
    }
  }

  if (phaseId === 'hardValidate' || phaseId === 'softValidate' || phaseId === 'coveVerify' || phaseId === 'repair') {
    return getPhaseFindings(snapshot, phaseId)[0] ?? t('debug.flow.drawer_example_empty')
  }

  if (phaseId === 'package') {
    if (typeof output.summary_esAR === 'string') {
      return output.summary_esAR
    }

    const firstIntention = Array.isArray(output.implementationIntentions) ? output.implementationIntentions[0] : null
    if (typeof firstIntention === 'string') {
      return firstIntention
    }
  }

  if (phaseId === 'adapt') {
    if (typeof output.summary_esAR === 'string') {
      return output.summary_esAR
    }

    const rerunTarget = getAdaptRerunTarget(snapshot)
    if (rerunTarget) {
      return t('debug.flow.topology_adapt_rerun_value', {
        target: getPhaseLabel(rerunTarget)
      })
    }
  }

  return t('debug.flow.drawer_example_empty')
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
    const repairCycleCount = getRepairCycleCount(snapshot)

    if (snapshot.repairExhausted) {
      return t('debug.flow.kpi_repair_exhausted', { count: repairCycleCount })
    }

    const repairOutput = snapshot.phases.repair?.output as Record<string, unknown> | undefined
    if (typeof repairOutput?.scoreAfter === 'number' && repairCycleCount > 0) {
      return t('debug.flow.kpi_repair_score', {
        count: repairCycleCount,
        score: formatQualityScore(repairOutput.scoreAfter)
      })
    }

    if (snapshot.phaseStatuses.repair === 'running') {
      const cycle = snapshot.progress?.details?.cycle
      const cycleNumber = typeof cycle === 'number' ? cycle : Math.max(repairCycleCount, 1)
      return t('debug.flow.kpi_repair_running', { current: cycleNumber, total: 3 })
    }

    return repairCycleCount > 0
      ? t('debug.flow.kpi_repair_cycles', { count: repairCycleCount })
      : t('debug.flow.kpi_not_applicable')
  }

  if (phaseId === 'package') {
    const qualityScore = typeof output.qualityScore === 'number' ? output.qualityScore : null
    return t('debug.flow.kpi_quality', { score: formatQualityScore(qualityScore) })
  }

  if (phaseId === 'adapt') {
    if (typeof output.mode !== 'string') {
      return t('debug.flow.topology_adapt_pending')
    }

    const mode = output.mode
    const risk = typeof output.overallRisk === 'string' ? output.overallRisk : '--'
    return t('debug.flow.kpi_adapt', { mode, risk })
  }

  return '--'
}

function derivePhaseStatus(snapshot: PipelineRuntimeData | null, phaseId: PipelinePhaseV5): FlowViewerPhaseStatus {
  if (!snapshot) {
    return 'pending'
  }

  if (snapshot.currentPausePoint?.phase === phaseId) {
    return 'paused'
  }

  if (snapshot.phaseStatuses[phaseId] === 'paused') {
    return 'paused'
  }

  if (phaseId === 'repair') {
    const repairCycleCount = getRepairCycleCount(snapshot)

    if (snapshot.repairExhausted) {
      return 'exhausted'
    }

    if (snapshot.phaseStatuses.repair === 'running') {
      return 'running'
    }

    if (repairCycleCount > 0) {
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

function aggregateValidationStatus(
  snapshot: PipelineRuntimeData | null,
  phases: FlowViewerPhaseItem[]
): TopologyNodeStatus {
  if (phases.some((phase) => phase.status === 'paused')) {
    return 'paused'
  }

  if (phases.some((phase) => phase.status === 'running')) {
    return 'running'
  }

  if (phases.some((phase) => phase.status === 'error')) {
    return 'error'
  }

  const findings = countFindings(snapshot)
  if (findings.fail > 0) {
    return snapshot?.repairExhausted ? 'exhausted' : 'error'
  }

  if (findings.warn > 0) {
    return 'partial'
  }

  if (phases.every((phase) => phase.status === 'pending')) {
    return 'pending'
  }

  if (phases.every((phase) => phase.status === 'skipped')) {
    return 'skipped'
  }

  return 'success'
}

function getLoopVisualState(repairPhase: FlowViewerPhaseItem): TopologyLoopVisualState {
  if (repairPhase.status === 'running') {
    return 'running'
  }

  if (repairPhase.status === 'exhausted') {
    return 'exhausted'
  }

  const lastCycle = repairPhase.repairCycles.slice(-1)[0]
  if (!lastCycle) {
    return 'idle'
  }

  return lastCycle.status
}

function buildTopologyGlossary(): TopologyGlossaryItem[] {
  return [
    {
      id: 'llm',
      label: t('debug.flow.glossary_llm_label'),
      description: t('debug.flow.glossary_llm_desc')
    },
    {
      id: 'deterministic',
      label: t('debug.flow.glossary_deterministic_label'),
      description: t('debug.flow.glossary_deterministic_desc')
    },
    {
      id: 'hybrid',
      label: t('debug.flow.glossary_hybrid_label'),
      description: t('debug.flow.glossary_hybrid_desc')
    },
    {
      id: 'repair',
      label: t('debug.flow.glossary_repair_label'),
      description: t('debug.flow.glossary_repair_desc')
    },
    {
      id: 'adapt',
      label: t('debug.flow.glossary_adapt_label'),
      description: t('debug.flow.glossary_adapt_desc')
    }
  ]
}

function buildTopologyNode(input: {
  id: TopologyNodeId
  phaseId: PipelinePhaseV5 | null
  label: string
  shortLabel?: string
  stepLabel: string
  status: TopologyNodeStatus
  executionKind: TopologyExecutionKind
  kpi: string
  isOptional?: boolean
  isAsync?: boolean
  highlight?: boolean
  highlightLabel?: string | null
}): TopologyNode {
  return {
    id: input.id,
    phaseId: input.phaseId,
    label: input.label,
    shortLabel: input.shortLabel ?? input.label,
    stepLabel: input.stepLabel,
    status: input.status,
    executionKind: input.executionKind,
    kpi: input.kpi,
    isOptional: input.isOptional ?? false,
    isAsync: input.isAsync ?? false,
    highlight: input.highlight ?? false,
    highlightLabel: input.highlightLabel ?? null
  }
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
    const phaseId = phase.id as PipelinePhaseV5
    const status = derivePhaseStatus(snapshot, phaseId)
    const timing = getPhaseTiming(snapshot, phaseId)
    const group = getPhaseGroup(phase.groupId)
    const repairCycles = phaseId === 'repair'
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
      id: phaseId,
      index,
      name: getPhaseLabel(phaseId),
      color: phase.color,
      groupId: phase.groupId,
      groupLabel: getGroupLabel(group.id),
      status,
      executionKind: getPhaseExecutionKind(phaseId),
      kpi: buildPhaseKpi(snapshot, phaseId),
      progressMessage: snapshot?.progress?.phase === phase.id ? snapshot.progress.message : null,
      timeline: phaseTimeline,
      repairCycles,
      input: (snapshot?.phases?.[phaseId]?.input ?? {}) as Record<string, unknown>,
      output: getPhaseOutput(snapshot, phaseId),
      raw: {
        phase: snapshot?.phases?.[phaseId] ?? null,
        progress: snapshot?.progress?.phase === phase.id ? snapshot.progress : null,
        status: snapshot?.phaseStatuses?.[phaseId] ?? 'pending'
      },
      processing: snapshot?.phases?.[phaseId]?.processing ?? null,
      durationMs: phaseTimeline?.durationMs ?? snapshot?.phases?.[phaseId]?.durationMs ?? null,
      purpose: getPhasePurpose(snapshot, phaseId),
      simpleSummary: getPhaseSimpleSummary(phaseId),
      example: buildPhaseExample(snapshot, phaseId),
      findings: getPhaseFindings(snapshot, phaseId)
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
    runId: snapshot?.run.runId ?? null,
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
      repairCycles: getRepairCycleCount(snapshot),
      domainLabel: footerDomain,
      tokensTotal: footerTokens
    },
    source: snapshot?.run.source ?? null,
    modelId: snapshot?.run.modelId ?? null,
    domainChip: snapshot?.domainCardMeta
      ? `${snapshot.domainCardMeta.method} · ${(snapshot.domainCardMeta.confidence * 100).toFixed(0)}%`
      : null,
    interactiveMode: Boolean(snapshot?.interactiveMode),
    currentPausePoint: getCurrentPausePoint(snapshot)
  }
}

export function buildPipelineTopologyModel(
  snapshot: PipelineRuntimeData | null,
  now: number | DateTime = DateTime.utc()
): PipelineTopologyModel {
  const mainPhaseIds: Array<TopologyNodeId & PipelinePhaseV5> = [
    'classify',
    'requirements',
    'profile',
    'strategy',
    'template',
    'schedule'
  ]
  const viewerModel = buildFlowViewerModel(snapshot, now)
  const phaseById = new Map(viewerModel.phases.map((phase) => [phase.id, phase]))
  const validationPhases = [
    phaseById.get('hardValidate'),
    phaseById.get('softValidate'),
    phaseById.get('coveVerify')
  ].filter((phase): phase is FlowViewerPhaseItem => Boolean(phase))
  const repairPhase = phaseById.get('repair') ?? viewerModel.phases.find((phase) => phase.id === 'repair')
  const adaptPhase = phaseById.get('adapt') ?? viewerModel.phases.find((phase) => phase.id === 'adapt')
  const rerunTarget = getAdaptRerunTarget(snapshot)
  const validationFindings = countFindings(snapshot)
  const validationStatus = aggregateValidationStatus(snapshot, validationPhases)

  if (!repairPhase || !adaptPhase) {
    throw new Error('FLOW_VIEWER_TOPOLOGY_PHASES_MISSING')
  }

  const mainNodes: TopologyNode[] = mainPhaseIds.map((phaseId, index) => {
    const phase = phaseById.get(phaseId)
    if (!phase) {
      throw new Error(`FLOW_VIEWER_PHASE_MISSING:${phaseId}`)
    }

    return buildTopologyNode({
      id: phaseId,
      phaseId,
      label: phase.name,
      stepLabel: String(index + 1),
      status: phase.status,
      executionKind: phase.executionKind,
      kpi: phase.kpi,
      highlight: rerunTarget === phaseId,
      highlightLabel: rerunTarget === phaseId ? t('debug.flow.topology_rerun_target_badge') : null
    })
  })

  const validationNode = buildTopologyNode({
    id: 'validation',
    phaseId: 'hardValidate',
    label: t('debug.flow.topology_validation_title'),
    shortLabel: t('debug.flow.topology_validation_short'),
    stepLabel: '7/8/9',
    status: validationStatus,
    executionKind: 'hybrid',
    kpi: formatFindingCounts(validationFindings)
  })

  const packagePhase = phaseById.get('package')
  if (!packagePhase) {
    throw new Error('FLOW_VIEWER_PHASE_MISSING:package')
  }

  mainNodes.push(buildTopologyNode({
    id: 'package',
    phaseId: 'package',
    label: packagePhase.name,
    stepLabel: '11',
    status: packagePhase.status,
    executionKind: packagePhase.executionKind,
    kpi: packagePhase.kpi
  }))

  const loopStatus = getLoopVisualState(repairPhase)
  const loopState: TopologyLoopState = {
    active: repairPhase.repairCycles.length > 0 || repairPhase.status === 'running' || repairPhase.status === 'exhausted',
    status: loopStatus,
    cycles: repairPhase.repairCycles,
    summary: loopStatus === 'idle'
      ? t('debug.flow.topology_repair_idle')
      : loopStatus === 'running'
        ? t('debug.flow.status_running')
        : t(`debug.flow.repair_status_${loopStatus}`)
  }

  const repairNode = Object.assign(buildTopologyNode({
    id: 'repair',
    phaseId: 'repair',
    label: repairPhase.name,
    stepLabel: '10',
    status: repairPhase.status,
    executionKind: repairPhase.executionKind,
    kpi: repairPhase.kpi,
    isOptional: true,
    highlight: loopState.active
  }), {
    phase: repairPhase,
    cycles: repairPhase.repairCycles
  })

  const adaptHasOutput = Object.keys(adaptPhase.output).length > 0
  const adaptNode = Object.assign(buildTopologyNode({
    id: 'adapt',
    phaseId: 'adapt',
    label: adaptPhase.name,
    stepLabel: '12',
    status: adaptPhase.status,
    executionKind: adaptPhase.executionKind,
    kpi: adaptHasOutput ? adaptPhase.kpi : t('debug.flow.topology_adapt_pending'),
    isOptional: true,
    isAsync: true,
    highlight: rerunTarget !== null,
    highlightLabel: rerunTarget !== null ? t('debug.flow.topology_rerun_target_badge') : null
  }), {
    phase: adaptPhase,
    rerunTarget,
    hasOutput: adaptHasOutput
  })

  return {
    mainNodes,
    validationNode,
    validationPhases,
    repairNode,
    adaptNode,
    edges: [
      { id: 'classify-requirements', from: 'classify', to: 'requirements', style: 'solid', label: null, highlight: false },
      { id: 'requirements-profile', from: 'requirements', to: 'profile', style: 'solid', label: null, highlight: false },
      { id: 'profile-strategy', from: 'profile', to: 'strategy', style: 'solid', label: null, highlight: rerunTarget === 'strategy' },
      { id: 'strategy-template', from: 'strategy', to: 'template', style: 'solid', label: null, highlight: rerunTarget === 'strategy' },
      { id: 'template-schedule', from: 'template', to: 'schedule', style: 'solid', label: null, highlight: rerunTarget === 'schedule' },
      { id: 'schedule-validation', from: 'schedule', to: 'validation', style: 'solid', label: null, highlight: rerunTarget === 'schedule' },
      { id: 'validation-package', from: 'validation', to: 'package', style: 'solid', label: null, highlight: false },
      {
        id: 'validation-repair',
        from: 'validation',
        to: 'repair',
        style: 'dashed',
        label: t('debug.flow.topology_repair_branch'),
        highlight: loopState.active
      },
      {
        id: 'repair-validation',
        from: 'repair',
        to: 'validation',
        style: 'dashed',
        label: t('debug.flow.topology_repair_return'),
        highlight: loopState.active
      },
      {
        id: 'package-adapt',
        from: 'package',
        to: 'adapt',
        style: 'dashed',
        label: t('debug.flow.topology_adapt_async'),
        highlight: false
      },
      {
        id: 'adapt-rerun',
        from: 'adapt',
        to: rerunTarget ?? 'schedule',
        style: 'dashed',
        label: rerunTarget
          ? t('debug.flow.topology_adapt_rerun_value', { target: getPhaseLabel(rerunTarget) })
          : null,
        highlight: rerunTarget !== null
      }
    ],
    loopState,
    glossary: buildTopologyGlossary(),
    rerunTarget
  }
}

export function getDefaultSelectedPhaseId(model: FlowViewerModel): PipelinePhaseV5 {
  const pausedPhase = model.phases.find((phase) => phase.status === 'paused')
  if (pausedPhase) {
    return pausedPhase.id
  }

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
