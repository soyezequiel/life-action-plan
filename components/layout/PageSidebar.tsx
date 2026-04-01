'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { t } from '@/src/i18n'

import PulsoLogo from '../PulsoLogo'
import { MaterialIcon } from '../midnight-mint/MaterialIcon'

type SidebarNavItem = {
  href: string
  matchPath?: string
  label: string
  icon: string
  exact?: boolean
}

const NAV_ITEMS: SidebarNavItem[] = [
  { href: '/', label: t('dashboard.shell_nav.dashboard'), icon: 'dashboard', exact: true },
  { href: '/flow', label: t('dashboard.shell_nav.flow'), icon: 'account_tree' },
  {
    href: '/plan/v5?tab=calendar&view=week',
    matchPath: '/plan/v5',
    label: t('dashboard.shell_nav.calendar'),
    icon: 'calendar_month'
  },
  { href: '/settings', label: t('dashboard.shell_nav.system'), icon: 'settings' }
]

function isActivePath(pathname: string, item: SidebarNavItem): boolean {
  const matchPath = item.matchPath ?? item.href

  if (item.exact) {
    return pathname === matchPath
  }

  return pathname === matchPath || pathname.startsWith(`${matchPath}/`)
}

export function PageSidebar() {
  const pathname = usePathname()

  return (
    <div className="grid gap-5 rounded-[32px] border border-[rgba(148,163,184,0.18)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(244,247,244,0.9))] p-5 shadow-[0_30px_80px_-28px_rgba(15,23,42,0.2)] backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#0f172a] shadow-[0_18px_32px_-18px_rgba(15,23,42,0.9)]">
          <PulsoLogo variant="mark" className="h-9 w-9" ariaLabel={t('app.name')} />
        </div>

        <div className="min-w-0">
          <strong className="block truncate font-display text-[1.15rem] font-bold tracking-[-0.04em] text-slate-800">
            {t('app.name')}
          </strong>
          <p className="mt-1 text-[0.78rem] uppercase tracking-[0.18em] text-slate-400">
            {t('app.tagline')}
          </p>
        </div>
      </div>

      <nav aria-label={t('dashboard.sidebar.navigation')} className="grid gap-2">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item)

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-3 rounded-[20px] px-4 py-3 text-sm font-semibold transition ${
                active
                  ? 'bg-[#DFF6F1] text-slate-800 shadow-[inset_0_0_0_1px_rgba(20,184,166,0.12)]'
                  : 'text-slate-500 hover:bg-white hover:text-slate-800'
              }`}
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-[14px] transition ${
                  active ? 'bg-white text-[#0f766e]' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-50'
                }`}
              >
                <MaterialIcon name={item.icon} className="text-[20px]" />
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-2 grid gap-3">
        <Link href="/flow" className="app-button app-button--primary w-full justify-center">
          {t('dashboard.start')}
        </Link>
        <Link href="/settings" className="app-button app-button--secondary w-full justify-center">
          {t('dashboard.shell_nav.system')}
        </Link>
      </div>
    </div>
  )
}
