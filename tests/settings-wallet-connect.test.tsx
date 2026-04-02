// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import SettingsView from '../components/workspace/views/SettingsView'
import { t } from '../src/i18n'

const walletConnectMock = vi.hoisted(() => vi.fn())
const walletStatusMock = vi.hoisted(() => vi.fn())
const apiKeyStatusMock = vi.hoisted(() => vi.fn())
const refreshMock = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react')

  function createMotionComponent(tagName: string) {
    return ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(function MotionComponent(props, ref) {
      const {
        children,
        layout,
        initial,
        animate,
        exit,
        transition,
        whileTap,
        whileHover,
        ...rest
      } = props

      void layout
      void initial
      void animate
      void exit
      void transition
      void whileTap
      void whileHover

      return ReactModule.createElement(tagName, { ...rest, ref }, children as React.ReactNode)
    })
  }

  return {
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    motion: new Proxy({}, {
      get: (_target, property) => createMotionComponent(String(property))
    })
  }
})

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  )
}))

vi.mock('@/components/midnight-mint/MaterialIcon', () => ({
  MaterialIcon: ({ name, className }: { name: string; className?: string }) => (
    <span data-icon={name} className={className} />
  )
}))

vi.mock('@/src/lib/client/browser-http-client', () => ({
  browserLapClient: {
    wallet: {
      status: walletStatusMock,
      connect: walletConnectMock,
      disconnect: vi.fn()
    },
    settings: {
      apiKeyStatus: apiKeyStatusMock
    }
  }
}))

vi.mock('@/src/lib/client/UserStatusProvider', () => ({
  useUserStatusContext: () => ({
    onboardingStep: 'READY' as const,
    refresh: refreshMock
  })
}))

describe('settings wallet connect', () => {
  beforeEach(() => {
    walletConnectMock.mockReset()
    walletStatusMock.mockReset()
    apiKeyStatusMock.mockReset()
    refreshMock.mockClear()
    walletStatusMock.mockResolvedValue({
      configured: false,
      connected: false,
      canUseSecureStorage: true
    })
    apiKeyStatusMock.mockResolvedValue({ configured: true })
  })

  it('muestra el error real cuando el backend rechaza la conexion', async () => {
    const user = userEvent.setup()
    walletConnectMock.mockResolvedValue({
      success: false,
      status: {
        configured: false,
        connected: false,
        canUseSecureStorage: true
      },
      error: 'INVALID_NWC_URL'
    })

    render(
      <SettingsView
        section="wallet"
        initialWalletStatus={{
          configured: false,
          connected: false,
          canUseSecureStorage: true
        }}
        initialApiConfigured
      />
    )

    await user.type(screen.getByPlaceholderText(t('settings.wallet_placeholder')), 'nostr+walletconnect://demo')
    await user.click(screen.getByRole('button', { name: t('settings.wallet_confirm') }))

    expect(await screen.findByText(t('settings.wallet_error_invalid_url'))).toBeTruthy()
    expect(screen.queryByText(t('settings.wallet_success'))).toBeNull()
  })
})
