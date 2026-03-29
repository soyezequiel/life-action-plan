import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCodexAuthSessionMock: vi.fn()
}))

vi.mock('../src/lib/auth/codex-auth', () => ({
  getCodexAuthSession: mocks.getCodexAuthSessionMock
}))

import { getProvider } from '../src/lib/providers/provider-factory'

function createCodexStreamResponse(): Response {
  return new Response([
    'data: {"type":"response.created","response":{"id":"resp_codex","created_at":1742400000,"model":"gpt-5-codex"}}\n\n',
    'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"message","id":"msg_1","phase":"final_answer"}}\n\n',
    'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"{\\"ok\\":true}","logprobs":null}\n\n',
    'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"message","id":"msg_1","phase":"final_answer"}}\n\n',
    'data: {"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":5}}}\n\n'
  ].join(''), {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream'
    }
  })
}

function createDelayedCodexStreamResponse(events: Array<{ delayMs: number; body: unknown }>): Response {
  const encoder = new TextEncoder()
  const totalDelay = events.length > 0
    ? Math.max(...events.map((event) => event.delayMs)) + 1
    : 0

  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) {
        setTimeout(() => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event.body)}\n\n`))
        }, event.delayMs)
      }

      setTimeout(() => {
        controller.close()
      }, totalDelay)
    }
  }), {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream'
    }
  })
}

describe('provider-factory codex oauth', () => {
  beforeEach(() => {
    mocks.getCodexAuthSessionMock.mockReset()
    mocks.getCodexAuthSessionMock.mockResolvedValue({
      accessToken: 'codex-access-token',
      refreshToken: 'codex-refresh-token',
      accountId: 'account-123',
      idToken: 'id-token'
    })
  })

  it('inyecta headers OAuth de Codex y fuerza store=false', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      const input = Array.isArray(body.input) ? body.input as Array<Record<string, unknown>> : []

      expect(headers.get('Authorization')).toBe('Bearer codex-access-token')
      expect(headers.get('chatgpt-account-id')).toBe('account-123')
      expect(headers.get('OpenAI-Beta')).toBe('responses=experimental')
      expect(headers.get('originator')).toBe('codex_cli_rs')
      expect(headers.get('accept')).toBe('text/event-stream')
      expect(body.instructions).toBe('solo json')
      expect(body.store).toBe(false)
      expect(body.max_output_tokens).toBeUndefined()
      expect(body.max_completion_tokens).toBeUndefined()
      expect(input).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'hola'
            }
          ]
        }
      ])

      return createCodexStreamResponse()
    })

    vi.stubGlobal('fetch', fetchMock)

    const runtime = getProvider('openai:gpt-5-codex', {
      apiKey: 'chatgpt-oauth',
      baseURL: 'https://chatgpt.com/backend-api/codex',
      authMode: 'codex-oauth'
    })

    const result = await runtime.chat([
      { role: 'system', content: 'solo json' },
      { role: 'user', content: 'hola' }
    ])

    expect(mocks.getCodexAuthSessionMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('https://chatgpt.com/backend-api/codex/responses', expect.any(Object))
    expect(result.usage).toEqual({
      promptTokens: 3,
      completionTokens: 5
    })
  })

  it('falla antes de la red si el backend Codex llega sin authMode', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(() => getProvider('openai:gpt-5-codex', {
      apiKey: 'chatgpt-oauth',
      baseURL: 'https://chatgpt.com/backend-api/codex',
    })).toThrow('CODEX_OAUTH_AUTH_MODE_REQUIRED')

    expect(mocks.getCodexAuthSessionMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('usa instructions por defecto si no llega system prompt', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>

      expect(body.instructions).toBe('You are a helpful assistant. Follow the requested output format exactly.')
      expect(body.input).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'hola'
            }
          ]
        }
      ])

      return createCodexStreamResponse()
    })

    vi.stubGlobal('fetch', fetchMock)

    const runtime = getProvider('openai:gpt-5-codex', {
      apiKey: 'chatgpt-oauth',
      baseURL: 'https://chatgpt.com/backend-api/codex',
      authMode: 'codex-oauth'
    })

    await runtime.chat([
      { role: 'user', content: 'hola' }
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('tolera respuestas lentas de Codex si siguen llegando dentro de una ventana razonable', async () => {
    vi.useFakeTimers()

    const fetchMock = vi.fn(async () => createDelayedCodexStreamResponse([
      {
        delayMs: 30_000,
        body: {
          type: 'response.created',
          response: {
            id: 'resp_codex_delayed',
            created_at: 1742400000,
            model: 'gpt-5-codex'
          }
        }
      },
      {
        delayMs: 30_010,
        body: {
          type: 'response.output_item.added',
          output_index: 0,
          item: {
            type: 'message',
            id: 'msg_1',
            phase: 'final_answer'
          }
        }
      },
      {
        delayMs: 30_020,
        body: {
          type: 'response.output_text.delta',
          item_id: 'msg_1',
          delta: '{"ok":true}',
          logprobs: null
        }
      },
      {
        delayMs: 30_030,
        body: {
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            type: 'message',
            id: 'msg_1',
            phase: 'final_answer'
          }
        }
      },
      {
        delayMs: 30_040,
        body: {
          type: 'response.completed',
          response: {
            usage: {
              input_tokens: 3,
              output_tokens: 5
            }
          }
        }
      }
    ]))

    vi.stubGlobal('fetch', fetchMock)

    const runtime = getProvider('openai:gpt-5-codex', {
      apiKey: 'chatgpt-oauth',
      baseURL: 'https://chatgpt.com/backend-api/codex',
      authMode: 'codex-oauth'
    })

    const resultPromise = runtime.chat([
      { role: 'system', content: 'solo json' },
      { role: 'user', content: 'hola' }
    ])

    await vi.advanceTimersByTimeAsync(30_100)

    await expect(resultPromise).resolves.toMatchObject({
      content: '{"ok":true}',
      usage: {
        promptTokens: 3,
        completionTokens: 5
      }
    })
  })
})
