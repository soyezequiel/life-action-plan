'use client'

import React from 'react'

import { MockupSidebar } from './MockupSidebar'
import type { MockupPrimaryAction, MockupNavItem, MockupShellProps, MockupTopTab } from './mockup-shell.types'

export type { MockupNavItem, MockupPrimaryAction, MockupShellProps, MockupTopTab } from './mockup-shell.types'

interface MockupOrchestratorProps extends MockupShellProps {
  id?: string
  isMobileNavOpen?: boolean
  onCloseMobileNav?: () => void
  userName?: string | null
  userEmail?: string | null
  userImage?: string | null
}

function tabsToNavItems(tabs: MockupTopTab[] | undefined): MockupNavItem[] {
  return tabs?.map((tab) => ({
    label: tab.label,
    href: tab.href,
    active: tab.active,
    onClick: tab.onClick,
    icon: 'circle'
  })) ?? []
}

export function MockupOrchestrator({
  sidebarLabel,
  sidebarNav,
  sidebarPrimaryAction,
  sidebarFooter,
  topLeft,
  topTabs,
  topRight,
  contentClassName,
  children,
  id = 'mockup-sidebar',
  isMobileNavOpen = false,
  onCloseMobileNav = () => {},
  userName,
  userEmail,
  userImage
}: MockupOrchestratorProps) {
  const navItems = sidebarNav ?? tabsToNavItems(topTabs)

  return (
    <div className="min-h-screen bg-[#f7f1e8] lg:flex">
      <MockupSidebar
        id={id}
        sidebarLabel={sidebarLabel}
        navItems={navItems}
        primaryAction={sidebarPrimaryAction}
        footerItems={sidebarFooter ?? []}
        isMobileNavOpen={isMobileNavOpen}
        onCloseMobileNav={onCloseMobileNav}
        userName={userName}
        userEmail={userEmail}
        userImage={userImage}
      />

      <main className={contentClassName ?? 'flex-1 lg:ml-64'}>
        {(topLeft || topTabs || topRight) && (
          <header className="flex items-center justify-between gap-4 px-6 py-5">
            <div>{topLeft}</div>
            <div className="flex items-center gap-3">{topTabs?.map((tab) => (
              <span key={tab.label} className={tab.active ? 'font-semibold' : ''}>{tab.label}</span>
            ))}</div>
            <div>{topRight}</div>
          </header>
        )}
        {children}
      </main>
    </div>
  )
}
