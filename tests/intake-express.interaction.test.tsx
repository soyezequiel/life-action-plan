// @vitest-environment jsdom

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import IntakeExpress from '../components/IntakeExpress'
import { AppServicesProvider } from '../src/lib/client/app-services'
import { t } from '../src/i18n'
import type { LapAPI } from '../src/shared/types/lap-api'
import { UserStatusProvider } from '../src/lib/client/UserStatusProvider'

const fetchMock = vi.fn()

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
    MotionConfig: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    motion: new Proxy({}, {
      get: (_target, property) => createMotionComponent(String(property))
    })
  }
})

vi.mock('../src/lib/client/UserStatusProvider', () => ({
  UserStatusProvider: ({ children }: { children: React.ReactNode }) => children,
  useUserStatusContext: () => ({
    hasWallet: true,
    hasApiKey: true,
    hasPlan: false,
    onboardingStep: 'READY' as const,
    isConfigured: true,
    loading: false,
    error: null,
    refresh: vi.fn(async () => {})
  })
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: {
        id: 'user-1'
      }
    },
    status: 'authenticated'
  })
}))

vi.mock('../components/midnight-mint/SuccessPaymentAnimation', () => ({
  SuccessPaymentAnimation: () => null
}))

function createLapClientStub(): LapAPI {
  return {
    intake: {
      save: vi.fn(async () => ({ success: true, profileId: 'profile-1' }))
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

describe('intake express interaction', () => {
  it('permite avanzar con Enter usando el flujo real de intake', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url === '/api/profile/latest') {
        return new Response(JSON.stringify('profile-1'), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      if (url === '/api/wallet/status') {
        return new Response(JSON.stringify({
          configured: false,
          connected: false,
          canUseSecureStorage: true
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      if (url === '/api/wallet/quote') {
        return new Response(JSON.stringify({
          planBuildChargeSats: 0,
          planBuildChargeReady: true,
          planBuildChargeReasonCode: null
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppServicesProvider services={{ lapClient: createLapClientStub() }}>
        <UserStatusProvider>
          <IntakeExpress onComplete={() => {}} />
        </UserStatusProvider>
      </AppServicesProvider>
    )

    const objectiveField = await screen.findByPlaceholderText('Escribe tu objetivo aquí...')
    expect(objectiveField).toBeTruthy()

    await user.type(objectiveField, 'Aprender Rust')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/profile/latest', expect.anything())
    })
  })
})
