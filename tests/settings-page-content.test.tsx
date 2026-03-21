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

function createBuildPreviewResponse(url: string): Response {
  if (url.includes('provider=ollama')) {
    return new Response(JSON.stringify({
      success: true,
      usage: {
        mode: 'backend-local',
        resourceOwner: 'backend',
        executionTarget: 'backend-local',
        credentialSource: 'none',
        chargePolicy: 'charge',
        chargeReason: 'backend_resource',
        chargeable: true,
        estimatedCostSats: 5,
        billingReasonCode: null,
        billingReasonDetail: null,
        canExecute: true,
        blockReasonCode: null,
        blockReasonDetail: null,
        providerId: 'ollama',
        modelId: 'ollama:qwen3:8b'
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (url.includes('hasUserApiKey=1')) {
    return new Response(JSON.stringify({
      success: true,
      usage: {
        mode: 'user-cloud',
        resourceOwner: 'user',
        executionTarget: 'cloud',
        credentialSource: 'user-supplied',
        chargePolicy: 'skip',
        chargeReason: 'user_resource',
        chargeable: false,
        estimatedCostSats: 5,
        billingReasonCode: 'user_resource',
        billingReasonDetail: 'RESOURCE_OWNER_USER',
        canExecute: true,
        blockReasonCode: null,
        blockReasonDetail: null,
        providerId: 'openrouter',
        modelId: 'openrouter:openai/gpt-4o-mini'
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({
    success: true,
    usage: {
      mode: 'backend-cloud',
      resourceOwner: 'backend',
      executionTarget: 'cloud',
      credentialSource: 'backend-stored',
      chargePolicy: 'charge',
      chargeReason: 'backend_resource',
      chargeable: true,
      estimatedCostSats: 5,
      billingReasonCode: null,
      billingReasonDetail: null,
      canExecute: true,
      blockReasonCode: null,
      blockReasonDetail: null,
      providerId: 'openrouter',
      modelId: 'openrouter:openai/gpt-4o-mini'
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('settings page content', () => {
  beforeEach(() => {
    pushMock.mockReset()
    searchParamsMock = new URLSearchParams('intent=build&provider=ollama')
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/settings/build-preview')) {
        return createBuildPreviewResponse(url)
      }

      return new Response(JSON.stringify({ configured: false }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      })
    })
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
    expect(await screen.findByText('Origen del recurso: LAP pone la maquina que arma el plan.')).toBeTruthy()
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
    expect(await screen.findByText('Origen del recurso: LAP pone el asistente en linea para esta accion.')).toBeTruthy()
    expect(screen.getByPlaceholderText(t('settings.apikey_placeholder'))).toBeTruthy()
  })

  it('muestra que no se cobra cuando el build usa la clave del usuario', async () => {
    searchParamsMock = new URLSearchParams('intent=build&provider=openrouter')
    const user = userEvent.setup()

    render(
      <AppServicesProvider services={{ lapClient: createLapClientStub() }}>
        <SettingsPageContent deploymentMode="local" />
      </AppServicesProvider>
    )

    await screen.findByText(t('settings.apikey_title'))
    await user.type(screen.getByPlaceholderText(t('settings.apikey_placeholder')), 'sk-or-v1-demo')

    expect(await screen.findByText('Origen del recurso: Vas a usar tu propia clave del asistente.')).toBeTruthy()
    expect(screen.getByText('Como usa tu propio recurso, esta accion no se cobra.')).toBeTruthy()
    expect((screen.getByRole('button', { name: t('settings.apikey_confirm') }) as HTMLButtonElement).disabled).toBe(false)
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
