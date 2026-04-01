'use client'

import React from 'react'
import { MockupSidebar } from '../midnight-mint/MockupSidebar'
import type { MockupNavItem } from '../midnight-mint/mockup-shell.types'
import type { WorkspaceNavItem } from './types'

interface WorkspaceSidebarProps {
  id: string
  sidebarLabel?: string
  navItems: WorkspaceNavItem[]
  isMobileNavOpen: boolean
  onCloseMobileNav: () => void
  userName?: string | null
  userEmail?: string | null
  userImage?: string | null
}

export function WorkspaceSidebar({
  id,
  sidebarLabel,
  navItems,
  isMobileNavOpen,
  onCloseMobileNav,
  userName,
  userEmail,
  userImage
}: WorkspaceSidebarProps) {
  const sidebarNav: MockupNavItem[] = navItems.map((item) => ({
    label: item.label,
    icon: item.icon,
    href: item.href,
    active: item.active
  }))

  return (
    <MockupSidebar
      id={id}
      sidebarLabel={sidebarLabel}
      navItems={sidebarNav}
      footerItems={[]}
      isMobileNavOpen={isMobileNavOpen}
      onCloseMobileNav={onCloseMobileNav}
      userName={userName}
      userEmail={userEmail}
      userImage={userImage}
      primaryAction={undefined}
    />
  )
}
