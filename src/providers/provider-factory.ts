import { createOpenAI } from '@ai-sdk/openai'
import { generateText, streamText } from 'ai'
import type { AgentRuntime, LLMMessage, LLMResponse, ToolCall } from '../runtime/types'

interface ProviderConfig {
  apiKey: string
  baseURL?: string
  model?: string
}

interface ProviderTimeouts {
  chatMs: number
  streamMs: number
}

interface OllamaToolCall {
  type?: string
  function?: {
    name?: string
    arguments?: Record<string, unknown>
  }
}

interface OllamaChatMessage {
  content?: string
  thinking?: string
  tool_calls?: OllamaToolCall[]
}

interface OllamaChatResponse {
  message?: OllamaChatMessage
  prompt_eval_count?: number
  eval_count?: number
}

const OPENAI_TIMEOUTS: ProviderTimeouts = {
  chatMs: 20_000,
  streamMs: 20_000
}

const OLLAMA_TIMEOUTS: ProviderTimeouts = {
  chatMs: 180_000,
  streamMs: 180_000
}

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
    return createOllamaRuntime(modelName || 'qwen3:8b', config, OLLAMA_TIMEOUTS)
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

function normalizeOllamaBaseUrl(baseURL?: string): string {
  const trimmed = (baseURL || 'http://localhost:11434').trim().replace(/\/+$/g, '')
  return trimmed.endsWith('/v1') ? trimmed.slice(0, -3) : trimmed
}

function shouldEnableOllamaThinking(model: string): boolean {
  return /(qwen|deepseek|gpt-oss|qwq|r1)/i.test(model)
}

function mapOllamaMessages(messages: LLMMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content
  }))
}

function normalizeOllamaToolCalls(toolCalls: OllamaToolCall[] | undefined): ToolCall[] | undefined {
  if (!toolCalls?.length) {
    return undefined
  }

  const normalized = toolCalls.flatMap((toolCall, index) => {
    const functionName = toolCall.function?.name?.trim()
    const argumentsValue = toolCall.function?.arguments

    if (!functionName) {
      return []
    }

    return [{
      id: `ollama-tool-${index}`,
      name: functionName,
      arguments: argumentsValue && typeof argumentsValue === 'object' ? argumentsValue : {}
    }]
  })

  return normalized.length > 0 ? normalized : undefined
}

function mergeToolCalls(current: ToolCall[] | undefined, incoming: ToolCall[] | undefined): ToolCall[] | undefined {
  if (!incoming?.length) {
    return current
  }

  const merged = new Map<string, ToolCall>()

  for (const toolCall of current ?? []) {
    merged.set(toolCall.id, toolCall)
  }

  for (const toolCall of incoming) {
    merged.set(toolCall.id, toolCall)
  }

  return Array.from(merged.values())
}

function appendOllamaMessageParts(
  currentText: string,
  currentThinkingOpen: boolean,
  message: OllamaChatMessage | undefined
): { nextText: string; nextThinkingOpen: boolean; emittedChunks: string[]; toolCalls?: ToolCall[] } {
  let nextText = currentText
  let nextThinkingOpen = currentThinkingOpen
  const emittedChunks: string[] = []

  const thinking = typeof message?.thinking === 'string' ? message.thinking : ''
  const content = typeof message?.content === 'string' ? message.content : ''

  if (thinking) {
    if (!nextThinkingOpen) {
      nextText += '<think>'
      emittedChunks.push('<think>')
      nextThinkingOpen = true
    }

    nextText += thinking
    emittedChunks.push(thinking)
  }

  if (content) {
    if (nextThinkingOpen) {
      nextText += '</think>'
      emittedChunks.push('</think>')
      nextThinkingOpen = false
    }

    nextText += content
    emittedChunks.push(content)
  }

  const toolCalls = normalizeOllamaToolCalls(message?.tool_calls)

  if (toolCalls && nextThinkingOpen) {
    nextText += '</think>'
    emittedChunks.push('</think>')
    nextThinkingOpen = false
  }

  return {
    nextText,
    nextThinkingOpen,
    emittedChunks,
    toolCalls
  }
}

function finalizeOllamaResponse(
  content: string,
  thinkingOpen: boolean,
  promptTokens: number,
  completionTokens: number,
  toolCalls?: ToolCall[]
): LLMResponse {
  const finalContent = thinkingOpen ? `${content}</think>` : content

  return {
    content: finalContent,
    ...(toolCalls ? { toolCalls } : {}),
    usage: {
      promptTokens,
      completionTokens
    }
  }
}

async function* iterateOllamaStream(response: Response): AsyncIterable<OllamaChatResponse> {
  if (!response.body) {
    throw new Error('Ollama no devolvió un stream legible.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })

    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)

      if (line) {
        yield JSON.parse(line) as OllamaChatResponse
      }

      newlineIndex = buffer.indexOf('\n')
    }

    if (done) {
      const tail = buffer.trim()
      if (tail) {
        yield JSON.parse(tail) as OllamaChatResponse
      }
      return
    }
  }
}

function createOllamaRuntime(model: string, config: ProviderConfig, timeouts: ProviderTimeouts): AgentRuntime {
  const baseURL = normalizeOllamaBaseUrl(config.baseURL)
  const think = shouldEnableOllamaThinking(model)

  async function sendOllamaChatRequest(
    messages: LLMMessage[],
    stream: boolean,
    abortSignal: AbortSignal
  ): Promise<Response> {
    const response = await fetch(`${baseURL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: mapOllamaMessages(messages),
        stream,
        think,
        options: {
          num_predict: OLLAMA_MAX_OUTPUT_TOKENS
        }
      }),
      signal: abortSignal
    })

    if (!response.ok) {
      throw new Error((await response.text()) || `Ollama devolvió ${response.status}`)
    }

    return response
  }

  async function collectOllamaResponse(
    messages: LLMMessage[],
    abortSignal: AbortSignal,
    onToken?: (token: string) => void
  ): Promise<LLMResponse> {
    const response = await sendOllamaChatRequest(messages, Boolean(onToken), abortSignal)
    let content = ''
    let thinkingOpen = false
    let promptTokens = 0
    let completionTokens = 0
    let toolCalls: ToolCall[] | undefined

    if (onToken) {
      for await (const chunk of iterateOllamaStream(response)) {
        const appended = appendOllamaMessageParts(content, thinkingOpen, chunk.message)
        content = appended.nextText
        thinkingOpen = appended.nextThinkingOpen
        toolCalls = mergeToolCalls(toolCalls, appended.toolCalls)

        for (const emittedChunk of appended.emittedChunks) {
          onToken(emittedChunk)
        }

        promptTokens = chunk.prompt_eval_count ?? promptTokens
        completionTokens = chunk.eval_count ?? completionTokens
      }

      if (thinkingOpen) {
        onToken('</think>')
      }
    } else {
      const chunk = await response.json() as OllamaChatResponse
      const appended = appendOllamaMessageParts(content, thinkingOpen, chunk.message)
      content = appended.nextText
      thinkingOpen = appended.nextThinkingOpen
      toolCalls = appended.toolCalls
      promptTokens = chunk.prompt_eval_count ?? 0
      completionTokens = chunk.eval_count ?? 0
    }

    return finalizeOllamaResponse(content, thinkingOpen, promptTokens, completionTokens, toolCalls)
  }

  return {
    async chat(messages: LLMMessage[]): Promise<LLMResponse> {
      return runWithTimeout(
        (abortSignal) => collectOllamaResponse(messages, abortSignal),
        timeouts.chatMs,
        MODEL_TIMEOUT_MESSAGE
      )
    },

    async *stream(messages: LLMMessage[]): AsyncIterable<string> {
      const controller = new AbortController()
      const abortId = setTimeout(() => {
        controller.abort()
      }, timeouts.streamMs)

      try {
        const response = await sendOllamaChatRequest(messages, true, controller.signal)
        let content = ''
        let thinkingOpen = false

        for await (const chunk of iterateOllamaStream(response)) {
          const appended = appendOllamaMessageParts(content, thinkingOpen, chunk.message)
          content = appended.nextText
          thinkingOpen = appended.nextThinkingOpen

          for (const emittedChunk of appended.emittedChunks) {
            yield emittedChunk
          }
        }

        if (thinkingOpen) {
          yield '</think>'
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
        (abortSignal) => collectOllamaResponse(messages, abortSignal, onToken),
        timeouts.streamMs,
        MODEL_TIMEOUT_MESSAGE
      )
    },

    newContext(): AgentRuntime {
      return createOllamaRuntime(model, config, timeouts)
    }
  }
}
