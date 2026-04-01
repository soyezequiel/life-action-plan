import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveUserIdMock: vi.fn(() => 'local-user'),
  getInteractiveSessionMock: vi.fn(),
  updateInteractiveSessionMock: vi.fn(),
  resolvePlanBuildExecutionMock: vi.fn(),
  getDeploymentModeMock: vi.fn(() => 'local'),
  createBuildAgentRuntimeMock: vi.fn(),
  getProfileMock: vi.fn(),
  parseStoredProfileMock: vi.fn(),
  getProfileTimezoneMock: vi.fn(() => 'UTC'),
  restoreMock: vi.fn(),
  createV6RuntimeSnapshotMock: vi.fn(() => ({ snapshot: true })),
  parseV6RuntimeSnapshotMock: vi.fn(),
}))

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

vi.mock('../app/api/_user-settings', () => ({
  resolveUserId: mocks.resolveUserIdMock,
}))

vi.mock('../src/lib/db/interactive-sessions', () => ({
  getInteractiveSession: mocks.getInteractiveSessionMock,
  updateInteractiveSession: mocks.updateInteractiveSessionMock,
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
}))

vi.mock('../src/lib/domain/plan-helpers', () => ({
  parseStoredProfile: mocks.parseStoredProfileMock,
  getProfileTimezone: mocks.getProfileTimezoneMock,
}))

vi.mock('../src/lib/pipeline/v6/orchestrator', () => ({
  PlanOrchestrator: {
    restore: mocks.restoreMock,
  },
}))

vi.mock('../src/lib/pipeline/v6/session-snapshot', () => ({
  createV6RuntimeSnapshot: mocks.createV6RuntimeSnapshotMock,
  parseV6RuntimeSnapshot: mocks.parseV6RuntimeSnapshotMock,
}))

import { POST } from '../app/api/plan/build/resume/route'

describe('plan build resume route', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => {
      if (typeof mock === 'function' && 'mockReset' in mock) {
        mock.mockReset()
      }
    })

    mocks.resolveUserIdMock.mockReturnValue('local-user')
    mocks.getDeploymentModeMock.mockReturnValue('local')
    mocks.getInteractiveSessionMock.mockResolvedValue({
      id: 'session-1',
      status: 'active',
      runtimeSnapshot: { persisted: true },
    })
    mocks.getProfileMock.mockResolvedValue({
      id: 'profile-1',
      data: '{}',
    })
    mocks.parseStoredProfileMock.mockReturnValue({ participantes: [] })
    mocks.parseV6RuntimeSnapshotMock.mockReturnValue({
      request: {
        goalText: 'Aprender cocina italiana',
        profileId: 'profile-1',
        provider: 'openai:gpt-5-codex',
        resourceMode: 'codex',
        apiKey: null,
        backendCredentialId: null,
        thinkingMode: 'enabled',
      },
      orchestrator: { restored: true },
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
    mocks.restoreMock.mockReturnValue({
      resume: vi.fn().mockResolvedValue({
        status: 'needs_input',
        package: null,
        pendingQuestions: {
          questions: [{
            id: 'q-1',
            text: 'Cuantas horas?',
            purpose: 'Dimensionar',
            type: 'number',
          }],
          reasoning: 'Falta disponibilidad',
          informationGaps: ['horas'],
          confidence: 0.5,
          readyToAdvance: false,
        },
        scratchpad: [],
        tokensUsed: 0,
        iterations: 2,
        agentOutcomes: [],
        degraded: false,
      }),
      getSnapshot: vi.fn(() => ({ restored: true })),
      getProgress: vi.fn(() => ({
        progressScore: 65,
        lastAction: 'Packaging final plan',
      })),
      getDebugStatus: vi.fn(() => ({
        lifecycle: 'paused_for_input',
        currentPhase: 'clarify',
        currentAgent: 'clarifier',
        currentAction: 'session.paused',
        currentSummary_es: 'Esperando respuestas.',
        iteration: 2,
        revisionCycles: 0,
        clarifyRounds: 1,
        progressScore: 65,
        degraded: false,
        fallbackCount: 0,
        publicationState: null,
        failureCode: null,
        lastEventSequence: 1,
        lastEventTimestamp: '2026-03-30T00:00:00.000Z',
        lastEventSummary_es: 'Esperando respuestas.',
      })),
    })
    mocks.updateInteractiveSessionMock.mockResolvedValue(undefined)
    mocks.createV6RuntimeSnapshotMock.mockReturnValue({ snapshot: true })
  })

  it('reconstruye el runtime usando authMode de Codex durante el resume', async () => {
    const response = await POST(new Request('http://localhost/api/plan/build/resume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'session-1',
        answers: {
          nivel: 'principiante',
        },
      }),
    }))

    await response.text()

    expect(mocks.createBuildAgentRuntimeMock).toHaveBeenCalledWith({
      modelId: 'openai:gpt-5-codex',
      apiKey: 'chatgpt-oauth',
      baseURL: 'https://chatgpt.com/backend-api/codex',
      authMode: 'codex-oauth',
    }, {
      thinkingMode: 'enabled',
    })
    expect(mocks.createBuildAgentRuntimeMock).toHaveBeenNthCalledWith(2, {
      modelId: 'openai:gpt-5-codex',
      apiKey: 'chatgpt-oauth',
      baseURL: 'https://chatgpt.com/backend-api/codex',
      authMode: 'codex-oauth',
    }, {
      thinkingMode: 'disabled',
    })
  })

  it('falla rapido con diagnostico explicito si el provider restaurado no esta soportado', async () => {
    mocks.parseV6RuntimeSnapshotMock.mockReturnValueOnce({
      request: {
        goalText: 'Aprender cocina italiana',
        profileId: 'profile-1',
        provider: 'openai',
        resourceMode: null,
        apiKey: null,
        backendCredentialId: null,
        thinkingMode: 'enabled',
      },
      orchestrator: { restored: true },
    })
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

    const response = await POST(new Request('http://localhost/api/plan/build/resume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'session-1',
        answers: {
          nivel: 'principiante',
        },
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
      }),
      error: expect.stringContaining('provider_not_supported'),
    }))
    expect(mocks.createBuildAgentRuntimeMock).not.toHaveBeenCalled()
  })

  it('normalizes legacy gpt-5-codex snapshots into the codex oauth path during resume', async () => {
    mocks.parseV6RuntimeSnapshotMock.mockReturnValueOnce({
      request: {
        goalText: 'Aprender cocina italiana',
        profileId: 'profile-1',
        provider: 'openai:gpt-5-codex',
        resourceMode: null,
        apiKey: null,
        backendCredentialId: null,
        thinkingMode: 'enabled',
      },
      orchestrator: { restored: true },
    })

    const response = await POST(new Request('http://localhost/api/plan/build/resume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'session-1',
        answers: {
          nivel: 'principiante',
        },
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

  it('surfaces failed_for_quality_review details when resume terminates in final review', async () => {
    mocks.restoreMock.mockReturnValueOnce({
      resume: vi.fn().mockResolvedValue({
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
        scratchpad: [],
        tokensUsed: 10,
        iterations: 4,
        agentOutcomes: [
          {
            agent: 'critic',
            phase: 'critique',
            source: 'fallback',
            errorCode: 'FAILED_QUALITY_REVIEW',
            errorMessage: 'Faltan hitos concretos para cerrar el plan.',
            durationMs: 12,
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
            durationMs: 12,
          },
        ],
      }),
      getSnapshot: vi.fn(() => ({ restored: true })),
      getProgress: vi.fn(() => ({
        progressScore: 95,
        lastAction: 'Packaging final plan',
      })),
    })

    const response = await POST(new Request('http://localhost/api/plan/build/resume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'session-1',
        answers: {
          nivel: 'principiante',
        },
      }),
    }))

    const payloads = extractSsePayloads(await response.text())
    expect(payloads.some((payload) => payload.type === 'v6:blocked')).toBe(true)
    const resultPayload = [...payloads].reverse().find((payload) => payload.type === 'result')

    expect(resultPayload).toBeTruthy()
    expect(resultPayload?.result).toEqual(expect.objectContaining({
      success: false,
      failureCode: 'failed_for_quality_review',
      error: 'Faltan hitos concretos para cerrar el plan.',
      blockingAgents: expect.arrayContaining([
        expect.objectContaining({
          agent: 'critic',
          errorMessage: 'Faltan hitos concretos para cerrar el plan.',
        }),
      ]),
      warnings: expect.arrayContaining([
        'Faltan hitos concretos para cerrar el plan.',
      ]),
      qualityIssues: expect.arrayContaining([
        expect.objectContaining({
          code: 'FAILED_QUALITY_REVIEW',
        }),
      ]),
      package: expect.objectContaining({
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
  })

  it('emits structured debug events when resume runs in debug mode', async () => {
    mocks.restoreMock.mockImplementationOnce((_snapshot, _brainRuntime, _fastRuntime, _runtimeLabel, debugListener) => ({
      resume: vi.fn().mockImplementation(async () => {
        debugListener?.({
          sequence: 3,
          timestamp: '2026-03-30T00:00:00.000Z',
          category: 'lifecycle',
          action: 'session.resumed',
          summary_es: 'Se retomo la sesion con 1 respuesta nueva.',
          phase: 'clarify',
          agent: 'clarifier',
          iteration: 2,
          revisionCycle: 0,
          clarifyRound: 1,
          progressScore: 65,
          degraded: false,
          fallbackCount: 0,
          publicationState: null,
          failureCode: null,
          errorCode: null,
          details: {
            answersCount: 1,
          },
        })
        return {
          status: 'needs_input',
          package: null,
          pendingQuestions: {
            questions: [{
              id: 'q-1',
              text: 'Cuantas horas?',
              purpose: 'Dimensionar',
              type: 'number',
            }],
            reasoning: 'Falta disponibilidad',
            informationGaps: ['horas'],
            confidence: 0.5,
            readyToAdvance: false,
          },
          scratchpad: [],
          tokensUsed: 0,
          iterations: 2,
          agentOutcomes: [],
          degraded: false,
        }
      }),
      getSnapshot: vi.fn(() => ({ restored: true })),
      getProgress: vi.fn(() => ({
        progressScore: 65,
        lastAction: 'Packaging final plan',
      })),
      getDebugStatus: vi.fn(() => ({
        lifecycle: 'paused_for_input',
        currentPhase: 'clarify',
        currentAgent: 'clarifier',
        currentAction: 'session.resumed',
        currentSummary_es: 'Se retomo la sesion con 1 respuesta nueva.',
        iteration: 2,
        revisionCycles: 0,
        clarifyRounds: 1,
        progressScore: 65,
        degraded: false,
        fallbackCount: 0,
        publicationState: null,
        failureCode: null,
        lastEventSequence: 3,
        lastEventTimestamp: '2026-03-30T00:00:00.000Z',
        lastEventSummary_es: 'Se retomo la sesion con 1 respuesta nueva.',
      })),
    }))

    const response = await POST(new Request('http://localhost/api/plan/build/resume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'session-1',
        answers: {
          nivel: 'principiante',
        },
        debug: true,
      }),
    }))

    const payloads = extractSsePayloads(await response.text())
    const debugPayload = payloads.find((payload) => payload.type === 'v6:debug')

    expect(debugPayload).toEqual(expect.objectContaining({
      type: 'v6:debug',
      data: expect.objectContaining({
        action: 'session.resumed',
        phase: 'clarify',
        agent: 'clarifier',
      }),
    }))
  })
})
