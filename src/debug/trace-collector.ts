import { DateTime } from 'luxon'
import type { LLMMessage, LLMResponse } from '../lib/runtime/types'
import {
  debugEventSchema,
  debugSpanSchema,
  debugTraceSnapshotSchema,
  type DebugEvent,
  type DebugSpan,
  type DebugTraceSnapshot
} from '../shared/types/debug'

const MAX_ACTIVE_TRACES = 100
const TOKEN_BATCH_SIZE = 10
const TOKEN_BATCH_MS = 30
const TRACE_CLEANUP_MS = 5 * 60 * 1000

interface TraceState {
  traceId: string
  skillName: string
  provider: string
  startedAt: string
  metadata: Record<string, unknown>
  spans: Map<string, DebugSpan>
  completedAt: string | null
  cleanupTimer: NodeJS.Timeout | null
}

interface TokenBatchState {
  traceId: string
  spanId: string
  tokens: string[]
  timer: NodeJS.Timeout | null
}

interface DebugEventSender {
  isDestroyed?: () => boolean
  send?: (channel: string, event: DebugEvent) => void
}

function nowIso(): string {
  return DateTime.utc().toISO() ?? DateTime.utc().toFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getDurationMs(startedAt: string, completedAt: string): number {
  const started = DateTime.fromISO(startedAt)
  const completed = DateTime.fromISO(completedAt)

  if (!started.isValid || !completed.isValid) {
    return 0
  }

  return Math.max(completed.toMillis() - started.toMillis(), 0)
}

function withFirstTokenMetadata(span: DebugSpan): DebugSpan['metadata'] {
  if (typeof span.metadata.firstTokenAt === 'string') {
    return span.metadata
  }

  const firstTokenAt = nowIso()
  return {
    ...span.metadata,
    firstTokenAt,
    timeToFirstTokenMs: getDurationMs(span.startedAt, firstTokenAt)
  }
}

class TraceCollector {
  private enabled = false
  private sender: DebugEventSender | null = null
  private listeners = new Set<(event: DebugEvent) => void>()
  private activeTraces = new Map<string, TraceState>()
  private tokenBatches = new Map<string, TokenBatchState>()

  enable(sender?: DebugEventSender): void {
    this.sender = sender ?? null
    this.enabled = true
  }

  disable(): void {
    this.enabled = false
    this.sender = null
  }

  subscribe(listener: (event: DebugEvent) => void): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  listenerCount(): number {
    return this.listeners.size
  }

  clear(): void {
    this.resetState()
  }

  private resetState(): void {
    for (const trace of this.activeTraces.values()) {
      if (trace.cleanupTimer) {
        clearTimeout(trace.cleanupTimer)
      }
    }

    for (const batch of this.tokenBatches.values()) {
      if (batch.timer) {
        clearTimeout(batch.timer)
      }
    }

    this.activeTraces.clear()
    this.tokenBatches.clear()
  }

  isEnabled(): boolean {
    return this.enabled || this.listeners.size > 0
  }

  startTrace(skillName: string, provider: string, metadata: Record<string, unknown> = {}): string | null {
    this.evictOldestTraceIfNeeded()

    const traceId = crypto.randomUUID()
    const startedAt = nowIso()
    this.activeTraces.set(traceId, {
      traceId,
      skillName,
      provider,
      startedAt,
      metadata,
      spans: new Map(),
      completedAt: null,
      cleanupTimer: null
    })

    this.emitValidated({
      type: 'trace:start',
      traceId,
      spanId: null,
      timestamp: startedAt,
      data: {
        skillName,
        provider
      }
    })

    return traceId
  }

  completeTrace(traceId: string | null): void {
    if (!traceId) return

    const trace = this.activeTraces.get(traceId)
    if (!trace) return

    this.flushTraceTokens(traceId)
    trace.completedAt = nowIso()

    this.emitValidated({
      type: 'trace:complete',
      traceId,
      spanId: null,
      timestamp: trace.completedAt,
      data: {
        skillName: trace.skillName,
        provider: trace.provider
      }
    })

    this.scheduleTraceCleanup(traceId)
  }

  failTrace(traceId: string | null, error: unknown): void {
    if (!traceId) return

    const trace = this.activeTraces.get(traceId)
    if (!trace) return

    this.flushTraceTokens(traceId)
    trace.completedAt = nowIso()

    this.emitValidated({
      type: 'trace:complete',
      traceId,
      spanId: null,
      timestamp: trace.completedAt,
      data: {
        skillName: trace.skillName,
        provider: trace.provider,
        error: toErrorMessage(error)
      }
    })

    this.scheduleTraceCleanup(traceId)
  }

  startSpan(params: {
    traceId: string | null
    parentSpanId?: string | null
    skillName: string
    provider: string
    type: 'chat' | 'stream'
    messages: LLMMessage[]
    metadata?: Record<string, unknown>
  }): string | null {
    if (!params.traceId) return null

    const trace = this.activeTraces.get(params.traceId)
    if (!trace) return null

    const spanId = crypto.randomUUID()
    const span = debugSpanSchema.parse({
      traceId: params.traceId,
      spanId,
      parentSpanId: params.parentSpanId ?? null,
      skillName: params.skillName,
      provider: params.provider,
      type: params.type,
      status: 'pending',
      messages: params.messages.map((message) => ({
        role: message.role,
        content: message.content
      })),
      response: null,
      error: null,
      usage: null,
      startedAt: nowIso(),
      completedAt: null,
      durationMs: null,
      metadata: params.metadata ?? {}
    })

    trace.spans.set(spanId, span)

    this.emitValidated({
      type: 'span:start',
      traceId: params.traceId,
      spanId,
      timestamp: span.startedAt,
      data: {
        span
      }
    })

    return spanId
  }

  emitToken(traceId: string | null, spanId: string | null, token: string): void {
    if (!traceId || !spanId || !token) return

    const span = this.getSpan(traceId, spanId)
    if (!span) return

    this.updateSpan(traceId, spanId, {
      status: 'streaming',
      response: `${span.response ?? ''}${token}`,
      metadata: withFirstTokenMetadata(span)
    })

    const batch = this.tokenBatches.get(spanId) ?? {
      traceId,
      spanId,
      tokens: [],
      timer: null
    }

    batch.tokens.push(token)

    if (!batch.timer) {
      batch.timer = setTimeout(() => {
        this.flushTokenBatch(spanId)
      }, TOKEN_BATCH_MS)
    }

    this.tokenBatches.set(spanId, batch)

    if (batch.tokens.length >= TOKEN_BATCH_SIZE) {
      this.flushTokenBatch(spanId)
    }
  }

  completeSpan(traceId: string | null, spanId: string | null, response: LLMResponse): void {
    if (!traceId || !spanId) return

    this.flushTokenBatch(spanId)

    const nextSpan = this.buildCompletedSpan(traceId, spanId, {
      status: 'completed',
      response: response.content,
      error: null,
      usage: response.usage
    })

    if (!nextSpan) return

    this.emitValidated({
      type: 'span:complete',
      traceId,
      spanId,
      timestamp: nextSpan.completedAt ?? nowIso(),
      data: {
        span: nextSpan
      }
    })
  }

  failSpan(traceId: string | null, spanId: string | null, error: unknown): void {
    if (!traceId || !spanId) return

    this.flushTokenBatch(spanId)

    const nextSpan = this.buildCompletedSpan(traceId, spanId, {
      status: 'error',
      error: toErrorMessage(error),
      usage: null
    })

    if (!nextSpan) return

    this.emitValidated({
      type: 'span:error',
      traceId,
      spanId,
      timestamp: nextSpan.completedAt ?? nowIso(),
      data: {
        span: nextSpan,
        error: nextSpan.error ?? toErrorMessage(error)
      }
    })
  }

  getSnapshot(): DebugTraceSnapshot[] {
    return Array.from(this.activeTraces.values())
      .map((trace) => debugTraceSnapshotSchema.parse({
        traceId: trace.traceId,
        skillName: trace.skillName,
        provider: trace.provider,
        startedAt: trace.startedAt,
        completedAt: trace.completedAt,
        error: Array.from(trace.spans.values()).find((span) => span.status === 'error')?.error ?? null,
        metadata: trace.metadata,
        spans: Array.from(trace.spans.values()).sort((left, right) => (
          DateTime.fromISO(right.startedAt).toMillis() - DateTime.fromISO(left.startedAt).toMillis()
        ))
      }))
      .sort((left, right) => DateTime.fromISO(right.startedAt).toMillis() - DateTime.fromISO(left.startedAt).toMillis())
  }

  private evictOldestTraceIfNeeded(): void {
    if (this.activeTraces.size < MAX_ACTIVE_TRACES) {
      return
    }

    const oldestTraceId = this.activeTraces.keys().next().value as string | undefined

    if (oldestTraceId) {
      this.dropTrace(oldestTraceId)
    }
  }

  private scheduleTraceCleanup(traceId: string): void {
    const trace = this.activeTraces.get(traceId)
    if (!trace) return

    if (trace.cleanupTimer) {
      clearTimeout(trace.cleanupTimer)
    }

    trace.cleanupTimer = setTimeout(() => {
      this.dropTrace(traceId)
    }, TRACE_CLEANUP_MS)
  }

  private dropTrace(traceId: string): void {
    const trace = this.activeTraces.get(traceId)
    if (!trace) return

    if (trace.cleanupTimer) {
      clearTimeout(trace.cleanupTimer)
    }

    for (const spanId of trace.spans.keys()) {
      this.flushTokenBatch(spanId)
      this.tokenBatches.delete(spanId)
    }

    this.activeTraces.delete(traceId)
  }

  private flushTraceTokens(traceId: string): void {
    const trace = this.activeTraces.get(traceId)
    if (!trace) return

    for (const spanId of trace.spans.keys()) {
      this.flushTokenBatch(spanId)
    }
  }

  private flushTokenBatch(spanId: string): void {
    const batch = this.tokenBatches.get(spanId)
    if (!batch) return

    if (batch.timer) {
      clearTimeout(batch.timer)
    }

    if (batch.tokens.length > 0) {
      this.emitValidated({
        type: 'span:token',
        traceId: batch.traceId,
        spanId: batch.spanId,
        timestamp: nowIso(),
        data: {
          tokens: [...batch.tokens]
        }
      })
    }

    this.tokenBatches.delete(spanId)
  }

  private buildCompletedSpan(
    traceId: string,
    spanId: string,
    updates: Partial<Pick<DebugSpan, 'status' | 'response' | 'error' | 'usage'>>
  ): DebugSpan | null {
    const span = this.getSpan(traceId, spanId)
    if (!span) return null

    const completedAt = nowIso()
    return this.updateSpan(traceId, spanId, {
      ...updates,
      completedAt,
      durationMs: getDurationMs(span.startedAt, completedAt)
    })
  }

  private getSpan(traceId: string, spanId: string): DebugSpan | null {
    const trace = this.activeTraces.get(traceId)
    if (!trace) return null

    return trace.spans.get(spanId) ?? null
  }

  private updateSpan(traceId: string, spanId: string, updates: Partial<DebugSpan>): DebugSpan | null {
    const trace = this.activeTraces.get(traceId)
    const currentSpan = trace?.spans.get(spanId)

    if (!trace || !currentSpan) {
      return null
    }

    const nextSpan = debugSpanSchema.parse({
      ...currentSpan,
      ...updates
    })

    trace.spans.set(spanId, nextSpan)
    return nextSpan
  }

  private emitValidated(event: DebugEvent): void {
    if (!this.isEnabled()) return

    if (typeof this.sender?.isDestroyed === 'function' && this.sender.isDestroyed()) {
      this.enabled = false
      this.sender = null
    }

    try {
      const validatedEvent = debugEventSchema.parse(event)
      if (typeof this.sender?.send === 'function') {
        this.sender.send('debug:event', validatedEvent)
      }

      for (const listener of this.listeners) {
        listener(validatedEvent)
      }
    } catch (error) {
      console.error('[LAP] debug emitValidated failed:', error instanceof Error ? error.message : error)
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __lapTraceCollector: TraceCollector | undefined
}

if (!globalThis.__lapTraceCollector) {
  globalThis.__lapTraceCollector = new TraceCollector()
}

export const traceCollector: TraceCollector = globalThis.__lapTraceCollector
