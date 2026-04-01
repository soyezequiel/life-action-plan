'use client'

import React from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'
import { t } from '@/src/i18n'

import PulsoLogoAnimated from '../ui/PulsoLogoAnimated'
import { MaterialIcon } from './MaterialIcon'
import type { MockupNavItem, MockupPrimaryAction } from './mockup-shell.types'

interface MockupSidebarProps {
  id: string
  sidebarLabel?: string
  navItems: MockupNavItem[]
  primaryAction?: MockupPrimaryAction
  footerItems: MockupNavItem[]
  isMobileNavOpen: boolean
  onCloseMobileNav: () => void
  userName?: string | null
  userEmail?: string | null
  userImage?: string | null
}

export function MockupSidebar({
  id,
  sidebarLabel = '',
  navItems,
  primaryAction,
  footerItems,
  isMobileNavOpen,
  onCloseMobileNav,
  userName,
  userEmail,
  userImage
}: MockupSidebarProps) {
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
        {item.meta ? <span className="ml-auto text-[10px] uppercase tracking-[0.24em] text-slate-400">{item.meta}</span> : null}
      </span>
    )

    if (item.href) {
      return (
        <Link key={`${item.label}-${item.href}`} href={item.href} aria-current={item.active ? 'page' : undefined} onClick={onCloseMobileNav}>
          {content}
        </Link>
      )
    }

    return (
      <button
        key={item.label}
        type="button"
        className="w-full"
        onClick={() => {
          onCloseMobileNav()
          item.onClick?.()
        }}
      >
        {content}
      </button>
    )
  }

  return (
    <aside
      id={id}
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
        <div className="mb-6 flex items-center gap-3 rounded-[22px] border border-white/40 bg-white/60 p-3 shadow-sm backdrop-blur-sm">
          {userImage ? (
            <img src={userImage} alt="" className="h-10 w-10 rounded-full border border-slate-200" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1E293B] text-white">
              <MaterialIcon name="person" className="text-[20px]" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[13px] font-bold text-slate-800">{userName || userEmail}</p>
            <p className="truncate font-display text-[10px] capitalize text-slate-400">{t('mockups.common.active_planner')}</p>
          </div>
        </div>
      ) : null}

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => renderNavItem(item))}
      </nav>

      {primaryAction ? (
        <Link
          href={primaryAction.href ?? '#'}
          onClick={onCloseMobileNav}
          className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-[18px] bg-[#1E293B] px-5 font-display text-[13px] font-bold text-white shadow-[0_20px_40px_-10px_rgba(0,0,0,0.03)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <span>{primaryAction.label}</span>
          {primaryAction.icon ? <MaterialIcon name={primaryAction.icon} className="text-[18px]" /> : null}
        </Link>
      ) : null}

      {footerItems.length > 0 ? (
        <div className="mt-6 border-t border-slate-200/50 pt-4">
          <div className="space-y-1">
            {footerItems.map((item) => renderNavItem(item, true))}
          </div>
        </div>
      ) : null}
    </aside>
  )
}
