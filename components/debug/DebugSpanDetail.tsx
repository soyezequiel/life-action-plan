import React, { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { t } from '../../src/i18n'
import type { DebugSpan } from '../../src/shared/types/debug'
import type { DebugTraceView } from '../../src/lib/client/use-debug-traces'
import DebugMessageInspector from './DebugMessageInspector'
import DebugTokenStream from './DebugTokenStream'

type DebugTab = 'messages' | 'stream' | 'timing' | 'raw'

interface DebugSpanDetailProps {
  trace: DebugTraceView | null
  span: DebugSpan | null
}

function renderTimingValue(value: string | number | null): string {
  if (value === null || value === '') {
    return '-'
  }

  return String(value)
}

function getMetadataNumber(span: DebugSpan, key: string): number | null {
  const value = span.metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function renderFirstTokenValue(span: DebugSpan): string {
  const timeToFirstTokenMs = getMetadataNumber(span, 'timeToFirstTokenMs')
  if (timeToFirstTokenMs !== null) {
    return t('debug.timing_first_token_value', { ms: timeToFirstTokenMs })
  }

  if (span.status === 'pending' || span.status === 'streaming') {
    return t('debug.timing_first_token_pending')
  }

  return '-'
}

export default function DebugSpanDetail({ trace, span }: DebugSpanDetailProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<DebugTab>('stream')

  useEffect(() => {
    setActiveTab('stream')
  }, [span?.spanId])

  if (!span || !trace) {
    return <p className="debug-panel__empty">{t('debug.no_selection')}</p>
  }

  const tabs: Array<{ id: DebugTab; label: string }> = [
    { id: 'messages', label: t('debug.tabs.messages') },
    { id: 'stream', label: t('debug.tabs.stream') },
    { id: 'timing', label: t('debug.tabs.timing') },
    { id: 'raw', label: t('debug.tabs.raw') }
  ]

  return (
    <section className="debug-detail">
      <header className="debug-detail__header">
        <div>
          <strong className="debug-detail__title">{span.skillName}</strong>
          <p className="debug-detail__meta">{span.provider}</p>
        </div>
        <span className={`debug-status-chip debug-status-chip--${span.status}`}>
          {t(`debug.status.${span.status}`)}
        </span>
      </header>

      <div className="debug-detail__tabs" role="tablist" aria-label={t('debug.panel_title')}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={[
              'debug-detail__tab',
              activeTab === tab.id ? 'debug-detail__tab--active' : ''
            ].join(' ')}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="debug-detail__body">
        {activeTab === 'messages' && <DebugMessageInspector messages={span.messages} />}
        {activeTab === 'stream' && <DebugTokenStream span={span} />}
        {activeTab === 'timing' && (
          <dl className="debug-timing">
            <div className="debug-timing__row">
              <dt>{t('debug.timing_skill')}</dt>
              <dd>{renderTimingValue(span.skillName)}</dd>
            </div>
            <div className="debug-timing__row">
              <dt>{t('debug.timing_provider')}</dt>
              <dd>{renderTimingValue(span.provider)}</dd>
            </div>
            <div className="debug-timing__row">
              <dt>{t('debug.timing_started')}</dt>
              <dd>{renderTimingValue(span.startedAt)}</dd>
            </div>
            <div className="debug-timing__row">
              <dt>{t('debug.timing_completed')}</dt>
              <dd>{renderTimingValue(span.completedAt)}</dd>
            </div>
            <div className="debug-timing__row">
              <dt>{t('debug.timing_duration')}</dt>
              <dd>{renderTimingValue(span.durationMs)}</dd>
            </div>
            <div className="debug-timing__row">
              <dt>{t('debug.timing_first_token')}</dt>
              <dd>{renderFirstTokenValue(span)}</dd>
            </div>
            <div className="debug-timing__row">
              <dt>{t('debug.timing_prompt_tokens')}</dt>
              <dd>{renderTimingValue(span.usage?.promptTokens ?? null)}</dd>
            </div>
            <div className="debug-timing__row">
              <dt>{t('debug.timing_completion_tokens')}</dt>
              <dd>{renderTimingValue(span.usage?.completionTokens ?? null)}</dd>
            </div>
          </dl>
        )}
        {activeTab === 'raw' && (
          <pre className="debug-detail__raw">
            {JSON.stringify({ trace, span }, null, 2)}
          </pre>
        )}
      </div>
    </section>
  )
}
