'use client'

import React from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'
import { t } from '@/src/i18n'

import PulsoLogoAnimated from '../ui/PulsoLogoAnimated'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'
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
  sidebarLabel = '',
  navItems,
  isMobileNavOpen,
  onCloseMobileNav,
  userName,
  userEmail,
  userImage
}: WorkspaceSidebarProps) {
  return (
    <aside
      id={id}
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-[18rem] max-w-[88vw] flex-col border-r border-slate-200/50 bg-[linear-gradient(180deg,rgba(255,253,249,0.96),rgba(247,241,232,0.92))] px-4 py-4 backdrop-blur-2xl transition-transform duration-300 ease-out lg:w-64 lg:translate-x-0',
        isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <div className="mb-6 flex items-center justify-between gap-3 px-2 pt-1">
        <div className="flex min-w-0 items-center gap-3">
          <PulsoLogoAnimated variant="mark" size={40} speed={4} glow={false} ariaLabel={t('app.name')} />
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-bold tracking-tight text-[#1f2937]">{t('app.name')}</p>
            {sidebarLabel ? (
              <p className="truncate font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">{sidebarLabel}</p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          aria-label={t('debug.flow.close')}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/70 hover:text-slate-800 lg:hidden"
          onClick={onCloseMobileNav}
        >
          <MaterialIcon name="close" className="text-[20px]" />
        </button>
      </div>

      {userName || userEmail ? (
        <div className="mb-6 flex items-center gap-3 rounded-[22px] border border-white/60 bg-white/70 p-3 shadow-[0_18px_36px_-24px_rgba(17,24,39,0.18)] backdrop-blur-sm">
          {userImage ? (
            <img src={userImage} alt="" className="h-10 w-10 rounded-full border border-slate-200" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1E293B] text-white">
              <MaterialIcon name="person" className="text-[20px]" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[13px] font-bold text-slate-800">{userName || userEmail}</p>
            <p className="truncate font-display text-[10px] capitalize text-slate-400">{t('workspace.sidebar.active_user')}</p>
          </div>
        </div>
      ) : null}

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <Link key={`${item.key}-${item.href}`} href={item.href} aria-current={item.active ? 'page' : undefined} onClick={onCloseMobileNav}>
            <span
              className={cn(
                'flex items-center gap-3 rounded-[18px] px-4 py-3.5 text-left text-[15px] transition-all duration-200',
                item.active
                  ? 'bg-white text-slate-900 shadow-[0_18px_36px_-18px_rgba(17,24,39,0.18)]'
                  : 'text-slate-500 hover:bg-white/80 hover:text-slate-800'
              )}
            >
              <MaterialIcon
                name={item.icon}
                className={cn('text-[19px]', item.active ? 'text-slate-900' : 'text-slate-400')}
              />
              <span className="font-display font-medium tracking-tight">{item.label}</span>
            </span>
          </Link>
        ))}
      </nav>
    </aside>
  )
}
