import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { DateTime } from 'luxon'
import { getCurrentLocale, t } from '../../src/i18n'
import type { DebugTraceView } from '../../src/lib/client/use-debug-traces'

interface DebugTraceListProps {
  traces: DebugTraceView[]
  selectedSpanId: string | null
  onSelectSpan: (spanId: string) => void
}

function formatDuration(durationMs: number | null, startedAt: string, nowMs: number): string {
  if (durationMs !== null) {
    if (durationMs < 1000) {
      return `${durationMs}ms`
    }

    if (durationMs < 60_000) {
      return `${(durationMs / 1000).toFixed(1)}s`
    }

    const minutes = Math.floor(durationMs / 60_000)
    const seconds = Math.floor((durationMs % 60_000) / 1000)
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  }

  const started = DateTime.fromISO(startedAt).toMillis()
  return formatDuration(Math.max(nowMs - started, 0), startedAt, nowMs)
}

function formatRelativeTimestamp(value: string): string {
  const relative = DateTime.fromISO(value)
    .setLocale(getCurrentLocale())
    .toRelative()

  return relative ?? value
}

export default function DebugTraceList({
  traces,
  selectedSpanId,
  onSelectSpan
}: DebugTraceListProps): JSX.Element {
  const [nowMs, setNowMs] = useState(DateTime.now().toMillis())
  const hasStreamingTrace = traces.some((trace) => trace.spans.some((span) => span.status === 'streaming'))

  useEffect(() => {
    if (!hasStreamingTrace) {
      return
    }

    const timer = window.setInterval(() => {
      setNowMs(DateTime.now().toMillis())
    }, 250)

    return () => {
      window.clearInterval(timer)
    }
  }, [hasStreamingTrace])

  if (traces.length === 0) {
    return <p className="debug-panel__empty">{t('debug.no_traces')}</p>
  }

  return (
    <div className="debug-trace-list">
      {traces.map((trace) => (
        <section key={trace.traceId} className="debug-trace-list__group">
          <header className="debug-trace-list__group-header">
            <strong>{trace.skillName || trace.provider}</strong>
            <span>{formatRelativeTimestamp(trace.startedAt)}</span>
          </header>

          <div className="debug-trace-list__rows">
            {trace.spans.map((span) => (
              <button
                key={span.spanId}
                className={[
                  'debug-trace-list__row',
                  selectedSpanId === span.spanId ? 'debug-trace-list__row--active' : ''
                ].join(' ')}
                onClick={() => onSelectSpan(span.spanId)}
              >
                <span className={`debug-trace-list__status debug-trace-list__status--${span.status}`} aria-hidden="true" />
                <div className="debug-trace-list__copy">
                  <strong className="debug-trace-list__title">{span.skillName}</strong>
                  <span className="debug-trace-list__provider">{span.provider}</span>
                </div>
                <div className="debug-trace-list__metrics">
                  <span>{formatDuration(span.durationMs, span.startedAt, nowMs)}</span>
                  <span>{formatRelativeTimestamp(span.startedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
