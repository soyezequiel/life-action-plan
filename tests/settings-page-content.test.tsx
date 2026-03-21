// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import SettingsPageContent from '../components/SettingsPageContent'
import { AppServicesProvider } from '../src/lib/client/app-services'
import { t } from '../src/i18n'
import type { LapAPI } from '../src/shared/types/lap-api'
import type { WalletConnectResult } from '../src/shared/types/lap-api'

const pushMock = vi.fn()
const fetchMock = vi.fn()
let searchParamsMock = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock
  }),
  useSearchParams: () => searchParamsMock
}))

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
    MotionConfig: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    motion: new Proxy({}, {
      get: (_target, property) => createMotionComponent(String(property))
    })
  }
})

function createLapClientStub(): LapAPI {
  return {
    plan: {
      onBuildProgress: vi.fn(() => () => {})
    },
    profile: {
      latest: vi.fn(async () => 'profile-1')
    },
    wallet: {
      status: vi.fn(async () => ({
        configured: false,
        connected: false,
        canUseSecureStorage: true,
        planBuildChargeSats: 5,
        planBuildChargeReady: false,
        planBuildChargeReasonCode: 'wallet_not_connected'
      })),
      connect: vi.fn(async () => ({
        success: true,
        status: {
          configured: true,
          connected: true,
          canUseSecureStorage: true
        }
      })),
      disconnect: vi.fn(async () => ({ success: true }))
    }
  } as unknown as LapAPI
}

describe('settings page content', () => {
  beforeEach(() => {
    pushMock.mockReset()
    searchParamsMock = new URLSearchParams('intent=build&provider=ollama')
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ configured: false }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    }))
    vi.stubGlobal('fetch', fetchMock)
  })

  it('oculta el campo de API key para build local', async () => {
    render(
      <AppServicesProvider services={{ lapClient: createLapClientStub() }}>
        <SettingsPageContent deploymentMode="local" />
      </AppServicesProvider>
    )

    expect(await screen.findByText(t('settings.local_build_title'))).toBeTruthy()
    expect(screen.getByText(t('settings.local_build_hint'))).toBeTruthy()
    expect(screen.getByText(t('settings.build_route_hint', { provider: t('builder.provider_local') }))).toBeTruthy()
    expect(screen.queryByPlaceholderText(t('settings.apikey_placeholder'))).toBeNull()
  })

  it('mantiene la advertencia visible si se pide build local en cloud', async () => {
    render(
      <AppServicesProvider services={{ lapClient: createLapClientStub() }}>
        <SettingsPageContent deploymentMode="vercel-preview" />
      </AppServicesProvider>
    )

    expect(await screen.findByText(t('builder.local_unavailable_deploy'))).toBeTruthy()
    expect(screen.getByPlaceholderText(t('settings.apikey_placeholder'))).toBeTruthy()
    expect(screen.getByText(t('settings.build_charge_hint', { sats: '5' }))).toBeTruthy()
    expect(screen.getAllByText(t('dashboard.wallet_build_blocked.wallet_not_connected')).length).toBeGreaterThan(0)
  })

  it('muestra OpenRouter como ruta elegida para build cloud', async () => {
    searchParamsMock = new URLSearchParams('intent=build&provider=openrouter')

    render(
      <AppServicesProvider services={{ lapClient: createLapClientStub() }}>
        <SettingsPageContent deploymentMode="local" />
      </AppServicesProvider>
    )

    expect(await screen.findByText(t('settings.apikey_title'))).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/api-key?provider=openrouter')
    expect(screen.getByText(t('settings.build_route_hint', {
      provider: t('builder.provider_openrouter')
    }))).toBeTruthy()
    expect(screen.getByPlaceholderText(t('settings.apikey_placeholder'))).toBeTruthy()
  })

  it('muestra un error claro cuando la wallet no responde como NWC compatible', async () => {
    const client = createLapClientStub()
    const user = userEvent.setup()

    client.wallet.connect = vi.fn(async (): Promise<WalletConnectResult> => ({
      success: false,
      status: {
        configured: false,
        connected: false,
        canUseSecureStorage: true,
        planBuildChargeSats: 5,
        planBuildChargeReady: false,
        planBuildChargeReasonCode: 'wallet_not_connected'
      },
      error: 'WALLET_NWC_INFO_UNAVAILABLE'
    }))

    render(
      <AppServicesProvider services={{ lapClient: client }}>
        <SettingsPageContent deploymentMode="local" />
      </AppServicesProvider>
    )

    await screen.findByText(t('settings.local_build_title'))
    await user.type(screen.getByPlaceholderText(t('settings.wallet_placeholder')), 'nostr+walletconnect://demo')
    await user.click(screen.getByRole('button', { name: t('settings.wallet_confirm') }))

    expect(await screen.findByText(t('settings.wallet_error_nwc_incompatible'))).toBeTruthy()
  })
})
