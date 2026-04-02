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
    user: {
      status: vi.fn(),
    },
  } as unknown as LapAPI & {
    user: { status: ReturnType<typeof vi.fn> }
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
    lapClient.user.status.mockResolvedValue({
      hasWallet: true,
      hasApiKey: true,
      hasPlan: true,
      latestProfileId: null,
    })

    window.localStorage.setItem(LOCAL_PROFILE_ID_STORAGE_KEY, 'profile-local')

    const wrapper = ({ children }: PropsWithChildren) => (
      <AppServicesProvider services={{ lapClient }}>
        {children}
      </AppServicesProvider>
    )

    const { result } = renderHook(() => useUserStatus(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(lapClient.user.status).toHaveBeenCalledWith('profile-local')
    expect(result.current.latestProfileId).toBeNull()
    expect(result.current.hasPlan).toBe(true)
    expect(result.current.onboardingStep).toBe('READY')
  })

  it('preserva el estado previo cuando falla el snapshot agregado durante un refresh', async () => {
    const lapClient = createLapClientStub()
    lapClient.user.status.mockResolvedValue({
      hasWallet: true,
      hasApiKey: true,
      hasPlan: false,
      latestProfileId: 'profile-1',
    })

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
    expect(result.current.latestProfileId).toBe('profile-1')
    expect(result.current.onboardingStep).toBe('PLAN')

    window.localStorage.setItem(LOCAL_PROFILE_ID_STORAGE_KEY, 'profile-1')
    lapClient.user.status.mockRejectedValue(new Error('wallet temporarily unavailable'))

    await act(async () => {
      await result.current.refresh()
    })

    expect(lapClient.user.status).toHaveBeenLastCalledWith('profile-1')
    expect(result.current.hasWallet).toBe(true)
    expect(result.current.hasApiKey).toBe(true)
    expect(result.current.hasPlan).toBe(false)
    expect(result.current.onboardingStep).toBe('PLAN')
    expect(result.current.error).toBe('wallet temporarily unavailable')
  })

  it('mantiene el primer render en loading aunque exista cache local y aplica el snapshot despues de montar', async () => {
    const lapClient = createLapClientStub()
    lapClient.user.status.mockResolvedValue({
      hasWallet: true,
      hasApiKey: true,
      hasPlan: true,
      latestProfileId: 'profile-cached',
    })

    window.localStorage.setItem('lap.user-status.v1', JSON.stringify({
      userId: 'user-1',
      timestamp: Date.now(),
      snapshot: {
        hasWallet: true,
        hasApiKey: true,
        hasPlan: true,
        latestProfileId: 'profile-cached',
      },
    }))

    const wrapper = ({ children }: PropsWithChildren) => (
      <AppServicesProvider services={{ lapClient }}>
        {children}
      </AppServicesProvider>
    )

    const { result } = renderHook(() => useUserStatus(), { wrapper })

    expect(result.current.loading).toBe(true)
    expect(result.current.onboardingStep).toBe('LOADING')

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.hasWallet).toBe(true)
    expect(result.current.hasApiKey).toBe(true)
    expect(result.current.hasPlan).toBe(true)
    expect(result.current.latestProfileId).toBe('profile-cached')
    expect(result.current.onboardingStep).toBe('READY')
  })
})
