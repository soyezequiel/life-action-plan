import React, { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { DateTime } from 'luxon'
import { t } from '../../src/i18n'
import type { DebugSpan } from '../../src/shared/types/debug'

interface DebugTokenStreamProps {
  span: DebugSpan
}

interface StreamSections {
  thinking: string
  answer: string
  thinkingActive: boolean
}

function getMetadataNumber(span: DebugSpan, key: string): number | null {
  const value = span.metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatSeconds(valueMs: number): string {
  return (valueMs / 1000).toFixed(valueMs >= 10_000 ? 0 : 1)
}

function splitThinkSections(content: string): StreamSections {
  if (!content) {
    return {
      thinking: '',
      answer: '',
      thinkingActive: false
    }
  }

  const thinkingParts: string[] = []
  const answerParts: string[] = []
  const tagPattern = /<\/?think>/gi
  let cursor = 0
  let inThink = false
  let match = tagPattern.exec(content)

  while (match) {
    if (match.index > cursor) {
      const chunk = content.slice(cursor, match.index)
      if (inThink) {
        thinkingParts.push(chunk)
      } else {
        answerParts.push(chunk)
      }
    }

    inThink = match[0].toLowerCase() !== '</think>'
    cursor = match.index + match[0].length
    match = tagPattern.exec(content)
  }

  if (cursor < content.length) {
    const chunk = content.slice(cursor)
    if (inThink) {
      thinkingParts.push(chunk)
    } else {
      answerParts.push(chunk)
    }
  }

  return {
    thinking: thinkingParts.join(''),
    answer: answerParts.join(''),
    thinkingActive: inThink
  }
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
  const sections = splitThinkSections(response)

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
  const timeToFirstTokenMs = getMetadataNumber(span, 'timeToFirstTokenMs')
  const waitingForFirstToken = !response && (span.status === 'pending' || span.status === 'streaming')
  const liveWaitMs = waitingForFirstToken ? Math.max(nowMs - startedMs, 0) : null
  const firstTokenLabel = timeToFirstTokenMs !== null
    ? t('debug.first_token_ready', { seconds: formatSeconds(timeToFirstTokenMs) })
    : waitingForFirstToken && liveWaitMs !== null
      ? t('debug.first_token_pending', { seconds: formatSeconds(liveWaitMs) })
      : null
  const showThinkingCursor = span.status === 'streaming' && sections.thinkingActive
  const showAnswerCursor = span.status === 'streaming' && !sections.thinkingActive
  const tokensPerSecond = durationMs > 0
    ? estimateCompletionTokens(span) / Math.max(durationMs / 1000, 0.001)
    : 0

  return (
    <div className="debug-stream">
      <div className="debug-stream__toolbar">
        <div className="debug-stream__toolbar-copy">
          {firstTokenLabel && (
            <span className="debug-stream__rate">
              {firstTokenLabel}
            </span>
          )}
          <span className="debug-stream__rate">
            {t('debug.tokens_per_second', { value: tokensPerSecond.toFixed(1) })}
          </span>
        </div>
        <button
          className="debug-panel__ghost-button"
          onClick={() => setAutoScroll((current) => !current)}
        >
          {autoScroll ? t('debug.pause_scroll') : t('debug.resume_scroll')}
        </button>
      </div>

      <div ref={containerRef} className="debug-stream__viewport">
        {response ? (
          <div className="debug-stream__sections">
            <section className="debug-stream__section debug-stream__section--thinking">
              <header className="debug-stream__section-header">
                <span className="debug-stream__section-label">{t('debug.stream_thinking_label')}</span>
              </header>
              {sections.thinking ? (
                <pre className="debug-stream__content debug-stream__content--thinking">
                  {sections.thinking}
                  {showThinkingCursor && <span className="debug-stream__cursor" aria-hidden="true" />}
                </pre>
              ) : (
                <p className="debug-stream__empty-copy">{t('debug.stream_thinking_empty')}</p>
              )}
            </section>

            <section className="debug-stream__section debug-stream__section--answer">
              <header className="debug-stream__section-header">
                <span className="debug-stream__section-label">{t('debug.stream_answer_label')}</span>
              </header>
              {sections.answer ? (
                <pre className="debug-stream__content">
                  {sections.answer}
                  {showAnswerCursor && <span className="debug-stream__cursor" aria-hidden="true" />}
                </pre>
              ) : (
                <p className="debug-stream__empty-copy">
                  {span.status === 'pending' || span.status === 'streaming'
                    ? t('debug.stream_answer_waiting')
                    : t('debug.stream_answer_empty')}
                </p>
              )}
            </section>
          </div>
        ) : waitingForFirstToken && liveWaitMs !== null ? (
          <div className="debug-panel__empty">
            <div>{t('debug.stream_waiting')}</div>
            <div>{t('debug.stream_waiting_elapsed', { seconds: formatSeconds(liveWaitMs) })}</div>
          </div>
        ) : (
          <p className="debug-panel__empty">{t('debug.stream_empty')}</p>
        )}
      </div>
    </div>
  )
}
