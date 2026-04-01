'use client'

import { WorkspaceOrchestrator } from '../workspace/WorkspaceOrchestrator'
import type { SettingsViewProps } from '../workspace/types'

export default function ResourceProviderMockup({
  section = 'wallet',
  initialWalletStatus = null,
  initialApiConfigured = false
}: SettingsViewProps) {
  return (
    <WorkspaceOrchestrator
      viewKey="settings"
      viewProps={{ section, initialWalletStatus, initialApiConfigured }}
    />
  )
}
