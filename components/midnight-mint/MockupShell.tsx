'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { motion, MotionConfig } from 'framer-motion'
import { cn } from '@/lib/utils'
import { t } from '@/src/i18n'
import { usePathname, useSearchParams } from 'next/navigation'
import { useSession, signOut } from "next-auth/react"
import { MaterialIcon } from './MaterialIcon'
import PulsoLogoAnimated from '../ui/PulsoLogoAnimated'
import { useUserStatusContext } from '@/src/lib/client/UserStatusProvider'

export interface MockupNavItem {
  label: string
  icon: string
  active?: boolean
  href?: string
  meta?: string
  onClick?: () => void
}

export interface MockupTopTab {
  label: string
  active?: boolean
  href?: string
  onClick?: () => void
}

export interface MockupShellProps {
  sidebarLabel?: string
  sidebarNav?: MockupNavItem[]
  sidebarPrimaryAction?: {
    label: string
    icon?: string
    href?: string
  }
  sidebarFooter?: MockupNavItem[]
  topLeft?: ReactNode
  topTabs?: MockupTopTab[]
  topRight?: ReactNode
  contentClassName?: string
  children: ReactNode
}

export function MockupShell({
  sidebarLabel = '',
  sidebarNav,
  sidebarPrimaryAction,
  sidebarFooter,
  topLeft,
  topTabs,
  topRight,
  contentClassName,
  children
}: MockupShellProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const variant = searchParams?.get('variant')
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  const { onboardingStep } = useUserStatusContext()

  const isDashboard = pathname === '/' && !variant
  const isTasks = pathname === '/flow' && variant === 'tasks'
  const isPlan = pathname?.startsWith('/plan')
  const isIntake = pathname?.startsWith('/intake')
  const isSettings = pathname?.startsWith('/settings')

  const canonicalNav: MockupNavItem[] = []

  // Always show Settings
  const settingsItem = { label: t('mockups.common.nav.settings'), icon: 'settings', href: '/settings', active: isSettings }

  if (onboardingStep === 'SETUP') {
    canonicalNav.push(settingsItem)
  } else if (onboardingStep === 'PLAN') {
    canonicalNav.push(
      { label: t('mockups.common.nav.intake'), icon: 'flag', href: '/intake', active: isIntake },
      settingsItem
    )
  } else {
    // READY (Full Access)
    canonicalNav.push(
      { label: t('mockups.common.nav.dashboard'), icon: 'dashboard', href: '/', active: isDashboard },
      { label: t('mockups.common.nav.planificador'), icon: 'calendar_today', href: '/plan?view=week', active: isPlan },
      { label: t('mockups.common.nav.tareas'), icon: 'check_circle', href: '/flow?variant=tasks', active: isTasks },
      { label: t('mockups.common.nav.intake'), icon: 'flag', href: '/intake', active: isIntake },
      settingsItem
    )
  }

  const { data: session } = useSession()
  const activeNavItem = canonicalNav.find((item) => item.active)
  const currentSectionLabel = activeNavItem?.label ?? t('app.name')
  const hasTopTabs = Boolean(topTabs && topTabs.length > 0)
  const hasHeaderContent = Boolean(topLeft || topRight || hasTopTabs)

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/' })
  }

  const closeMobileNav = () => {
    setIsMobileNavOpen(false)
  }

  const renderNavItem = (item: MockupNavItem, compact = false) => {
    const content = (
      <span
        className={cn(
          'flex items-center gap-3 rounded-[18px] text-left transition-all duration-200',
          compact
            ? 'px-4 py-2.5 text-[11px] uppercase tracking-[0.22em]'
            : 'px-4 py-3.5 text-[15px]',
          item.active
            ? 'bg-white text-slate-900 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)]'
            : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'
        )}
      >
        <MaterialIcon
          name={item.icon}
          className={cn(compact ? 'text-[18px]' : 'text-[19px]', item.active ? 'text-slate-900' : 'text-slate-400')}
        />
        <span className={cn('font-display', compact ? 'font-bold' : 'font-medium tracking-tight')}>
          {item.label}
        </span>
        {item.meta && <span className="ml-auto text-[10px] uppercase tracking-[0.24em] text-slate-400">{item.meta}</span>}
      </span>
    )

    if (item.href) {
      return (
        <Link key={item.label} href={item.href} aria-current={item.active ? 'page' : undefined} onClick={closeMobileNav}>
          {content}
        </Link>
      )
    }

    return (
      <button key={item.label} type="button" className="w-full" onClick={() => {
        closeMobileNav()
        item.onClick?.()
      }}>
        {content}
      </button>
    )
  }

  const renderTopTab = (tab: MockupTopTab, mobile = false) => {
    const tabContent = (
      <span
        className={cn(
          'border-b-2 border-transparent font-display font-bold uppercase transition-colors',
          mobile
            ? 'inline-flex whitespace-nowrap pb-2 text-[10px] tracking-[0.18em]'
            : 'pb-2 text-[11px] tracking-[0.22em]',
          tab.active ? 'border-[#1E293B] text-[#334155]' : 'text-slate-400 hover:text-slate-600'
        )}
      >
        {tab.label}
      </span>
    )

    if (tab.href) {
      return (
        <Link key={tab.label} href={tab.href} aria-current={tab.active ? 'page' : undefined}>
          {tabContent}
        </Link>
      )
    }

    return <button key={tab.label} type="button" onClick={tab.onClick}>{tabContent}</button>
  }

  const canonicalFooter: MockupNavItem[] = [
    { label: t('mockups.common.exit'), icon: 'logout', onClick: handleLogout }
  ]
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen overflow-hidden bg-[#FAFAF9] text-[#334155]">
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-[#E9D5FF]/25 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-[520px] w-[520px] rounded-full bg-[#A7F3D0]/25 blur-3xl" />
        </div>

        {isMobileNavOpen && (
          <button
            type="button"
            aria-label={t('debug.flow.close')}
            className="fixed inset-0 z-30 bg-slate-950/30 backdrop-blur-[2px] lg:hidden"
            onClick={closeMobileNav}
          />
        )}

        <aside
          id="mockup-shell-nav"
          className={cn(
            'fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-[18rem] max-w-[88vw] flex-col border-r border-slate-200/40 bg-[#F8FAFC]/92 px-4 py-4 backdrop-blur-xl transition-transform duration-300 ease-out lg:w-64 lg:translate-x-0',
            isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="mb-6 flex items-center justify-between gap-3 px-2 pt-1">
            <div className="flex min-w-0 items-center gap-3">
              <PulsoLogoAnimated variant="mark" size={40} speed={4} glow={false} ariaLabel={t('app.name')} />
              <div className="min-w-0">
                <p className="truncate font-display text-xl font-bold tracking-tight text-[#334155]">{t('app.name')}</p>
                {sidebarLabel && (
                  <p className="truncate font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">{sidebarLabel}</p>
                )}
              </div>
            </div>

            <button
              type="button"
              aria-label={t('debug.flow.close')}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/70 hover:text-slate-800 lg:hidden"
              onClick={closeMobileNav}
            >
              <MaterialIcon name="close" className="text-[20px]" />
            </button>
          </div>

          {session?.user && (
            <div className="mb-6 flex items-center gap-3 rounded-[22px] bg-white/60 p-3 shadow-sm backdrop-blur-sm border border-white/40">
              {session.user.image ? (
                <img src={session.user.image} alt="" className="h-10 w-10 rounded-full border border-slate-200" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1E293B] text-white">
                  <MaterialIcon name="person" className="text-[20px]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[13px] font-bold text-slate-800">{session.user.name || session.user.email}</p>
                <p className="truncate font-display text-[10px] text-slate-400 capitalize">Planificador activo</p>
              </div>
            </div>
          )}

          <nav className="flex-1 space-y-1">
            {canonicalNav.map((item) => renderNavItem(item))}
          </nav>

          {sidebarPrimaryAction && (
            <Link
              href={sidebarPrimaryAction.href ?? '#'}
              onClick={closeMobileNav}
              className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-[18px] bg-[#1E293B] px-5 font-display text-[13px] font-bold text-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <span>{sidebarPrimaryAction.label}</span>
              {sidebarPrimaryAction.icon && <MaterialIcon name={sidebarPrimaryAction.icon} className="text-[18px]" />}
            </Link>
          )}

          {canonicalFooter.length > 0 && (
            <div className="mt-6 border-t border-slate-200/50 pt-4">
              <div className="space-y-1">
                {canonicalFooter.map((item) => renderNavItem(item, true))}
              </div>
            </div>
          )}
        </aside>

        <main className="relative z-10 min-h-screen lg:pl-64">
          <header className={cn(
            'sticky top-0 z-20 border-b border-white/70 bg-white/80 backdrop-blur-xl',
            hasHeaderContent ? '' : 'lg:hidden'
          )}>
            <div className="flex min-h-14 items-center justify-between gap-3 px-4 sm:min-h-16 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4 lg:gap-6">
                <button
                  type="button"
                  aria-controls="mockup-shell-nav"
                  aria-expanded={isMobileNavOpen}
                  aria-label={currentSectionLabel}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-slate-600 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.3)] transition hover:text-slate-900 lg:hidden"
                  onClick={() => setIsMobileNavOpen(true)}
                >
                  <MaterialIcon name="menu" className="text-[20px]" />
                </button>

                <div className="min-w-0 lg:hidden">
                  <p className="truncate font-display text-[14px] font-bold tracking-tight text-[#334155]">{currentSectionLabel}</p>
                  {sidebarLabel && (
                    <p className="truncate font-display text-[10px] uppercase tracking-[0.22em] text-slate-400">{sidebarLabel}</p>
                  )}
                </div>

                {topLeft}

                {hasTopTabs && (
                  <nav className="hidden items-center gap-5 lg:flex">
                    {topTabs?.map((tab) => renderTopTab(tab))}
                  </nav>
                )}
              </div>

              {topRight && <div className="flex shrink-0 items-center gap-2 sm:gap-3">{topRight}</div>}
            </div>

            {hasTopTabs && (
              <div className="border-t border-white/60 px-4 sm:px-6 lg:hidden">
                <nav className="flex min-w-full items-center gap-4 overflow-x-auto py-3">
                  {topTabs?.map((tab) => renderTopTab(tab, true))}
                </nav>
              </div>
            )}
          </header>

          <motion.div
            className={cn('mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8', contentClassName)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </MotionConfig>
  )
}
