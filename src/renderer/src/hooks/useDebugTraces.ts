import { useEffect, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import type { DebugEvent, DebugSpan, DebugTraceSnapshot } from '../../../shared/types/ipc'
import { useLapClient } from '../app-services'

const MAX_RENDERER_TRACES = 50

export interface DebugTraceView {
  traceId: string
  skillName: string
  provider: string
  startedAt: string
  completedAt: string | null
  error: string | null
  spans: DebugSpan[]
}

function trimTraces(traces: DebugTraceView[]): DebugTraceView[] {
  return traces.slice(0, MAX_RENDERER_TRACES)
}

function upsertTrace(
  traces: DebugTraceView[],
  traceId: string,
  buildNext: (current: DebugTraceView | null) => DebugTraceView
): DebugTraceView[] {
  const current = traces.find((trace) => trace.traceId === traceId) ?? null
  const nextTrace = buildNext(current)
  const nextTraces = [nextTrace, ...traces.filter((trace) => trace.traceId !== traceId)]
  return trimTraces(nextTraces)
}

function upsertSpan(trace: DebugTraceView, span: DebugSpan): DebugTraceView {
  return {
    ...trace,
    skillName: trace.skillName || span.skillName,
    provider: span.provider,
    spans: [span, ...trace.spans.filter((item) => item.spanId !== span.spanId)]
  }
}

function mergeSnapshotTrace(trace: DebugTraceView | null, snapshot: DebugTraceSnapshot): DebugTraceView {
  const spanMap = new Map<string, DebugSpan>()

  for (const span of trace?.spans ?? []) {
    spanMap.set(span.spanId, span)
  }

  for (const span of snapshot.spans) {
    spanMap.set(span.spanId, span)
  }

  return {
    traceId: snapshot.traceId,
    skillName: snapshot.skillName || trace?.skillName || '',
    provider: snapshot.provider || trace?.provider || '',
    startedAt: snapshot.startedAt || trace?.startedAt || '',
    completedAt: snapshot.completedAt ?? trace?.completedAt ?? null,
    error: snapshot.error ?? trace?.error ?? null,
    spans: Array.from(spanMap.values()).sort((left, right) => (
      DateTime.fromISO(right.startedAt).toMillis() - DateTime.fromISO(left.startedAt).toMillis()
    ))
  }
}

function appendTokensToSpan(trace: DebugTraceView, spanId: string, appendedText: string): DebugTraceView {
  return {
    ...trace,
    spans: trace.spans.map((span) => (
      span.spanId === spanId
        ? {
            ...span,
            status: span.status === 'pending' ? 'streaming' : span.status,
            response: `${span.response ?? ''}${appendedText}`
          }
        : span
    ))
  }
}

function applyEvent(traces: DebugTraceView[], event: DebugEvent): DebugTraceView[] {
  if (event.type === 'trace:start') {
    return upsertTrace(traces, event.traceId, (current) => ({
      traceId: event.traceId,
      skillName: event.data.skillName ?? current?.skillName ?? '',
      provider: event.data.provider ?? current?.provider ?? '',
      startedAt: current?.startedAt ?? event.timestamp,
      completedAt: current?.completedAt ?? null,
      error: current?.error ?? null,
      spans: current?.spans ?? []
    }))
  }

  if (event.type === 'trace:complete') {
    return upsertTrace(traces, event.traceId, (current) => ({
      traceId: event.traceId,
      skillName: event.data.skillName ?? current?.skillName ?? '',
      provider: event.data.provider ?? current?.provider ?? '',
      startedAt: current?.startedAt ?? event.timestamp,
      completedAt: event.timestamp,
      error: event.data.error ?? current?.error ?? null,
      spans: current?.spans ?? []
    }))
  }

  if ((event.type === 'span:start' || event.type === 'span:complete' || event.type === 'span:error') && event.data.span) {
    const span = event.data.span

    return upsertTrace(traces, event.traceId, (current) => {
      const baseTrace: DebugTraceView = current ?? {
        traceId: event.traceId,
        skillName: span.skillName,
        provider: span.provider,
        startedAt: span.startedAt,
        completedAt: null,
        error: null,
        spans: []
      }

      return {
        ...upsertSpan(baseTrace, span),
        error: event.type === 'span:error'
          ? event.data.error ?? span.error ?? baseTrace.error
          : baseTrace.error
      }
    })
  }

  return traces
}

function findSpanInTraces(traces: DebugTraceView[], spanId: string | null): DebugSpan | null {
  if (!spanId) {
    return null
  }

  for (const trace of traces) {
    const span = trace.spans.find((item) => item.spanId === spanId)
    if (span) {
      return span
    }
  }

  return null
}

function findTraceForSpan(traces: DebugTraceView[], spanId: string | null): DebugTraceView | null {
  if (!spanId) {
    return null
  }

  return traces.find((trace) => trace.spans.some((item) => item.spanId === spanId)) ?? null
}

export function useDebugTraces() {
  const client = useLapClient()
  const [traces, setTraces] = useState<DebugTraceView[]>([])
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)
  const tracesRef = useRef<DebugTraceView[]>([])
  const pendingTokensRef = useRef(new Map<string, { traceId: string; text: string }>())
  const flushTimerRef = useRef<number | null>(null)
  const flushFrameRef = useRef<number | null>(null)
  const snapshotInFlightRef = useRef(false)

  function updateTraces(updater: (currentTraces: DebugTraceView[]) => DebugTraceView[]): void {
    setTraces((currentTraces) => {
      const nextTraces = updater(currentTraces)
      tracesRef.current = nextTraces
      return nextTraces
    })
  }

  useEffect(() => {
    let isActive = true
    const snapshotTimerIds: number[] = []

    function flushPendingTokens(): void {
      const pendingEntries = Array.from(pendingTokensRef.current.entries())
      pendingTokensRef.current.clear()

      updateTraces((currentTraces) => {
        let nextTraces = currentTraces

        for (const [spanId, entry] of pendingEntries) {
          nextTraces = upsertTrace(nextTraces, entry.traceId, (trace) => {
            const baseTrace: DebugTraceView = trace ?? {
              traceId: entry.traceId,
              skillName: '',
              provider: '',
              startedAt: '',
              completedAt: null,
              error: null,
              spans: []
            }

            return appendTokensToSpan(baseTrace, spanId, entry.text)
          })
        }

        return nextTraces
      })
    }

    async function syncSnapshot(): Promise<void> {
      if (!isActive || snapshotInFlightRef.current) {
        return
      }

      snapshotInFlightRef.current = true

      try {
        const snapshot = await client.debug.snapshot()

        if (!isActive) {
          return
        }

        updateTraces((currentTraces) => {
          let nextTraces = currentTraces

          for (const trace of snapshot.traces) {
            nextTraces = upsertTrace(nextTraces, trace.traceId, (current) => mergeSnapshotTrace(current, trace))
          }

          return nextTraces
        })

        setSelectedSpanId((currentSpanId) => currentSpanId ?? snapshot.traces[0]?.spans[0]?.spanId ?? null)
      } catch {
        // Keep the panel usable even if the browser snapshot endpoint blips during startup.
      } finally {
        snapshotInFlightRef.current = false
      }
    }

    function scheduleTokenFlush(): void {
      if (flushTimerRef.current !== null || flushFrameRef.current !== null) {
        return
      }

      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null
        flushFrameRef.current = window.requestAnimationFrame(() => {
          flushFrameRef.current = null
          flushPendingTokens()
        })
      }, 50)
    }

    const unsubscribe = client.debug.onEvent((event) => {
      if (event.type === 'span:token' && event.spanId) {
        const nextText = (event.data.tokens ?? (event.data.token ? [event.data.token] : [])).join('')
        if (!nextText) {
          return
        }

        const spanKnown = tracesRef.current.some((trace) => trace.spans.some((span) => span.spanId === event.spanId))

        if (!spanKnown) {
          void syncSnapshot()
        }

        const current = pendingTokensRef.current.get(event.spanId)
        pendingTokensRef.current.set(event.spanId, {
          traceId: event.traceId,
          text: `${current?.text ?? ''}${nextText}`
        })
        scheduleTokenFlush()
        return
      }

      updateTraces((currentTraces) => applyEvent(currentTraces, event))

      if (event.data.span) {
        setSelectedSpanId((currentSpanId) => currentSpanId ?? event.data.span?.spanId ?? null)
      }
    })

    void syncSnapshot()

    for (const delayMs of [250, 1000]) {
      snapshotTimerIds.push(window.setTimeout(() => {
        void syncSnapshot()
      }, delayMs))
    }

    return () => {
      isActive = false
      unsubscribe()

      for (const timerId of snapshotTimerIds) {
        window.clearTimeout(timerId)
      }

      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
      }

      if (flushFrameRef.current !== null) {
        window.cancelAnimationFrame(flushFrameRef.current)
      }

      pendingTokensRef.current.clear()
      snapshotInFlightRef.current = false
    }
  }, [client])

  useEffect(() => {
    const selectedSpan = findSpanInTraces(traces, selectedSpanId)

    if (selectedSpan) {
      return
    }

    const fallbackSpanId = traces[0]?.spans[0]?.spanId ?? null
    if (fallbackSpanId !== selectedSpanId) {
      setSelectedSpanId(fallbackSpanId)
    }
  }, [selectedSpanId, traces])

  return {
    traces,
    selectedSpanId,
    selectedSpan: findSpanInTraces(traces, selectedSpanId),
    selectedTrace: findTraceForSpan(traces, selectedSpanId),
    setSelectedSpanId,
    clearTraces: () => {
      pendingTokensRef.current.clear()
      tracesRef.current = []
      setSelectedSpanId(null)
      setTraces([])
    }
  }
}
