'use client'

import React from 'react'

import { WorkspaceOrchestrator } from './workspace/WorkspaceOrchestrator'
import type { SettingsViewProps } from './workspace/types'

export default function SettingsPageContent({
  section = 'wallet',
  initialWalletStatus = null,
  initialApiConfigured = false,
}: SettingsViewProps) {
  return (
    <WorkspaceOrchestrator
      viewKey="settings"
      viewProps={{
        section,
        initialWalletStatus,
        initialApiConfigured,
      }}
    />
  )
}
