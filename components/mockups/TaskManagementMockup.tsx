'use client'

import { WorkspaceOrchestrator } from '../workspace/WorkspaceOrchestrator'
import type { TasksViewProps } from '../workspace/types'

export default function TaskManagementMockup({ initialTasks }: TasksViewProps) {
  return (
    <WorkspaceOrchestrator
      viewKey="tasks"
      viewProps={{ initialTasks }}
    />
  )
}
