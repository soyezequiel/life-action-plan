import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { resolve } from 'path'

import { DateTime } from 'luxon'

import type { ResourceUsageSummary } from '../../shared/types/resource-usage'
import type { PhaseIO } from '../pipeline/phase-io'
import type { PipelinePhaseV5 } from '../pipeline/v5/runner'

export type PhaseStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped'
export type RepairTimelinePhase = 'hardValidate' | 'softValidate' | 'coveVerify' | 'repair'
export type RepairTimelinePhaseStatus = PhaseStatus | 'exhausted'
export type RepairTimelineStatus = 'repaired' | 'clean' | 'exhausted'

export interface PipelineRuntimePhaseTiming {
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
}

export interface PipelineRuntimeProgress {
  phase: PipelinePhaseV5
  message: string
  details?: Record<string, unknown>
  updatedAt: string
}

export interface PipelineRuntimeRepairAttempt {
  attempt: number
  maxAttempts: number
  findings: Array<{ severity: string; message: string }>
  updatedAt: string
}

export interface PipelineRuntimeRepairPhaseEntry extends PipelineRuntimePhaseTiming {
  phase: RepairTimelinePhase
  status: RepairTimelinePhaseStatus
  summaryLabel: string | null
}

export interface PipelineRuntimeRepairCycle {
  cycle: number
  status: RepairTimelineStatus
  findings: {
    fail: number
    warn: number
    info: number
  }
  scoreBefore: number | null
  scoreAfter: number | null
  phases: PipelineRuntimeRepairPhaseEntry[]
}

export interface PipelineRuntimeError {
  phase: PipelinePhaseV5 | 'run'
  message: string
  updatedAt: string
}

export interface PipelineRuntimeRunMetadata {
  runId: string
  source: 'api-build' | 'cli-v5'
  status: 'running' | 'success' | 'error'
  startedAt: string
  finishedAt: string | null
  modelId: string | null
  goalText: string | null
  profileId: string | null
  outputFile: string | null
  tokensUsed: { input: number; output: number } | null
  resourceUsage: ResourceUsageSummary | null
  updatedAt: string
}

export interface PipelineRuntimeData {
  schemaVersion: 2
  pipeline: 'v5'
  updatedAt: string
  run: PipelineRuntimeRunMetadata
  phaseStatuses: Record<PipelinePhaseV5, PhaseStatus>
  phases: Partial<Record<PipelinePhaseV5, PhaseIO>>
  phaseTimeline: Partial<Record<PipelinePhaseV5, PipelineRuntimePhaseTiming>>
  progress: PipelineRuntimeProgress | null
  repairCycles: number
  repairExhausted: boolean
  repairAttempts: PipelineRuntimeRepairAttempt[]
  repairTimeline: PipelineRuntimeRepairCycle[]
  domainCardMeta: {
    domainLabel: string
    method: string
    confidence: number
  } | null
  lastError: PipelineRuntimeError | null
}

export interface PipelineRuntimeInit {
  source: PipelineRuntimeRunMetadata['source']
  modelId?: string | null
  goalText?: string | null
  profileId?: string | null
  outputFile?: string | null
}

export interface PipelineRuntimeRecorder {
  startRun(next: PipelineRuntimeInit): PipelineRuntimeData
  setRunMetadata(next: Partial<Omit<PipelineRuntimeRunMetadata, 'source' | 'status' | 'startedAt' | 'updatedAt'>>): PipelineRuntimeData
  markPhaseStart(
    phase: PipelinePhaseV5,
    details?: { input?: unknown; message?: string; startedAt?: string | null }
  ): PipelineRuntimeData
  markPhaseSuccess(phase: PipelinePhaseV5, io?: PhaseIO): PipelineRuntimeData
  markPhaseFailure(phase: PipelinePhaseV5, error: Error): PipelineRuntimeData
  markPhaseSkipped(
    phase: PipelinePhaseV5,
    reason?: string,
    details?: { startedAt?: string | null; finishedAt?: string | null }
  ): PipelineRuntimeData
  recordProgress(phase: PipelinePhaseV5, progress: Record<string, unknown>): PipelineRuntimeData
  recordRepairAttempt(
    attempt: number,
    maxAttempts: number,
    findings: Array<{ severity: string; message: string }>
  ): PipelineRuntimeData
  markRepairCyclePhaseStart(
    cycle: number,
    phase: RepairTimelinePhase,
    details?: { startedAt?: string | null; summaryLabel?: string | null }
  ): PipelineRuntimeData
  markRepairCyclePhaseComplete(
    cycle: number,
    phase: RepairTimelinePhase,
    status: RepairTimelinePhaseStatus,
    details?: { io?: PhaseIO; finishedAt?: string | null; summaryLabel?: string | null }
  ): PipelineRuntimeData
  finalizeRepairCycle(
    cycle: number,
    summary: {
      status: RepairTimelineStatus
      findings: Array<{ severity: string; message: string }>
      scoreBefore?: number | null
      scoreAfter?: number | null
    }
  ): PipelineRuntimeData
  markRepairExhausted(): PipelineRuntimeData
  setDomainCardMeta(meta: PipelineRuntimeData['domainCardMeta']): PipelineRuntimeData
  completeRun(status: PipelineRuntimeRunMetadata['status'], extra?: { message?: string }): PipelineRuntimeData
  getSnapshot(): PipelineRuntimeData
}

const CONTEXT_FILE = resolve(process.cwd(), 'tmp/pipeline-context.json')
const CONTEXT_SUCCESS_FILE = resolve(process.cwd(), 'tmp/pipeline-context-success.json')
const REPAIR_TIMELINE_PHASES: RepairTimelinePhase[] = ['hardValidate', 'softValidate', 'coveVerify', 'repair']

export const PIPELINE_V5_PHASES: PipelinePhaseV5[] = [
  'classify',
  'requirements',
  'profile',
  'strategy',
  'template',
  'schedule',
  'hardValidate',
  'softValidate',
  'coveVerify',
  'repair',
  'package',
  'adapt'
]

function nowIso(): string {
  return DateTime.utc().toISO() ?? DateTime.utc().toFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
}

function createPhaseStatuses(status: PhaseStatus = 'pending'): Record<PipelinePhaseV5, PhaseStatus> {
  return PIPELINE_V5_PHASES.reduce((accumulator, phase) => {
    accumulator[phase] = status
    return accumulator
  }, {} as Record<PipelinePhaseV5, PhaseStatus>)
}

function emptyRunMetadata(input: PipelineRuntimeInit, startedAt: string): PipelineRuntimeRunMetadata {
  return {
    runId: randomUUID(),
    source: input.source,
    status: 'running',
    startedAt,
    finishedAt: null,
    modelId: input.modelId ?? null,
    goalText: input.goalText ?? null,
    profileId: input.profileId ?? null,
    outputFile: input.outputFile ?? null,
    tokensUsed: null,
    resourceUsage: null,
    updatedAt: startedAt
  }
}

function cloneRepairTimeline(cycles: PipelineRuntimeRepairCycle[]): PipelineRuntimeRepairCycle[] {
  return cycles.map((cycle) => ({
    ...cycle,
    findings: { ...cycle.findings },
    phases: cycle.phases.map((phase) => ({ ...phase }))
  }))
}

function clonePhaseTimeline(
  timeline: Partial<Record<PipelinePhaseV5, PipelineRuntimePhaseTiming>>
): Partial<Record<PipelinePhaseV5, PipelineRuntimePhaseTiming>> {
  return Object.fromEntries(
    Object.entries(timeline).map(([phase, entry]) => [
      phase,
      entry ? { ...entry } : entry
    ])
  ) as Partial<Record<PipelinePhaseV5, PipelineRuntimePhaseTiming>>
}

function toMillis(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }

  const date = DateTime.fromISO(value)
  return date.isValid ? date.toMillis() : null
}

function buildTiming(input: {
  startedAt?: string | null
  finishedAt?: string | null
  durationMs?: number | null
}): PipelineRuntimePhaseTiming {
  const startedAt = input.startedAt ?? null
  const finishedAt = input.finishedAt ?? null

  if (typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)) {
    return {
      startedAt,
      finishedAt,
      durationMs: input.durationMs
    }
  }

  const startedMs = toMillis(startedAt)
  const finishedMs = toMillis(finishedAt)

  return {
    startedAt,
    finishedAt,
    durationMs: startedMs !== null && finishedMs !== null
      ? Math.max(0, finishedMs - startedMs)
      : null
  }
}

function ensureRepairCycle(
  cycles: PipelineRuntimeRepairCycle[],
  cycleNumber: number
): PipelineRuntimeRepairCycle {
  let cycle = cycles.find((entry) => entry.cycle === cycleNumber)

  if (!cycle) {
    cycle = {
      cycle: cycleNumber,
      status: 'repaired',
      findings: { fail: 0, warn: 0, info: 0 },
      scoreBefore: null,
      scoreAfter: null,
      phases: []
    }
    cycles.push(cycle)
  }

  return cycle
}

function ensureRepairPhase(
  cycle: PipelineRuntimeRepairCycle,
  phase: RepairTimelinePhase
): PipelineRuntimeRepairPhaseEntry {
  let phaseEntry = cycle.phases.find((entry) => entry.phase === phase)

  if (!phaseEntry) {
    phaseEntry = {
      phase,
      status: 'pending',
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      summaryLabel: null
    }
    cycle.phases.push(phaseEntry)
  }

  cycle.phases.sort((left, right) => {
    return REPAIR_TIMELINE_PHASES.indexOf(left.phase) - REPAIR_TIMELINE_PHASES.indexOf(right.phase)
  })

  return phaseEntry
}

function countFindings(findings: Array<{ severity: string }>): PipelineRuntimeRepairCycle['findings'] {
  return findings.reduce((totals, finding) => {
    if (finding.severity === 'FAIL') {
      totals.fail += 1
      return totals
    }

    if (finding.severity === 'WARN') {
      totals.warn += 1
      return totals
    }

    totals.info += 1
    return totals
  }, { fail: 0, warn: 0, info: 0 })
}

export function createEmptyPipelineRuntimeData(input: PipelineRuntimeInit): PipelineRuntimeData {
  const startedAt = nowIso()

  return {
    schemaVersion: 2,
    pipeline: 'v5',
    updatedAt: startedAt,
    run: emptyRunMetadata(input, startedAt),
    phaseStatuses: createPhaseStatuses(),
    phases: {},
    phaseTimeline: {},
    progress: null,
    repairCycles: 0,
    repairExhausted: false,
    repairAttempts: [],
    repairTimeline: [],
    domainCardMeta: null,
    lastError: null
  }
}

function ensureContextDir(): void {
  mkdirSync(resolve(CONTEXT_FILE, '..'), { recursive: true })
}

export function persistPipelineRuntimeData(snapshot: PipelineRuntimeData): PipelineRuntimeData {
  ensureContextDir()
  writeFileSync(CONTEXT_FILE, JSON.stringify(snapshot, null, 2), 'utf8')
  return snapshot
}

export function readPipelineRuntimeData(): PipelineRuntimeData | null {
  if (!existsSync(CONTEXT_FILE)) {
    return null
  }

  try {
    const raw = readFileSync(CONTEXT_FILE, 'utf8')
    return JSON.parse(raw) as PipelineRuntimeData
  } catch {
    return null
  }
}

export function readLatestSuccessfulRuntimeData(): PipelineRuntimeData | null {
  if (!existsSync(CONTEXT_SUCCESS_FILE)) {
    return null
  }

  try {
    const raw = readFileSync(CONTEXT_SUCCESS_FILE, 'utf8')
    return JSON.parse(raw) as PipelineRuntimeData
  } catch {
    return null
  }
}

function persistSuccessSnapshot(snapshot: PipelineRuntimeData): void {
  ensureContextDir()
  writeFileSync(CONTEXT_SUCCESS_FILE, JSON.stringify(snapshot, null, 2), 'utf8')
}

function snapshotWithUpdate(
  snapshot: PipelineRuntimeData,
  updater: (draft: PipelineRuntimeData, updatedAt: string) => void
): PipelineRuntimeData {
  const updatedAt = nowIso()
  const nextSnapshot: PipelineRuntimeData = {
    ...snapshot,
    updatedAt,
    run: {
      ...snapshot.run,
      updatedAt
    },
    phaseStatuses: {
      ...snapshot.phaseStatuses
    },
    phases: {
      ...snapshot.phases
    },
    phaseTimeline: clonePhaseTimeline(snapshot.phaseTimeline),
    repairAttempts: snapshot.repairAttempts.slice(),
    repairTimeline: cloneRepairTimeline(snapshot.repairTimeline)
  }

  updater(nextSnapshot, updatedAt)
  return persistPipelineRuntimeData(nextSnapshot)
}

export function createPipelineRuntimeRecorder(initial: PipelineRuntimeInit): PipelineRuntimeRecorder {
  let snapshot = persistPipelineRuntimeData(createEmptyPipelineRuntimeData(initial))

  return {
    startRun(next) {
      snapshot = persistPipelineRuntimeData(createEmptyPipelineRuntimeData(next))
      return snapshot
    },
    setRunMetadata(next) {
      snapshot = snapshotWithUpdate(snapshot, (draft) => {
        draft.run = {
          ...draft.run,
          modelId: next.modelId ?? draft.run.modelId,
          goalText: next.goalText ?? draft.run.goalText,
          profileId: next.profileId ?? draft.run.profileId,
          outputFile: next.outputFile ?? draft.run.outputFile,
          tokensUsed: next.tokensUsed ?? draft.run.tokensUsed,
          resourceUsage: next.resourceUsage ?? draft.run.resourceUsage,
          finishedAt: next.finishedAt ?? draft.run.finishedAt
        }
      })
      return snapshot
    },
    markPhaseStart(phase, details) {
      snapshot = snapshotWithUpdate(snapshot, (draft, updatedAt) => {
        const startedAt = details?.startedAt ?? updatedAt
        draft.phaseStatuses[phase] = 'running'
        draft.phaseTimeline[phase] = buildTiming({
          startedAt,
          finishedAt: null,
          durationMs: null
        })
        draft.progress = details?.message
          ? {
              phase,
              message: details.message,
              updatedAt,
              details: nullIfEmpty(details.input ? { input: details.input } : undefined)
            }
          : draft.progress
      })
      return snapshot
    },
    markPhaseSuccess(phase, io) {
      snapshot = snapshotWithUpdate(snapshot, (draft) => {
        draft.phaseStatuses[phase] = 'success'
        if (io) {
          draft.phases[phase] = io
          draft.phaseTimeline[phase] = buildTiming(io)
        }
        if (draft.progress?.phase === phase) {
          draft.progress = null
        }
        draft.lastError = null
      })
      return snapshot
    },
    markPhaseFailure(phase, error) {
      snapshot = snapshotWithUpdate(snapshot, (draft, updatedAt) => {
        const existingTiming = draft.phaseTimeline[phase]
        draft.phaseStatuses[phase] = 'error'
        draft.phaseTimeline[phase] = buildTiming({
          startedAt: existingTiming?.startedAt ?? updatedAt,
          finishedAt: updatedAt,
          durationMs: null
        })
        draft.lastError = {
          phase,
          message: error.message,
          updatedAt
        }
        draft.progress = {
          phase,
          message: error.message,
          updatedAt
        }
      })
      return snapshot
    },
    markPhaseSkipped(phase, reason, details) {
      snapshot = snapshotWithUpdate(snapshot, (draft, updatedAt) => {
        const existingTiming = draft.phaseTimeline[phase]
        draft.phaseStatuses[phase] = 'skipped'
        if (existingTiming?.startedAt) {
          draft.phaseTimeline[phase] = buildTiming({
            startedAt: details?.startedAt ?? existingTiming.startedAt,
            finishedAt: details?.finishedAt ?? updatedAt,
            durationMs: null
          })
        } else if (!draft.phaseTimeline[phase]) {
          draft.phaseTimeline[phase] = buildTiming({
            startedAt: null,
            finishedAt: null,
            durationMs: null
          })
        }

        if (reason) {
          draft.progress = {
            phase,
            message: reason,
            updatedAt
          }
        } else if (draft.progress?.phase === phase) {
          draft.progress = null
        }
      })
      return snapshot
    },
    recordProgress(phase, progress) {
      snapshot = snapshotWithUpdate(snapshot, (draft, updatedAt) => {
        const message = typeof progress.message === 'string' && progress.message.trim()
          ? progress.message.trim()
          : `Phase ${phase} updated.`
        const details = { ...progress }
        delete details.message

        draft.progress = {
          phase,
          message,
          updatedAt,
          details: nullIfEmpty(details)
        }
      })
      return snapshot
    },
    recordRepairAttempt(attempt, maxAttempts, findings) {
      snapshot = snapshotWithUpdate(snapshot, (draft, updatedAt) => {
        draft.repairCycles = attempt
        draft.repairAttempts.push({
          attempt,
          maxAttempts,
          findings,
          updatedAt
        })
        draft.progress = {
          phase: 'repair',
          message: `Repair attempt ${attempt}/${maxAttempts}`,
          updatedAt,
          details: {
            findingsCount: findings.length
          }
        }
      })
      return snapshot
    },
    markRepairCyclePhaseStart(cycleNumber, phase, details) {
      snapshot = snapshotWithUpdate(snapshot, (draft, updatedAt) => {
        const cycle = ensureRepairCycle(draft.repairTimeline, cycleNumber)
        const phaseEntry = ensureRepairPhase(cycle, phase)
        const startedAt = details?.startedAt ?? updatedAt

        phaseEntry.status = 'running'
        phaseEntry.startedAt = startedAt
        phaseEntry.finishedAt = null
        phaseEntry.durationMs = null
        phaseEntry.summaryLabel = details?.summaryLabel ?? phaseEntry.summaryLabel
      })
      return snapshot
    },
    markRepairCyclePhaseComplete(cycleNumber, phase, status, details) {
      snapshot = snapshotWithUpdate(snapshot, (draft, updatedAt) => {
        const cycle = ensureRepairCycle(draft.repairTimeline, cycleNumber)
        const phaseEntry = ensureRepairPhase(cycle, phase)
        const timing = details?.io
          ? buildTiming(details.io)
          : buildTiming({
              startedAt: phaseEntry.startedAt ?? updatedAt,
              finishedAt: details?.finishedAt ?? updatedAt,
              durationMs: null
            })

        phaseEntry.status = status
        phaseEntry.startedAt = timing.startedAt
        phaseEntry.finishedAt = timing.finishedAt
        phaseEntry.durationMs = timing.durationMs
        phaseEntry.summaryLabel = details?.summaryLabel ?? phaseEntry.summaryLabel
      })
      return snapshot
    },
    finalizeRepairCycle(cycleNumber, summary) {
      snapshot = snapshotWithUpdate(snapshot, (draft) => {
        const cycle = ensureRepairCycle(draft.repairTimeline, cycleNumber)
        cycle.status = summary.status
        cycle.findings = countFindings(summary.findings)
        cycle.scoreBefore = summary.scoreBefore ?? cycle.scoreBefore
        cycle.scoreAfter = summary.scoreAfter ?? cycle.scoreAfter
      })
      return snapshot
    },
    markRepairExhausted() {
      snapshot = snapshotWithUpdate(snapshot, (draft) => {
        draft.repairExhausted = true
      })
      return snapshot
    },
    setDomainCardMeta(meta) {
      snapshot = snapshotWithUpdate(snapshot, (draft) => {
        draft.domainCardMeta = meta
      })
      return snapshot
    },
    completeRun(status, extra) {
      snapshot = snapshotWithUpdate(snapshot, (draft, updatedAt) => {
        draft.run = {
          ...draft.run,
          status,
          finishedAt: updatedAt
        }
        if (extra?.message) {
          draft.progress = {
            phase: draft.progress?.phase ?? 'package',
            message: extra.message,
            updatedAt
          }
        } else if (status !== 'running') {
          draft.progress = null
        }

        if (status === 'error' && !draft.lastError && extra?.message) {
          draft.lastError = {
            phase: 'run',
            message: extra.message,
            updatedAt
          }
        }
      })

      if (status === 'success') {
        persistSuccessSnapshot(snapshot)
      }

      return snapshot
    },
    getSnapshot() {
      return snapshot
    }
  }
}

function nullIfEmpty(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value || Object.keys(value).length === 0) {
    return undefined
  }

  return value
}
