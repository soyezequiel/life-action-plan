'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { t } from '../../src/i18n'
import PulsoLogo from '../PulsoLogo'
import styles from './AppShell.module.css'

type ShellNavItem = {
  href: string
  label: string
  exact?: boolean
}

const NAV_ITEMS: ShellNavItem[] = [
  { href: '/', label: t('dashboard.shell_nav.dashboard'), exact: true },
  { href: '/flow', label: t('dashboard.shell_nav.flow') },
  { href: '/plan', label: t('dashboard.shell_nav.plan') },
  { href: '/plan/v5', label: t('dashboard.shell_nav.calendar') },
  { href: '/settings', label: t('dashboard.shell_nav.system') },
]

interface AppShellProps {
  eyebrow?: string
  title: string
  copy?: string
  children: ReactNode
  actions?: ReactNode
  compact?: boolean
}

function isActivePath(pathname: string, item: ShellNavItem): boolean {
  if (item.exact) {
    return pathname === item.href
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export function AppShell({ eyebrow, title, copy, children, actions, compact = false }: AppShellProps) {
  const pathname = usePathname()

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brandLockup}>
          <PulsoLogo variant="mark" className={styles.brandMark} ariaLabel={t('app.name')} />
          <div>
            <strong className={styles.brandName}>{t('app.name')}</strong>
            <p className={styles.brandTagline}>{t('app.tagline')}</p>
          </div>
        </div>

        <nav className={styles.nav} aria-label={t('dashboard.title')}>
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item)

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <Link className={`${styles.primaryAction} app-button app-button--primary`} href="/flow">
            {t('dashboard.start')}
          </Link>
          <Link className={`${styles.secondaryAction} app-button app-button--secondary`} href="/settings">
            {t('dashboard.shell_nav.system')}
          </Link>
        </div>
      </aside>

      <main className={`${styles.main} ${compact ? styles.mainCompact : ''}`}>
        <header className={styles.topbar}>
          <div className={styles.topbarCopy}>
            {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
            <h1 className={styles.title}>{title}</h1>
            {copy && <p className={styles.copy}>{copy}</p>}
          </div>

          {actions && <div className={styles.actions}>{actions}</div>}
        </header>

        <div className={styles.content}>
          {children}
        </div>
      </main>
    </div>
  )
}
