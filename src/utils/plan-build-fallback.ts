export const DEFAULT_OLLAMA_FALLBACK_MODEL = 'ollama:qwen3:8b'

interface BuildWithFallbackResult<T> {
  result: T
  fallbackUsed: boolean
  modelId: string
}

export async function buildWithOllamaFallback<T>(
  modelId: string,
  buildPlan: (nextModelId: string) => Promise<T>,
  onFallback?: (originalError: Error) => void
): Promise<BuildWithFallbackResult<T>> {
  try {
    return {
      result: await buildPlan(modelId),
      fallbackUsed: false,
      modelId
    }
  } catch (error) {
    const originalError = error instanceof Error ? error : new Error('Unknown error')

    if (!modelId.startsWith('openai:')) {
      throw originalError
    }

    onFallback?.(originalError)

    try {
      return {
        result: await buildPlan(DEFAULT_OLLAMA_FALLBACK_MODEL),
        fallbackUsed: true,
        modelId: DEFAULT_OLLAMA_FALLBACK_MODEL
      }
    } catch {
      throw originalError
    }
  }
}
