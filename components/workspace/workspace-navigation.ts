import { t } from '@/src/i18n'
import type { OnboardingStep } from '@/src/lib/client/use-user-status'

import type { WorkspaceNavItem, WorkspaceRouteSpec, WorkspaceViewKey } from './types'

const WORKSPACE_ROUTE_SPECS: WorkspaceRouteSpec[] = [
  {
    key: 'dashboard',
    label: t('mockups.common.nav.dashboard'),
    icon: 'dashboard',
    href: '/',
    visibleIn: ['READY']
  },
  {
    key: 'planner',
    label: t('mockups.common.nav.planificador'),
    icon: 'calendar_today',
    href: '/plan',
    visibleIn: ['READY']
  },
  {
    key: 'tasks',
    label: t('mockups.common.nav.tareas'),
    icon: 'check_circle',
    href: '/tasks',
    visibleIn: ['READY']
  },
  {
    key: 'intake',
    label: t('mockups.common.nav.intake'),
    icon: 'flag',
    href: '/intake',
    visibleIn: ['PLAN', 'READY']
  },
  {
    key: 'settings',
    label: t('mockups.common.nav.settings'),
    icon: 'settings',
    href: '/settings',
    visibleIn: ['SETUP', 'PLAN', 'READY']
  }
]

export function resolveWorkspaceNavigation(
  onboardingStep: OnboardingStep,
  activeViewKey: WorkspaceViewKey
): WorkspaceNavItem[] {
  if (onboardingStep === 'LOADING') {
    return []
  }

  return WORKSPACE_ROUTE_SPECS
    .filter((route) => route.visibleIn.includes(onboardingStep))
    .map((route) => ({
      key: route.key,
      label: route.label,
      icon: route.icon,
      href: route.href,
      active: route.key === activeViewKey
    }))
}
