'use client'

import { WorkspaceOrchestrator } from '../workspace/WorkspaceOrchestrator'
import type { IntakeViewProps } from '../workspace/types'

export default function IntakeMockup({ onComplete, onCancel }: IntakeViewProps) {
  return (
    <WorkspaceOrchestrator
      viewKey="intake"
      viewProps={{ onComplete, onCancel }}
      contentClassName="p-0"
    />
  )
}
