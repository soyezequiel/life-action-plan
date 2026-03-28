'use client'

import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DateTime } from 'luxon'

import { t } from '../../src/i18n'
import {
  buildFlowViewerModel,
  buildPipelineTopologyModel,
  formatViewerDuration,
  formatViewerQualityScore,
  getDefaultSelectedPhaseId,
  type FlowViewerMode,
  type FlowViewerModel,
  type FlowViewerPhaseItem,
  type FlowViewerPhaseStatus,
  type FlowViewerRepairCycle,
  type PipelineTopologyModel,
  type TopologyExecutionKind,
  type TopologyNode
} from '@lib/flow/flow-viewer-model'
import type { PipelineRuntimeData } from '@lib/flow/pipeline-runtime-data'
import './flow-viewer.css'

const DEFAULT_DRAWER_RATIO = 0.4
const MIN_DRAWER_HEIGHT = 280
const MAX_DRAWER_HEIGHT_RATIO = 0.62
const DRAWER_STORAGE_KEY = 'pipeline-v5-debug-viewer-drawer-height'
const DRAWER_TAB_STORAGE_KEY = 'pipeline-v5-debug-viewer-drawer-tab'
const VIEW_MODE_STORAGE_KEY = 'pipeline-v5-debug-viewer-mode'
const VIEW_SCALE_STORAGE_KEY = 'pipeline-v5-debug-viewer-scale'
const DEFAULT_VIEW_SCALE = 1
const MIN_VIEW_SCALE = 0.72
const MAX_VIEW_SCALE = 1.04
const VIEW_SCALE_STEP = 0.04
const PHASE_COUNT = 12

const FIELD_LABELS: Record<string, string> = {
  goalType: 'debug.flow.field_goal_type',
  confidence: 'debug.flow.field_confidence',
  risk: 'debug.flow.field_risk',
  extractedSignals: 'debug.flow.field_signals',
  questions: 'debug.flow.field_questions',
  freeHoursWeekday: 'debug.flow.field_weekday_hours',
  freeHoursWeekend: 'debug.flow.field_weekend_hours',
  energyLevel: 'debug.flow.field_energy',
  fixedCommitments: 'debug.flow.field_commitments',
  scheduleConstraints: 'debug.flow.field_constraints',
  phases: 'debug.flow.field_phases',
  milestones: 'debug.flow.field_milestones',
  focus_esAR: 'debug.flow.field_focus',
  activities: 'debug.flow.field_activities',
  durationMin: 'debug.flow.field_duration',
  frequencyPerWeek: 'debug.flow.field_frequency',
  events: 'debug.flow.field_events',
  unscheduled: 'debug.flow.field_unscheduled',
  metrics: 'debug.flow.field_metrics',
  findings: 'debug.flow.field_findings',
  severity: 'debug.flow.field_severity',
  description: 'debug.flow.field_description',
  suggestion_esAR: 'debug.flow.field_suggestion',
  question: 'debug.flow.field_question',
  answer: 'debug.flow.field_answer',
  patchesApplied: 'debug.flow.field_patches',
  iterations: 'debug.flow.field_iterations',
  scoreBefore: 'debug.flow.field_score_before',
  scoreAfter: 'debug.flow.field_score_after',
  finalSchedule: 'debug.flow.field_final_schedule',
  items: 'debug.flow.field_items',
  habitStates: 'debug.flow.field_habit_states',
  slackPolicy: 'debug.flow.field_slack_policy',
  summary_esAR: 'debug.flow.field_summary',
  qualityScore: 'debug.flow.field_quality_score',
  implementationIntentions: 'debug.flow.field_intentions',
  warnings: 'debug.flow.field_warnings',
  tradeoffs: 'debug.flow.field_tradeoffs',
  mode: 'debug.flow.field_mode',
  overallRisk: 'debug.flow.field_overall_risk',
  assessments: 'debug.flow.field_assessments',
  dispatch: 'debug.flow.field_dispatch',
  recommendations: 'debug.flow.field_recommendations',
  changesMade: 'debug.flow.field_changes',
  rerunFromPhase: 'debug.flow.field_rerun_from',
  phasesToRun: 'debug.flow.field_phases_to_run',
  preserveSkeleton: 'debug.flow.field_preserve_skeleton',
  preserveHabitState: 'debug.flow.field_preserve_habit_state',
  allowSlackRecovery: 'debug.flow.field_allow_slack_recovery',
  relaxSoftConstraints: 'debug.flow.field_relax_soft_constraints',
  maxChurnMoves: 'debug.flow.field_max_churn_moves',
  affectedProgressionKeys: 'debug.flow.field_affected_progressions',
  activityAdjustments: 'debug.flow.field_activity_adjustments',
  reason: 'debug.flow.field_reason',
  status: 'debug.flow.field_status',
  progressMessage: 'debug.flow.field_progress',
  progressDetails: 'debug.flow.field_progress_details',
  domainCard: 'debug.flow.field_domain_card',
  repairAttempts: 'debug.flow.field_repair_attempts',
  repairCycles: 'debug.flow.field_repair_cycles',
  errorMessage: 'debug.flow.field_error'
}

type DrawerTab = 'summary' | 'input' | 'processing' | 'output'
const DRAWER_TABS: DrawerTab[] = ['summary', 'input', 'processing', 'output']

function isFlowViewerMode(value: string | null): value is FlowViewerMode {
  return value === 'inspect' || value === 'topology'
}

function getInitialViewerMode(): FlowViewerMode {
  if (typeof window === 'undefined') {
    return 'topology'
  }

  const storedValue = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)
  return isFlowViewerMode(storedValue) ? storedValue : 'topology'
}

function isDrawerTab(value: string | null): value is DrawerTab {
  return value !== null && DRAWER_TABS.includes(value as DrawerTab)
}

function getInitialDrawerTab(): DrawerTab {
  if (typeof window === 'undefined') {
    return 'summary'
  }

  const storedValue = window.localStorage.getItem(DRAWER_TAB_STORAGE_KEY)
  return isDrawerTab(storedValue) ? storedValue : 'summary'
}

function clampViewScale(scale: number): number {
  return Math.min(Math.max(scale, MIN_VIEW_SCALE), MAX_VIEW_SCALE)
}

function getInitialViewScale(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_VIEW_SCALE
  }

  const storedValue = window.localStorage.getItem(VIEW_SCALE_STORAGE_KEY)
  const parsedValue = storedValue ? Number.parseFloat(storedValue) : Number.NaN

  if (Number.isFinite(parsedValue)) {
    return clampViewScale(parsedValue)
  }

  return DEFAULT_VIEW_SCALE
}

function getDrawerHeightLimit(): number {
  if (typeof window === 'undefined') {
    return MIN_DRAWER_HEIGHT
  }

  return Math.max(MIN_DRAWER_HEIGHT, Math.floor(window.innerHeight * MAX_DRAWER_HEIGHT_RATIO))
}

function clampDrawerHeight(height: number): number {
  return Math.min(Math.max(height, MIN_DRAWER_HEIGHT), getDrawerHeightLimit())
}

function getInitialDrawerHeight(): number {
  if (typeof window === 'undefined') {
    return MIN_DRAWER_HEIGHT
  }

  const storedValue = window.localStorage.getItem(DRAWER_STORAGE_KEY)
  const parsedValue = storedValue ? Number.parseInt(storedValue, 10) : Number.NaN

  if (Number.isFinite(parsedValue)) {
    return clampDrawerHeight(parsedValue)
  }

  return clampDrawerHeight(Math.floor(window.innerHeight * DEFAULT_DRAWER_RATIO))
}

function formatScalar(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="flow-dr__null">-</span>
  }

  if (typeof value === 'boolean') {
    return (
      <span className={value ? 'flow-dr__bool flow-dr__bool--true' : 'flow-dr__bool flow-dr__bool--false'}>
        {value ? t('debug.flow.bool_yes') : t('debug.flow.bool_no')}
      </span>
    )
  }

  if (typeof value === 'number') {
    return <span className="flow-dr__number">{value.toLocaleString('es-AR')}</span>
  }

  if (typeof value === 'string') {
    return <span className="flow-dr__string">{value}</span>
  }

  return <span className="flow-dr__string">{String(value)}</span>
}

function renderObjectSummary(value: Record<string, unknown>): React.ReactNode {
  return (
    <div className="flow-dr__nested">
      {Object.entries(value).map(([key, nestedValue]) => (
        <div key={key} className="flow-dr__nested-row">
          <span className="flow-dr__nested-key">{FIELD_LABELS[key] ? t(FIELD_LABELS[key]) : key}</span>
          <span className="flow-dr__nested-value">
            {typeof nestedValue === 'object' && nestedValue !== null
              ? JSON.stringify(nestedValue, null, 2)
              : String(nestedValue)}
          </span>
        </div>
      ))}
    </div>
  )
}

function renderArray(key: string, value: unknown[]): React.ReactNode {
  if (value.length === 0) {
    return <span className="flow-dr__null">-</span>
  }

  if (typeof value[0] === 'string' || typeof value[0] === 'number') {
    return (
      <ul className="flow-dr__list flow-dr__list--simple">
        {value.map((item, index) => (
          <li key={`${key}-${index}`}>{String(item)}</li>
        ))}
      </ul>
    )
  }

  return (
    <div className="flow-dr__list">
      {value.map((item, index) => (
        <div key={`${key}-${index}`} className="flow-dr__card">
          {item && typeof item === 'object'
            ? renderObjectSummary(item as Record<string, unknown>)
            : formatScalar(item)}
        </div>
      ))}
    </div>
  )
}

function renderValue(key: string, value: unknown): React.ReactNode {
  if (Array.isArray(value)) {
    return renderArray(key, value)
  }

  if (value && typeof value === 'object') {
    return renderObjectSummary(value as Record<string, unknown>)
  }

  return formatScalar(value)
}

function DataRenderer({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data)

  if (entries.length === 0) {
    return <p className="flow-drawer__empty">{t('debug.flow.drawer_empty')}</p>
  }

  return (
    <div className="flow-dr">
      {entries.map(([key, value]) => (
        <div key={key} className="flow-dr__row">
          <div className="flow-dr__label">{FIELD_LABELS[key] ? t(FIELD_LABELS[key]) : key}</div>
          <div className="flow-dr__value">{renderValue(key, value)}</div>
        </div>
      ))}
    </div>
  )
}

function statusIcon(status: FlowViewerPhaseStatus | FlowViewerModel['masterStatus']): string {
  switch (status) {
    case 'success':
      return '✓'
    case 'error':
      return '✕'
    case 'running':
      return '●'
    case 'paused':
      return '⏸'
    case 'skipped':
      return '–'
    case 'exhausted':
    case 'partial':
      return '⚠'
    default:
      return '○'
  }
}

function statusLabel(status: FlowViewerPhaseStatus | FlowViewerModel['masterStatus']): string {
  if (status === 'partial') {
    return t('debug.flow.status_partial')
  }

  if (status === 'idle') {
    return t('debug.flow.status_idle')
  }

  return t(`debug.flow.status_${status}`)
}

function sourceLabel(source: string | null): string {
  if (source === 'api-build') {
    return t('debug.flow.source_api_build')
  }

  if (source === 'cli-v5') {
    return t('debug.flow.source_cli_v5')
  }

  if (source === 'interactive') {
    return t('debug.flow.source_interactive')
  }

  return source ?? '--'
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '--'
  }

  const date = DateTime.fromISO(value)
  if (!date.isValid) {
    return value
  }

  return date.setZone('America/Argentina/Buenos_Aires').toFormat('dd/LL HH:mm:ss')
}

function formatCount(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--'
  }

  return value.toLocaleString('es-AR')
}

function formatRunId(runId: string | null | undefined): string {
  if (!runId) {
    return '--'
  }

  return runId.slice(0, 8)
}

function executionKindLabel(kind: TopologyExecutionKind): string {
  return t(`debug.flow.execution_${kind}`)
}

function executionKindCopy(kind: TopologyExecutionKind): string {
  return t(`debug.flow.execution_copy_${kind}`)
}

function phaseShortLabel(phase: string): string {
  if (phase === 'hardValidate') {
    return 'H'
  }

  if (phase === 'softValidate') {
    return 'S'
  }

  if (phase === 'coveVerify') {
    return 'C'
  }

  if (phase === 'repair') {
    return 'R'
  }

  return phase.slice(0, 1).toUpperCase()
}

function timelinePlacement(
  startPercent: number | null,
  widthPercent: number | null,
  fallbackIndex = 0,
  fallbackCount = 1
): React.CSSProperties {
  if (typeof startPercent === 'number' && typeof widthPercent === 'number') {
    return {
      left: `${startPercent}%`,
      width: `max(${Math.max(widthPercent, 1).toFixed(2)}%, 0.8rem)`
    }
  }

  const safeCount = Math.max(fallbackCount, 1)
  const width = 100 / safeCount

  return {
    left: `${fallbackIndex * width}%`,
    width: `calc(${width}% - 0.2rem)`
  }
}

function StepperLane({
  phaseIndex,
  status
}: {
  phaseIndex: number
  status: FlowViewerPhaseStatus
}) {
  const position = PHASE_COUNT > 1 ? (phaseIndex / (PHASE_COUNT - 1)) * 100 : 0

  return (
    <div className="flow-stepper-lane" aria-hidden="true">
      <div className="flow-stepper-lane__track" />
      <div className={`flow-status flow-status--${status} flow-stepper-lane__dot`} style={{ left: `${position}%` }}>
        <span>{statusIcon(status)}</span>
      </div>
    </div>
  )
}

function TimelineBar({
  phase
}: {
  phase: FlowViewerPhaseItem
}) {
  if (!phase.timeline) {
    return <div className="flow-timeline-lane__empty">{t('debug.flow.timeline_unavailable')}</div>
  }

  return (
    <div className="flow-timeline-lane" aria-hidden="true">
      <div className="flow-timeline-lane__track" />
      <div
        className={`flow-timeline-lane__bar flow-timeline-lane__bar--${phase.status}`}
        style={timelinePlacement(phase.timeline.startPercent, phase.timeline.widthPercent)}
        title={`${phase.name} · ${formatViewerDuration(phase.timeline.durationMs)}`}
      >
        <span className="flow-timeline-lane__label">{formatViewerDuration(phase.timeline.durationMs)}</span>
      </div>
    </div>
  )
}

function RepairTimelineLane({
  phase
}: {
  phase: FlowViewerPhaseItem
}) {
  if (phase.repairCycles.length === 0) {
    return <TimelineBar phase={phase} />
  }

  return (
    <div className="flow-timeline-lane flow-timeline-lane--repair" aria-hidden="true">
      <div className="flow-timeline-lane__track" />
      {phase.repairCycles.map((cycle, index) => (
        <div
          key={cycle.cycle}
          className={`flow-repair-cycle flow-repair-cycle--${cycle.status}`}
          style={timelinePlacement(
            cycle.timeline.startPercent,
            cycle.timeline.widthPercent,
            index,
            phase.repairCycles.length
          )}
          title={`${t('debug.flow.repair_cycle_short', { count: cycle.cycle })} · ${formatViewerDuration(cycle.timeline.durationMs)}`}
        >
          <span className="flow-repair-cycle__meta">{t('debug.flow.repair_cycle_short', { count: cycle.cycle })}</span>
          <div className="flow-repair-cycle__segments">
            {cycle.phases.map((repairPhase) => (
              <span
                key={`${cycle.cycle}-${repairPhase.phase}`}
                className={`flow-repair-cycle__segment flow-repair-cycle__segment--${repairPhase.status}`}
                title={`${repairPhase.label} · ${formatViewerDuration(repairPhase.timeline.durationMs)}${repairPhase.summaryLabel ? ` · ${repairPhase.summaryLabel}` : ''}`}
              >
                {phaseShortLabel(repairPhase.phase)}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function RepairCycleDetail({ cycle }: { cycle: FlowViewerRepairCycle }) {
  return (
    <article className={`flow-repair-detail flow-repair-detail--${cycle.status}`}>
      <header className="flow-repair-detail__header">
        <strong>{t('debug.flow.repair_cycle_title', { count: cycle.cycle })}</strong>
        <span className={`flow-pill flow-pill--${cycle.status}`}>{t(`debug.flow.repair_status_${cycle.status}`)}</span>
      </header>
      <div className="flow-repair-detail__grid">
        {cycle.phases.map((phase) => (
          <div key={`${cycle.cycle}-${phase.phase}`} className="flow-repair-detail__row">
            <span className={`flow-status flow-status--${phase.status}`}>
              <span>{statusIcon(phase.status)}</span>
            </span>
            <span className="flow-repair-detail__phase">{phase.label}</span>
            <span className="flow-repair-detail__duration">{formatViewerDuration(phase.timeline.durationMs)}</span>
            <span className="flow-repair-detail__summary">{phase.summaryLabel ?? '--'}</span>
          </div>
        ))}
      </div>
      <footer className="flow-repair-detail__footer">
        <span>
          {`${t('debug.flow.footer_findings')}: ${t('debug.flow.finding_fail')} ${cycle.findings.fail} | ${t('debug.flow.finding_warn')} ${cycle.findings.warn} | ${t('debug.flow.finding_info')} ${cycle.findings.info}`}
        </span>
        <span>{t('debug.flow.repair_score_delta', {
          before: formatViewerQualityScore(cycle.scoreBefore),
          after: formatViewerQualityScore(cycle.scoreAfter)
        })}</span>
      </footer>
    </article>
  )
}

function RepairCycleStrip({ cycle }: { cycle: FlowViewerRepairCycle }) {
  return (
    <div className={`flow-repair-cycle flow-repair-cycle--${cycle.status} flow-repair-cycle--topology`}>
      <span className="flow-repair-cycle__meta">{t('debug.flow.repair_cycle_short', { count: cycle.cycle })}</span>
      <div className="flow-repair-cycle__segments">
        {cycle.phases.map((phase) => (
          <span
            key={`${cycle.cycle}-${phase.phase}`}
            className={`flow-repair-cycle__segment flow-repair-cycle__segment--${phase.status}`}
            title={`${phase.label} · ${formatViewerDuration(phase.timeline.durationMs)}${phase.summaryLabel ? ` · ${phase.summaryLabel}` : ''}`}
          >
            {phaseShortLabel(phase.phase)}
          </span>
        ))}
      </div>
    </div>
  )
}

function getValidationPhaseSummary(phase: FlowViewerPhaseItem): string {
  if (phase.id !== 'hardValidate' && phase.id !== 'softValidate' && phase.id !== 'coveVerify') {
    return phase.kpi
  }

  const findings = Array.isArray(phase.output.findings)
    ? phase.output.findings as Array<unknown>
    : []

  if (phase.id === 'hardValidate') {
    return `${t('debug.flow.finding_fail')} ${findings.length}`
  }

  const counts = findings.reduce(
    (acc: { fail: number; warn: number; info: number }, finding) => {
      const severity = finding && typeof finding === 'object' && typeof (finding as Record<string, unknown>).severity === 'string'
        ? ((finding as Record<string, unknown>).severity as string).toUpperCase()
        : 'INFO'

      if (severity === 'FAIL') {
        acc.fail += 1
        return acc
      }

      if (severity === 'WARN') {
        acc.warn += 1
        return acc
      }

      acc.info += 1
      return acc
    },
    { fail: 0, warn: 0, info: 0 }
  )

  const parts: string[] = []
  if (counts.fail > 0) {
    parts.push(`${t('debug.flow.finding_fail')} ${counts.fail}`)
  }
  if (counts.warn > 0) {
    parts.push(`${t('debug.flow.finding_warn')} ${counts.warn}`)
  }
  if (counts.info > 0) {
    parts.push(`${t('debug.flow.finding_info')} ${counts.info}`)
  }

  return parts.length > 0 ? parts.join(' | ') : t('debug.flow.validation_no_findings')
}

function TopologyNodeCard({
  node,
  selected,
  onSelect,
  caption
}: {
  node: TopologyNode
  selected: boolean
  onSelect: (phaseId: FlowViewerPhaseItem['id']) => void
  caption?: string
}) {
  const isDisabled = node.phaseId === null

  return (
    <button
      type="button"
      className={[
        'flow-topology-node',
        `flow-topology-node--${node.executionKind}`,
        `flow-topology-node--${node.status}`,
        selected ? 'flow-topology-node--selected' : '',
        node.highlight ? 'flow-topology-node--highlight' : '',
        node.isOptional ? 'flow-topology-node--optional' : '',
        node.isAsync ? 'flow-topology-node--async' : ''
      ].filter(Boolean).join(' ')}
      onClick={() => {
        if (node.phaseId) {
          onSelect(node.phaseId)
        }
      }}
      aria-pressed={selected}
      disabled={isDisabled}
    >
      <div className="flow-topology-node__eyebrow">
        <span className="flow-topology-node__step">{node.stepLabel}</span>
        <span className={`flow-pill flow-pill--${node.status}`}>
          {statusLabel(node.status)}
        </span>
      </div>
      <strong>{node.label}</strong>
      <span className="flow-topology-node__kpi">{node.kpi}</span>
      <div className="flow-topology-node__badges">
        <span className={`flow-execution-badge flow-execution-badge--${node.executionKind}`}>
          {executionKindLabel(node.executionKind)}
        </span>
        {node.highlightLabel && (
          <span className="flow-chip flow-chip--mono">{node.highlightLabel}</span>
        )}
      </div>
      {caption && <small className="flow-topology-node__caption">{caption}</small>}
    </button>
  )
}

function ValidationBlock({
  node,
  phases,
  selectedPhaseId,
  onPhaseSelect
}: {
  node: PipelineTopologyModel['validationNode']
  phases: PipelineTopologyModel['validationPhases']
  selectedPhaseId: FlowViewerPhaseItem['id'] | null
  onPhaseSelect: (phaseId: FlowViewerPhaseItem['id']) => void
}) {
  return (
    <section className={`flow-validation-block flow-validation-block--${node.status}`}>
      <div className="flow-validation-block__header">
        <div>
          <span className="flow-validation-block__step">{node.stepLabel}</span>
          <strong>{node.label}</strong>
        </div>
        <span className={`flow-pill flow-pill--${node.status}`}>{statusLabel(node.status)}</span>
      </div>
      <p className="flow-validation-block__copy">{t('debug.flow.topology_validation_copy')}</p>
      <div className="flow-validation-block__badges">
        <span className="flow-execution-badge flow-execution-badge--hybrid">
          {executionKindLabel(node.executionKind)}
        </span>
        <span className="flow-chip">{node.kpi}</span>
      </div>
      <div className="flow-validation-block__phases">
        {phases.map((phase) => (
          <button
            key={phase.id}
            type="button"
            className={[
              'flow-validation-phase',
              `flow-validation-phase--${phase.status}`,
              selectedPhaseId === phase.id ? 'flow-validation-phase--selected' : ''
            ].join(' ')}
            onClick={() => onPhaseSelect(phase.id)}
            aria-pressed={selectedPhaseId === phase.id}
          >
            <span className="flow-validation-phase__name">{phase.name}</span>
            <span className="flow-validation-phase__kpi">{getValidationPhaseSummary(phase)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function TopologyGlossary({
  glossary
}: {
  glossary: PipelineTopologyModel['glossary']
}) {
  return (
    <section className="flow-topology__glossary" aria-label={t('debug.flow.topology_glossary_title')}>
      {glossary.map((item) => (
        <article key={item.id} className="flow-topology__glossary-item">
          <strong>{item.label}</strong>
          <p>{item.description}</p>
        </article>
      ))}
    </section>
  )
}

function TopologyCanvas({
  topology,
  selectedPhaseId,
  onPhaseSelect,
  glossaryOpen
}: {
  topology: PipelineTopologyModel
  selectedPhaseId: FlowViewerPhaseItem['id'] | null
  onPhaseSelect: (phaseId: FlowViewerPhaseItem['id']) => void
  glossaryOpen: boolean
}) {
  const packageNode = topology.mainNodes[topology.mainNodes.length - 1]
  const preValidationNodes = topology.mainNodes.slice(0, -1)

  return (
    <motion.div
      className="flow-topology"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="flow-topology__intro"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
      >
        <p>{t('debug.flow.topology_intro')}</p>
        <div className="flow-topology__legend-inline">
          {topology.glossary.map((item) => (
            <span key={item.id} className="flow-chip" title={item.description}>
              {item.label}
            </span>
          ))}
        </div>
      </motion.div>

      <AnimatePresence initial={false}>
        {glossaryOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <TopologyGlossary glossary={topology.glossary} />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="flow-topology__layout"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flow-topology__main-stage">
          <div className="flow-topology__spine">
            {preValidationNodes.map((node) => (
              <React.Fragment key={node.id}>
                <TopologyNodeCard
                  node={node}
                  selected={selectedPhaseId === node.phaseId}
                  onSelect={onPhaseSelect}
                />
                <span className="flow-topology__connector" aria-hidden="true" />
              </React.Fragment>
            ))}

            <ValidationBlock
              node={topology.validationNode}
              phases={topology.validationPhases}
              selectedPhaseId={selectedPhaseId}
              onPhaseSelect={onPhaseSelect}
            />
            <span className="flow-topology__connector" aria-hidden="true" />
            <TopologyNodeCard
              node={packageNode}
              selected={selectedPhaseId === packageNode.phaseId}
              onSelect={onPhaseSelect}
              caption={t('debug.flow.topology_package_anchor')}
            />
          </div>

          <div className={`flow-topology__repair-lane ${topology.loopState.active ? 'flow-topology__repair-lane--active' : ''}`}>
            <div className="flow-topology__repair-connector">
              <span>{t('debug.flow.topology_repair_branch')}</span>
            </div>
            <TopologyNodeCard
              node={topology.repairNode}
              selected={selectedPhaseId === topology.repairNode.phaseId}
              onSelect={onPhaseSelect}
              caption={topology.loopState.summary}
            />
            <div className="flow-topology__repair-cycles">
              {topology.loopState.cycles.length > 0 ? (
                topology.loopState.cycles.map((cycle) => (
                  <RepairCycleStrip key={cycle.cycle} cycle={cycle} />
                ))
              ) : (
                <p className="flow-topology__repair-empty">{t('debug.flow.topology_repair_idle')}</p>
              )}
            </div>
            <div className="flow-topology__repair-return">
              <span>{t('debug.flow.topology_repair_return')}</span>
            </div>
            {topology.loopState.status === 'exhausted' && (
              <p className="flow-topology__repair-warning">{t('debug.flow.topology_repair_residual')}</p>
            )}
          </div>
        </div>

        <aside className="flow-topology__adapt-stage">
          <div className="flow-topology__adapt-link">
            <span>{t('debug.flow.topology_adapt_async')}</span>
          </div>
          <TopologyNodeCard
            node={topology.adaptNode}
            selected={selectedPhaseId === topology.adaptNode.phaseId}
            onSelect={onPhaseSelect}
          />
          <p className="flow-topology__adapt-copy">{t('debug.flow.topology_adapt_copy')}</p>
          {topology.rerunTarget && (
            <div className="flow-topology__adapt-rerun">
              <span className="flow-topology__adapt-rerun-label">{t('debug.flow.topology_adapt_rerun')}</span>
              <strong>{t('debug.flow.topology_adapt_rerun_value', { target: t(`debug.flow.phase_name_${topology.rerunTarget}`) })}</strong>
            </div>
          )}
        </aside>
      </motion.div>
    </motion.div>
  )
}

function TopologyDrawerContent({
  snapshot,
  phase
}: {
  snapshot: PipelineRuntimeData | null
  phase: FlowViewerPhaseItem
}) {
  const findings = snapshot?.lastError?.phase === phase.id
    ? [snapshot.lastError.message, ...phase.findings]
    : phase.findings

  return (
    <div className="flow-drawer-overview">
      <section className="flow-drawer-overview__section">
        <span className="flow-drawer-overview__label">{t('debug.flow.drawer_purpose')}</span>
        <p className="flow-drawer-overview__copy">{phase.purpose}</p>
      </section>

      <section className="flow-drawer-overview__section">
        <span className="flow-drawer-overview__label">{t('debug.flow.drawer_input')}</span>
        <DataRenderer data={phase.input} />
      </section>

      <section className="flow-drawer-overview__section">
        <span className="flow-drawer-overview__label">{t('debug.flow.drawer_output')}</span>
        <DataRenderer data={phase.output} />
      </section>

      <section className="flow-drawer-overview__section">
        <span className="flow-drawer-overview__label">{t('debug.flow.drawer_execution')}</span>
        <div className="flow-drawer-overview__execution">
          <span className={`flow-execution-badge flow-execution-badge--${phase.executionKind}`}>
            {executionKindLabel(phase.executionKind)}
          </span>
          <p className="flow-drawer-overview__copy">{executionKindCopy(phase.executionKind)}</p>
        </div>
      </section>

      <section className="flow-drawer-overview__section">
        <span className="flow-drawer-overview__label">{t('debug.flow.drawer_findings')}</span>
        {findings.length > 0 ? (
          <ul className="flow-drawer-overview__list">
            {findings.map((finding, index) => (
              <li key={`${phase.id}-finding-${index}`}>{finding}</li>
            ))}
          </ul>
        ) : (
          <p className="flow-drawer-overview__copy">{t('debug.flow.drawer_no_findings')}</p>
        )}
      </section>

      <section className="flow-drawer-overview__section">
        <span className="flow-drawer-overview__label">{t('debug.flow.drawer_example')}</span>
        <p className="flow-drawer-overview__copy">{phase.example}</p>
      </section>

      <section className="flow-drawer-overview__section">
        <span className="flow-drawer-overview__label">{t('debug.flow.drawer_simple')}</span>
        <p className="flow-drawer-overview__copy">{phase.simpleSummary}</p>
      </section>
    </div>
  )
}

function SummaryTab({
  snapshot,
  phase
}: {
  snapshot: PipelineRuntimeData | null
  phase: FlowViewerPhaseItem
}) {
  return (
    <div className="flow-summary">
      <div className="flow-summary__cards">
        <div className="flow-summary__card">
          <span>{t('debug.flow.summary_status')}</span>
          <strong>{statusLabel(phase.status)}</strong>
        </div>
        <div className="flow-summary__card">
          <span>{t('debug.flow.summary_kpi')}</span>
          <strong>{phase.kpi}</strong>
        </div>
        <div className="flow-summary__card">
          <span>{t('debug.flow.summary_duration')}</span>
          <strong>{formatViewerDuration(phase.durationMs)}</strong>
        </div>
        <div className="flow-summary__card">
          <span>{t('debug.flow.summary_started')}</span>
          <strong>{formatDateTime(phase.timeline?.startedAt ?? snapshot?.phases?.[phase.id]?.startedAt ?? null)}</strong>
        </div>
        <div className="flow-summary__card">
          <span>{t('debug.flow.summary_finished')}</span>
          <strong>{formatDateTime(phase.timeline?.finishedAt ?? snapshot?.phases?.[phase.id]?.finishedAt ?? null)}</strong>
        </div>
        <div className="flow-summary__card">
          <span>{t('debug.flow.summary_progress')}</span>
          <strong>{phase.progressMessage ?? '--'}</strong>
        </div>
      </div>

      {phase.id === 'repair' && phase.repairCycles.length > 0 && (
        <div className="flow-summary__repair-list">
          {phase.repairCycles.map((cycle) => (
            <RepairCycleDetail key={cycle.cycle} cycle={cycle} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProcessingTab({
  snapshot,
  phase
}: {
  snapshot: PipelineRuntimeData | null
  phase: FlowViewerPhaseItem
}) {
  const tokensUsed = snapshot?.run.tokensUsed ?? null
  const totalTokens = tokensUsed ? tokensUsed.input + tokensUsed.output : null

  return (
    <div className="flow-processing">
      <p className="flow-processing__body">{phase.processing ?? t('debug.flow.no_processing_info')}</p>
      <div className="flow-processing__meta">
        <div className="flow-processing__meta-row">
          <span>{t('debug.flow.summary_duration')}</span>
          <strong>{formatViewerDuration(phase.durationMs)}</strong>
        </div>
        <div className="flow-processing__meta-row">
          <span>{t('debug.flow.processing_source')}</span>
          <strong>{sourceLabel(snapshot?.run.source ?? null)}</strong>
        </div>
        <div className="flow-processing__meta-row">
          <span>{t('debug.flow.processing_model')}</span>
          <strong>{snapshot?.run.modelId ?? '--'}</strong>
        </div>
        <div className="flow-processing__meta-row">
          <span>{t('debug.flow.processing_tokens')}</span>
          <strong>
            {tokensUsed
              ? `${t('debug.flow.tokens_input')}: ${formatCount(tokensUsed.input)} · ${t('debug.flow.tokens_output')}: ${formatCount(tokensUsed.output)} · ${t('debug.flow.processing_total_tokens')}: ${formatCount(totalTokens)}`
              : '--'}
          </strong>
        </div>
      </div>
    </div>
  )
}

function PhaseDrawer({
  snapshot,
  phase,
  mode,
  isOpen,
  height,
  activeTab,
  onTabChange,
  onClose,
  onResizeStart
}: {
  snapshot: PipelineRuntimeData | null
  phase: FlowViewerPhaseItem | null
  mode: FlowViewerMode
  isOpen: boolean
  height: number
  activeTab: DrawerTab
  onTabChange: (tab: DrawerTab) => void
  onClose: () => void
  onResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void
}) {
  const [showRawJson, setShowRawJson] = useState(false)

  useEffect(() => {
    setShowRawJson(false)
  }, [phase?.id])

  if (!phase) {
    return null
  }

  const rawPayload = {
    input: phase.input,
    output: phase.output,
    raw: phase.raw
  }

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.section
          className="flow-drawer"
          style={{ height }}
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 32 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="flow-drawer__resize-handle"
            onMouseDown={onResizeStart}
            role="separator"
            aria-orientation="horizontal"
            aria-label={t('debug.flow.drawer_resize')}
          />

          <header className="flow-drawer__header">
            <div className="flow-drawer__heading">
              <span className={`flow-status flow-status--${phase.status}`}>
                <span>{statusIcon(phase.status)}</span>
              </span>
              <div>
                <strong>{phase.name}</strong>
                <p>{phase.kpi}</p>
              </div>
            </div>

            <div className="flow-drawer__actions">
              <button
                className={`flow-toggle ${showRawJson ? 'flow-toggle--active' : ''}`}
                type="button"
                onClick={() => setShowRawJson((current) => !current)}
              >
                {t('debug.flow.raw_json')}
              </button>
              <button className="flow-toggle" type="button" onClick={onClose}>
                {t('debug.flow.close')}
              </button>
            </div>
          </header>

          {mode === 'inspect' && (
            <div className="flow-drawer__tabs" role="tablist" aria-label={t('debug.flow.drawer_tabs')}>
              {DRAWER_TABS.map((tab) => (
                <button
                  key={tab}
                  className={`flow-drawer__tab ${activeTab === tab ? 'flow-drawer__tab--active' : ''}`}
                  role="tab"
                  type="button"
                  aria-selected={activeTab === tab}
                  onClick={() => onTabChange(tab)}
                >
                  {t(`debug.flow.tab_${tab}`)}
                </button>
              ))}
            </div>
          )}

          <div className="flow-drawer__body">
            {mode === 'topology' ? (
              <TopologyDrawerContent snapshot={snapshot} phase={phase} />
            ) : (
              <>
                {activeTab === 'summary' && <SummaryTab snapshot={snapshot} phase={phase} />}
                {activeTab === 'input' && <DataRenderer data={phase.input} />}
                {activeTab === 'processing' && <ProcessingTab snapshot={snapshot} phase={phase} />}
                {activeTab === 'output' && <DataRenderer data={phase.output} />}
              </>
            )}

            {showRawJson && (
              <pre className="flow-drawer__raw">{JSON.stringify(rawPayload, null, 2)}</pre>
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  )
}

function InspectorCanvas({
  model,
  selectedPhase,
  onPhaseSelect
}: {
  model: FlowViewerModel
  selectedPhase: FlowViewerPhaseItem | null
  onPhaseSelect: (phaseId: FlowViewerPhaseItem['id']) => void
}) {
  return (
    <>
      <div className="flow-viewer__axis">
        <div className="flow-viewer__axis-rail">{t('debug.flow.phase_rail')}</div>
        <div className="flow-viewer__axis-timeline">
          <span>{model.hasTimingData ? '0s' : t('debug.flow.timeline_stepper')}</span>
          <span>{model.hasTimingData ? formatViewerDuration(model.totalDurationMs) : t('debug.flow.timeline_stepper_hint')}</span>
        </div>
      </div>

      <div className="flow-viewer__groups">
        {model.groups.map((group) => (
          <section key={group.id} className="flow-group">
            <div className="flow-group__divider" style={{ ['--group-accent' as string]: group.color }}>
              <span>{group.label}</span>
            </div>

            <div className="flow-group__rows">
              {group.phases.map((phase) => (
                <button
                  key={phase.id}
                  type="button"
                  className={`flow-phase-row flow-phase-row--${phase.status} ${selectedPhase?.id === phase.id ? 'flow-phase-row--selected' : ''}`}
                  onClick={() => onPhaseSelect(phase.id)}
                  aria-pressed={selectedPhase?.id === phase.id}
                  style={{ ['--phase-accent' as string]: phase.color }}
                >
                  <div className="flow-phase-row__rail">
                    <span className={`flow-status flow-status--${phase.status}`}>
                      <span>{statusIcon(phase.status)}</span>
                    </span>
                    <div className="flow-phase-row__copy">
                      <strong>{phase.name}</strong>
                      <span>{phase.kpi}</span>
                      {phase.progressMessage && <small>{phase.progressMessage}</small>}
                    </div>
                  </div>

                  <div className="flow-phase-row__timeline">
                    {model.hasTimingData
                      ? phase.id === 'repair'
                        ? <RepairTimelineLane phase={phase} />
                        : <TimelineBar phase={phase} />
                      : <StepperLane phaseIndex={phase.index} status={phase.status} />}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}

export function FlowViewerSurface({
  snapshot,
  isLoading = false
}: {
  snapshot: PipelineRuntimeData | null
  isLoading?: boolean
}) {
  const [selectedPhaseId, setSelectedPhaseId] = useState<FlowViewerPhaseItem['id'] | null>(null)
  const [viewerMode, setViewerMode] = useState<FlowViewerMode>(() => getInitialViewerMode())
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [drawerHeight, setDrawerHeight] = useState(() => getInitialDrawerHeight())
  const [activeDrawerTab, setActiveDrawerTab] = useState<DrawerTab>(() => getInitialDrawerTab())
  const [glossaryOpen, setGlossaryOpen] = useState(false)
  const [viewScale, setViewScale] = useState(() => getInitialViewScale())
  const [nowMs, setNowMs] = useState(() => Date.now())

  const model = buildFlowViewerModel(snapshot, nowMs)
  const topology = buildPipelineTopologyModel(snapshot, nowMs)
  const selectedPhase = model.phases.find((phase) => phase.id === selectedPhaseId) ?? null

  useEffect(() => {
    if (!model.hasData) {
      setSelectedPhaseId(null)
      return
    }

    if (!selectedPhaseId) {
      setSelectedPhaseId(getDefaultSelectedPhaseId(model))
      return
    }

    if (!model.phases.some((phase) => phase.id === selectedPhaseId)) {
      setSelectedPhaseId(getDefaultSelectedPhaseId(model))
    }
  }, [model, selectedPhaseId])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleWindowResize = () => {
      setDrawerHeight((current) => clampDrawerHeight(current))
    }

    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(DRAWER_TAB_STORAGE_KEY, activeDrawerTab)
  }, [activeDrawerTab])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewerMode)
  }, [viewerMode])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(VIEW_SCALE_STORAGE_KEY, viewScale.toFixed(2))
  }, [viewScale])

  useEffect(() => {
    setNowMs(Date.now())

    if (snapshot?.run.status !== 'running') {
      return
    }

    const interval = window.setInterval(() => {
      setNowMs(Date.now())
    }, 250)

    return () => window.clearInterval(interval)
  }, [snapshot?.run.status, snapshot?.updatedAt])

  useEffect(() => {
    if (!model.hasData) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
        return
      }

      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
        return
      }

      event.preventDefault()
      const currentIndex = model.phases.findIndex((phase) => phase.id === (selectedPhaseId ?? getDefaultSelectedPhaseId(model)))
      const offset = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex = Math.min(Math.max(currentIndex + offset, 0), model.phases.length - 1)
      const nextPhase = model.phases[nextIndex]

      if (nextPhase) {
        setSelectedPhaseId(nextPhase.id)
        setDrawerOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [model, selectedPhaseId])

  function handlePhaseSelection(phaseId: FlowViewerPhaseItem['id']): void {
    setSelectedPhaseId(phaseId)
    setDrawerOpen(true)
  }

  function handleModeChange(nextMode: FlowViewerMode): void {
    setViewerMode(nextMode)
    if (nextMode === 'inspect') {
      setGlossaryOpen(false)
    }
  }

  function handleResizeStart(event: React.MouseEvent<HTMLDivElement>): void {
    event.preventDefault()

    const originY = event.clientY
    const initialHeight = drawerHeight
    let lastHeight = drawerHeight

    const handleMouseMove = (moveEvent: MouseEvent) => {
      lastHeight = clampDrawerHeight(initialHeight + (originY - moveEvent.clientY))
      setDrawerHeight(lastHeight)
    }

    const handleMouseUp = () => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(DRAWER_STORAGE_KEY, String(clampDrawerHeight(lastHeight)))
      }

      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  function handleScaleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setViewScale(clampViewScale(Number(event.currentTarget.value) / 100))
  }

  if (!model.hasData && !isLoading) {
    return (
      <section className="flow-viewer flow-viewer--empty">
        <div className="flow-viewer__empty-copy">
          <h1>{t('debug.flow.viewer_title')}</h1>
          <p>{t('debug.flow.no_data')}</p>
        </div>
      </section>
    )
  }

  if (!model.hasData && isLoading) {
    return (
      <section className="flow-viewer flow-viewer--empty">
        <div className="flow-viewer__empty-copy">
          <h1>{t('debug.flow.viewer_title')}</h1>
          <p>{t('flow.loading')}</p>
        </div>
      </section>
    )
  }

  return (
    <section
      className="flow-viewer"
      aria-label={t('debug.flow.viewer_title')}
      style={{ ['--flow-density' as string]: String(viewScale) }}
    >
      <header className="flow-viewer__header">
        <div className="flow-viewer__header-copy">
          <div className="flow-viewer__header-topline">
            <strong>{t('debug.flow.viewer_title')}</strong>
            <span className="flow-chip flow-chip--mono">{`${t('debug.flow.meta_run_id')}: ${formatRunId(model.runId)}`}</span>
            {model.interactiveMode && (
              <span className="flow-chip flow-chip--interactive">{t('debug.flow.interactive_mode_badge')}</span>
            )}
            <span className={`flow-pill flow-pill--${model.masterStatus}`}>
              <span>{statusIcon(model.masterStatus)}</span>
              {statusLabel(model.masterStatus)}
            </span>
            <span className="flow-chip">{`${t('debug.flow.footer_quality')}: ${formatViewerQualityScore(model.footer.qualityScore)}`}</span>
            <span className="flow-chip">{`${t('debug.flow.footer_tokens')}: ${formatCount(model.footer.tokensTotal)}`}</span>
          </div>
          <div className="flow-viewer__header-bottomline">
            <span className="flow-viewer__total-time">{formatViewerDuration(model.totalDurationMs)}</span>
            {model.runMetaLabel && <p className="flow-viewer__run-meta">{model.runMetaLabel}</p>}
            <span className="flow-chip">{model.runLabel}</span>
          </div>
        </div>

        <div className="flow-viewer__meta">
          <span className="flow-chip">{`${t('debug.flow.meta_source')}: ${sourceLabel(model.source)}`}</span>
          <span className="flow-chip">{`${t('debug.flow.meta_model')}: ${model.modelId ?? '--'}`}</span>
          <span className="flow-chip">{`${t('debug.flow.meta_domain')}: ${model.domainChip ?? '--'}`}</span>
          <div className="flow-mode-toggle" role="tablist" aria-label={t('debug.flow.mode_label')}>
            <button
              type="button"
              role="tab"
              className={`flow-mode-toggle__button ${viewerMode === 'topology' ? 'flow-mode-toggle__button--active' : ''}`}
              aria-selected={viewerMode === 'topology'}
              onClick={() => handleModeChange('topology')}
            >
              {t('debug.flow.mode_topology')}
            </button>
            <button
              type="button"
              role="tab"
              className={`flow-mode-toggle__button ${viewerMode === 'inspect' ? 'flow-mode-toggle__button--active' : ''}`}
              aria-selected={viewerMode === 'inspect'}
              onClick={() => handleModeChange('inspect')}
            >
              {t('debug.flow.mode_inspect')}
            </button>
          </div>
          {viewerMode === 'inspect' ? (
            <label className="flow-scale-control">
              <span className="flow-scale-control__label">
                {`${t('debug.flow.scale_label')}: ${Math.round(viewScale * 100)}%`}
              </span>
              <input
                className="flow-scale-control__slider"
                type="range"
                min={Math.round(MIN_VIEW_SCALE * 100)}
                max={Math.round(MAX_VIEW_SCALE * 100)}
                step={Math.round(VIEW_SCALE_STEP * 100)}
                value={Math.round(viewScale * 100)}
                onChange={handleScaleChange}
                aria-label={t('debug.flow.scale_label')}
              />
              <span className="flow-scale-control__hint">
                {t('debug.flow.scale_hint')}
              </span>
            </label>
          ) : (
            <button
              className={`flow-toggle ${glossaryOpen ? 'flow-toggle--active' : ''}`}
              type="button"
              onClick={() => setGlossaryOpen((current) => !current)}
            >
              {t('debug.flow.topology_glossary_toggle')}
            </button>
          )}
        </div>
      </header>

      {model.interactiveMode && model.currentPausePoint && (
        <div className="flow-viewer__interactive-banner">
          <span className="flow-chip flow-chip--interactive">{t('debug.flow.interactive_waiting_badge')}</span>
          <strong>{t('debug.flow.interactive_banner_title')}</strong>
          <span>
            {t('debug.flow.interactive_banner_copy', {
              phase: t(`debug.flow.phase_name_${model.currentPausePoint.phase}`)
            })}
          </span>
        </div>
      )}

      <div className="flow-viewer__main">
        {viewerMode === 'topology' ? (
          <TopologyCanvas
            topology={topology}
            selectedPhaseId={selectedPhaseId}
            onPhaseSelect={handlePhaseSelection}
            glossaryOpen={glossaryOpen}
          />
        ) : (
          <InspectorCanvas
            model={model}
            selectedPhase={selectedPhase}
            onPhaseSelect={handlePhaseSelection}
          />
        )}
      </div>

      <AnimatePresence initial={false}>
        {model.progressToast && model.masterStatus === 'running' && (
          <motion.div
            className="flow-viewer__toast"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {model.progressToast}
          </motion.div>
        )}
      </AnimatePresence>

      <PhaseDrawer
        snapshot={snapshot}
        phase={selectedPhase}
        mode={viewerMode}
        isOpen={drawerOpen}
        height={drawerHeight}
        activeTab={activeDrawerTab}
        onTabChange={setActiveDrawerTab}
        onClose={() => setDrawerOpen(false)}
        onResizeStart={handleResizeStart}
      />

      <footer className="flow-viewer__footer">
        <span>
          {`${t('debug.flow.footer_findings')}: ${t('debug.flow.finding_fail')} ${model.footer.findings.fail} | ${t('debug.flow.finding_warn')} ${model.footer.findings.warn} | ${t('debug.flow.finding_info')} ${model.footer.findings.info}`}
        </span>
        <span>{`${t('debug.flow.footer_repair')}: ${model.footer.repairCycles > 0 ? t('debug.flow.kpi_repair_cycles', { count: model.footer.repairCycles }) : t('debug.flow.topology_repair_idle')}`}</span>
        <span>{`${t('debug.flow.footer_domain')}: ${model.footer.domainLabel ?? '--'}`}</span>
        <span>{`${t('debug.flow.footer_duration')}: ${formatViewerDuration(model.totalDurationMs)}`}</span>
      </footer>
    </section>
  )
}

type RunView = 'latest' | 'latest-success'

export function FlowViewer() {
  const [latestData, setLatestData] = useState<PipelineRuntimeData | null>(null)
  const [latestSuccessData, setLatestSuccessData] = useState<PipelineRuntimeData | null>(null)
  const [activeView, setActiveView] = useState<RunView>('latest')
  const [loading, setLoading] = useState(true)
  const latestDataRef = useRef<PipelineRuntimeData | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchContext() {
      try {
        const response = await fetch('/api/debug/pipeline-context')
        if (!response.ok) {
          return
        }

        const json = await response.json()

        if (!cancelled) {
          const latest = (json.data ?? null) as PipelineRuntimeData | null
          const success = (json.latestSuccess ?? null) as PipelineRuntimeData | null
          const hadPreviousLatest = latestDataRef.current !== null
          setLatestData(latest)
          latestDataRef.current = latest
          setLatestSuccessData(success)

          if (latest?.run.status === 'error' && success) {
            setActiveView((prev) => prev === 'latest' && !hadPreviousLatest ? 'latest-success' : prev)
          }

          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchContext()
    const interval = window.setInterval(() => {
      void fetchContext()
    }, 2000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  const activeSnapshot = activeView === 'latest-success' && latestSuccessData
    ? latestSuccessData
    : latestData

  const hasAlternative = latestSuccessData !== null && latestData?.run.status === 'error'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {hasAlternative && (
        <div style={{
          display: 'flex',
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: '#1a1a2e',
          borderBottom: '1px solid #2a2a3e',
          alignItems: 'center',
          fontSize: '13px'
        }}>
          <span style={{ color: '#888', marginRight: '4px' }}>{t('debug.flow.viewing_run')}:</span>
          <button
            onClick={() => setActiveView('latest')}
            style={{
              padding: '3px 10px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              backgroundColor: activeView === 'latest' ? '#e74c3c' : '#2a2a3e',
              color: activeView === 'latest' ? '#fff' : '#aaa'
            }}
          >
            {t('debug.flow.latest_run')} ({latestData?.run.status})
          </button>
          <button
            onClick={() => setActiveView('latest-success')}
            style={{
              padding: '3px 10px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              backgroundColor: activeView === 'latest-success' ? '#27ae60' : '#2a2a3e',
              color: activeView === 'latest-success' ? '#fff' : '#aaa'
            }}
          >
            {t('debug.flow.latest_success')}
          </button>
          {latestData?.run.runId && (
            <span style={{ color: '#555', marginLeft: 'auto', fontFamily: 'monospace', fontSize: '11px' }}>
              {`${t('debug.flow.meta_run_id')}: ${formatRunId(activeSnapshot?.run.runId)}`}
            </span>
          )}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <FlowViewerSurface snapshot={activeSnapshot} isLoading={loading} />
      </div>
    </div>
  )
}
