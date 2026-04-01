// @vitest-environment jsdom

import React from 'react'
import type { PropsWithChildren } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppServicesProvider } from '../src/lib/client/app-services'
import { LOCAL_PROFILE_ID_STORAGE_KEY } from '../src/lib/client/storage-keys'
import { useUserStatus } from '../src/lib/client/use-user-status'
import type { LapAPI } from '../src/shared/types/lap-api'

const mockUseSession = vi.fn()

vi.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}))

function createLapClientStub() {
  return {
    wallet: {
      status: vi.fn(),
    },
    settings: {
      apiKeyStatus: vi.fn(),
    },
    profile: {
      latest: vi.fn(),
    },
    plan: {
      list: vi.fn(),
    },
  } as unknown as LapAPI & {
    wallet: { status: ReturnType<typeof vi.fn> }
    settings: { apiKeyStatus: ReturnType<typeof vi.fn> }
    profile: { latest: ReturnType<typeof vi.fn> }
    plan: { list: ReturnType<typeof vi.fn> }
  }
}

describe('useUserStatus', () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      status: 'authenticated',
    })
    window.localStorage.clear()
  })

  afterEach(() => {
    consoleErrorSpy.mockClear()
  })

  it('usa el profileId guardado localmente para detectar planes cuando latest devuelve null', async () => {
    const lapClient = createLapClientStub()
    lapClient.wallet.status.mockResolvedValue({ configured: true })
    lapClient.settings.apiKeyStatus.mockResolvedValue({ configured: true })
    lapClient.profile.latest.mockResolvedValue(null)
    lapClient.plan.list.mockResolvedValue([{ id: 'plan-1' }])

    window.localStorage.setItem(LOCAL_PROFILE_ID_STORAGE_KEY, 'profile-local')

    const wrapper = ({ children }: PropsWithChildren) => (
      <AppServicesProvider services={{ lapClient }}>
        {children}
      </AppServicesProvider>
    )

    const { result } = renderHook(() => useUserStatus(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(lapClient.plan.list).toHaveBeenCalledWith('profile-local')
    expect(result.current.hasPlan).toBe(true)
    expect(result.current.onboardingStep).toBe('READY')
  })

  it('preserva la configuracion previa si fallan chequeos secundarios y aun asi detecta el plan nuevo', async () => {
    const lapClient = createLapClientStub()
    lapClient.wallet.status.mockResolvedValue({ configured: true })
    lapClient.settings.apiKeyStatus.mockResolvedValue({ configured: true })
    lapClient.profile.latest.mockResolvedValue('profile-1')
    lapClient.plan.list.mockResolvedValue([])

    const wrapper = ({ children }: PropsWithChildren) => (
      <AppServicesProvider services={{ lapClient }}>
        {children}
      </AppServicesProvider>
    )

    const { result } = renderHook(() => useUserStatus(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.hasApiKey).toBe(true)
    expect(result.current.hasWallet).toBe(true)
    expect(result.current.hasPlan).toBe(false)
    expect(result.current.onboardingStep).toBe('PLAN')

    window.localStorage.setItem(LOCAL_PROFILE_ID_STORAGE_KEY, 'profile-1')
    lapClient.wallet.status.mockRejectedValue(new Error('wallet temporarily unavailable'))
    lapClient.settings.apiKeyStatus.mockRejectedValue(new Error('api status unavailable'))
    lapClient.profile.latest.mockResolvedValue(null)
    lapClient.plan.list.mockResolvedValue([{ id: 'plan-1' }])

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.hasWallet).toBe(true)
    expect(result.current.hasApiKey).toBe(true)
    expect(result.current.hasPlan).toBe(true)
    expect(result.current.onboardingStep).toBe('READY')
    expect(result.current.error).toBe('wallet temporarily unavailable')
  })
})
