import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDeploymentModeMock: vi.fn(() => 'local'),
  resolvePlanBuildExecutionMock: vi.fn(),
  createBuildAgentRuntimeMock: vi.fn(),
  createInstrumentedRuntimeMock: vi.fn(),
  startTraceMock: vi.fn(() => 'trace-flow-1'),
}))

vi.mock('../src/lib/env/deployment', () => ({
  getDeploymentMode: mocks.getDeploymentModeMock,
}))

vi.mock('../src/lib/runtime/build-execution', () => ({
  resolvePlanBuildExecution: mocks.resolvePlanBuildExecutionMock,
}))

vi.mock('../src/lib/runtime/build-agent-runtime', () => ({
  createBuildAgentRuntime: mocks.createBuildAgentRuntimeMock,
}))

vi.mock('../src/debug/instrumented-runtime', () => ({
  createInstrumentedRuntime: mocks.createInstrumentedRuntimeMock,
}))

vi.mock('../src/debug/trace-collector', () => ({
  traceCollector: {
    startTrace: mocks.startTraceMock,
  },
}))

import { resolveRuntimeForWorkflow } from '../app/api/flow/_helpers'

describe('flow runtime helper', () => {
  beforeEach(() => {
    mocks.getDeploymentModeMock.mockReset()
    mocks.resolvePlanBuildExecutionMock.mockReset()
    mocks.createBuildAgentRuntimeMock.mockReset()
    mocks.createInstrumentedRuntimeMock.mockReset()
    mocks.startTraceMock.mockReset()

    mocks.getDeploymentModeMock.mockReturnValue('local')
    mocks.startTraceMock.mockReturnValue('trace-flow-1')
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
    mocks.createBuildAgentRuntimeMock.mockReturnValue({ base: true })
    mocks.createInstrumentedRuntimeMock.mockImplementation((runtime) => runtime)
  })

  it('propaga authMode cuando el flujo usa codex-cloud', async () => {
    const runtime = await resolveRuntimeForWorkflow({
      id: 'workflow-1',
      userId: 'user-1',
      state: {
        gate: {
          provider: 'openai:gpt-5-codex',
          llmMode: 'codex',
          backendCredentialId: null,
        },
      },
    } as never)

    expect(mocks.createBuildAgentRuntimeMock).toHaveBeenCalledWith({
      modelId: 'openai:gpt-5-codex',
      apiKey: 'chatgpt-oauth',
      baseURL: 'https://chatgpt.com/backend-api/codex',
      authMode: 'codex-oauth',
    })
    expect(mocks.createInstrumentedRuntimeMock).toHaveBeenCalledWith(
      { base: true },
      'trace-flow-1',
      'flow-agent',
      'openai:gpt-5-codex',
    )
    expect(runtime).toEqual({ base: true })
  })
})
