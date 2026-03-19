import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import type { AgentRuntime, LLMMessage, LLMResponse } from '../src/runtime/types'
import { createInstrumentedRuntime } from '../src/debug/instrumented-runtime'
import { traceCollector } from '../src/debug/trace-collector'

const messages: LLMMessage[] = [
  { role: 'system', content: 'solo json' },
  { role: 'user', content: 'perfil demo' }
]

function createSenderMock() {
  return {
    isDestroyed: vi.fn(() => false),
    send: vi.fn()
  } as unknown as WebContents & {
    isDestroyed: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
  }
}

function createRuntime(overrides: Partial<AgentRuntime> = {}): AgentRuntime {
  const response: LLMResponse = {
    content: '{"ok":true}',
    usage: {
      promptTokens: 12,
      completionTokens: 4
    }
  }

  return {
    chat: vi.fn(async () => response),
    stream: async function *stream() {
      yield response.content
    },
    streamChat: vi.fn(async (_messages, onToken) => {
      onToken('<think>')
      onToken(response.content)
      return response
    }),
    newContext: vi.fn(() => createRuntime(overrides)),
    ...overrides
  }
}

afterEach(() => {
  traceCollector.disable()
  vi.useRealTimers()
})

describe('createInstrumentedRuntime', () => {
  it('delegates chat directamente cuando debug no esta activo', async () => {
    const runtime = createRuntime()
    const instrumented = createInstrumentedRuntime(runtime, null, 'plan-builder', 'openai:gpt-4o-mini')

    const result = await instrumented.chat(messages)

    expect(runtime.chat).toHaveBeenCalledWith(messages)
    expect(result.content).toBe('{"ok":true}')
  })

  it('usa streamChat y emite tokens cuando debug esta activo', async () => {
    const senderMock = createSenderMock()
    traceCollector.enable(senderMock)
    const traceId = traceCollector.startTrace('plan-builder', 'ollama:qwen3:8b', { profileId: 'p1' })
    const runtime = createRuntime()
    const instrumented = createInstrumentedRuntime(runtime, traceId, 'plan-builder', 'ollama:qwen3:8b')

    const result = await instrumented.chat(messages)

    expect(runtime.streamChat).toHaveBeenCalled()
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 4 })

    const eventTypes = senderMock.send.mock.calls.map((call) => call[1].type)
    expect(eventTypes).toContain('span:token')
    expect(eventTypes).toContain('span:complete')
  })

  it('propaga errores y marca el span como fallido', async () => {
    const senderMock = createSenderMock()
    traceCollector.enable(senderMock)
    const traceId = traceCollector.startTrace('plan-builder', 'ollama:qwen3:8b', { profileId: 'p1' })
    const runtime = createRuntime({
      streamChat: vi.fn(async () => {
        throw new Error('boom')
      })
    })
    const instrumented = createInstrumentedRuntime(runtime, traceId, 'plan-builder', 'ollama:qwen3:8b')

    await expect(instrumented.chat(messages)).rejects.toThrow('boom')

    const eventTypes = senderMock.send.mock.calls.map((call) => call[1].type)
    expect(eventTypes).toContain('span:error')
  })

  it('encadena newContext sin perder la instrumentacion', async () => {
    const childRuntime = createRuntime()
    const runtime = createRuntime({
      newContext: vi.fn(() => childRuntime)
    })
    const instrumented = createInstrumentedRuntime(runtime, '11111111-1111-4111-8111-111111111111', 'plan-builder', 'openai:gpt-4o-mini')

    const nextContext = instrumented.newContext()
    await nextContext.chat(messages)

    expect(runtime.newContext).toHaveBeenCalled()
    expect(childRuntime.chat).toHaveBeenCalledWith(messages)
  })
})
