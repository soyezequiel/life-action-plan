'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import { t } from '@/src/i18n'
import type { WorkspaceViewKey, WorkspaceViewPropsMap } from './types'

const viewLoadingFallback = (
  <div className="rounded-[28px] border border-[rgba(31,41,55,0.08)] bg-[rgba(255,253,249,0.88)] p-6 text-slate-500 shadow-[0_22px_46px_-24px_rgba(17,24,39,0.18)] backdrop-blur-2xl">
    {t('ui.loading')}
  </div>
)

const DashboardView = dynamic(() => import('./views/DashboardView'), {
  loading: () => viewLoadingFallback,
})

const IntakeView = dynamic(() => import('./views/IntakeView'), {
  loading: () => viewLoadingFallback,
})

const PlannerView = dynamic(() => import('./views/PlannerView'), {
  loading: () => viewLoadingFallback,
})

const SettingsView = dynamic(() => import('./views/SettingsView'), {
  loading: () => viewLoadingFallback,
})

const TasksView = dynamic(() => import('./views/TasksView'), {
  loading: () => viewLoadingFallback,
})

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
