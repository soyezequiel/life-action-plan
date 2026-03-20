import React from 'react'
import type { JSX } from 'react'
import { DateTime } from 'luxon'
import { getCurrentLocale, t } from '../../src/i18n'
import type { DebugSnapshotState } from '../../src/lib/client/use-debug-traces'

interface DebugPanelStatusProps {
  snapshotState: DebugSnapshotState
  lastUpdatedAt: string | null
}

function formatRelativeTimestamp(value: string | null): string {
  if (!value) {
    return t('debug.snapshot_ready')
  }

  const relative = DateTime.fromISO(value)
    .setLocale(getCurrentLocale())
    .toRelative()

  return t('debug.snapshot_ready_at', {
    date: relative ?? value
  })
}

export default function DebugPanelStatus({
  snapshotState,
  lastUpdatedAt
}: DebugPanelStatusProps): JSX.Element {
  if (snapshotState === 'error') {
    return <p className="debug-panel__status debug-panel__status--error">{t('debug.snapshot_error')}</p>
  }

  if (snapshotState === 'loading') {
    return <p className="debug-panel__status">{t('debug.snapshot_connecting')}</p>
  }

  return <p className="debug-panel__status">{formatRelativeTimestamp(lastUpdatedAt)}</p>
}
