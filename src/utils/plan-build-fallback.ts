export const DEFAULT_OLLAMA_FALLBACK_MODEL = 'ollama:qwen3:8b'

const NON_FALLBACK_ERROR_PATTERNS = [
  /api key/i,
  /unauthorized/i,
  /authentication/i,
  /\b401\b/,
  /\b403\b/,
  /budget/i,
  /quota/i,
  /insufficient/i
]

interface BuildWithFallbackResult<T> {
  result: T
  fallbackUsed: boolean
  modelId: string
}

function shouldFallbackToOllama(error: Error): boolean {
  return !NON_FALLBACK_ERROR_PATTERNS.some((pattern) => pattern.test(error.message))
}

export async function buildWithOllamaFallback<T>(
  modelId: string,
  buildPlan: (nextModelId: string) => Promise<T>,
  onFallback?: (originalError: Error) => Promise<void> | void
): Promise<BuildWithFallbackResult<T>> {
  try {
    return {
      result: await buildPlan(modelId),
      fallbackUsed: false,
      modelId
    }
  } catch (error) {
    const originalError = error instanceof Error ? error : new Error('Unknown error')

    if (!modelId.startsWith('openai:') || !shouldFallbackToOllama(originalError)) {
      throw originalError
    }

    await onFallback?.(originalError)

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
