// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AppShell } from '../components/layout/AppShell'
import { t } from '../src/i18n'

vi.mock('next/navigation', () => ({
  usePathname: () => '/plan/v5',
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn()
  }),
  useSearchParams: () => new URLSearchParams()
}))

describe('app shell navigation', () => {
  it('usa una sola entrada canonica para el calendario del plan', () => {
    render(
      <AppShell title="Stub">
        <div>contenido</div>
      </AppShell>
    )

    expect(screen.queryByRole('link', { name: t('dashboard.shell_nav.plan') })).toBeNull()
    expect(screen.getByRole('link', { name: t('dashboard.shell_nav.calendar') }).getAttribute('href')).toBe(
      '/plan/v5?tab=calendar&view=week'
    )
  })
})
