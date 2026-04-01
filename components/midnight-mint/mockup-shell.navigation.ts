import type { OnboardingStep } from '@/src/lib/client/use-user-status'
import { t } from '@/src/i18n'

import type { MockupNavItem } from './mockup-shell.types'

interface ResolveMockupNavigationOptions {
  onboardingStep: OnboardingStep
  pathname: string | null
  variant: string | null
  sidebarNav?: MockupNavItem[]
  sidebarFooter?: MockupNavItem[]
  onLogout: () => void
}

interface ResolvedMockupNavigation {
  navItems: MockupNavItem[]
  footerItems: MockupNavItem[]
  currentSectionLabel: string
}

function deriveItemActive(item: MockupNavItem, pathname: string | null, variant: string | null): boolean {
  if (typeof item.active === 'boolean') {
    return item.active
  }

  if (!item.href || !pathname) {
    return false
  }

  const [hrefPath, rawQuery = ''] = item.href.split('?')
  const hrefParams = new URLSearchParams(rawQuery)
  const hrefVariant = hrefParams.get('variant')

  if (hrefPath === '/') {
    return pathname === '/' && !variant
  }

  if (hrefPath === '/flow') {
    return hrefVariant ? pathname === '/flow' && variant === hrefVariant : pathname === '/flow'
  }

  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`)
}

function withResolvedActive(items: MockupNavItem[], pathname: string | null, variant: string | null): MockupNavItem[] {
  return items.map((item) => ({
    ...item,
    active: deriveItemActive(item, pathname, variant)
  }))
}

function buildCanonicalNavigation(
  onboardingStep: OnboardingStep,
  pathname: string | null,
  variant: string | null
): MockupNavItem[] {
  const isDashboard = pathname === '/' && !variant
  const isTasks = pathname === '/flow' && variant === 'tasks'
  const isPlan = pathname?.startsWith('/plan') ?? false
  const isIntake = pathname?.startsWith('/intake') ?? false
  const isSettings = pathname?.startsWith('/settings') ?? false

  const settingsItem: MockupNavItem = {
    label: t('mockups.common.nav.settings'),
    icon: 'settings',
    href: '/settings',
    active: isSettings
  }

  if (onboardingStep === 'SETUP') {
    return [settingsItem]
  }

  if (onboardingStep === 'PLAN') {
    return [
      { label: t('mockups.common.nav.intake'), icon: 'flag', href: '/intake', active: isIntake },
      settingsItem
    ]
  }

  return [
    { label: t('mockups.common.nav.dashboard'), icon: 'dashboard', href: '/', active: isDashboard },
    { label: t('mockups.common.nav.planificador'), icon: 'calendar_today', href: '/plan?view=week', active: isPlan },
    { label: t('mockups.common.nav.tareas'), icon: 'check_circle', href: '/flow?variant=tasks', active: isTasks },
    { label: t('mockups.common.nav.intake'), icon: 'flag', href: '/intake', active: isIntake },
    settingsItem
  ]
}

export function resolveMockupNavigation({
  onboardingStep,
  pathname,
  variant,
  sidebarNav,
  sidebarFooter,
  onLogout
}: ResolveMockupNavigationOptions): ResolvedMockupNavigation {
  const navItems = sidebarNav
    ? withResolvedActive(sidebarNav, pathname, variant)
    : buildCanonicalNavigation(onboardingStep, pathname, variant)

  const footerItems = sidebarFooter
    ? withResolvedActive(sidebarFooter, pathname, variant)
    : [{ label: t('mockups.common.exit'), icon: 'logout', onClick: onLogout }]

  const activeNavItem = navItems.find((item) => item.active) ?? navItems[0] ?? null

  return {
    navItems,
    footerItems,
    currentSectionLabel: activeNavItem?.label ?? t('app.name')
  }
}
