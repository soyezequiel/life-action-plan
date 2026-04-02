'use client'

import React from 'react'

import { WorkspaceOrchestrator } from './workspace/WorkspaceOrchestrator'
import type { TasksViewProps } from './workspace/types'

export default function TasksPageContent({ initialTasks }: TasksViewProps) {
  return (
    <WorkspaceOrchestrator
      viewKey="tasks"
      viewProps={{ initialTasks }}
    />
  )
}
