import { describe, expect, it, vi } from 'vitest'
import { buildWithOllamaFallback, DEFAULT_OLLAMA_FALLBACK_MODEL } from '../src/utils/plan-build-fallback'

describe('buildWithOllamaFallback', () => {
  it('no usa fallback si el provider original responde', async () => {
    const buildPlan = vi.fn(async (modelId: string) => ({ modelId }))

    const result = await buildWithOllamaFallback('openai:gpt-4o-mini', buildPlan)

    expect(result).toEqual({
      result: { modelId: 'openai:gpt-4o-mini' },
      fallbackUsed: false,
      modelId: 'openai:gpt-4o-mini'
    })
    expect(buildPlan).toHaveBeenCalledTimes(1)
  })

  it('intenta Ollama cuando OpenAI falla', async () => {
    const onFallback = vi.fn()
    const buildPlan = vi.fn(async (modelId: string) => {
      if (modelId.startsWith('openai:')) {
        throw new Error('timeout')
      }

      return { modelId }
    })

    const result = await buildWithOllamaFallback('openai:gpt-4o-mini', buildPlan, onFallback)

    expect(result).toEqual({
      result: { modelId: DEFAULT_OLLAMA_FALLBACK_MODEL },
      fallbackUsed: true,
      modelId: DEFAULT_OLLAMA_FALLBACK_MODEL
    })
    expect(onFallback).toHaveBeenCalledWith(expect.objectContaining({ message: 'timeout' }))
  })

  it('devuelve el error original si el fallback también falla', async () => {
    const buildPlan = vi.fn(async (modelId: string) => {
      if (modelId === DEFAULT_OLLAMA_FALLBACK_MODEL) {
        throw new Error('ollama down')
      }

      throw new Error('invalid api key')
    })

    await expect(buildWithOllamaFallback('openai:gpt-4o-mini', buildPlan)).rejects.toThrow('invalid api key')
  })

  it('no intenta fallback para modelos que no son openai', async () => {
    const buildPlan = vi.fn(async () => {
      throw new Error('ollama down')
    })

    await expect(buildWithOllamaFallback('ollama:qwen3:8b', buildPlan)).rejects.toThrow('ollama down')
    expect(buildPlan).toHaveBeenCalledTimes(1)
  })
})
