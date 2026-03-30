import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getProvider, getProviderTimeouts } from '../src/lib/providers/provider-factory'

function createJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

function createSseResponse(events: unknown[]): Response {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream'
    }
  })
}

describe('getProvider', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    delete process.env.APP_URL
  })

  it('crea runtimes cloud soportados', () => {
    const openai = getProvider('openai:gpt-4o-mini', { apiKey: 'test-key' })
    const openrouter = getProvider('openrouter:openai/gpt-4o-mini', { apiKey: 'or-key' })

    expect(openai.chat).toBeTypeOf('function')
    expect(openai.stream).toBeTypeOf('function')
    expect(openai.streamChat).toBeTypeOf('function')
    expect(openrouter.chat).toBeTypeOf('function')
    expect(openrouter.stream).toBeTypeOf('function')
  })

  it('soporta modelo sin prefijo como OpenAI', () => {
    const runtime = getProvider('gpt-4o-mini', { apiKey: 'test-key' })
    expect(runtime.chat).toBeTypeOf('function')
  })

  it('tira error para provider desconocido', () => {
    expect(() => getProvider('anthropic:claude-3', { apiKey: 'k' })).toThrow('Unknown provider')
  })

  it('newContext devuelve un nuevo runtime funcional', () => {
    const runtime = getProvider('openai:gpt-4o-mini', { apiKey: 'test-key' })
    const newRuntime = runtime.newContext()

    expect(newRuntime.chat).toBeTypeOf('function')
    expect(newRuntime).not.toBe(runtime)
  })

  it('mantiene timeouts cortos para OpenAI y OpenRouter', () => {
    expect(getProviderTimeouts('openai:gpt-4o-mini')).toEqual({
      chatMs: 20_000,
      streamMs: 20_000
    })
    expect(getProviderTimeouts('openrouter:openai/gpt-4o-mini')).toEqual({
      chatMs: 20_000,
      streamMs: 20_000
    })
  })

  it('usa timeouts mas largos para modelos de razonamiento', () => {
    expect(getProviderTimeouts('openai:gpt-5-codex')).toEqual({
      chatMs: 60_000,
      streamMs: 60_000
    })
  })

  it('chat de OpenAI combina reasoning summary y respuesta visible', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body.model).toBe('gpt-5-mini')
      expect(body.reasoning).toEqual({ summary: 'auto' })

      return createJsonResponse({
        id: 'resp_123',
        created_at: 1_742_400_000,
        model: 'gpt-5-mini',
        output: [
          {
            type: 'reasoning',
            id: 'rs_1',
            encrypted_content: null,
            summary: [
              {
                type: 'summary_text',
                text: 'ordeno primero las prioridades'
              }
            ]
          },
          {
            type: 'message',
            role: 'assistant',
            id: 'msg_1',
            phase: 'final_answer',
            content: [
              {
                type: 'output_text',
                text: '{"ok":true}',
                annotations: []
              }
            ]
          }
        ],
        usage: {
          input_tokens: 21,
          output_tokens: 34,
          output_tokens_details: {
            reasoning_tokens: 8
          }
        }
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    const runtime = getProvider('openai:gpt-5-mini', {
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com/v1'
    })
    const result = await runtime.chat([
      { role: 'system', content: 'solo json' },
      { role: 'user', content: 'hola' }
    ])

    expect(result.content).toBe('<think>ordeno primero las prioridades</think>{"ok":true}')
    expect(result.usage).toEqual({ promptTokens: 21, completionTokens: 34 })
  })

  it('streamChat de OpenAI emite reasoning y contenido por separado', async () => {
    const fetchMock = vi.fn(async () => createSseResponse([
      {
        type: 'response.created',
        response: {
          id: 'resp_456',
          created_at: 1_742_400_000,
          model: 'gpt-5-mini'
        }
      },
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'reasoning',
          id: 'rs_1',
          encrypted_content: null
        }
      },
      {
        type: 'response.reasoning_summary_text.delta',
        item_id: 'rs_1',
        summary_index: 0,
        delta: 'reviso primero la estructura'
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          type: 'reasoning',
          id: 'rs_1',
          encrypted_content: null
        }
      },
      {
        type: 'response.output_item.added',
        output_index: 1,
        item: {
          type: 'message',
          id: 'msg_1',
          phase: 'final_answer'
        }
      },
      {
        type: 'response.output_text.delta',
        item_id: 'msg_1',
        delta: '{"nombre":"Plan"}'
      },
      {
        type: 'response.completed',
        response: {
          usage: {
            input_tokens: 13,
            output_tokens: 29,
            output_tokens_details: {
              reasoning_tokens: 5
            }
          }
        }
      }
    ]))

    vi.stubGlobal('fetch', fetchMock)

    const runtime = getProvider('openai:gpt-5-mini', { apiKey: 'test-key' })
    const chunks: string[] = []
    const result = await runtime.streamChat!([
      { role: 'system', content: 'solo json' },
      { role: 'user', content: 'hola' }
    ], (chunk) => {
      chunks.push(chunk)
    })

    expect(chunks).toEqual([
      '<think>',
      'reviso primero la estructura',
      '</think>',
      '{"nombre":"Plan"}'
    ])
    expect(result.content).toBe('<think>reviso primero la estructura</think>{"nombre":"Plan"}')
    expect(result.usage).toEqual({ promptTokens: 13, completionTokens: 29 })
  })

  it('chat de OpenRouter usa el endpoint compatible y manda headers esperados', async () => {
    process.env.APP_URL = 'https://lap.local'

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://openrouter.ai/api/v1/responses')
      const headers = new Headers(init?.headers)
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>

      expect(headers.get('HTTP-Referer')).toBe('https://lap.local')
      expect(headers.get('X-OpenRouter-Title')).toBe('LAP')
      expect(body.model).toBe('openai/gpt-4o-mini')

      return createJsonResponse({
        id: 'resp_or_123',
        created_at: 1_742_400_000,
        model: 'openai/gpt-4o-mini',
        output: [
          {
            type: 'message',
            role: 'assistant',
            id: 'msg_1',
            phase: 'final_answer',
            content: [
              {
                type: 'output_text',
                text: '{"provider":"openrouter"}',
                annotations: []
              }
            ]
          }
        ],
        usage: {
          input_tokens: 11,
          output_tokens: 17
        }
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    const runtime = getProvider('openrouter:openai/gpt-4o-mini', {
      apiKey: 'or-key'
    })
    const result = await runtime.chat([
      { role: 'system', content: 'solo json' },
      { role: 'user', content: 'hola' }
    ])

    expect(result.content).toBe('{"provider":"openrouter"}')
    expect(result.usage).toEqual({ promptTokens: 11, completionTokens: 17 })
  })
})
