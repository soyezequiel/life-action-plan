'use client'

import React from 'react'

import { WorkspaceOrchestrator } from './workspace/WorkspaceOrchestrator'
import type { IntakeViewProps } from './workspace/types'

export default function IntakeExpress({ onComplete, onCancel }: IntakeViewProps) {
  return (
    <WorkspaceOrchestrator
      viewKey="intake"
      viewProps={{ onComplete, onCancel }}
      contentClassName="p-0"
    />
  )
}
