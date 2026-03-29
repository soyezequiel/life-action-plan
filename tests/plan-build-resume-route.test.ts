import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveUserIdMock: vi.fn(() => 'local-user'),
  getInteractiveSessionMock: vi.fn(),
  updateInteractiveSessionMock: vi.fn(),
  resolvePlanBuildExecutionMock: vi.fn(),
  getDeploymentModeMock: vi.fn(() => 'local'),
  resolveBuildModelMock: vi.fn(() => 'openai:gpt-5-codex'),
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

vi.mock('../src/lib/providers/provider-metadata', () => ({
  resolveBuildModel: mocks.resolveBuildModelMock,
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
    mocks.resolveBuildModelMock.mockReturnValue('openai:gpt-5-codex')
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
      executionContext: {
        canExecute: true,
        mode: 'codex-cloud',
        resourceOwner: 'backend',
      },
      runtime: {
        modelId: 'openai:gpt-5-codex',
        apiKey: 'chatgpt-oauth',
        baseURL: 'https://chatgpt.com/backend-api/codex',
        authMode: 'codex-oauth',
      },
    })
    mocks.createBuildAgentRuntimeMock.mockReturnValue({
      chat: vi.fn(),
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
    })
    mocks.updateInteractiveSessionMock.mockResolvedValue(undefined)
    mocks.createV6RuntimeSnapshotMock.mockReturnValue({ persisted: true })
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
      error: expect.stringContaining('revision final'),
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
})
