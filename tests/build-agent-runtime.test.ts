import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProviderMock: vi.fn(),
}))

vi.mock('../src/lib/providers/provider-factory', () => ({
  getProvider: mocks.getProviderMock,
}))

import { createBuildAgentRuntime } from '../src/lib/runtime/build-agent-runtime'

describe('build-agent-runtime', () => {
  beforeEach(() => {
    mocks.getProviderMock.mockReset()
    mocks.getProviderMock.mockReturnValue({
      chat: vi.fn(),
      stream: vi.fn(),
      newContext: vi.fn(),
    })
  })

  it('propaga authMode y thinkingMode al provider reconstruido', () => {
    const runtime = createBuildAgentRuntime({
      modelId: 'openai:gpt-5-codex',
      apiKey: 'chatgpt-oauth',
      baseURL: 'https://chatgpt.com/backend-api/codex',
      authMode: 'codex-oauth',
    }, {
      thinkingMode: 'enabled',
    })

    expect(mocks.getProviderMock).toHaveBeenCalledWith('openai:gpt-5-codex', {
      apiKey: 'chatgpt-oauth',
      baseURL: 'https://chatgpt.com/backend-api/codex',
      thinkingMode: 'enabled',
      authMode: 'codex-oauth',
    })
    expect(runtime).toBe(mocks.getProviderMock.mock.results[0]?.value)
  })
})
