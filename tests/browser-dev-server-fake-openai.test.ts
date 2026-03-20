import { describe, expect, it } from 'vitest'
import {
  buildFakeOpenAIPlan,
  buildFakeOpenAIResponsesPayload,
  buildFakeOpenAIStreamEvents,
  shouldUseFakeOpenAI
} from '../src/server/fake-openai-responses'

function createOpenAIRequestBody() {
  return {
    model: 'gpt-5-mini',
    input: [
      {
        role: 'developer',
        content: 'Respondé solo JSON.'
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              'Nombre: Ana',
              'Edad: 32',
              'Ciudad: Rosario',
              'Objetivo principal: conseguir mi primer trabajo tech'
            ].join('\n')
          }
        ]
      }
    ]
  }
}

describe('browser dev fake OpenAI', () => {
  it('activa el provider fake solo para claves sk-fake en modelos openai', () => {
    expect(shouldUseFakeOpenAI('sk-fake-demo', 'openai:gpt-4o-mini')).toBe(true)
    expect(shouldUseFakeOpenAI('sk-live-demo', 'openai:gpt-4o-mini')).toBe(false)
    expect(shouldUseFakeOpenAI('sk-fake-demo', 'ollama:qwen3:8b')).toBe(false)
  })

  it('arma un plan fake basado en el prompt del perfil', () => {
    const plan = buildFakeOpenAIPlan(createOpenAIRequestBody())

    expect(plan.nombre).toBe('Plan de Ana')
    expect(plan.resumen).toContain('Rosario')
    expect(plan.resumen).toContain('conseguir mi primer trabajo tech')
    expect(plan.reasoning).toContain('Ana')
    expect(plan.eventos).toHaveLength(5)
    expect(plan.eventos[0]?.objetivoId).toBe('obj1')
  })

  it('devuelve un payload Responses valido con reasoning summary y mensaje final', () => {
    const payload = buildFakeOpenAIResponsesPayload(createOpenAIRequestBody())
    const output = Array.isArray(payload.output) ? payload.output : []

    expect(payload.model).toBe('gpt-5-mini')
    expect(output).toHaveLength(2)
    expect(output[0]).toMatchObject({
      type: 'reasoning'
    })
    expect(output[1]).toMatchObject({
      type: 'message',
      role: 'assistant'
    })
  })

  it('emite eventos SSE con reasoning y deltas de texto', () => {
    const events = buildFakeOpenAIStreamEvents(createOpenAIRequestBody())
    const eventTypes = events.map((event) => event.type)

    expect(eventTypes).toContain('response.created')
    expect(eventTypes).toContain('response.reasoning_summary_text.delta')
    expect(eventTypes).toContain('response.output_text.delta')
    expect(eventTypes.at(-1)).toBe('response.completed')
  })
})
