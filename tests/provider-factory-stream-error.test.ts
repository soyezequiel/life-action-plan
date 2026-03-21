import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getProvider } from '../src/lib/providers/provider-factory'

const mocks = vi.hoisted(() => ({
  createOpenAI: vi.fn(),
  generateText: vi.fn(),
  streamText: vi.fn()
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: mocks.createOpenAI
}))

vi.mock('ai', () => ({
  generateText: mocks.generateText,
  streamText: mocks.streamText
}))

describe('provider-factory stream errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.createOpenAI.mockReturnValue({
      responses: vi.fn(() => ({}))
    })

    mocks.generateText.mockResolvedValue({
      text: '{"ok":true}',
      reasoningText: '',
      usage: {
        inputTokens: 10,
        outputTokens: 4
      }
    })
  })

  it('propaga el error real del streamChat cuando OpenAI emite un chunk de error', async () => {
    mocks.streamText.mockReturnValue({
      fullStream: (async function *fullStream() {
        yield { type: 'start' }
        yield { type: 'error', error: new Error('Incorrect API key provided') }
      })(),
      usage: Promise.resolve({
        inputTokens: 0,
        outputTokens: 0
      })
    })

    const runtime = getProvider('openai:gpt-4o-mini', { apiKey: 'test-key' })

    await expect(runtime.streamChat!([
      { role: 'system', content: 'solo json' },
      { role: 'user', content: 'perfil demo' }
    ], () => {})).rejects.toThrow('Incorrect API key provided')
  })

  it('propaga el error real del stream cuando OpenAI emite un chunk de error', async () => {
    mocks.streamText.mockReturnValue({
      fullStream: (async function *fullStream() {
        yield { type: 'start' }
        yield { type: 'error', error: new Error('Incorrect API key provided') }
      })(),
      usage: Promise.resolve({
        inputTokens: 0,
        outputTokens: 0
      })
    })

    const runtime = getProvider('openai:gpt-4o-mini', { apiKey: 'test-key' })

    const readAll = async () => {
      for await (const _chunk of runtime.stream([
        { role: 'system', content: 'solo json' },
        { role: 'user', content: 'perfil demo' }
      ])) {
        // No-op.
      }
    }

    await expect(readAll()).rejects.toThrow('Incorrect API key provided')
  })
})
