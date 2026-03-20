// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import SettingsPageContent from '../components/SettingsPageContent'
import { AppServicesProvider } from '../src/lib/client/app-services'
import { t } from '../src/i18n'
import type { LapAPI } from '../src/shared/types/lap-api'

const pushMock = vi.fn()
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
        canUseSecureStorage: true
      }))
    }
  } as unknown as LapAPI
}

describe('settings page content', () => {
  beforeEach(() => {
    pushMock.mockReset()
    searchParamsMock = new URLSearchParams('intent=build&provider=ollama')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ configured: false }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    })))
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
  })
})
