'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, MotionConfig } from 'framer-motion'
import { usePathname, useSearchParams } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'

import { cn } from '@/lib/utils'
import { t } from '@/src/i18n'
import { useUserStatusContext } from '@/src/lib/client/UserStatusProvider'

import { MaterialIcon } from './MaterialIcon'
import { MockupSidebar } from './MockupSidebar'
import { resolveMockupNavigation } from './mockup-shell.navigation'
import type { MockupShellProps, MockupTopTab } from './mockup-shell.types'

export type { MockupNavItem, MockupPrimaryAction, MockupShellProps, MockupTopTab } from './mockup-shell.types'

function renderTopTab(tab: MockupTopTab, mobile = false) {
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

  return (
    <button key={tab.label} type="button" onClick={tab.onClick}>
      {tabContent}
    </button>
  )
}

export function MockupOrchestrator({
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
  const { data: session } = useSession()

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/' })
  }

  const closeMobileNav = () => {
    setIsMobileNavOpen(false)
  }

  const { navItems, footerItems, currentSectionLabel } = resolveMockupNavigation({
    onboardingStep,
    pathname,
    variant,
    sidebarNav,
    sidebarFooter,
    onLogout: handleLogout
  })

  const hasTopTabs = Boolean(topTabs && topTabs.length > 0)
  const hasHeaderContent = Boolean(topLeft || topRight || hasTopTabs)

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen overflow-hidden bg-[#FAFAF9] text-[#334155]">
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-[#E9D5FF]/25 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-[520px] w-[520px] rounded-full bg-[#A7F3D0]/25 blur-3xl" />
        </div>

        {isMobileNavOpen ? (
          <button
            type="button"
            aria-label={t('debug.flow.close')}
            className="fixed inset-0 z-30 bg-slate-950/30 backdrop-blur-[2px] lg:hidden"
            onClick={closeMobileNav}
          />
        ) : null}

        <MockupSidebar
          id="mockup-shell-nav"
          sidebarLabel={sidebarLabel}
          navItems={navItems}
          primaryAction={sidebarPrimaryAction}
          footerItems={footerItems}
          isMobileNavOpen={isMobileNavOpen}
          onCloseMobileNav={closeMobileNav}
          userName={session?.user?.name}
          userEmail={session?.user?.email}
          userImage={session?.user?.image}
        />

        <main className="relative z-10 min-h-screen lg:pl-64">
          <header
            className={cn(
              'sticky top-0 z-20 border-b border-white/70 bg-white/80 backdrop-blur-xl',
              hasHeaderContent ? '' : 'lg:hidden'
            )}
          >
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
                  {sidebarLabel ? (
                    <p className="truncate font-display text-[10px] uppercase tracking-[0.22em] text-slate-400">{sidebarLabel}</p>
                  ) : null}
                </div>

                {topLeft}

                {hasTopTabs ? (
                  <nav className="hidden items-center gap-5 lg:flex">
                    {topTabs?.map((tab) => renderTopTab(tab))}
                  </nav>
                ) : null}
              </div>

              {topRight ? <div className="flex shrink-0 items-center gap-2 sm:gap-3">{topRight}</div> : null}
            </div>

            {hasTopTabs ? (
              <div className="border-t border-white/60 px-4 sm:px-6 lg:hidden">
                <nav className="flex min-w-full items-center gap-4 overflow-x-auto py-3">
                  {topTabs?.map((tab) => renderTopTab(tab, true))}
                </nav>
              </div>
            ) : null}
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
