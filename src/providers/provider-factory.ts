import { createOpenAI } from '@ai-sdk/openai'
import { generateText, streamText } from 'ai'
import type { AgentRuntime, LLMMessage, LLMResponse } from '../runtime/types'

interface ProviderConfig {
  apiKey: string
  baseURL?: string
  model?: string
}

interface ProviderTimeouts {
  chatMs: number
  streamMs: number
}

const OPENAI_TIMEOUTS: ProviderTimeouts = {
  chatMs: 20_000,
  streamMs: 20_000
}

const OLLAMA_TIMEOUTS: ProviderTimeouts = {
  chatMs: 180_000,
  streamMs: 180_000
}

// Qwen3 is a "thinking" model: it uses reasoning tokens before generating content.
// 4096 maxOutputTokens may be consumed entirely by reasoning, leaving content empty.
const OLLAMA_MAX_OUTPUT_TOKENS = 16384

const MODEL_TIMEOUT_MESSAGE = 'El asistente tardó demasiado en responder. Intentá de nuevo.'

export function getProviderTimeouts(modelId: string): ProviderTimeouts {
  const colonIdx = modelId.indexOf(':')
  const providerName = colonIdx >= 0 ? modelId.slice(0, colonIdx) : 'openai'

  return providerName === 'ollama' ? OLLAMA_TIMEOUTS : OPENAI_TIMEOUTS
}

export function getProvider(modelId: string, config: ProviderConfig): AgentRuntime {
  const colonIdx = modelId.indexOf(':')
  const [providerName, modelName] = colonIdx >= 0
    ? [modelId.slice(0, colonIdx), modelId.slice(colonIdx + 1)]
    : ['openai', modelId]

  if (providerName === 'openai') {
    return createOpenAIRuntime(modelName || 'gpt-4o-mini', config, OPENAI_TIMEOUTS)
  }

  if (providerName === 'ollama') {
    return createOpenAIRuntime(modelName || 'qwen3:8b', {
      apiKey: 'ollama',
      baseURL: config.baseURL || 'http://localhost:11434/v1'
    }, OLLAMA_TIMEOUTS, OLLAMA_MAX_OUTPUT_TOKENS)
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

function createOpenAIRuntime(model: string, config: ProviderConfig, timeouts: ProviderTimeouts, maxOutputTokens = 4096): AgentRuntime {
  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  })

  const llmModel = openai(model)
  const mapMessages = (messages: LLMMessage[]) =>
    messages.map((message) => ({
      role: message.role as 'system' | 'user' | 'assistant',
      content: message.content
    }))

  async function collectStreamedResponse(
    messages: LLMMessage[],
    onToken: (token: string) => void,
    abortSignal: AbortSignal
  ): Promise<LLMResponse> {
    const result = streamText({
      model: llmModel,
      messages: mapMessages(messages),
      maxOutputTokens,
      abortSignal,
      timeout: timeouts.streamMs
    })

    let fullText = ''

    for await (const chunk of result.textStream) {
      fullText += chunk
      onToken(chunk)
    }

    const usage = await result.usage

    return {
      content: fullText,
      usage: {
        promptTokens: usage?.inputTokens ?? 0,
        completionTokens: usage?.outputTokens ?? 0
      }
    }
  }

  return {
    async chat(messages: LLMMessage[]): Promise<LLMResponse> {
      const result = await runWithTimeout(
        (abortSignal) => generateText({
          model: llmModel,
          messages: mapMessages(messages),
          maxOutputTokens,
          abortSignal,
          timeout: timeouts.chatMs
        }),
        timeouts.chatMs,
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
      const controller = new AbortController()
      const abortId = setTimeout(() => {
        controller.abort()
      }, timeouts.streamMs)

      try {
        const result = streamText({
          model: llmModel,
          messages: mapMessages(messages),
          maxOutputTokens,
          abortSignal: controller.signal,
          timeout: timeouts.streamMs
        })

        for await (const chunk of result.textStream) {
          yield chunk
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(MODEL_TIMEOUT_MESSAGE)
        }

        throw error
      } finally {
        clearTimeout(abortId)
      }
    },

    async streamChat(messages: LLMMessage[], onToken: (token: string) => void): Promise<LLMResponse> {
      return runWithTimeout(
        (abortSignal) => collectStreamedResponse(messages, onToken, abortSignal),
        timeouts.streamMs,
        MODEL_TIMEOUT_MESSAGE
      )
    },

    newContext(): AgentRuntime {
      return createOpenAIRuntime(model, config, timeouts, maxOutputTokens)
    }
  }
}
