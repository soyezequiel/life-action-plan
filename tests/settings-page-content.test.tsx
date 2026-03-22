// @vitest-environment jsdom

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPageContent from '../components/SettingsPageContent'
import WalletSection from '../components/settings/WalletSection'
import { AppServicesProvider } from '../src/lib/client/app-services'
import { t } from '../src/i18n'
import { toUserFacingErrorMessage } from '../src/lib/client/error-utils'
import type { LapAPI } from '../src/shared/types/lap-api'

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
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    MotionConfig: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    motion: new Proxy({}, {
      get: (_target, property) => createMotionComponent(String(property))
    })
  }
})

function createLapClientStub(): LapAPI {
  return {
    plan: {
      build: vi.fn(async () => ({ success: true })),
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
    },
    debug: {
      enable: vi.fn(async () => ({ enabled: true, panelVisible: true })),
      disable: vi.fn(async () => ({ enabled: false, panelVisible: false })),
      clear: vi.fn(async () => ({ enabled: true, panelVisible: true })),
      status: vi.fn(async () => ({ enabled: false, panelVisible: false })),
      snapshot: vi.fn(async () => ({ traces: [] })),
      onEvent: vi.fn(() => () => {})
    }
  } as unknown as LapAPI
}

function createBuildPreviewResponse(url: string): Response {
  const parsedUrl = new URL(url, 'http://localhost')
  const provider = parsedUrl.searchParams.get('provider')
  const resourceMode = parsedUrl.searchParams.get('resourceMode')
  const hasUserApiKey = parsedUrl.searchParams.get('hasUserApiKey')

  if (provider === 'ollama:qwen3:8b') {
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

  if (resourceMode === 'user' && hasUserApiKey === '1') {
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

  if (resourceMode === 'codex') {
    return new Response(JSON.stringify({
      success: true,
      usage: {
        mode: 'codex-cloud',
        resourceOwner: 'backend',
        executionTarget: 'cloud',
        credentialSource: 'backend-stored',
        chargePolicy: 'skip',
        chargeReason: 'internal_tooling',
        chargeable: false,
        estimatedCostSats: 5,
        billingReasonCode: 'internal_tooling',
        billingReasonDetail: 'INTERNAL_TOOLING_MODE',
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

  if (resourceMode === 'user') {
    return new Response(JSON.stringify({
      success: true,
      usage: {
        mode: 'user-cloud',
        resourceOwner: 'user',
        executionTarget: 'cloud',
        credentialSource: 'user-stored',
        chargePolicy: 'skip',
        chargeReason: 'user_resource',
        chargeable: false,
        estimatedCostSats: 5,
        billingReasonCode: 'execution_blocked',
        billingReasonDetail: 'USER_CREDENTIAL_MISSING',
        canExecute: false,
        blockReasonCode: 'user_credential_missing',
        blockReasonDetail: 'No active user credential is configured.',
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
    window.localStorage.clear()
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return new Response(JSON.stringify({ authenticated: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      if (url === '/api/models/available') {
        return new Response(JSON.stringify({
          success: true,
          models: [
            {
              providerId: 'openrouter',
              modelId: 'openrouter:openai/gpt-4o-mini',
              displayName: 'OpenRouter'
            }
          ]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      if (url.includes('/api/settings/build-preview')) {
        return createBuildPreviewResponse(url)
      }

      return new Response(JSON.stringify({ success: false }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  it('usa la ruta local del sistema cuando el build local esta disponible', async () => {
    render(
      <AppServicesProvider services={{ lapClient: createLapClientStub() }}>
        <SettingsPageContent deploymentMode="local" />
      </AppServicesProvider>
    )

    expect((await screen.findAllByText(t('settings.local_build_title'))).length).toBeGreaterThan(0)
    expect(screen.getAllByText(t('settings.local_build_hint')).length).toBeGreaterThan(0)
    expect(screen.getByText(t('settings.build_route_hint', { provider: t('builder.provider_local') }))).toBeTruthy()
    expect(await screen.findByText(`${t('resource_usage.label')}: ${t('resource_usage.mode.backend-local')}`)).toBeTruthy()
    expect(screen.queryByText(t('settings.llm_mode.title'))).toBeNull()
  })

  it('mantiene la advertencia visible si se pide build local fuera de la maquina', async () => {
    render(
      <AppServicesProvider services={{ lapClient: createLapClientStub() }}>
        <SettingsPageContent deploymentMode="vercel-preview" />
      </AppServicesProvider>
    )

    expect(await screen.findByText(t('builder.local_unavailable_deploy'))).toBeTruthy()
    expect(await screen.findByText(t('settings.llm_mode.title'))).toBeTruthy()
  })

  it('muestra los asistentes disponibles del servicio en modo servicio', async () => {
    searchParamsMock = new URLSearchParams('intent=build&provider=openrouter')

    render(
      <AppServicesProvider services={{ lapClient: createLapClientStub() }}>
        <SettingsPageContent deploymentMode="local" />
      </AppServicesProvider>
    )

    expect(await screen.findByText(t('settings.llm_mode.title'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('settings.normal_lane.advanced_open') }))
    expect(await screen.findByText('OpenRouter')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/models/available')
    expect(screen.getAllByText(t('settings.build_route_hint', {
      provider: t('settings.llm_mode.service_title')
    })).length).toBeGreaterThan(0)
    expect(await screen.findByText(t('settings.service_models.selected', { name: 'OpenRouter' }))).toBeTruthy()
    expect(await screen.findByText(`${t('resource_usage.label')}: ${t('resource_usage.mode.backend-cloud')}`)).toBeTruthy()
  })

  it('permite elegir un modelo local disponible desde el servicio de Pulso', async () => {
    searchParamsMock = new URLSearchParams('intent=build&provider=openrouter')
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return new Response(JSON.stringify({ authenticated: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      if (url === '/api/models/available') {
        return new Response(JSON.stringify({
          success: true,
          models: [
            {
              providerId: 'openrouter',
              modelId: 'openrouter:openai/gpt-4o-mini',
              displayName: 'OpenRouter'
            },
            {
              providerId: 'ollama',
              modelId: 'ollama:qwen3:8b',
              displayName: 'Ollama'
            }
          ]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      if (url.includes('/api/settings/build-preview')) {
        return createBuildPreviewResponse(url)
      }

      return new Response(JSON.stringify({ success: false }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    })

    render(
      <AppServicesProvider services={{ lapClient: createLapClientStub() }}>
        <SettingsPageContent deploymentMode="local" />
      </AppServicesProvider>
    )

    await screen.findByText(t('settings.llm_mode.title'))
    fireEvent.click(screen.getByRole('button', { name: t('settings.normal_lane.advanced_open') }))
    fireEvent.click(await screen.findByRole('button', { name: /Ollama/i }))

    expect(await screen.findByText(`${t('resource_usage.label')}: ${t('resource_usage.mode.backend-local')}`)).toBeTruthy()
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => (
        String(url).includes('/api/settings/build-preview?')
        && String(url).includes('provider=ollama%3Aqwen3%3A8b')
        && String(url).includes('resourceMode=auto')
      ))).toBe(true)
    })
  })

  it('muestra el toggle de pensamiento extendido para modelos locales compatibles', async () => {
    searchParamsMock = new URLSearchParams('intent=build&provider=openrouter')
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url === '/api/auth/me') {
        return new Response(JSON.stringify({ authenticated: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      if (url === '/api/models/available') {
        return new Response(JSON.stringify({
          success: true,
          models: [
            {
              providerId: 'ollama',
              modelId: 'ollama:qwen3:8b',
              displayName: 'Ollama - qwen3:8b'
            }
          ]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      if (url.includes('/api/settings/build-preview')) {
        return createBuildPreviewResponse(url)
      }

      return new Response(JSON.stringify({ success: false }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    })

    render(
      <AppServicesProvider services={{ lapClient: createLapClientStub() }}>
        <SettingsPageContent deploymentMode="local" />
      </AppServicesProvider>
    )

    await screen.findByText(t('settings.llm_mode.title'))
    fireEvent.click(screen.getByRole('button', { name: t('settings.normal_lane.advanced_open') }))

    expect(await screen.findByLabelText(t('settings.ollama_thinking_toggle'))).toBeTruthy()
  })

  it('muestra el acceso al inspector LLM desde la pantalla de armado', async () => {
    render(
      <AppServicesProvider services={{ lapClient: createLapClientStub() }}>
        <SettingsPageContent deploymentMode="local" />
      </AppServicesProvider>
    )

    expect(await screen.findByRole('button', { name: t('debug.panel_title') })).toBeTruthy()
  })

  it('respeta el modo propio pedido desde el dashboard', async () => {
    searchParamsMock = new URLSearchParams('intent=build&mode=own')

    render(
      <AppServicesProvider services={{ lapClient: createLapClientStub() }}>
        <SettingsPageContent deploymentMode="local" />
      </AppServicesProvider>
    )

    expect(await screen.findByText(t('settings.own_keys.add_title'))).toBeTruthy()
    expect(screen.getByText(t('resource_usage.blocked.user_credential_missing'))).toBeTruthy()
  })

  it('muestra el bloqueo cuando se elige conexion propia sin ninguna guardada', async () => {
    searchParamsMock = new URLSearchParams('intent=build&provider=openrouter')

    render(
      <AppServicesProvider services={{ lapClient: createLapClientStub() }}>
        <SettingsPageContent deploymentMode="local" />
      </AppServicesProvider>
    )

    await screen.findByText(t('settings.llm_mode.title'))
    fireEvent.click(screen.getByRole('button', { name: t('settings.normal_lane.advanced_open') }))
    fireEvent.click(await screen.findByText(t('settings.llm_mode.own_key_title')))

    expect(await screen.findByText(t('settings.own_keys.add_title'))).toBeTruthy()
    expect(await screen.findByText(t('resource_usage.blocked.user_credential_missing'))).toBeTruthy()
  })

  it('muestra que no se cobra cuando el build usa una conexion propia guardada', async () => {
    searchParamsMock = new URLSearchParams('intent=build&provider=openrouter')

    render(
      <AppServicesProvider services={{ lapClient: createLapClientStub() }}>
        <SettingsPageContent deploymentMode="local" />
      </AppServicesProvider>
    )

    await screen.findByText(t('settings.llm_mode.title'))
    fireEvent.click(screen.getByRole('button', { name: t('settings.normal_lane.advanced_open') }))
    fireEvent.click(await screen.findByText(t('settings.llm_mode.own_key_title')))

    fireEvent.change(screen.getByPlaceholderText(t('settings.own_keys.encryption_password_placeholder')), {
      target: { value: 'segura123' }
    })
    fireEvent.change(screen.getByPlaceholderText(t('settings.own_keys.alias_placeholder')), {
      target: { value: 'Mi cuenta' }
    })
    fireEvent.change(screen.getByPlaceholderText(t('settings.own_keys.key_placeholder')), {
      target: { value: 'sk-demo-user' }
    })
    fireEvent.click(screen.getByRole('button', { name: t('settings.own_keys.save') }))

    expect(await screen.findByText('Mi cuenta')).toBeTruthy()
    expect(await screen.findByText(`${t('resource_usage.label')}: ${t('resource_usage.mode.user-cloud')}`)).toBeTruthy()
    expect(await screen.findByText(t('resource_usage.billing.user_resource'))).toBeTruthy()
    await waitFor(() => {
      expect(window.localStorage.getItem('lap.keys.v1')).toContain('Mi cuenta')
    })
  })

  it('muestra el modo codex local sin pedir billetera ni cobro', async () => {
    searchParamsMock = new URLSearchParams('intent=build&provider=openrouter')

    render(
      <AppServicesProvider services={{ lapClient: createLapClientStub() }}>
        <SettingsPageContent deploymentMode="local" />
      </AppServicesProvider>
    )

    await screen.findByText(t('settings.llm_mode.title'))
    fireEvent.click(screen.getByRole('button', { name: t('settings.normal_lane.advanced_open') }))
    fireEvent.click(await screen.findByText(t('settings.llm_mode.codex_title')))

    expect(await screen.findByText(`${t('resource_usage.label')}: ${t('resource_usage.mode.codex-cloud')}`)).toBeTruthy()
    expect(await screen.findByText(t('resource_usage.billing.internal_tooling'))).toBeTruthy()
  })

  it('normaliza un error claro cuando la wallet no responde como NWC compatible', () => {
    expect(toUserFacingErrorMessage('WALLET_NWC_INFO_UNAVAILABLE')).toBe(t('settings.wallet_error_nwc_incompatible'))
    expect(toUserFacingErrorMessage('no info event (kind 13194) returned from relay')).toBe(t('settings.wallet_error_nwc_incompatible'))
  })

  it('no duplica el mensaje de billetera conectada despues de guardar la conexion', async () => {
    render(
      <WalletSection
        walletConnection=""
        walletStatus={{
          configured: true,
          connected: true,
          canUseSecureStorage: true
        }}
        walletBusy={false}
        walletNotice={t('settings.wallet_success')}
        walletError=""
        onWalletConnectionChange={() => {}}
        onConnect={async () => {}}
        onDisconnect={async () => {}}
      />
    )

    expect(screen.getAllByText(t('settings.wallet_success'))).toHaveLength(1)
  })
})
