'use client'

import React from 'react'
import DashboardView from './views/DashboardView'
import IntakeView from './views/IntakeView'
import PlannerView from './views/PlannerView'
import SettingsView from './views/SettingsView'
import TasksView from './views/TasksView'
import type { WorkspaceViewKey, WorkspaceViewPropsMap } from './types'

interface WorkspaceViewComponentProps<K extends WorkspaceViewKey> {
  viewKey: K
  viewProps: WorkspaceViewPropsMap[K]
}

export function WorkspaceViewComponent<K extends WorkspaceViewKey>({
  viewKey,
  viewProps
}: WorkspaceViewComponentProps<K>) {
  switch (viewKey) {
    case 'dashboard':
      return <DashboardView {...(viewProps as WorkspaceViewPropsMap['dashboard'])} />
    case 'planner':
      return <PlannerView {...(viewProps as WorkspaceViewPropsMap['planner'])} />
    case 'tasks':
      return <TasksView {...(viewProps as WorkspaceViewPropsMap['tasks'])} />
    case 'intake':
      return <IntakeView {...(viewProps as WorkspaceViewPropsMap['intake'])} />
    case 'settings':
      return <SettingsView {...(viewProps as WorkspaceViewPropsMap['settings'])} />
    default:
      return null
  }
}
