'use client'

import React from 'react'
import type { DeploymentMode } from '@/src/lib/env/deployment'

import { WorkspaceOrchestrator } from './workspace/WorkspaceOrchestrator'
import type { DashboardViewProps } from './workspace/types'

interface DashboardProps extends DashboardViewProps {
  deploymentMode?: DeploymentMode
}

export default function Dashboard({ deploymentMode, initialData = null }: DashboardProps) {
  void deploymentMode

  return (
    <WorkspaceOrchestrator
      viewKey="dashboard"
      viewProps={{ initialData }}
    />
  )
}
