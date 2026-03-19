import { createOpenAI } from '@ai-sdk/openai'
import { generateText, streamText } from 'ai'
import type { AgentRuntime, LLMMessage, LLMResponse } from '../runtime/types'

interface ProviderConfig {
  apiKey: string
  baseURL?: string
  model?: string
}

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

function createOpenAIRuntime(model: string, config: ProviderConfig): AgentRuntime {
  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  })

  const llmModel = openai(model)

  return {
    async chat(messages: LLMMessage[]): Promise<LLMResponse> {
      const result = await generateText({
        model: llmModel,
        messages: messages.map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content
        })),
        maxTokens: 4096,
        abortSignal: AbortSignal.timeout(120_000)
      })

      return {
        content: result.text,
        usage: {
          promptTokens: result.usage?.promptTokens ?? 0,
          completionTokens: result.usage?.completionTokens ?? 0
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
        maxTokens: 4096,
        abortSignal: AbortSignal.timeout(60_000)
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
