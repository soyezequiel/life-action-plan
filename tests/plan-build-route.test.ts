import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveUserIdMock: vi.fn(() => 'local-user'),
  resolvePlanBuildExecutionMock: vi.fn(),
  getDeploymentModeMock: vi.fn(() => 'local'),
  resolveBuildModelMock: vi.fn(() => 'openai:gpt-5-codex'),
  createBuildAgentRuntimeMock: vi.fn(),
  getProfileMock: vi.fn(),
  parseStoredProfileMock: vi.fn(),
  getProfileTimezoneMock: vi.fn(() => 'UTC'),
  buildSchedulingContextFromProfileMock: vi.fn(() => ({
    availability: [],
    blocked: [],
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

vi.mock('../src/lib/providers/provider-metadata', () => ({
  resolveBuildModel: mocks.resolveBuildModelMock,
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
  buildSchedulingContextFromProfile: mocks.buildSchedulingContextFromProfileMock,
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
    run = mocks.runMock
    getProgress = mocks.getProgressMock
    getSnapshot = mocks.getSnapshotMock
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
    mocks.resolveBuildModelMock.mockReturnValue('openai:gpt-5-codex')
    mocks.getProfileMock.mockResolvedValue({
      id: 'profile-1',
      data: '{}',
    })
    mocks.parseStoredProfileMock.mockReturnValue({
      participantes: [],
    })
    mocks.getProfileTimezoneMock.mockReturnValue('UTC')
    mocks.buildSchedulingContextFromProfileMock.mockReturnValue({
      availability: [],
      blocked: [],
    })
    mocks.getProgressMock.mockReturnValue({
      progressScore: 95,
      lastAction: 'Packaging final plan',
    })
    mocks.getSnapshotMock.mockReturnValue({ snapshot: true })
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
    expect(mocks.resolveBuildModelMock).toHaveBeenCalled()
    expect(mocks.getDeploymentModeMock).toHaveBeenCalled()
    expect(mocks.resolvePlanBuildExecutionMock).toHaveBeenCalled()
    const blockedPayload = payloads.find((payload) => payload.type === 'v6:blocked')

    expect(blockedPayload).toBeTruthy()
    expect(blockedPayload).toEqual(expect.objectContaining({
      type: 'v6:blocked',
      data: expect.objectContaining({
        failureCode: 'failed_for_quality_review',
        message: expect.stringContaining('revision final'),
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
})
