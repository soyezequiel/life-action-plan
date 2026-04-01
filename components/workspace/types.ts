'use client'

import type { DashboardSummaryResult, ProgressRow, WalletStatus } from '@/src/shared/types/lap-api'
import type { ReactNode } from 'react'

export type WorkspaceViewKey = 'dashboard' | 'planner' | 'tasks' | 'intake' | 'settings'

export interface WorkspaceTopTab {
  label: string
  active?: boolean
  href?: string
  onClick?: () => void
}

export interface DashboardViewProps {
  initialData?: DashboardSummaryResult | null
}

export interface PlannerViewProps {
  initialView?: 'multiMonthYear' | 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'
  initialData?: {
    activePlan: import('@/src/shared/types/lap-api').PlanRow | null
    tasks: ProgressRow[]
  } | null
}

export interface TasksViewProps {
  initialTasks?: ProgressRow[]
}

export interface IntakeViewProps {
  onCancel?: () => void
  onComplete?: (profileId: string, planId: string) => void | Promise<void>
}

export interface SettingsViewProps {
  section?: 'backend' | 'wallet'
  initialWalletStatus?: WalletStatus | null
  initialApiConfigured?: boolean
}

export interface WorkspaceViewPropsMap {
  dashboard: DashboardViewProps
  planner: PlannerViewProps
  tasks: TasksViewProps
  intake: IntakeViewProps
  settings: SettingsViewProps
}

export interface WorkspaceOrchestratorProps<K extends WorkspaceViewKey = WorkspaceViewKey> {
  viewKey: K
  viewProps: WorkspaceViewPropsMap[K]
  sidebarLabel?: string
  topLeft?: ReactNode
  topTabs?: WorkspaceTopTab[]
  topRight?: ReactNode
  contentClassName?: string
}

export interface WorkspaceNavItem {
  key: WorkspaceViewKey
  label: string
  icon: string
  href: string
  active: boolean
}

export interface WorkspaceRouteSpec {
  key: WorkspaceViewKey
  label: string
  icon: string
  href: string
  visibleIn: Array<'SETUP' | 'PLAN' | 'READY'>
}
