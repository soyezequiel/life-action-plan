import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCodexAuthAvailabilityMock: vi.fn()
}))

vi.mock('../src/lib/auth/codex-auth', () => ({
  getCodexAuthAvailability: mocks.getCodexAuthAvailabilityMock
}))

import {
  DEFAULT_CODEX_BUILD_MODEL,
  DEFAULT_OPENAI_BUILD_MODEL
} from '../src/lib/providers/provider-metadata'
import { resolveRealRunnerSelection } from '../src/lib/runtime/real-runner-selection'

describe('resolveRealRunnerSelection', () => {
  beforeEach(() => {
    mocks.getCodexAuthAvailabilityMock.mockReset()
  })

  it('prefiere Codex cuando hay sesion local y no hay modelo explicito', async () => {
    mocks.getCodexAuthAvailabilityMock.mockResolvedValue({
      available: true,
      reason: null
    })

    const selection = await resolveRealRunnerSelection({
      env: {
        OPENAI_API_KEY: 'openai-key',
        OPENROUTER_API_KEY: 'router-key'
      }
    })

    expect(selection.modelId).toBe(DEFAULT_CODEX_BUILD_MODEL)
    expect(selection.runtimeConfig).toEqual({
      apiKey: 'chatgpt-oauth',
      baseURL: 'https://chatgpt.com/backend-api/codex',
      thinkingMode: undefined,
      authMode: 'codex-oauth'
    })
  })

  it('respeta un modelo explicito aunque Codex este disponible', async () => {
    mocks.getCodexAuthAvailabilityMock.mockResolvedValue({
      available: true,
      reason: null
    })

    const selection = await resolveRealRunnerSelection({
      cliModelId: 'openai:gpt-4o-mini',
      env: {
        OPENAI_API_KEY: 'openai-key',
        OPENAI_BASE_URL: 'https://example.com/v1'
      }
    })

    expect(selection.modelId).toBe('openai:gpt-4o-mini')
    expect(selection.runtimeConfig).toEqual({
      apiKey: 'openai-key',
      baseURL: 'https://example.com/v1',
      thinkingMode: undefined
    })
  })

  it('usa OPENAI_API_KEY cuando Codex no esta disponible', async () => {
    mocks.getCodexAuthAvailabilityMock.mockResolvedValue({
      available: false,
      reason: 'missing'
    })

    const selection = await resolveRealRunnerSelection({
      env: {
        OPENAI_API_KEY: 'openai-key',
        OPENAI_BASE_URL: 'https://example.com/v1'
      }
    })

    expect(selection.modelId).toBe(DEFAULT_OPENAI_BUILD_MODEL)
    expect(selection.runtimeConfig).toEqual({
      apiKey: 'openai-key',
      baseURL: 'https://example.com/v1',
      thinkingMode: undefined
    })
  })

  it('falla si se fuerza Codex sin sesion local', async () => {
    mocks.getCodexAuthAvailabilityMock.mockResolvedValue({
      available: false,
      reason: 'missing'
    })

    await expect(resolveRealRunnerSelection({
      cliModelId: 'codex',
      env: {
        OPENAI_API_KEY: 'openai-key'
      }
    })).rejects.toThrow('sesion local de Codex')
  })
})
