// @vitest-environment jsdom

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Dashboard from '../components/Dashboard'
import { AppServicesProvider } from '../src/lib/client/app-services'
import { t } from '../src/i18n'
import type { LapAPI } from '../src/shared/types/lap-api'
import type { Perfil } from '../src/shared/schemas/perfil'
import type { PlanRow, ProgressRow } from '../src/shared/types/lap-api'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock
  })
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

const profile = {
  participantes: [
    {
      datosPersonales: {
        nombre: 'Ada',
        ubicacion: {
          zonaHoraria: 'America/Argentina/Buenos_Aires'
        }
      }
    }
  ]
} as unknown as Perfil

const basePlan: PlanRow = {
  id: 'plan-1',
  profileId: 'profile-1',
  nombre: 'Plan de constancia',
  slug: 'plan-de-constancia',
  manifest: JSON.stringify({
    fallbackUsed: false,
    ultimoModeloUsado: 'ollama:qwen3:8b',
    ultimaSimulacion: null
  }),
  createdAt: '2026-03-19',
  updatedAt: '2026-03-19'
}

const habitTask: ProgressRow = {
  id: 'progress-1',
  planId: 'plan-1',
  fecha: '2026-03-19',
  tipo: 'habito',
  objetivoId: 'obj-1',
  descripcion: 'Salir a caminar',
  completado: false,
  notas: JSON.stringify({ hora: '07:00', duracion: 20, categoria: 'ejercicio' }),
  createdAt: '2026-03-19T10:00:00.000Z'
}

function createLapClientStub(): LapAPI {
  return {
    intake: {
      save: vi.fn(async () => ({ success: true, profileId: 'profile-1' }))
    },
    plan: {
      build: vi.fn(async () => ({ success: true })),
      onBuildProgress: vi.fn(() => () => {}),
      list: vi.fn(async () => [basePlan]),
      simulate: vi.fn(async () => ({ success: true })),
      onSimulationProgress: vi.fn(() => () => {}),
      exportCalendar: vi.fn(async () => ({ success: true, filePath: 'mock.ics' }))
    },
    profile: {
      get: vi.fn(async () => profile),
      latest: vi.fn(async () => 'profile-1')
    },
    progress: {
      list: vi.fn(async () => [habitTask]),
      toggle: vi.fn(async () => ({ success: true, completado: true }))
    },
    streak: {
      get: vi.fn()
        .mockResolvedValueOnce({ current: 0, best: 2 })
        .mockResolvedValueOnce({ current: 5, best: 7 })
    },
    wallet: {
      status: vi.fn(async () => ({
        configured: false,
        connected: false,
        canUseSecureStorage: true
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
    cost: {
      summary: vi.fn(async () => ({
        planId: 'plan-1',
        tokensInput: 120,
        tokensOutput: 40,
        costUsd: 0.001,
        costSats: 2
      }))
    },
    debug: {
      enable: vi.fn(async () => ({ enabled: true, panelVisible: true })),
      disable: vi.fn(async () => ({ enabled: false, panelVisible: false })),
      clear: vi.fn(async () => ({ enabled: true, panelVisible: true })),
      status: vi.fn(async () => ({ enabled: false, panelVisible: false })),
      snapshot: vi.fn(async () => ({ traces: [] })),
      onEvent: vi.fn(() => () => {})
    }
  }
}

describe('dashboard interaction', () => {
  it('loads a plan and updates progress plus streak after completing a habit', async () => {
    const client = createLapClientStub()
    const user = userEvent.setup()
    pushMock.mockReset()

    render(
      <AppServicesProvider services={{ lapClient: client }}>
        <Dashboard deploymentMode="local" />
      </AppServicesProvider>
    )

    expect(await screen.findByText(t('dashboard.greeting', { nombre: 'Ada' }))).toBeTruthy()
    expect(screen.getByText(t('dashboard.done_count', { done: 0, total: 1 }))).toBeTruthy()
    expect(screen.getByText(t('dashboard.streak_best', { count: 2 }))).toBeTruthy()
    expect(screen.getByText(t('builder.route_local_done'))).toBeTruthy()

    await user.click(screen.getByRole('button', { name: t('dashboard.check_in') }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: t('dashboard.undo') })).toBeTruthy()
      expect(screen.getByText(t('dashboard.all_done'))).toBeTruthy()
      expect(screen.getByText(t('dashboard.streak_current', { count: 5 }))).toBeTruthy()
      expect(screen.getByText(t('dashboard.streak_best', { count: 7 }))).toBeTruthy()
    })

    expect(client.progress.toggle).toHaveBeenCalledWith('progress-1')
    expect(client.streak.get).toHaveBeenCalledTimes(2)
  })

  it('surfaces build actions in the empty-plan state', async () => {
    const client = createLapClientStub()
    pushMock.mockReset()

    client.plan.list = vi.fn(async () => [])
    client.progress.list = vi.fn(async () => [])
    client.streak.get = vi.fn(async () => ({ current: 0, best: 0 }))

    const user = userEvent.setup()

    render(
      <AppServicesProvider services={{ lapClient: client }}>
        <Dashboard deploymentMode="local" />
      </AppServicesProvider>
    )

    expect(await screen.findByText(t('dashboard.empty'))).toBeTruthy()

    await user.click(screen.getByRole('button', { name: t('dashboard.build_openai') }))
    await user.click(screen.getByRole('button', { name: t('dashboard.build_ollama') }))

    expect(pushMock).toHaveBeenCalledWith('/settings?intent=build&provider=openai')
    expect(client.plan.build).toHaveBeenCalledWith('profile-1', '', 'ollama:qwen3:8b')
  })

  it('oculta el build local en un deploy cloud', async () => {
    const client = createLapClientStub()
    pushMock.mockReset()

    client.plan.list = vi.fn(async () => [])
    client.progress.list = vi.fn(async () => [])
    client.streak.get = vi.fn(async () => ({ current: 0, best: 0 }))

    render(
      <AppServicesProvider services={{ lapClient: client }}>
        <Dashboard deploymentMode="vercel-preview" />
      </AppServicesProvider>
    )

    expect(await screen.findByText(t('dashboard.empty'))).toBeTruthy()
    expect(screen.getByText(t('builder.local_unavailable_deploy'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: t('dashboard.build_ollama') })).toBeNull()
  })
})
