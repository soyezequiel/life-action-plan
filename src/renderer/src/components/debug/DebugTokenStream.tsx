import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { DateTime } from 'luxon'
import { t } from '../../../../i18n'
import type { DebugSpan } from '../../../../shared/types/ipc'

interface DebugTokenStreamProps {
  span: DebugSpan
}

interface TextSegment {
  text: string
  isThink: boolean
}

function splitThinkSegments(content: string): TextSegment[] {
  if (!content) {
    return []
  }

  const segments: TextSegment[] = []
  const tagPattern = /<\/?think>/gi
  let cursor = 0
  let inThink = false
  let match = tagPattern.exec(content)

  while (match) {
    if (match.index > cursor) {
      segments.push({
        text: content.slice(cursor, match.index),
        isThink: inThink
      })
    }

    segments.push({
      text: match[0],
      isThink: true
    })

    inThink = match[0].toLowerCase() !== '</think>'
    cursor = match.index + match[0].length
    match = tagPattern.exec(content)
  }

  if (cursor < content.length) {
    segments.push({
      text: content.slice(cursor),
      isThink: inThink
    })
  }

  return segments
}

function estimateCompletionTokens(span: DebugSpan): number {
  if (span.usage?.completionTokens) {
    return span.usage.completionTokens
  }

  if (!span.response) {
    return 0
  }

  return span.response
    .split(/\s+/)
    .filter(Boolean)
    .length
}

export default function DebugTokenStream({ span }: DebugTokenStreamProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [nowMs, setNowMs] = useState(DateTime.now().toMillis())
  const response = span.response ?? ''
  const segments = splitThinkSegments(response)

  useEffect(() => {
    if (span.status !== 'streaming') {
      return
    }

    const timer = window.setInterval(() => {
      setNowMs(DateTime.now().toMillis())
    }, 250)

    return () => {
      window.clearInterval(timer)
    }
  }, [span.status])

  useEffect(() => {
    if (!autoScroll || !containerRef.current) {
      return
    }

    containerRef.current.scrollTop = containerRef.current.scrollHeight
  }, [autoScroll, response, span.status])

  const startedMs = DateTime.fromISO(span.startedAt).toMillis()
  const durationMs = span.durationMs ?? Math.max(nowMs - startedMs, 0)
  const tokensPerSecond = durationMs > 0
    ? estimateCompletionTokens(span) / Math.max(durationMs / 1000, 0.001)
    : 0

  return (
    <div className="debug-stream">
      <div className="debug-stream__toolbar">
        <span className="debug-stream__rate">
          {t('debug.tokens_per_second', { value: tokensPerSecond.toFixed(1) })}
        </span>
        <button
          className="debug-panel__ghost-button"
          onClick={() => setAutoScroll((current) => !current)}
        >
          {autoScroll ? t('debug.pause_scroll') : t('debug.resume_scroll')}
        </button>
      </div>

      <div ref={containerRef} className="debug-stream__viewport">
        {response ? (
          <pre className="debug-stream__content">
            {segments.map((segment, index) => (
              <span
                key={`${segment.text.slice(0, 12)}-${index}`}
                className={segment.isThink ? 'debug-stream__token debug-stream__token--think' : 'debug-stream__token'}
              >
                {segment.text}
              </span>
            ))}
            {span.status === 'streaming' && <span className="debug-stream__cursor" aria-hidden="true" />}
          </pre>
        ) : (
          <p className="debug-panel__empty">{t('debug.stream_empty')}</p>
        )}
      </div>
    </div>
  )
}
