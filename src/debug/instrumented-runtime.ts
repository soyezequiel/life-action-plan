import type { AgentRuntime, LLMMessage, LLMResponse } from '../runtime/types'
import { traceCollector } from './trace-collector'

interface InstrumentedRuntimeOptions {
  traceId: string | null
  skillName: string
  provider: string
  parentSpanId?: string | null
}

async function buildInstrumentedChatResponse(
  runtime: AgentRuntime,
  options: InstrumentedRuntimeOptions,
  messages: LLMMessage[],
  onToken?: (token: string) => void
): Promise<LLMResponse> {
  const canTrace = Boolean(options.traceId)
  const traceId = options.traceId

  if (!canTrace || !traceId) {
    if (runtime.streamChat && onToken) {
      return runtime.streamChat(messages, onToken)
    }

    const response = await runtime.chat(messages)

    if (onToken && response.content) {
      onToken(response.content)
    }

    return response
  }

  const useStreaming = typeof runtime.streamChat === 'function'
  const spanId = traceCollector.startSpan({
    traceId,
    parentSpanId: options.parentSpanId ?? null,
    skillName: options.skillName,
    provider: options.provider,
    type: useStreaming ? 'stream' : 'chat',
    messages
  })

  try {
    const response = useStreaming
      ? await runtime.streamChat!(messages, (token) => {
          onToken?.(token)
          traceCollector.emitToken(traceId, spanId, token)
        })
      : await runtime.chat(messages)

    traceCollector.completeSpan(traceId, spanId, response)
    return response
  } catch (error) {
    traceCollector.failSpan(traceId, spanId, error)
    throw error
  }
}

export function createInstrumentedRuntime(
  runtime: AgentRuntime,
  traceId: string | null,
  skillName: string,
  provider: string,
  parentSpanId: string | null = null
): AgentRuntime {
  return {
    async chat(messages: LLMMessage[]): Promise<LLMResponse> {
      return buildInstrumentedChatResponse(runtime, { traceId, skillName, provider, parentSpanId }, messages)
    },

    async *stream(messages: LLMMessage[]): AsyncIterable<string> {
      const canTrace = Boolean(traceId)

      if (!canTrace || !traceId) {
        for await (const chunk of runtime.stream(messages)) {
          yield chunk
        }
        return
      }

      const spanId = traceCollector.startSpan({
        traceId,
        parentSpanId,
        skillName,
        provider,
        type: 'stream',
        messages
      })

      let response = ''

      try {
        for await (const chunk of runtime.stream(messages)) {
          response += chunk
          traceCollector.emitToken(traceId, spanId, chunk)
          yield chunk
        }

        traceCollector.completeSpan(traceId, spanId, {
          content: response,
          usage: {
            promptTokens: 0,
            completionTokens: 0
          }
        })
      } catch (error) {
        traceCollector.failSpan(traceId, spanId, error)
        throw error
      }
    },

    async streamChat(messages: LLMMessage[], onToken: (token: string) => void): Promise<LLMResponse> {
      return buildInstrumentedChatResponse(
        runtime,
        { traceId, skillName, provider, parentSpanId },
        messages,
        onToken
      )
    },

    newContext(): AgentRuntime {
      return createInstrumentedRuntime(runtime.newContext(), traceId, skillName, provider, parentSpanId)
    }
  }
}
