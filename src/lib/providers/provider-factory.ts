import { createOpenAI } from '@ai-sdk/openai'
import { generateText, streamText } from 'ai'
import { getCodexAuthSession } from '../auth/codex-auth'
import type { AgentRuntime, LLMMessage, LLMResponse, ToolCall } from '../runtime/types'
import { DEFAULT_OPENROUTER_BUILD_MODEL, getModelProviderName, supportsOllamaThinking } from './provider-metadata'

type ProviderAuthMode = 'api-key' | 'codex-oauth'

interface ProviderConfig {
  apiKey: string
  baseURL?: string
  model?: string
  thinkingMode?: 'enabled' | 'disabled'
  authMode?: ProviderAuthMode
}

interface ProviderTimeouts {
  chatMs: number
  streamMs: number
}

interface InactivityTimeoutController {
  abortSignal: AbortSignal
  recordActivity: () => void
  clear: () => void
  isTimedOut: () => boolean
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

const OPENAI_REASONING_TIMEOUTS: ProviderTimeouts = {
  chatMs: 60_000,
  streamMs: 60_000
}

const OLLAMA_TIMEOUTS: ProviderTimeouts = {
  chatMs: 180_000,
  streamMs: 180_000
}

const OLLAMA_MAX_OUTPUT_TOKENS = 4096
const OPENAI_REASONING_SUMMARY_MODE = 'auto'
const MODEL_TIMEOUT_MESSAGE = 'El asistente tardo demasiado en responder. Intentalo de nuevo.'
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const CODEX_BACKEND_BASE_URL = 'https://chatgpt.com/backend-api/codex'
const CODEX_OAUTH_PLACEHOLDER_KEY = 'chatgpt-oauth'
const CODEX_BETA_RESPONSES = 'responses=experimental'
const CODEX_ORIGINATOR = 'codex_cli_rs'
const DEFAULT_CODEX_INSTRUCTIONS = 'You are a helpful assistant. Follow the requested output format exactly.'

function shouldUseExtendedCloudTimeout(modelId: string, authMode?: ProviderAuthMode): boolean {
  if (authMode === 'codex-oauth') {
    return true
  }

  const normalized = modelId.trim().toLowerCase()
  const modelName = normalized.includes(':')
    ? normalized.slice(normalized.indexOf(':') + 1)
    : normalized

  return modelName.includes('gpt-5')
    || /(^|[/-])o\d/.test(modelName)
}

export function getProviderTimeouts(modelId: string, authMode?: ProviderAuthMode): ProviderTimeouts {
  const providerName = getModelProviderName(modelId)

  if (providerName === 'ollama') {
    return OLLAMA_TIMEOUTS
  }

  return shouldUseExtendedCloudTimeout(modelId, authMode)
    ? OPENAI_REASONING_TIMEOUTS
    : OPENAI_TIMEOUTS
}

export function getProvider(modelId: string, config: ProviderConfig): AgentRuntime {
  const colonIdx = modelId.indexOf(':')
  const [providerName, modelName] = colonIdx >= 0
    ? [modelId.slice(0, colonIdx), modelId.slice(colonIdx + 1)]
    : ['openai', modelId]
  const timeouts = getProviderTimeouts(modelId, config.authMode)

  if (providerName === 'openai') {
    return createOpenAIRuntime(modelName || 'gpt-4o-mini', config, timeouts)
  }

  if (providerName === 'openrouter') {
    return createOpenRouterRuntime(modelName || DEFAULT_OPENROUTER_BUILD_MODEL.slice('openrouter:'.length), config, timeouts)
  }

  if (providerName === 'ollama') {
    return createOllamaRuntime(modelName || 'qwen3:8b', config, timeouts)
  }

  throw new Error(`Unknown provider: ${providerName}`)
}

function getOpenRouterHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-OpenRouter-Title': 'LAP'
  }
  const referer = process.env.APP_URL?.trim()
    || process.env.NEXT_PUBLIC_APP_URL?.trim()
    || (process.env.VERCEL_URL?.trim() ? `https://${process.env.VERCEL_URL.trim()}` : '')
    || 'http://localhost:3000'

  if (referer) {
    headers['HTTP-Referer'] = referer
  }

  return headers
}

function isCodexAuthMode(config: ProviderConfig): boolean {
  return config.authMode === 'codex-oauth'
}

function normalizeBaseUrl(value?: string): string {
  return value?.trim().replace(/\/+$/g, '') ?? ''
}

function requiresCodexOAuth(config: ProviderConfig): boolean {
  const normalizedBaseUrl = normalizeBaseUrl(config.baseURL)
  const hasCodexBaseUrl = normalizedBaseUrl === CODEX_BACKEND_BASE_URL
  const hasCodexPlaceholderKey = config.apiKey.trim() === CODEX_OAUTH_PLACEHOLDER_KEY

  return hasCodexBaseUrl || hasCodexPlaceholderKey
}

function assertCodexAuthMode(config: ProviderConfig): void {
  if (requiresCodexOAuth(config) && !isCodexAuthMode(config)) {
    throw new Error(
      'CODEX_OAUTH_AUTH_MODE_REQUIRED: Codex backend requires authMode="codex-oauth".',
    )
  }
}

function extractCodexTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .flatMap((item) => {
      if (!item || typeof item !== 'object') {
        return []
      }

      const text = (item as { text?: unknown }).text
      return typeof text === 'string' && text.trim().length > 0
        ? [text.trim()]
        : []
    })
    .join('\n')
    .trim()
}

function patchCodexRequestBody(body: BodyInit | null | undefined): BodyInit | undefined {
  if (typeof body !== 'string') {
    return body ?? undefined
  }

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const input = Array.isArray(parsed.input) ? parsed.input : undefined
    const instructionParts: string[] = []

    if (typeof parsed.instructions === 'string' && parsed.instructions.trim().length > 0) {
      instructionParts.push(parsed.instructions.trim())
    }

    const filteredInput = input?.filter((item) => {
      if (!item || typeof item !== 'object') {
        return true
      }

      const role = (item as { role?: unknown }).role
      if (role !== 'developer' && role !== 'system') {
        return true
      }

      const content = extractCodexTextContent((item as { content?: unknown }).content)
      if (content.length > 0) {
        instructionParts.push(content)
      }

      return false
    })

    return JSON.stringify({
      ...parsed,
      ...(filteredInput ? { input: filteredInput } : {}),
      instructions: instructionParts.join('\n\n').trim() || DEFAULT_CODEX_INSTRUCTIONS,
      max_output_tokens: undefined,
      max_completion_tokens: undefined,
      store: false
    })
  } catch {
    return body
  }
}

async function sendCodexRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
  forceRefresh = false
): Promise<Response> {
  const session = await getCodexAuthSession(forceRefresh ? { forceRefresh: true } : undefined)
  const headers = new Headers(init?.headers)

  headers.set('Authorization', `Bearer ${session.accessToken}`)
  headers.set('chatgpt-account-id', session.accountId)
  headers.set('OpenAI-Beta', CODEX_BETA_RESPONSES)
  headers.set('originator', CODEX_ORIGINATOR)
  headers.set('accept', 'text/event-stream')

  return fetch(input, {
    ...init,
    headers,
    body: patchCodexRequestBody(init?.body)
  })
}

function createCodexFetch() {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const firstResponse = await sendCodexRequest(input, init)

    if (firstResponse.status !== 401) {
      return firstResponse
    }

    try {
      return await sendCodexRequest(input, init, true)
    } catch {
      return firstResponse
    }
  }
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

function createInactivityTimeoutController(timeoutMs: number): InactivityTimeoutController {
  const controller = new AbortController()
  let timedOut = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const armTimeout = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
  }

  armTimeout()

  return {
    abortSignal: controller.signal,
    recordActivity: () => {
      if (!timedOut) {
        armTimeout()
      }
    },
    clear: () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    },
    isTimedOut: () => timedOut
  }
}

function normalizeInactivityTimeoutError(
  error: unknown,
  timeoutController: InactivityTimeoutController,
  timeoutMessage: string
): Error {
  if (
    timeoutController.isTimedOut()
    || (error instanceof Error && error.name === 'AbortError' && timeoutController.abortSignal.aborted)
  ) {
    return new Error(timeoutMessage)
  }

  return error instanceof Error ? error : new Error(String(error))
}

async function runWithInactivityTimeout<T>(
  operation: (timeoutController: InactivityTimeoutController) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  const timeoutController = createInactivityTimeoutController(timeoutMs)

  try {
    return await operation(timeoutController)
  } catch (error) {
    throw normalizeInactivityTimeoutError(error, timeoutController, timeoutMessage)
  } finally {
    timeoutController.clear()
  }
}

import { traceCollector } from '../../debug/trace-collector'

function buildOpenAIProviderOptions(model: string, authMode?: ProviderAuthMode) {
  const openaiOptions: {
    reasoningSummary?: string
    store?: boolean
  } = {}

  if (shouldRequestOpenAIReasoningSummary(model)) {
    openaiOptions.reasoningSummary = OPENAI_REASONING_SUMMARY_MODE
  }

  if (authMode === 'codex-oauth') {
    openaiOptions.store = false
  }

  return Object.keys(openaiOptions).length > 0
    ? {
        openai: openaiOptions
      }
    : undefined
}

function createOpenAIRuntime(
  model: string,
  config: ProviderConfig,
  timeouts: ProviderTimeouts,
  maxOutputTokens = 4096,
  options?: { providerName?: string; headers?: Record<string, string> }
): AgentRuntime {
  assertCodexAuthMode(config)

  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    headers: options?.headers,
    name: options?.providerName,
    fetch: isCodexAuthMode(config) ? createCodexFetch() : undefined
  })

  const llmModel = openai.responses(model)
  
  const getInstrumentationCtx = () => ({
    traceId: traceCollector.getActiveTraceId(),
    skillName: 'llm-interaction',
    provider: options?.providerName || 'openai'
  })

  const providerOptions = buildOpenAIProviderOptions(model, config.authMode)
  const mapMessages = (messages: LLMMessage[]) =>
    messages.map((message) => ({
      role: message.role as 'system' | 'user' | 'assistant',
      content: message.content
    }))

async function collectStreamedResponse(
    messages: LLMMessage[],
    onToken: (token: string) => void,
    abortSignal: AbortSignal,
    onActivity?: () => void
  ): Promise<LLMResponse> {
    const { traceId, skillName, provider } = getInstrumentationCtx()
    const spanId = traceCollector.startSpan({
      traceId,
      skillName,
      provider,
      type: 'stream',
      messages
    })

    const wrappedOnToken = (token: string) => {
        traceCollector.emitToken(traceId, spanId, token)
        onToken(token)
    }

    const result = streamText({
      model: llmModel,
      messages: mapMessages(messages),
      maxOutputTokens,
      abortSignal,
      ...(providerOptions ? { providerOptions } : {})
    })

    let fullText = ''
    let thinkingOpen = false

    for await (const chunk of result.fullStream) {
      onActivity?.()
      const streamError = getOpenAIChunkError(chunk as { type?: string; error?: unknown })
      if (streamError) {
        traceCollector.failSpan(traceId, spanId, streamError)
        throw streamError
      }

      const appended = appendOpenAIStreamChunk(
        fullText,
        thinkingOpen,
        chunk as { type?: string; delta?: string; text?: string }
      )

      fullText = appended.nextText
      thinkingOpen = appended.nextThinkingOpen

      for (const emittedChunk of appended.emittedChunks) {
        wrappedOnToken(emittedChunk)
      }
    }

    if (thinkingOpen) {
      fullText += '</think>'
      wrappedOnToken('</think>')
    }

    const usage = await result.usage
    const finalResponse = {
      content: fullText,
      usage: {
        promptTokens: usage?.inputTokens ?? 0,
        completionTokens: usage?.outputTokens ?? 0
      }
    }

    traceCollector.completeSpan(traceId, spanId, finalResponse)

    return finalResponse
  }

  return {
    async chat(messages: LLMMessage[]): Promise<LLMResponse> {
      const { traceId, skillName, provider } = getInstrumentationCtx()
      const spanId = traceCollector.startSpan({
        traceId,
        skillName,
        provider,
        type: 'chat',
        messages
      })

      try {
        if (isCodexAuthMode(config)) {
          const streamedResponse = await runWithInactivityTimeout(async (timeoutController) => {
            const result = streamText({
              model: llmModel,
              messages: mapMessages(messages),
              maxOutputTokens,
              abortSignal: timeoutController.abortSignal,
              ...(providerOptions ? { providerOptions } : {})
            })

            let fullText = ''
            let thinkingOpen = false

            for await (const chunk of result.fullStream) {
              timeoutController.recordActivity()
              const streamError = getOpenAIChunkError(chunk as { type?: string; error?: unknown })
              if (streamError) {
                throw streamError
              }

              const appended = appendOpenAIStreamChunk(
                fullText,
                thinkingOpen,
                chunk as { type?: string; delta?: string; text?: string }
              )

              fullText = appended.nextText
              thinkingOpen = appended.nextThinkingOpen
            }

            if (thinkingOpen) {
              fullText += '</think>'
            }

            const usage = await result.usage
            return {
              content: fullText,
              usage: {
                promptTokens: usage?.inputTokens ?? 0,
                completionTokens: usage?.outputTokens ?? 0
              }
            }
          }, timeouts.streamMs, MODEL_TIMEOUT_MESSAGE)

          traceCollector.completeSpan(traceId, spanId, streamedResponse)
          return streamedResponse
        }

        const result = await runWithTimeout(
          (abortSignal) => generateText({
            model: llmModel,
            messages: mapMessages(messages),
            maxOutputTokens,
            abortSignal,
            timeout: timeouts.chatMs,
            ...(providerOptions ? { providerOptions } : {})
          }),
          timeouts.chatMs,
          MODEL_TIMEOUT_MESSAGE
        )

        const response = {
          content: mergeReasoningContent(result.reasoningText, result.text),
          usage: {
            promptTokens: result.usage?.inputTokens ?? 0,
            completionTokens: result.usage?.outputTokens ?? 0
          }
        }

        traceCollector.completeSpan(traceId, spanId, response)
        return response
      } catch (error) {
        traceCollector.failSpan(traceId, spanId, error)
        throw error
      }
    },
    async *stream(messages: LLMMessage[]): AsyncIterable<string> {
      const timeoutController = createInactivityTimeoutController(timeouts.streamMs)

      try {
        const result = streamText({
          model: llmModel,
          messages: mapMessages(messages),
          maxOutputTokens,
          abortSignal: timeoutController.abortSignal,
          ...(providerOptions ? { providerOptions } : {})
        })

        let fullText = ''
        let thinkingOpen = false

        for await (const chunk of result.fullStream) {
          timeoutController.recordActivity()
          const streamError = getOpenAIChunkError(chunk as { type?: string; error?: unknown })
          if (streamError) {
            throw streamError
          }

          const appended = appendOpenAIStreamChunk(
            fullText,
            thinkingOpen,
            chunk as { type?: string; delta?: string; text?: string }
          )

          fullText = appended.nextText
          thinkingOpen = appended.nextThinkingOpen

          for (const emittedChunk of appended.emittedChunks) {
            yield emittedChunk
          }
        }

        if (thinkingOpen) {
          yield '</think>'
        }
      } catch (error) {
        throw normalizeInactivityTimeoutError(error, timeoutController, MODEL_TIMEOUT_MESSAGE)
      } finally {
        timeoutController.clear()
      }
    },
    async streamChat(messages: LLMMessage[], onToken: (token: string) => void): Promise<LLMResponse> {
      return runWithInactivityTimeout(
        (timeoutController) => collectStreamedResponse(
          messages,
          onToken,
          timeoutController.abortSignal,
          timeoutController.recordActivity
        ),
        timeouts.streamMs,
        MODEL_TIMEOUT_MESSAGE
      )
    },
    newContext(): AgentRuntime {
      return createOpenAIRuntime(model, config, timeouts, maxOutputTokens, options)
    }
  }
}

function createOpenRouterRuntime(model: string, config: ProviderConfig, timeouts: ProviderTimeouts): AgentRuntime {
  return createOpenAIRuntime(model, {
    ...config,
    baseURL: config.baseURL?.trim() || OPENROUTER_BASE_URL
  }, timeouts, 4096, {
    providerName: 'openrouter',
    headers: getOpenRouterHeaders()
  })
}

function shouldRequestOpenAIReasoningSummary(model: string): boolean {
  return /^(o\d|gpt-5)/i.test(model.trim())
}

function mergeReasoningContent(reasoningText: string | undefined, responseText: string): string {
  const visibleReasoning = typeof reasoningText === 'string' ? reasoningText.trim() : ''
  return visibleReasoning ? `<think>${visibleReasoning}</think>${responseText}` : responseText
}

function getOpenAIChunkText(chunk: { delta?: string; text?: string }): string {
  if (typeof chunk.delta === 'string') return chunk.delta
  if (typeof chunk.text === 'string') return chunk.text
  return ''
}

function getOpenAIChunkError(chunk: { type?: string; error?: unknown }): Error | null {
  if (chunk.type !== 'error') {
    return null
  }

  if (chunk.error instanceof Error) {
    return chunk.error
  }

  if (typeof chunk.error === 'string' && chunk.error.trim()) {
    return new Error(chunk.error.trim())
  }

  return new Error('OPENAI_STREAM_ERROR')
}

function appendOpenAIStreamChunk(
  currentText: string,
  currentThinkingOpen: boolean,
  chunk: { type?: string; delta?: string; text?: string }
): { nextText: string; nextThinkingOpen: boolean; emittedChunks: string[] } {
  let nextText = currentText
  let nextThinkingOpen = currentThinkingOpen
  const emittedChunks: string[] = []

  if (chunk.type === 'reasoning-start') {
    if (!nextThinkingOpen) {
      nextText += '<think>'
      emittedChunks.push('<think>')
      nextThinkingOpen = true
    }

    return { nextText, nextThinkingOpen, emittedChunks }
  }

  if (chunk.type === 'reasoning-end') {
    if (nextThinkingOpen) {
      nextText += '</think>'
      emittedChunks.push('</think>')
      nextThinkingOpen = false
    }

    return { nextText, nextThinkingOpen, emittedChunks }
  }

  const chunkText = getOpenAIChunkText(chunk)
  if (!chunkText) {
    return { nextText, nextThinkingOpen, emittedChunks }
  }

  if (chunk.type === 'reasoning-delta') {
    if (!nextThinkingOpen) {
      nextText += '<think>'
      emittedChunks.push('<think>')
      nextThinkingOpen = true
    }

    nextText += chunkText
    emittedChunks.push(chunkText)
    return { nextText, nextThinkingOpen, emittedChunks }
  }

  if (chunk.type === 'text-delta') {
    if (nextThinkingOpen) {
      nextText += '</think>'
      emittedChunks.push('</think>')
      nextThinkingOpen = false
    }

    nextText += chunkText
    emittedChunks.push(chunkText)
  }

  return { nextText, nextThinkingOpen, emittedChunks }
}

function normalizeOllamaBaseUrl(baseURL?: string): string {
  const trimmed = (baseURL || 'http://localhost:11434').trim().replace(/\/+$/g, '')
  return trimmed.endsWith('/v1') ? trimmed.slice(0, -3) : trimmed
}

function shouldEnableOllamaThinking(model: string, thinkingMode?: ProviderConfig['thinkingMode']): boolean {
  if (thinkingMode === 'enabled') {
    return supportsOllamaThinking(model)
  }

  if (thinkingMode === 'disabled') {
    return false
  }

  const override = process.env.LAP_ENABLE_OLLAMA_THINKING?.trim().toLowerCase() || ''

  if (override === '1' || override === 'true') {
    return supportsOllamaThinking(model)
  }

  return false
}

function mapOllamaMessages(messages: LLMMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content
  }))
}

function normalizeOllamaToolCalls(toolCalls: OllamaToolCall[] | undefined): ToolCall[] | undefined {
  if (!toolCalls?.length) return undefined

  const normalized = toolCalls.flatMap((toolCall, index) => {
    const functionName = toolCall.function?.name?.trim()
    const argumentsValue = toolCall.function?.arguments

    if (!functionName) return []

    return [{
      id: `ollama-tool-${index}`,
      name: functionName,
      arguments: argumentsValue && typeof argumentsValue === 'object' ? argumentsValue : {}
    }]
  })

  return normalized.length > 0 ? normalized : undefined
}

function mergeToolCalls(current: ToolCall[] | undefined, incoming: ToolCall[] | undefined): ToolCall[] | undefined {
  if (!incoming?.length) return current

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
    throw new Error('Ollama no devolvio un stream legible.')
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
  const think = shouldEnableOllamaThinking(model, config.thinkingMode)

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
      throw new Error((await response.text()) || `Ollama devolvio ${response.status}`)
    }

    return response
  }

  async function collectOllamaResponse(
    messages: LLMMessage[],
    abortSignal: AbortSignal,
    onToken?: (token: string) => void,
    onActivity?: () => void
  ): Promise<LLMResponse> {
    const response = await sendOllamaChatRequest(messages, Boolean(onToken), abortSignal)
    onActivity?.()
    let content = ''
    let thinkingOpen = false
    let promptTokens = 0
    let completionTokens = 0
    let toolCalls: ToolCall[] | undefined

    if (onToken) {
      for await (const chunk of iterateOllamaStream(response)) {
        onActivity?.()
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
      const timeoutController = createInactivityTimeoutController(timeouts.streamMs)

      try {
        const response = await sendOllamaChatRequest(messages, true, timeoutController.abortSignal)
        timeoutController.recordActivity()
        let content = ''
        let thinkingOpen = false

        for await (const chunk of iterateOllamaStream(response)) {
          timeoutController.recordActivity()
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
        throw normalizeInactivityTimeoutError(error, timeoutController, MODEL_TIMEOUT_MESSAGE)
      } finally {
        timeoutController.clear()
      }
    },
    async streamChat(messages: LLMMessage[], onToken: (token: string) => void): Promise<LLMResponse> {
      return runWithInactivityTimeout(
        (timeoutController) => collectOllamaResponse(
          messages,
          timeoutController.abortSignal,
          onToken,
          timeoutController.recordActivity
        ),
        timeouts.streamMs,
        MODEL_TIMEOUT_MESSAGE
      )
    },
    newContext(): AgentRuntime {
      return createOllamaRuntime(model, config, timeouts)
    }
  }
}
