import { afterEach, describe, expect, it, vi } from 'vitest'
import { traceCollector } from '../src/debug/trace-collector'

function createSenderMock() {
  return {
    isDestroyed: vi.fn(() => false),
    send: vi.fn()
  } as {
    isDestroyed: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
  }
}

afterEach(() => {
  traceCollector.disable()
  traceCollector.clear()
  vi.useRealTimers()
})

describe('traceCollector', () => {
  it('captura trazas aunque el inspector todavia no este activo', () => {
    const traceId = traceCollector.startTrace('plan-builder', 'ollama:qwen3:8b', { profileId: 'p1' })
    const spanId = traceCollector.startSpan({
      traceId,
      skillName: 'plan-builder',
      provider: 'ollama:qwen3:8b',
      type: 'stream',
      messages: [
        { role: 'system', content: 'solo json' },
        { role: 'user', content: 'perfil demo' }
      ]
    })
    traceCollector.emitToken(traceId, spanId, '{"ok"')

    const snapshot = traceCollector.getSnapshot()

    expect(traceId).toMatch(/[0-9a-f-]{36}/)
    expect(snapshot[0]?.spans[0]?.response).toBe('{"ok"')
  })

  it('emite eventos validados cuando esta activado', () => {
    vi.useFakeTimers()
    const senderMock = createSenderMock()
    traceCollector.enable(senderMock)

    const traceId = traceCollector.startTrace('plan-builder', 'ollama:qwen3:8b', { profileId: 'p1' })
    const spanId = traceCollector.startSpan({
      traceId,
      skillName: 'plan-builder',
      provider: 'ollama:qwen3:8b',
      type: 'stream',
      messages: [
        { role: 'system', content: 'solo json' },
        { role: 'user', content: 'perfil demo' }
      ]
    })

    traceCollector.emitToken(traceId, spanId, '<think>')
    traceCollector.emitToken(traceId, spanId, '{}')
    vi.advanceTimersByTime(35)
    traceCollector.completeSpan(traceId, spanId, {
      content: '<think>{}',
      usage: {
        promptTokens: 10,
        completionTokens: 2
      }
    })
    traceCollector.completeTrace(traceId)

    const eventTypes = senderMock.send.mock.calls.map((call) => call[1].type)
    expect(eventTypes).toContain('trace:start')
    expect(eventTypes).toContain('span:start')
    expect(eventTypes).toContain('span:token')
    expect(eventTypes).toContain('span:complete')
    expect(eventTypes).toContain('trace:complete')
  })

  it('evicta la traza mas vieja al superar el maximo', () => {
    const senderMock = createSenderMock()
    traceCollector.enable(senderMock)

    const firstTraceId = traceCollector.startTrace('plan-builder', 'ollama:qwen3:8b', { index: 0 })

    for (let index = 1; index <= 100; index += 1) {
      traceCollector.startTrace('plan-builder', 'ollama:qwen3:8b', { index })
    }

    const activeTraces = (traceCollector as unknown as { activeTraces: Map<string, unknown> }).activeTraces
    expect(activeTraces.size).toBe(100)
    expect(activeTraces.has(firstTraceId as string)).toBe(false)
  })

  it('limpia trazas completadas despues de 5 minutos', () => {
    vi.useFakeTimers()
    const senderMock = createSenderMock()
    traceCollector.enable(senderMock)

    const traceId = traceCollector.startTrace('plan-builder', 'openai:gpt-4o-mini', {})
    traceCollector.completeTrace(traceId)

    const activeTraces = (traceCollector as unknown as { activeTraces: Map<string, unknown> }).activeTraces
    expect(activeTraces.has(traceId as string)).toBe(true)

    vi.advanceTimersByTime(5 * 60 * 1000)

    expect(activeTraces.has(traceId as string)).toBe(false)
  })

  it('expone un snapshot de las trazas activas', () => {
    const senderMock = createSenderMock()
    traceCollector.enable(senderMock)

    const traceId = traceCollector.startTrace('plan-builder', 'ollama:qwen3:8b', { profileId: 'p1' })
    const spanId = traceCollector.startSpan({
      traceId,
      skillName: 'plan-builder',
      provider: 'ollama:qwen3:8b',
      type: 'stream',
      messages: [
        { role: 'system', content: 'solo json' },
        { role: 'user', content: 'perfil demo' }
      ]
    })

    traceCollector.emitToken(traceId, spanId, '<think>')
    traceCollector.completeSpan(traceId, spanId, {
      content: '<think>{}',
      usage: {
        promptTokens: 10,
        completionTokens: 2
      }
    })

    const snapshot = traceCollector.getSnapshot()

    expect(snapshot).toHaveLength(1)
    expect(snapshot[0]?.traceId).toBe(traceId)
    expect(snapshot[0]?.spans[0]?.spanId).toBe(spanId)
    expect(snapshot[0]?.spans[0]?.response).toBe('<think>{}')
  })

  it('guarda el tiempo al primer token en la metadata del span', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-19T15:00:00.000Z'))

    const senderMock = createSenderMock()
    traceCollector.enable(senderMock)

    const traceId = traceCollector.startTrace('plan-builder', 'openai:gpt-4o-mini', {})
    const spanId = traceCollector.startSpan({
      traceId,
      skillName: 'plan-builder',
      provider: 'openai:gpt-4o-mini',
      type: 'stream',
      messages: [
        { role: 'system', content: 'solo json' },
        { role: 'user', content: 'perfil demo' }
      ]
    })

    vi.advanceTimersByTime(1200)
    traceCollector.emitToken(traceId, spanId, '{')

    const snapshot = traceCollector.getSnapshot()
    const span = snapshot[0]?.spans[0]

    expect(span?.metadata.firstTokenAt).toBe('2026-03-19T15:00:01.200Z')
    expect(span?.metadata.timeToFirstTokenMs).toBe(1200)
    expect(span?.response).toBe('{')
  })
})
