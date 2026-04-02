import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveUserIdMock: vi.fn(() => 'local-user'),
  resolvePlanBuildExecutionMock: vi.fn(),
  getDeploymentModeMock: vi.fn(() => 'local'),
  createBuildAgentRuntimeMock: vi.fn(),
  getProfileMock: vi.fn(),
  parseStoredProfileMock: vi.fn(),
  getProfileTimezoneMock: vi.fn(() => 'UTC'),
  isStartDateInPastMock: vi.fn(() => false),
  buildSchedulingContextFromProfileMock: vi.fn(() => ({
    planningStartAt: '2026-03-30T00:00:00.000Z',
    weekStartDate: '2026-03-30T00:00:00.000Z',
    availability: [],
    blocked: [],
  })),
  persistPlanFromV5PackageMock: vi.fn(() => ({
    planId: 'persisted-debug-plan',
  })),
  createInteractiveSessionMock: vi.fn(),
  updateInteractiveSessionMock: vi.fn(),
  createV6RuntimeSnapshotMock: vi.fn(() => ({ snapshot: true })),
  getUserByIdMock: vi.fn(),
  runMock: vi.fn(),
  getProgressMock: vi.fn(() => ({
    progressScore: 95,
    lastAction: 'Packaging final plan',
  })),
  getSnapshotMock: vi.fn(() => ({ snapshot: true })),
  getDebugStatusMock: vi.fn(() => ({
    lifecycle: 'running',
    currentPhase: 'plan',
    currentAgent: 'planner',
    currentAction: 'agent.start',
    currentSummary_es: 'Planificando.',
    iteration: 3,
    revisionCycles: 1,
    clarifyRounds: 0,
    progressScore: 55,
    degraded: false,
    fallbackCount: 0,
    publicationState: null,
    failureCode: null,
    lastEventSequence: 1,
    lastEventTimestamp: '2026-03-30T00:00:00.000Z',
    lastEventSummary_es: 'Planificando.',
  })),
  setDebugListenerMock: vi.fn(),
}))

vi.mock('../app/api/_user-settings', () => ({
  resolveUserId: mocks.resolveUserIdMock,
}))

vi.mock('../src/lib/runtime/build-execution', () => ({
  resolvePlanBuildExecution: mocks.resolvePlanBuildExecutionMock,
}))

vi.mock('../src/lib/env/deployment', () => ({
  getDeploymentMode: mocks.getDeploymentModeMock,
}))

vi.mock('../src/lib/runtime/build-agent-runtime', () => ({
  createBuildAgentRuntime: mocks.createBuildAgentRuntimeMock,
}))

vi.mock('../src/lib/db/db-helpers', () => ({
  getProfile: mocks.getProfileMock,
  getUserById: mocks.getUserByIdMock,
}))

vi.mock('../src/lib/domain/plan-helpers', () => ({
  parseStoredProfile: mocks.parseStoredProfileMock,
  getProfileTimezone: mocks.getProfileTimezoneMock,
}))

vi.mock('../src/lib/pipeline/shared/scheduling-context', () => ({
  isStartDateInPast: mocks.isStartDateInPastMock,
  buildSchedulingContextFromProfile: mocks.buildSchedulingContextFromProfileMock,
}))

vi.mock('../src/lib/domain/plan-v5-activation', () => ({
  persistPlanFromV5Package: mocks.persistPlanFromV5PackageMock,
}))

vi.mock('../src/lib/db/interactive-sessions', () => ({
  createInteractiveSession: mocks.createInteractiveSessionMock,
  updateInteractiveSession: mocks.updateInteractiveSessionMock,
}))

vi.mock('../src/lib/pipeline/v6/session-snapshot', () => ({
  createV6RuntimeSnapshot: mocks.createV6RuntimeSnapshotMock,
}))

vi.mock('../src/lib/pipeline/v6/orchestrator', () => ({
  PlanOrchestrator: class {
    constructor(
      _config: unknown,
      _brainRuntime: unknown,
      _fastRuntime: unknown,
      _runtimeLabel?: string,
      debugListener?: (event: unknown) => void,
    ) {
      mocks.setDebugListenerMock(debugListener ?? null)
    }
    run = mocks.runMock
    getProgress = mocks.getProgressMock
    getSnapshot = mocks.getSnapshotMock
    getDebugStatus = mocks.getDebugStatusMock
  },
}))

import { POST } from '../app/api/plan/build/route'

function extractSsePayloads(streamText: string): Array<Record<string, unknown>> {
  return streamText
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim())
      const dataLine = lines.find((line) => line.startsWith('data:'))
      if (!dataLine) {
        return null
      }
      return JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>
    })
    .filter((payload): payload is Record<string, unknown> => payload !== null)
}

describe('plan build route failure surfacing', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => {
      if (typeof mock === 'function' && 'mockReset' in mock) {
        mock.mockReset()
      }
    })

    mocks.resolveUserIdMock.mockReturnValue('local-user')
    mocks.getDeploymentModeMock.mockReturnValue('local')
    mocks.getProfileMock.mockResolvedValue({
      id: 'profile-1',
      data: '{}',
    })
    mocks.parseStoredProfileMock.mockReturnValue({
      participantes: [],
    })
    mocks.getProfileTimezoneMock.mockReturnValue('UTC')
    mocks.isStartDateInPastMock.mockReturnValue(false)
    mocks.buildSchedulingContextFromProfileMock.mockReturnValue({
      planningStartAt: '2026-03-30T00:00:00.000Z',
      weekStartDate: '2026-03-30T00:00:00.000Z',
      availability: [],
      blocked: [],
    })
    mocks.persistPlanFromV5PackageMock.mockReturnValue({
      planId: 'persisted-debug-plan',
    })
    mocks.getProgressMock.mockReturnValue({
      progressScore: 95,
      lastAction: 'Packaging final plan',
    })
    mocks.getSnapshotMock.mockReturnValue({ snapshot: true })
    mocks.getDebugStatusMock.mockReturnValue({
      lifecycle: 'running',
      currentPhase: 'plan',
      currentAgent: 'planner',
      currentAction: 'agent.start',
      currentSummary_es: 'Planificando.',
      iteration: 3,
      revisionCycles: 1,
      clarifyRounds: 0,
      progressScore: 55,
      degraded: false,
      fallbackCount: 0,
      publicationState: null,
      failureCode: null,
      lastEventSequence: 1,
      lastEventTimestamp: '2026-03-30T00:00:00.000Z',
      lastEventSummary_es: 'Planificando.',
    })
    mocks.createBuildAgentRuntimeMock.mockReturnValue({
      chat: vi.fn().mockResolvedValue({
        content: 'OK',
        usage: {
          promptTokens: 1,
          completionTokens: 1,
        },
      }),
      stream: vi.fn(),
      newContext: vi.fn(),
    })
    mocks.resolvePlanBuildExecutionMock.mockResolvedValue({
      requestedModelId: 'openai:gpt-5-codex',
      executionContext: {
        canExecute: true,
        mode: 'codex-cloud',
        resourceOwner: 'backend',
        resolutionSource: 'requested-mode',
        blockReasonCode: null,
        blockReasonDetail: null,
        provider: {
          providerId: 'openai',
          modelId: 'openai:gpt-5-codex',
          providerKind: 'cloud',
        },
      },
      runtime: {
        modelId: 'openai:gpt-5-codex',
        apiKey: 'chatgpt-oauth',
        baseURL: 'https://chatgpt.com/backend-api/codex',
        authMode: 'codex-oauth',
      },
      billingPolicy: {
        chargeable: false,
        skipReasonCode: 'internal_tooling',
        skipReasonDetail: 'INTERNAL_TOOLING_MODE',
      },
    })
    mocks.runMock.mockResolvedValue({
      status: 'failed',
      package: {
        plan: {
          goalIds: ['goal-cocina'],
          timezone: 'UTC',
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
          skeleton: {
            horizonWeeks: 12,
            goalIds: ['goal-cocina'],
            phases: [],
            milestones: [],
          },
          detail: {
            horizonWeeks: 2,
            startDate: '2026-03-30',
            endDate: '2026-04-12',
            scheduledEvents: [],
            weeks: [],
          },
          operational: {
            horizonDays: 7,
            startDate: '2026-03-30',
            endDate: '2026-04-05',
            frozen: true,
            scheduledEvents: [],
            buffers: [],
            days: [],
            totalBufferMin: 0,
          },
        },
        items: [],
        habitStates: [],
        slackPolicy: {
          weeklyTimeBufferMin: 120,
          maxChurnMovesPerWeek: 3,
          frozenHorizonDays: 2,
        },
        timezone: 'UTC',
        summary_esAR: 'No se pudo cerrar el plan.',
        qualityScore: 12,
        implementationIntentions: [],
        warnings: ['Faltan hitos concretos para cerrar el plan.'],
        tradeoffs: [],
        publicationState: 'failed_for_quality_review',
        qualityIssues: [
          {
            code: 'FAILED_QUALITY_REVIEW',
            severity: 'blocking',
            message: 'Faltan hitos concretos para cerrar el plan.',
          },
        ],
        requestDomain: 'cocina-italiana',
        packageDomain: 'cocina-italiana',
        intakeCoverage: {
          requiredSignals: ['cooking_level'],
          missingSignals: [],
          signalUsage: [],
        },
        agentOutcomes: [],
        degraded: false,
      },
      scratchpad: [{
        phase: 'package',
        agent: 'packager',
        iteration: 1,
        action: 'Empaquetar',
        reasoning: 'Revision final.',
        result: 'No aprobado',
        tokensUsed: 10,
        timestamp: '2026-03-30T00:00:00.000Z',
      }],
      tokensUsed: 10,
      iterations: 7,
      agentOutcomes: [
        {
          agent: 'critic',
          phase: 'critique',
          source: 'fallback',
          errorCode: 'FAILED_QUALITY_REVIEW',
          errorMessage: 'Faltan hitos concretos para cerrar el plan.',
          durationMs: 31,
        },
      ],
      degraded: false,
      publicationState: 'failed',
      failureCode: 'failed_for_quality_review',
      blockingAgents: [
        {
          agent: 'critic',
          phase: 'critique',
          source: 'fallback',
          errorCode: 'FAILED_QUALITY_REVIEW',
          errorMessage: 'Faltan hitos concretos para cerrar el plan.',
          durationMs: 31,
        },
      ],
    })
  })

  it('surfaces failed_for_quality_review details instead of collapsing to a generic error', async () => {
    const response = await POST(new Request('http://localhost/api/plan/build', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        goalText: 'Quiero aprender a cocinar platos italianos',
        profileId: 'c2567794-35f8-45b0-8eea-f0b1b7a86f60',
        provider: 'openai:gpt-5-codex',
        resourceMode: 'codex',
      }),
    }))

    const payloads = extractSsePayloads(await response.text())

    expect(mocks.resolveUserIdMock).toHaveBeenCalled()
    expect(mocks.getProfileMock).toHaveBeenCalled()
    expect(mocks.parseStoredProfileMock).toHaveBeenCalled()
    expect(mocks.getDeploymentModeMock).toHaveBeenCalled()
    expect(mocks.resolvePlanBuildExecutionMock).toHaveBeenCalled()
    const blockedPayload = payloads.find((payload) => payload.type === 'v6:blocked')

    expect(blockedPayload).toBeTruthy()
    expect(blockedPayload).toEqual(expect.objectContaining({
      type: 'v6:blocked',
      data: expect.objectContaining({
        failureCode: 'failed_for_quality_review',
        message: 'Faltan hitos concretos para cerrar el plan.',
        blockingAgents: expect.arrayContaining([
          expect.objectContaining({
            agent: 'critic',
            errorMessage: 'Faltan hitos concretos para cerrar el plan.',
          }),
        ]),
        agentOutcomes: expect.arrayContaining([
          expect.objectContaining({
            agent: 'critic',
            source: 'fallback',
          }),
        ]),
        qualityIssues: expect.arrayContaining([
          expect.objectContaining({
            code: 'FAILED_QUALITY_REVIEW',
          }),
        ]),
        warnings: expect.arrayContaining([
          'Faltan hitos concretos para cerrar el plan.',
        ]),
      }),
    }))

    const resultPayload = payloads.find((payload) => {
      if (payload.type !== 'result') {
        return false
      }

      const result = payload.result as Record<string, unknown> | undefined
      return Boolean(result?.failureCode)
    }) ?? [...payloads].reverse().find((payload) => payload.type === 'result')

    if (resultPayload) {
      expect(resultPayload.result).toEqual(expect.objectContaining({
        success: false,
        failureCode: 'failed_for_quality_review',
      }))
    }
  })

  it('returns a friendly error when startDate is in the past for the profile timezone', async () => {
    mocks.isStartDateInPastMock.mockReturnValueOnce(true)

    const response = await POST(new Request('http://localhost/api/plan/build', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        goalText: 'Quiero aprender a cocinar platos italianos',
        profileId: 'c2567794-35f8-45b0-8eea-f0b1b7a86f60',
        provider: 'openai:gpt-5-codex',
        resourceMode: 'codex',
        startDate: '2026-03-01',
      }),
    }))

    const payloads = extractSsePayloads(await response.text())
    const resultPayload = payloads.find((payload) => payload.type === 'result')

    expect(resultPayload?.result).toEqual(expect.objectContaining({
      success: false,
      error: 'La fecha de inicio tiene que ser hoy o un dia futuro.',
    }))
    expect(mocks.runMock).not.toHaveBeenCalled()
  })

  it('persists the plan when health supervision is only a warning', async () => {
    mocks.runMock.mockResolvedValueOnce({
      status: 'completed',
      package: {
        plan: {
          goalIds: ['goal-salud'],
          timezone: 'UTC',
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
          skeleton: {
            horizonWeeks: 12,
            goalIds: ['goal-salud'],
            phases: [],
            milestones: [],
          },
          detail: {
            horizonWeeks: 2,
            startDate: '2026-03-30',
            endDate: '2026-04-12',
            scheduledEvents: [],
            weeks: [],
          },
          operational: {
            horizonDays: 7,
            startDate: '2026-03-30',
            endDate: '2026-04-05',
            frozen: true,
            scheduledEvents: [],
            buffers: [],
            days: [],
            totalBufferMin: 0,
          },
        },
        items: [],
        habitStates: [],
        slackPolicy: {
          weeklyTimeBufferMin: 120,
          maxChurnMovesPerWeek: 3,
          frozenHorizonDays: 2,
        },
        timezone: 'UTC',
        summary_esAR: 'Plan listo con advertencia de salud.',
        qualityScore: 78,
        implementationIntentions: [],
        warnings: [
          '[Etapa: Listo] Este plan toca un objetivo de salud sensible. Usalo como guia inicial y con seguimiento profesional o supervision clinica antes de empujar cambios fuertes.',
        ],
        tradeoffs: [],
        publicationState: 'publishable',
        qualityIssues: [
          {
            code: 'HEALTH_SAFETY_SUPERVISION_MISSING',
            severity: 'warning',
            message: '[Etapa: Listo] Este plan toca un objetivo de salud sensible. Usalo como guia inicial y con seguimiento profesional o supervision clinica antes de empujar cambios fuertes.',
          },
        ],
        requestDomain: 'salud',
        packageDomain: 'salud',
        intakeCoverage: {
          requiredSignals: ['health_supervision'],
          missingSignals: ['health_supervision'],
          signalUsage: [],
        },
        agentOutcomes: [
          {
            agent: 'planner',
            phase: 'plan',
            source: 'fallback',
            errorCode: 'Error',
            errorMessage: 'Planner output failed validation: check "health.supervision" did not pass. Fallback strategy was used.',
            durationMs: 21,
          },
        ],
        degraded: false,
      },
      pendingQuestions: null,
      scratchpad: [],
      tokensUsed: 10,
      iterations: 3,
      agentOutcomes: [
        {
          agent: 'planner',
          phase: 'plan',
          source: 'fallback',
          errorCode: 'Error',
          errorMessage: 'Planner output failed validation: check "health.supervision" did not pass. Fallback strategy was used.',
          durationMs: 21,
        },
      ],
      degraded: false,
      publicationState: 'ready',
      failureCode: null,
      blockingAgents: [],
    })

    const response = await POST(new Request('http://localhost/api/plan/build', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        goalText: 'Quiero bajar 50kg en 12 meses',
        profileId: 'c2567794-35f8-45b0-8eea-f0b1b7a86f60',
        provider: 'openai:gpt-5-codex',
        resourceMode: 'codex',
      }),
    }))

    const payloads = extractSsePayloads(await response.text())
    const completePayload = payloads.find((payload) => payload.type === 'v6:complete')

    expect(payloads.some((payload) => payload.type === 'v6:blocked')).toBe(false)
    expect(mocks.persistPlanFromV5PackageMock).toHaveBeenCalledTimes(1)
    expect(mocks.persistPlanFromV5PackageMock).toHaveBeenCalledWith(expect.objectContaining({
      goalText: 'Quiero bajar 50kg en 12 meses',
      package: expect.objectContaining({
        publicationState: 'publishable',
        warnings: expect.arrayContaining([
          expect.stringContaining('seguimiento profesional o supervision clinica'),
        ]),
      }),
    }))
    expect(completePayload).toEqual(expect.objectContaining({
      type: 'v6:complete',
      data: expect.objectContaining({
        planId: 'persisted-debug-plan',
        score: 78,
      }),
    }))
  })

  it('returns explicit provider diagnostics when the provider cannot execute', async () => {
    mocks.resolvePlanBuildExecutionMock.mockResolvedValueOnce({
      requestedModelId: 'openai:gpt-4o-mini',
      executionContext: {
        canExecute: false,
        mode: 'user-cloud',
        resourceOwner: 'user',
        resolutionSource: 'requested-mode',
        blockReasonCode: 'unsupported_provider',
        blockReasonDetail: 'Model openai:gpt-4o-mini is not supported by the execution resolver.',
        provider: {
          providerId: 'unknown',
          modelId: 'openai:gpt-4o-mini',
          providerKind: 'cloud',
        },
      },
      runtime: null,
      billingPolicy: {
        chargeable: false,
        skipReasonCode: 'execution_blocked',
        skipReasonDetail: 'Model openai:gpt-4o-mini is not supported by the execution resolver.',
      },
    })

    const response = await POST(new Request('http://localhost/api/plan/build', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        goalText: 'Quiero aprender a cocinar platos italianos',
        profileId: 'c2567794-35f8-45b0-8eea-f0b1b7a86f60',
        provider: 'openai',
      }),
    }))

    const payloads = extractSsePayloads(await response.text())
    const providerPayload = payloads.find((payload) => payload.type === 'v6:provider')
    const resultPayload = payloads.find((payload) => payload.type === 'result')

    expect(providerPayload).toEqual(expect.objectContaining({
      type: 'v6:provider',
      data: expect.objectContaining({
        requestedProvider: 'openai',
        resolvedModelId: 'openai:gpt-4o-mini',
        canExecute: false,
        blockReasonCode: 'unsupported_provider',
      }),
    }))
    expect(resultPayload?.result).toEqual(expect.objectContaining({
      success: false,
      providerErrorCode: 'provider_not_supported',
      providerTrace: expect.objectContaining({
        requestedProvider: 'openai',
        resolvedModelId: 'openai:gpt-4o-mini',
      }),
      error: expect.stringContaining('provider_not_supported'),
    }))
    expect(mocks.createBuildAgentRuntimeMock).not.toHaveBeenCalled()
  })

  it('normalizes gpt-5-codex requests into the codex oauth path even without resourceMode', async () => {
    const response = await POST(new Request('http://localhost/api/plan/build', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        goalText: 'Quiero aprender a cocinar platos italianos',
        profileId: 'c2567794-35f8-45b0-8eea-f0b1b7a86f60',
        provider: 'openai:gpt-5-codex',
      }),
    }))

    const payloads = extractSsePayloads(await response.text())
    const providerPayload = payloads.find((payload) => payload.type === 'v6:provider')

    expect(mocks.resolvePlanBuildExecutionMock).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'openai:gpt-5-codex',
      requestedMode: 'codex-cloud',
    }))
    expect(providerPayload).toEqual(expect.objectContaining({
      type: 'v6:provider',
      data: expect.objectContaining({
        requestedProvider: 'codex',
        executionMode: 'codex-cloud',
        authMode: 'codex-oauth',
      }),
    }))
  })

  it('emits structured debug events when the request enables debug mode', async () => {
    mocks.runMock.mockImplementationOnce(async () => {
      const debugListener = mocks.setDebugListenerMock.mock.calls.at(-1)?.[0]
      debugListener?.({
        sequence: 1,
        timestamp: '2026-03-30T00:00:00.000Z',
        category: 'agent',
        action: 'agent.start',
        summary_es: 'Planificando estrategia.',
        phase: 'plan',
        agent: 'planner',
        iteration: 3,
        revisionCycle: 1,
        clarifyRound: 0,
        progressScore: 55,
        degraded: false,
        fallbackCount: 0,
        publicationState: null,
        failureCode: null,
        errorCode: null,
        details: {
          runtimeLabel: 'openai:gpt-5-codex',
        },
      })

      return {
        status: 'completed',
        package: {
          plan: {
            goalIds: ['goal-cocina'],
            timezone: 'UTC',
            createdAt: '2026-03-30T00:00:00.000Z',
            updatedAt: '2026-03-30T00:00:00.000Z',
            skeleton: {
              horizonWeeks: 12,
              goalIds: ['goal-cocina'],
              phases: [],
              milestones: [],
            },
            detail: {
              horizonWeeks: 2,
              startDate: '2026-03-30',
              endDate: '2026-04-12',
              scheduledEvents: [],
              weeks: [],
            },
            operational: {
              horizonDays: 7,
              startDate: '2026-03-30',
              endDate: '2026-04-05',
              frozen: true,
              scheduledEvents: [],
              buffers: [],
              days: [],
              totalBufferMin: 0,
            },
          },
          items: [],
          habitStates: [],
          slackPolicy: {
            weeklyTimeBufferMin: 120,
            maxChurnMovesPerWeek: 3,
            frozenHorizonDays: 2,
          },
          timezone: 'UTC',
          summary_esAR: 'Plan listo.',
          qualityScore: 88,
          implementationIntentions: [],
          warnings: [],
          tradeoffs: [],
          agentOutcomes: [],
          degraded: false,
          publicationState: 'publishable',
          qualityIssues: [],
        },
        pendingQuestions: null,
        scratchpad: [],
        tokensUsed: 10,
        iterations: 3,
        agentOutcomes: [],
        degraded: false,
        publicationState: 'ready',
      }
    })

    const response = await POST(new Request('http://localhost/api/plan/build', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        goalText: 'Quiero aprender a cocinar platos italianos',
        profileId: 'c2567794-35f8-45b0-8eea-f0b1b7a86f60',
        provider: 'openai:gpt-5-codex',
        resourceMode: 'codex',
        debug: true,
      }),
    }))

    const payloads = extractSsePayloads(await response.text())
    const debugPayload = payloads.find((payload) => payload.type === 'v6:debug')

    expect(debugPayload).toEqual(expect.objectContaining({
      type: 'v6:debug',
      data: expect.objectContaining({
        action: 'agent.start',
        summary_es: 'Planificando estrategia.',
        phase: 'plan',
        agent: 'planner',
      }),
    }))
  })
})
