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

function createNdjsonResponse(lines: unknown[]): Response {
  return new Response(`${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson'
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
  })

  it('crea un runtime OpenAI con modelo default', () => {
    const runtime = getProvider('openai:gpt-4o-mini', { apiKey: 'test-key' })
    expect(runtime).toBeDefined()
    expect(runtime.chat).toBeTypeOf('function')
    expect(runtime.stream).toBeTypeOf('function')
    expect(runtime.streamChat).toBeTypeOf('function')
    expect(runtime.newContext).toBeTypeOf('function')
  })

  it('crea un runtime Ollama apuntando a localhost', () => {
    const runtime = getProvider('ollama:qwen3:8b', { apiKey: '' })
    expect(runtime).toBeDefined()
    expect(runtime.chat).toBeTypeOf('function')
    expect(runtime.streamChat).toBeTypeOf('function')
  })

  it('soporta modelo sin prefijo (default openai)', () => {
    const runtime = getProvider('gpt-4o-mini', { apiKey: 'test-key' })
    expect(runtime).toBeDefined()
  })

  it('parsea correctamente modelId con múltiples ":" (ollama:qwen3:8b)', () => {
    const runtime = getProvider('ollama:qwen3:8b', { apiKey: '' })
    expect(runtime).toBeDefined()
    expect(runtime.chat).toBeTypeOf('function')
  })

  it('tira error para provider desconocido', () => {
    expect(() => getProvider('anthropic:claude-3', { apiKey: 'k' })).toThrow('Unknown provider')
  })

  it('newContext devuelve un nuevo runtime funcional', () => {
    const runtime = getProvider('openai:gpt-4o-mini', { apiKey: 'test-key' })
    const newRuntime = runtime.newContext()
    expect(newRuntime).toBeDefined()
    expect(newRuntime.chat).toBeTypeOf('function')
    expect(newRuntime).not.toBe(runtime)
  })

  it('usa timeouts más amplios para Ollama local', () => {
    expect(getProviderTimeouts('ollama:qwen3:8b')).toEqual({
      chatMs: 180_000,
      streamMs: 180_000
    })
  })

  it('mantiene timeouts cortos para OpenAI', () => {
    expect(getProviderTimeouts('openai:gpt-4o-mini')).toEqual({
      chatMs: 20_000,
      streamMs: 20_000
    })
  })

  it('chat de OpenAI combina reasoning summary y respuesta visible', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.openai.com/v1/responses')

      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body.model).toBe('gpt-5-mini')
      expect(body.stream).toBeUndefined()
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

  it('streamChat de OpenAI emite reasoning summary y respuesta en bloques separados', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body.model).toBe('gpt-5-mini')
      expect(body.stream).toBe(true)
      expect(body.reasoning).toEqual({ summary: 'auto' })

      return createSseResponse([
        {
          type: 'response.created',
          response: {
            id: 'resp_456',
            created_at: 1_742_400_000,
            model: 'gpt-5-mini',
            service_tier: null
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
          type: 'response.reasoning_summary_part.done',
          item_id: 'rs_1',
          summary_index: 0
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
          delta: '{"nombre":"Plan"}',
          logprobs: null
        },
        {
          type: 'response.output_item.done',
          output_index: 1,
          item: {
            type: 'message',
            id: 'msg_1',
            phase: 'final_answer'
          }
        },
        {
          type: 'response.completed',
          response: {
            incomplete_details: null,
            usage: {
              input_tokens: 13,
              output_tokens: 29,
              output_tokens_details: {
                reasoning_tokens: 5
              }
            },
            service_tier: null
          }
        }
      ])
    })

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

  it('usa la API nativa de Ollama para chat y preserva thinking + tool calls', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://localhost:11434/api/chat')

      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body.model).toBe('qwen3:8b')
      expect(body.stream).toBe(false)
      expect(body.think).toBe(true)

      return createJsonResponse({
        message: {
          thinking: 'pienso primero',
          content: '{"ok":true}',
          tool_calls: [
            {
              function: {
                name: 'buscar_dato',
                arguments: { ciudad: 'Buenos Aires' }
              }
            }
          ]
        },
        prompt_eval_count: 12,
        eval_count: 34
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    const runtime = getProvider('ollama:qwen3:8b', { apiKey: '', baseURL: 'http://localhost:11434/v1' })
    const result = await runtime.chat([
      { role: 'system', content: 'solo json' },
      { role: 'user', content: 'hola' }
    ])

    expect(result.content).toBe('<think>pienso primero</think>{"ok":true}')
    expect(result.toolCalls).toEqual([
      {
        id: 'ollama-tool-0',
        name: 'buscar_dato',
        arguments: { ciudad: 'Buenos Aires' }
      }
    ])
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 34 })
  })

  it('streamChat de Ollama emite thinking y contenido en el orden correcto', async () => {
    const fetchMock = vi.fn(async () => createNdjsonResponse([
      {
        message: {
          thinking: 'analizo'
        }
      },
      {
        message: {
          content: '{"nombre":"Plan"}'
        }
      },
      {
        message: {},
        prompt_eval_count: 7,
        eval_count: 9
      }
    ]))

    vi.stubGlobal('fetch', fetchMock)

    const runtime = getProvider('ollama:qwen3:8b', { apiKey: '' })
    const chunks: string[] = []

    const result = await runtime.streamChat!([
      { role: 'system', content: 'solo json' },
      { role: 'user', content: 'hola' }
    ], (chunk) => {
      chunks.push(chunk)
    })

    expect(chunks).toEqual(['<think>', 'analizo', '</think>', '{"nombre":"Plan"}'])
    expect(result.content).toBe('<think>analizo</think>{"nombre":"Plan"}')
    expect(result.usage).toEqual({ promptTokens: 7, completionTokens: 9 })
  })

  it('stream de Ollama también expone thinking como tags <think>', async () => {
    const fetchMock = vi.fn(async () => createNdjsonResponse([
      {
        message: {
          thinking: 'razono'
        }
      },
      {
        message: {
          content: 'respuesta final'
        }
      }
    ]))

    vi.stubGlobal('fetch', fetchMock)

    const runtime = getProvider('ollama:qwen3:8b', { apiKey: '' })
    const chunks: string[] = []

    for await (const chunk of runtime.stream([
      { role: 'system', content: 'solo json' },
      { role: 'user', content: 'hola' }
    ])) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['<think>', 'razono', '</think>', 'respuesta final'])
  })
})
