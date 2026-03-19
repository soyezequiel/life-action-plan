import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { t } from '../src/i18n'
import DebugMessageInspector from '../src/renderer/src/components/debug/DebugMessageInspector'
import DebugSpanDetail from '../src/renderer/src/components/debug/DebugSpanDetail'
import type { DebugSpan } from '../src/shared/types/ipc'
import type { DebugTraceView } from '../src/renderer/src/hooks/useDebugTraces'

const traceId = '11111111-1111-4111-8111-111111111111'
const spanId = '22222222-2222-4222-8222-222222222222'

const baseSpan: DebugSpan = {
  traceId,
  spanId,
  parentSpanId: null,
  skillName: 'plan-builder',
  provider: 'ollama:qwen3:8b',
  type: 'stream',
  status: 'streaming',
  messages: [
    { role: 'system', content: 'Devolve solo JSON.' },
    { role: 'user', content: 'Quiero una rutina sostenible.' },
    { role: 'assistant', content: '{"nombre":"Plan demo"}' }
  ],
  response: '<think>acomodo el horario</think>{"nombre":"Plan demo"}',
  error: null,
  usage: {
    promptTokens: 120,
    completionTokens: 48
  },
  startedAt: '2026-03-19T15:00:00.000Z',
  completedAt: null,
  durationMs: null,
  metadata: {}
}

const baseTrace: DebugTraceView = {
  traceId,
  skillName: 'plan-builder',
  provider: 'ollama:qwen3:8b',
  startedAt: '2026-03-19T15:00:00.000Z',
  completedAt: null,
  error: null,
  spans: [baseSpan]
}

describe('debug panel render', () => {
  it('renders the empty detail state when no span is selected', () => {
    const html = renderToStaticMarkup(
      createElement(DebugSpanDetail, {
        trace: null,
        span: null
      })
    )

    expect(html).toContain(t('debug.no_selection'))
  })

  it('renders stream detail with think tags and provider metadata', () => {
    const html = renderToStaticMarkup(
      createElement(DebugSpanDetail, {
        trace: baseTrace,
        span: baseSpan
      })
    )

    expect(html).toContain('plan-builder')
    expect(html).toContain('ollama:qwen3:8b')
    expect(html).toContain('&lt;think&gt;')
    expect(html).toContain('acomodo el horario')
    expect(html).toContain(t('debug.pause_scroll'))
  })

  it('renders messages with localized role labels and character counts', () => {
    const html = renderToStaticMarkup(
      createElement(DebugMessageInspector, {
        messages: baseSpan.messages
      })
    )

    expect(html).toContain(t('debug.role.system'))
    expect(html).toContain(t('debug.role.user'))
    expect(html).toContain(t('debug.role.assistant'))
    expect(html).toContain(t('debug.characters', { count: baseSpan.messages[0].content.length }))
  })
})
