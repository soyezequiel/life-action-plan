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

interface BuildWithFallbackOptions {
  allowFallback?: boolean
  fallbackModelId?: string
  onFallback?: (originalError: Error) => Promise<void> | void
}

function shouldFallbackToOllama(error: Error): boolean {
  return !NON_FALLBACK_ERROR_PATTERNS.some((pattern) => pattern.test(error.message))
}

export async function buildWithOllamaFallback<T>(
  modelId: string,
  buildPlan: (nextModelId: string) => Promise<T>,
  options: BuildWithFallbackOptions = {}
): Promise<BuildWithFallbackResult<T>> {
  const fallbackModelId = options.fallbackModelId || DEFAULT_OLLAMA_FALLBACK_MODEL
  const allowFallback = options.allowFallback ?? true

  try {
    return {
      result: await buildPlan(modelId),
      fallbackUsed: false,
      modelId
    }
  } catch (error) {
    const originalError = error instanceof Error ? error : new Error('Unknown error')

    if (!allowFallback || !modelId.startsWith('openai:') || !shouldFallbackToOllama(originalError)) {
      throw originalError
    }

    await options.onFallback?.(originalError)

    try {
      return {
        result: await buildPlan(fallbackModelId),
        fallbackUsed: true,
        modelId: fallbackModelId
      }
    } catch {
      throw originalError
    }
  }
}
