'use client'

import type { ReactNode } from 'react'

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

export interface MockupPrimaryAction {
  label: string
  icon?: string
  href?: string
}

export interface MockupShellProps {
  sidebarLabel?: string
  sidebarNav?: MockupNavItem[]
  sidebarPrimaryAction?: MockupPrimaryAction
  sidebarFooter?: MockupNavItem[]
  topLeft?: ReactNode
  topTabs?: MockupTopTab[]
  topRight?: ReactNode
  contentClassName?: string
  children: ReactNode
}
