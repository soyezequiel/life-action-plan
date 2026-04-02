import { t } from '@/src/i18n'
import type { OnboardingStep } from '@/src/lib/client/use-user-status'

import type { WorkspaceNavItem, WorkspaceRouteSpec, WorkspaceViewKey } from './types'

const WORKSPACE_ROUTE_SPECS: WorkspaceRouteSpec[] = [
  {
    key: 'dashboard',
    label: t('workspace.nav.dashboard'),
    icon: 'dashboard',
    href: '/',
    visibleIn: ['READY']
  },
  {
    key: 'planner',
    label: t('workspace.nav.planner'),
    icon: 'calendar_today',
    href: '/plan',
    visibleIn: ['READY']
  },
  {
    key: 'tasks',
    label: t('workspace.nav.tasks'),
    icon: 'check_circle',
    href: '/tasks',
    visibleIn: ['READY']
  },
  {
    key: 'intake',
    label: t('workspace.nav.intake'),
    icon: 'flag',
    href: '/intake',
    visibleIn: ['PLAN', 'READY']
  },
  {
    key: 'settings',
    label: t('workspace.nav.settings'),
    icon: 'settings',
    href: '/settings',
    visibleIn: ['SETUP', 'PLAN', 'READY']
  }
]

export function resolveWorkspaceNavigation(
  onboardingStep: OnboardingStep,
  activeViewKey: WorkspaceViewKey
): WorkspaceNavItem[] {
  const visibleOnStep = onboardingStep === 'LOADING' ? 'READY' : onboardingStep

  return WORKSPACE_ROUTE_SPECS
    .filter((route) => route.visibleIn.includes(visibleOnStep))
    .map((route) => ({
      key: route.key,
      label: route.label,
      icon: route.icon,
      href: route.href,
      active: route.key === activeViewKey
    }))
}
