'use client'

import { WorkspaceOrchestrator } from '../workspace/WorkspaceOrchestrator'
import type { PlannerViewProps } from '../workspace/types'

export default function PlanificadorPage({
  initialView = 'dayGridMonth',
  initialData = null
}: PlannerViewProps) {
  return (
    <WorkspaceOrchestrator
      viewKey="planner"
      viewProps={{ initialView, initialData }}
      contentClassName="p-0"
    />
  )
}
