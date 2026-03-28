import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createEmptyPipelineRuntimeData,
  createPipelineRuntimeRecorder,
  readPipelineRuntimeData
} from '../src/lib/flow/pipeline-runtime-data'

const SNAPSHOT_FILE = resolve(process.cwd(), 'tmp/pipeline-context.json')
const originalSnapshot = existsSync(SNAPSHOT_FILE) ? readFileSync(SNAPSHOT_FILE, 'utf8') : null

const resourceUsage = {
  mode: 'backend-cloud',
  resourceOwner: 'backend',
  executionTarget: 'cloud',
  credentialSource: 'backend-stored',
  chargePolicy: 'charge',
  chargeReason: 'backend_resource',
  chargeable: true,
  estimatedCostSats: 5,
  billingReasonCode: null,
  billingReasonDetail: null,
  canExecute: true,
  blockReasonCode: null,
  blockReasonDetail: null,
  providerId: 'openai',
  modelId: 'openai:gpt-4o-mini'
} as const

afterEach(() => {
  mkdirSync(resolve(SNAPSHOT_FILE, '..'), { recursive: true })

  if (originalSnapshot === null) {
    writeFileSync(SNAPSHOT_FILE, '', 'utf8')
    return
  }

  writeFileSync(SNAPSHOT_FILE, originalSnapshot, 'utf8')
})

describe('pipeline runtime data v5', () => {
  it('initializes the expanded snapshot shape', () => {
    const snapshot = createEmptyPipelineRuntimeData({
      source: 'api-build',
      modelId: 'openai:gpt-4o-mini',
      goalText: 'Aprender guitarra',
      profileId: 'profile-123'
    })

    expect(snapshot.pipeline).toBe('v5')
    expect(snapshot.schemaVersion).toBe(3)
    expect(snapshot.run.status).toBe('running')
    expect(snapshot.phaseStatuses.classify).toBe('pending')
    expect(snapshot.phaseTimeline).toEqual({})
    expect(snapshot.repairTimeline).toEqual([])
    expect(snapshot.run.tokensUsed).toBeNull()
    expect(snapshot.run.resourceUsage).toBeNull()
    expect(snapshot.interactiveMode).toBe(false)
    expect(snapshot.currentPausePoint).toBeNull()
    expect(snapshot.pauseHistory).toEqual([])
    expect(snapshot.interactiveState).toBeNull()
  })

  it('records timing for running and skipped phases', () => {
    const recorder = createPipelineRuntimeRecorder({
      source: 'api-build',
      modelId: 'openai:gpt-4o-mini',
      goalText: 'Aprender guitarra',
      profileId: 'profile-123'
    })

    recorder.markPhaseStart('classify', {
      startedAt: '2026-03-26T00:00:00.000Z',
      input: { text: 'Aprender guitarra' }
    })
    recorder.markPhaseSuccess('classify', {
      input: { text: 'Aprender guitarra' },
      output: { goalType: 'SKILL_ACQUISITION' },
      processing: 'Clasifica el objetivo.',
      startedAt: '2026-03-26T00:00:00.000Z',
      finishedAt: '2026-03-26T00:00:01.000Z',
      durationMs: 1000
    })
    recorder.markPhaseStart('adapt', {
      startedAt: '2026-03-26T00:00:02.000Z'
    })
    recorder.markPhaseSkipped('adapt', 'Sin logs', {
      finishedAt: '2026-03-26T00:00:02.500Z'
    })

    const snapshot = readPipelineRuntimeData()

    expect(snapshot?.phaseStatuses.classify).toBe('success')
    expect(snapshot?.phaseTimeline.classify).toMatchObject({
      startedAt: '2026-03-26T00:00:00.000Z',
      finishedAt: '2026-03-26T00:00:01.000Z',
      durationMs: 1000
    })
    expect(snapshot?.phaseStatuses.adapt).toBe('skipped')
    expect(snapshot?.phaseTimeline.adapt?.startedAt).toBe('2026-03-26T00:00:02.000Z')
    expect(snapshot?.phaseTimeline.adapt?.finishedAt).toBe('2026-03-26T00:00:02.500Z')
  })

  it('persists repair timeline cycles, exhaustion, and run metadata', () => {
    const recorder = createPipelineRuntimeRecorder({
      source: 'api-build',
      modelId: 'openai:gpt-4o-mini',
      goalText: 'Aprender guitarra',
      profileId: 'profile-123'
    })

    recorder.recordRepairAttempt(1, 3, [
      { severity: 'FAIL', message: 'Conflicto 1' },
      { severity: 'WARN', message: 'Carga alta' }
    ])
    recorder.markRepairCyclePhaseStart(1, 'hardValidate', {
      startedAt: '2026-03-26T00:00:10.000Z'
    })
    recorder.markRepairCyclePhaseComplete(1, 'hardValidate', 'success', {
      finishedAt: '2026-03-26T00:00:10.120Z',
      summaryLabel: '2 FAIL'
    })
    recorder.markRepairCyclePhaseStart(1, 'softValidate', {
      startedAt: '2026-03-26T00:00:10.120Z'
    })
    recorder.markRepairCyclePhaseComplete(1, 'softValidate', 'success', {
      finishedAt: '2026-03-26T00:00:10.165Z',
      summaryLabel: '1 WARN'
    })
    recorder.markRepairCyclePhaseStart(1, 'coveVerify', {
      startedAt: '2026-03-26T00:00:10.165Z'
    })
    recorder.markRepairCyclePhaseComplete(1, 'coveVerify', 'success', {
      finishedAt: '2026-03-26T00:00:11.055Z',
      summaryLabel: '1 FAIL'
    })
    recorder.markRepairCyclePhaseStart(1, 'repair', {
      startedAt: '2026-03-26T00:00:11.055Z'
    })
    recorder.markRepairCyclePhaseComplete(1, 'repair', 'success', {
      finishedAt: '2026-03-26T00:00:11.395Z',
      summaryLabel: '3 patches'
    })
    recorder.finalizeRepairCycle(1, {
      status: 'repaired',
      findings: [
        { severity: 'FAIL', message: 'Conflicto 1' },
        { severity: 'WARN', message: 'Carga alta' }
      ],
      scoreBefore: 0.62,
      scoreAfter: 0.87
    })

    recorder.recordRepairAttempt(2, 3, [
      { severity: 'FAIL', message: 'Conflicto 2' }
    ])
    recorder.markRepairCyclePhaseStart(2, 'hardValidate', {
      startedAt: '2026-03-26T00:00:12.000Z'
    })
    recorder.markRepairCyclePhaseComplete(2, 'hardValidate', 'success', {
      finishedAt: '2026-03-26T00:00:12.095Z',
      summaryLabel: '0 FAIL'
    })
    recorder.markRepairCyclePhaseComplete(2, 'repair', 'exhausted', {
      finishedAt: '2026-03-26T00:00:12.095Z',
      summaryLabel: 'Agotado'
    })
    recorder.finalizeRepairCycle(2, {
      status: 'exhausted',
      findings: [
        { severity: 'FAIL', message: 'Conflicto 2' }
      ]
    })
    recorder.markRepairExhausted()
    recorder.setRunMetadata({
      tokensUsed: { input: 1200, output: 340 },
      resourceUsage
    })

    const snapshot = recorder.getSnapshot()

    expect(snapshot.repairExhausted).toBe(true)
    expect(snapshot.repairCycles).toBe(2)
    expect(snapshot.repairTimeline).toHaveLength(2)
    expect(snapshot.repairTimeline[0]).toMatchObject({
      cycle: 1,
      status: 'repaired',
      findings: { fail: 1, warn: 1, info: 0 },
      scoreBefore: 0.62,
      scoreAfter: 0.87
    })
    expect(snapshot.repairTimeline[0].phases.map((phase) => phase.phase)).toEqual([
      'hardValidate',
      'softValidate',
      'coveVerify',
      'repair'
    ])
    expect(snapshot.repairTimeline[1]).toMatchObject({
      cycle: 2,
      status: 'exhausted',
      findings: { fail: 1, warn: 0, info: 0 }
    })
    expect(snapshot.run.tokensUsed).toEqual({ input: 1200, output: 340 })
    expect(snapshot.run.resourceUsage).toEqual(resourceUsage)
  })
})
