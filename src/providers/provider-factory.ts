import { createOpenAI } from '@ai-sdk/openai'
import { generateText, streamText } from 'ai'
import type { AgentRuntime, LLMMessage, LLMResponse } from '../runtime/types'

interface ProviderConfig {
  apiKey: string
  baseURL?: string
  model?: string
}

const CHAT_TIMEOUT_MS = 20_000
const STREAM_TIMEOUT_MS = 20_000
const MODEL_TIMEOUT_MESSAGE = 'El asistente tardó demasiado en responder. Intentá de nuevo.'

export function getProvider(modelId: string, config: ProviderConfig): AgentRuntime {
  const colonIdx = modelId.indexOf(':')
  const [providerName, modelName] = colonIdx >= 0
    ? [modelId.slice(0, colonIdx), modelId.slice(colonIdx + 1)]
    : ['openai', modelId]

  if (providerName === 'openai') {
    return createOpenAIRuntime(modelName || 'gpt-4o-mini', config)
  }

  if (providerName === 'ollama') {
    return createOpenAIRuntime(modelName || 'qwen3:8b', {
      apiKey: 'ollama',
      baseURL: config.baseURL || 'http://localhost:11434/v1'
    })
  }

  throw new Error(`Unknown provider: ${providerName}`)
}

async function runWithTimeout<T>(
  operation: (abortSignal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  const controller = new AbortController()
  const abortId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  const timeoutPromise = new Promise<never>((_, reject) => {
    const rejectId = setTimeout(() => {
      clearTimeout(abortId)
      reject(new Error(timeoutMessage))
    }, timeoutMs)

    controller.signal.addEventListener('abort', () => {
      clearTimeout(rejectId)
      reject(new Error(timeoutMessage))
    }, { once: true })
  })

  try {
    return await Promise.race([
      operation(controller.signal),
      timeoutPromise
    ])
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(timeoutMessage)
    }

    throw error
  } finally {
    clearTimeout(abortId)
  }
}

function createOpenAIRuntime(model: string, config: ProviderConfig): AgentRuntime {
  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  })

  const llmModel = openai(model)

  return {
    async chat(messages: LLMMessage[]): Promise<LLMResponse> {
      const result = await runWithTimeout(
        (abortSignal) => generateText({
          model: llmModel,
          messages: messages.map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content
          })),
          maxOutputTokens: 4096,
          abortSignal,
          timeout: CHAT_TIMEOUT_MS
        }),
        CHAT_TIMEOUT_MS,
        MODEL_TIMEOUT_MESSAGE
      )

      return {
        content: result.text,
        usage: {
          promptTokens: result.usage?.inputTokens ?? 0,
          completionTokens: result.usage?.outputTokens ?? 0
        }
      }
    },

    async *stream(messages: LLMMessage[]): AsyncIterable<string> {
      const result = streamText({
        model: llmModel,
        messages: messages.map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content
        })),
        maxOutputTokens: 4096,
        timeout: STREAM_TIMEOUT_MS
      })

      for await (const chunk of result.textStream) {
        yield chunk
      }
    },

    newContext(): AgentRuntime {
      return createOpenAIRuntime(model, config)
    }
  }
}
