import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'

import {
  buildFlowViewerModel,
  buildPipelineTopologyModel,
  formatViewerQualityScore,
  getDefaultSelectedPhaseId
} from '../src/lib/flow/flow-viewer-model'
import { createEmptyPipelineRuntimeData } from '../src/lib/flow/pipeline-runtime-data'

describe('flow viewer model', () => {
  it('falls back to the stepper when there are no timings', () => {
    const snapshot = createEmptyPipelineRuntimeData({
      source: 'api-build',
      modelId: 'openai:gpt-4o-mini',
      goalText: 'Aprender guitarra'
    })

    snapshot.phaseStatuses.classify = 'success'
    snapshot.phaseTimeline = {}

    const model = buildFlowViewerModel(snapshot, DateTime.fromISO('2026-03-26T00:00:03.000Z'))

    expect(model.hasTimingData).toBe(false)
    expect(model.phases.find((phase) => phase.id === 'classify')?.status).toBe('success')
  })

  it('builds grouped waterfall data, partial master status, and repair details', () => {
    const snapshot = createEmptyPipelineRuntimeData({
      source: 'api-build',
      modelId: 'openai:gpt-4o-mini',
      goalText: 'Aprender guitarra'
    })

    snapshot.run.status = 'success'
    snapshot.run.startedAt = '2026-03-26T00:00:00.000Z'
    snapshot.run.finishedAt = '2026-03-26T00:00:04.000Z'
    snapshot.run.tokensUsed = { input: 2000, output: 840 }
    snapshot.phaseStatuses.classify = 'success'
    snapshot.phaseStatuses.requirements = 'success'
    snapshot.phaseStatuses.repair = 'success'
    snapshot.phaseStatuses.package = 'success'
    snapshot.repairCycles = 2
    snapshot.repairExhausted = true
    snapshot.domainCardMeta = {
      domainLabel: 'running',
      method: 'MANUAL',
      confidence: 0.92
    }
    snapshot.phaseTimeline = {
      classify: {
        startedAt: '2026-03-26T00:00:00.000Z',
        finishedAt: '2026-03-26T00:00:01.000Z',
        durationMs: 1000
      },
      requirements: {
        startedAt: '2026-03-26T00:00:01.000Z',
        finishedAt: '2026-03-26T00:00:02.000Z',
        durationMs: 1000
      },
      repair: {
        startedAt: '2026-03-26T00:00:02.000Z',
        finishedAt: '2026-03-26T00:00:03.000Z',
        durationMs: 1000
      },
      package: {
        startedAt: '2026-03-26T00:00:03.000Z',
        finishedAt: '2026-03-26T00:00:04.000Z',
        durationMs: 1000
      }
    }
    snapshot.phases.requirements = {
      input: { classification: { goalType: 'RECURRENT_HABIT' } },
      output: { questions: ['q1', 'q2', 'q3', 'q4'] },
      processing: 'Genera preguntas.',
      startedAt: '2026-03-26T00:00:01.000Z',
      finishedAt: '2026-03-26T00:00:02.000Z',
      durationMs: 1000
    }
    snapshot.phases.package = {
      input: {},
      output: { qualityScore: 0.85 },
      processing: 'Empaqueta el resultado.',
      startedAt: '2026-03-26T00:00:03.000Z',
      finishedAt: '2026-03-26T00:00:04.000Z',
      durationMs: 1000
    }
    snapshot.phases.hardValidate = {
      input: {},
      output: { findings: [{ severity: 'FAIL' }] },
      processing: 'Valida reglas duras.',
      startedAt: '2026-03-26T00:00:02.000Z',
      finishedAt: '2026-03-26T00:00:02.100Z',
      durationMs: 100
    }
    snapshot.phases.softValidate = {
      input: {},
      output: { findings: [{ severity: 'WARN' }, { severity: 'INFO' }] },
      processing: 'Valida reglas soft.',
      startedAt: '2026-03-26T00:00:02.100Z',
      finishedAt: '2026-03-26T00:00:02.200Z',
      durationMs: 100
    }
    snapshot.phases.coveVerify = {
      input: {},
      output: { findings: [{ severity: 'FAIL' }] },
      processing: 'Verifica consistencia.',
      startedAt: '2026-03-26T00:00:02.200Z',
      finishedAt: '2026-03-26T00:00:02.900Z',
      durationMs: 700
    }
    snapshot.repairTimeline = [
      {
        cycle: 1,
        status: 'repaired',
        findings: { fail: 1, warn: 1, info: 0 },
        scoreBefore: 0.62,
        scoreAfter: 0.87,
        phases: [
          {
            phase: 'hardValidate',
            status: 'success',
            startedAt: '2026-03-26T00:00:02.000Z',
            finishedAt: '2026-03-26T00:00:02.100Z',
            durationMs: 100,
            summaryLabel: '2 FAIL'
          },
          {
            phase: 'softValidate',
            status: 'success',
            startedAt: '2026-03-26T00:00:02.100Z',
            finishedAt: '2026-03-26T00:00:02.145Z',
            durationMs: 45,
            summaryLabel: '1 WARN'
          },
          {
            phase: 'coveVerify',
            status: 'success',
            startedAt: '2026-03-26T00:00:02.145Z',
            finishedAt: '2026-03-26T00:00:02.935Z',
            durationMs: 790,
            summaryLabel: '1 FAIL'
          },
          {
            phase: 'repair',
            status: 'success',
            startedAt: '2026-03-26T00:00:02.935Z',
            finishedAt: '2026-03-26T00:00:03.000Z',
            durationMs: 65,
            summaryLabel: '3 patches'
          }
        ]
      },
      {
        cycle: 2,
        status: 'exhausted',
        findings: { fail: 1, warn: 0, info: 0 },
        scoreBefore: 0.87,
        scoreAfter: null,
        phases: [
          {
            phase: 'hardValidate',
            status: 'success',
            startedAt: '2026-03-26T00:00:03.000Z',
            finishedAt: '2026-03-26T00:00:03.095Z',
            durationMs: 95,
            summaryLabel: '0 FAIL'
          },
          {
            phase: 'repair',
            status: 'exhausted',
            startedAt: '2026-03-26T00:00:03.095Z',
            finishedAt: '2026-03-26T00:00:03.095Z',
            durationMs: 0,
            summaryLabel: 'Agotado'
          }
        ]
      }
    ]

    const model = buildFlowViewerModel(snapshot, DateTime.fromISO('2026-03-26T00:00:04.000Z'))
    const topology = buildPipelineTopologyModel(snapshot, DateTime.fromISO('2026-03-26T00:00:04.000Z'))

    expect(model.masterStatus).toBe('partial')
    expect(model.hasTimingData).toBe(true)
    expect(model.groups.map((group) => group.label)).toEqual([
      'Entender',
      'Planificar',
      'Validar y entregar'
    ])
    expect(model.footer.tokensTotal).toBe(2840)
    expect(model.footer.domainLabel).toBe('running (MANUAL, 92%)')
    expect(model.footer.findings).toEqual({
      fail: 2,
      warn: 1,
      info: 1
    })
    expect(model.phases.find((phase) => phase.id === 'repair')?.status).toBe('exhausted')
    expect(model.phases.find((phase) => phase.id === 'repair')?.repairCycles).toHaveLength(2)
    expect(model.phases.find((phase) => phase.id === 'requirements')?.kpi).toBe('4 preguntas')
    expect(model.phases.find((phase) => phase.id === 'classify')?.name).toBe('Classify')
    expect(model.phases.find((phase) => phase.id === 'requirements')?.timeline?.startPercent).toBeCloseTo(25, 0)
    expect(model.phases.find((phase) => phase.id === 'requirements')?.timeline?.widthPercent).toBeCloseTo(25, 0)
    expect(formatViewerQualityScore(model.footer.qualityScore)).toBe('0.85')
    expect(getDefaultSelectedPhaseId(model)).toBe('package')
    expect(topology.mainNodes.map((node) => node.id)).toEqual([
      'classify',
      'requirements',
      'profile',
      'strategy',
      'template',
      'schedule',
      'package'
    ])
    expect(topology.repairNode.phase.id).toBe('repair')
    expect(topology.adaptNode.phase.id).toBe('adapt')
    expect(topology.loopState.status).toBe('exhausted')
  })

  it('marks strategy as rerun target when adapt requests rebase', () => {
    const snapshot = createEmptyPipelineRuntimeData({
      source: 'api-build',
      modelId: 'openai:gpt-4o-mini',
      goalText: 'Aprender guitarra'
    })

    snapshot.run.status = 'success'
    snapshot.phaseStatuses.package = 'success'
    snapshot.phaseStatuses.adapt = 'success'
    snapshot.phases.adapt = {
      input: {},
      output: {
        mode: 'REBASE',
        overallRisk: 'CRITICAL',
        dispatch: {
          rerunFromPhase: 'strategy'
        }
      },
      processing: 'Evalua adherencia.',
      startedAt: '2026-03-26T00:00:04.000Z',
      finishedAt: '2026-03-26T00:00:05.000Z',
      durationMs: 1000
    }

    const topology = buildPipelineTopologyModel(snapshot, DateTime.fromISO('2026-03-26T00:00:05.000Z'))

    expect(topology.rerunTarget).toBe('strategy')
    expect(topology.mainNodes.find((node) => node.id === 'strategy')?.highlight).toBe(true)
    expect(topology.mainNodes.find((node) => node.id === 'schedule')?.highlight).toBe(false)
  })

  it('marks schedule as rerun target when adapt requests partial repair', () => {
    const snapshot = createEmptyPipelineRuntimeData({
      source: 'api-build',
      modelId: 'openai:gpt-4o-mini',
      goalText: 'Aprender guitarra'
    })

    snapshot.run.status = 'success'
    snapshot.phaseStatuses.package = 'success'
    snapshot.phaseStatuses.adapt = 'success'
    snapshot.phases.adapt = {
      input: {},
      output: {
        mode: 'PARTIAL_REPAIR',
        overallRisk: 'AT_RISK',
        dispatch: {
          rerunFromPhase: 'schedule'
        }
      },
      processing: 'Evalua adherencia.',
      startedAt: '2026-03-26T00:00:04.000Z',
      finishedAt: '2026-03-26T00:00:05.000Z',
      durationMs: 1000
    }

    const topology = buildPipelineTopologyModel(snapshot, DateTime.fromISO('2026-03-26T00:00:05.000Z'))

    expect(topology.rerunTarget).toBe('schedule')
    expect(topology.mainNodes.find((node) => node.id === 'schedule')?.highlight).toBe(true)
    expect(topology.mainNodes.find((node) => node.id === 'strategy')?.highlight).toBe(false)
  })

  it('derives repair state from repairTimeline when the aggregate count is stale', () => {
    const snapshot = createEmptyPipelineRuntimeData({
      source: 'api-build',
      modelId: 'openai:gpt-4o-mini',
      goalText: 'Aprender guitarra'
    })

    snapshot.run.status = 'success'
    snapshot.phaseStatuses.repair = 'skipped'
    snapshot.repairCycles = 0
    snapshot.repairTimeline = [
      {
        cycle: 1,
        status: 'clean',
        findings: { fail: 0, warn: 1, info: 0 },
        scoreBefore: 0.84,
        scoreAfter: 0.91,
        phases: [
          {
            phase: 'hardValidate',
            status: 'success',
            startedAt: '2026-03-26T00:00:02.000Z',
            finishedAt: '2026-03-26T00:00:02.100Z',
            durationMs: 100,
            summaryLabel: '0 FAIL'
          },
          {
            phase: 'repair',
            status: 'success',
            startedAt: '2026-03-26T00:00:02.100Z',
            finishedAt: '2026-03-26T00:00:02.300Z',
            durationMs: 200,
            summaryLabel: 'Sin fallas'
          }
        ]
      }
    ]

    const model = buildFlowViewerModel(snapshot, DateTime.fromISO('2026-03-26T00:00:03.000Z'))
    const topology = buildPipelineTopologyModel(snapshot, DateTime.fromISO('2026-03-26T00:00:03.000Z'))

    expect(model.phases.find((phase) => phase.id === 'repair')?.status).toBe('success')
    expect(model.footer.repairCycles).toBe(1)
    expect(topology.repairNode.highlight).toBe(true)
    expect(topology.repairNode.highlightLabel).toBeNull()
  })
})
