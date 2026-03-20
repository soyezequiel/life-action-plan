'use client'

import { useEffect, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import type { DebugSpan, DebugTraceSnapshot } from '../../shared/types/debug'
import { useLapClient } from './app-services'

const POLL_INTERVAL_MS = 1200
const MAX_RENDERER_TRACES = 50

export type DebugTraceView = DebugTraceSnapshot
export type DebugSnapshotState = 'loading' | 'ready' | 'error'

function trimTraces(traces: DebugTraceView[]): DebugTraceView[] {
  return traces.slice(0, MAX_RENDERER_TRACES)
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
  const [snapshotState, setSnapshotState] = useState<DebugSnapshotState>('loading')
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const isActiveRef = useRef(true)

  useEffect(() => {
    isActiveRef.current = true

    async function syncSnapshot(): Promise<void> {
      try {
        const snapshot = await client.debug.snapshot()

        if (!isActiveRef.current) {
          return
        }

        setTraces(trimTraces([...snapshot.traces].sort((left, right) => (
          DateTime.fromISO(right.startedAt).toMillis() - DateTime.fromISO(left.startedAt).toMillis()
        ))))
        setSnapshotState('ready')
        setLastUpdatedAt(DateTime.now().toISO())
      } catch {
        if (!isActiveRef.current) {
          return
        }

        setSnapshotState('error')
      }
    }

    void syncSnapshot()
    const timer = window.setInterval(() => {
      void syncSnapshot()
    }, POLL_INTERVAL_MS)

    return () => {
      isActiveRef.current = false
      window.clearInterval(timer)
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
    snapshotState,
    lastUpdatedAt,
    setSelectedSpanId,
    clearTraces: async () => {
      setSelectedSpanId(null)
      setTraces([])
      try {
        await client.debug.clear()
        setSnapshotState('loading')
        setLastUpdatedAt(DateTime.now().toISO())
      } catch {
        setSnapshotState('error')
      }
    }
  }
}
