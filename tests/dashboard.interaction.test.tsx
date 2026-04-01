// @vitest-environment jsdom

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DateTime } from 'luxon'
import Dashboard from '../components/Dashboard'
import { AppServicesProvider } from '../src/lib/client/app-services'
import { UserStatusProvider } from '../src/lib/client/UserStatusProvider'
import { t } from '../src/i18n'
import type { DashboardSummaryResult, LapAPI, PlanRow } from '../src/shared/types/lap-api'

const replaceMock = vi.fn()
const refreshMock = vi.fn()
const todayIso = DateTime.now().setZone('America/Argentina/Buenos_Aires').toISODate() ?? '2026-03-19'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    refresh: refreshMock
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/'
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: {
        name: 'naranja',
        email: 'naranja@example.com'
      }
    },
    status: 'authenticated'
  })
}))

const basePlan: PlanRow = {
  id: 'plan-1',
  profileId: 'profile-1',
  nombre: 'Plan de constancia',
  slug: 'plan-de-constancia',
  manifest: JSON.stringify({
    v5: {
      package: {
        timezone: 'America/Argentina/Buenos_Aires',
        plan: {
          operational: {
            days: [],
            scheduledEvents: []
          },
          detail: {
            scheduledEvents: [],
            weeks: []
          }
        }
      }
    }
  }),
  createdAt: '2026-03-19',
  updatedAt: '2026-03-19'
}

function buildSummary(overrides: Partial<DashboardSummaryResult> = {}): DashboardSummaryResult {
  return {
    planId: 'plan-1',
    planName: 'Plan de constancia',
    timezone: 'America/Argentina/Buenos_Aires',
    date: todayIso,
    dateLabel: 'jueves 19 marzo 2026',
    progressPercentage: 0,
    tasksTotal: 1,
    tasksCompleted: 0,
    tasksActive: 1,
    tasks: [
      {
        id: 'progress-1',
        planId: 'plan-1',
        fecha: todayIso,
        tipo: 'habito',
        objetivoId: 'obj-1',
        descripcion: 'Salir a caminar',
        completado: false,
        notas: null,
        createdAt: '2026-03-19T10:00:00.000Z'
      }
    ],
    schedule: {
      events: [
        {
          title: 'Bloque de enfoque',
          startAt: '2026-03-19T09:00:00.000-03:00',
          endAt: '2026-03-19T10:00:00.000-03:00',
          durationMin: 60,
          rigidity: 'hard'
        }
      ],
      isEmpty: false
    },
    focus: {
      status: 'before_next',
      remainingMinutes: 45,
      title: 'Bloque de enfoque',
      nextEventStartAt: '2026-03-19T09:00:00.000-03:00',
      targetAt: '2026-03-19T09:00:00.000-03:00'
    },
    week: {
      days: [
        {
          date: todayIso,
          weekdayLabel: 'jue',
          percentage: 0,
          completedCount: 0,
          totalCount: 1,
          isToday: true
        }
      ]
    },
    trend: {
      direction: 'flat',
      deltaPercentagePoints: 0,
      currentAverage: 0,
      previousAverage: 0
    },
    streak: {
      current: 2,
      best: 5
    },
    ...overrides
  }
}

function createLapClientStub(summaryOverrides?: Partial<DashboardSummaryResult>): LapAPI {
  const summary = buildSummary(summaryOverrides)

  return {
    intake: {
      save: vi.fn(async () => ({ success: true, profileId: 'profile-1' }))
    },
    plan: {
      build: vi.fn(async () => ({ success: true, planId: 'plan-1' })),
      onBuildProgress: vi.fn(() => () => {}),
      list: vi.fn(async () => [basePlan]),
      simulate: vi.fn(async () => ({ success: true })),
      onSimulationProgress: vi.fn(() => () => {}),
      exportCalendar: vi.fn(async () => ({ success: true, filePath: 'mock.ics' })),
      exportSimulation: vi.fn(async () => ({ success: true, filePath: 'mock.json' }))
    },
    dashboard: {
      summary: vi.fn(async () => summary)
    },
    profile: {
      get: vi.fn(async () => null),
      latest: vi.fn(async () => 'profile-1')
    },
    progress: {
      list: vi.fn(async () => summary.tasks),
      summary: vi.fn(async () => []),
      toggle: vi.fn(async () => ({ success: true, completado: true }))
    },
    streak: {
      get: vi.fn(async () => summary.streak)
    },
    wallet: {
      status: vi.fn(async () => ({
        configured: false,
        connected: false,
        canUseSecureStorage: true
      })),
      quote: vi.fn(async () => ({
        planBuildChargeSats: 5,
        planBuildChargeReady: true,
        planBuildChargeReasonCode: null
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
        tokensInput: 0,
        tokensOutput: 0,
        costUsd: 0,
        costSats: 0,
        chargedSats: 0,
        operations: [],
        latestCharge: null
      }))
    },
    settings: {
      apiKeyStatus: vi.fn(async () => ({ configured: true }))
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

function renderDashboard(client: LapAPI) {
  return render(
    <AppServicesProvider services={{ lapClient: client }}>
      <UserStatusProvider>
        <Dashboard deploymentMode="local" />
      </UserStatusProvider>
    </AppServicesProvider>
  )
}

describe('dashboard interaction', () => {
  it('renderiza el resumen real del plan activo', async () => {
    const client = createLapClientStub()

    renderDashboard(client)

    expect(await screen.findByText('Plan de constancia')).toBeTruthy()
    expect(screen.getByText(t('dashboard.schedule.today'))).toBeTruthy()
    expect(screen.getAllByText('Bloque de enfoque').length).toBeGreaterThan(0)
    expect(screen.getByText('Salir a caminar')).toBeTruthy()
    expect(screen.getByText(t('dashboard.streak_current', { count: 2 }))).toBeTruthy()
  })

  it('actualiza el resumen cuando marca una tarea', async () => {
    const client = createLapClientStub({
      tasks: [
        {
          id: 'progress-1',
          planId: 'plan-1',
          fecha: todayIso,
          tipo: 'habito',
          objetivoId: 'obj-1',
          descripcion: 'Salir a caminar',
          completado: true,
          notas: null,
          createdAt: '2026-03-19T10:00:00.000Z'
        }
      ],
      tasksCompleted: 1,
      tasksActive: 0,
      progressPercentage: 100
    })
    const user = userEvent.setup()

    renderDashboard(client)

    await user.click(await screen.findByRole('button', { name: /Salir a caminar/i }))

    await waitFor(() => {
      expect(client.progress.toggle).toHaveBeenCalledWith('progress-1')
    })

    await waitFor(() => {
      expect(client.dashboard.summary).toHaveBeenCalledTimes(2)
    })
  })

  it('muestra estado vacio cuando no hay planes', async () => {
    const client = createLapClientStub()
    client.plan.list = vi.fn(async () => [])

    renderDashboard(client)

    expect(await screen.findByRole('heading', { name: t('dashboard.empty_title') })).toBeTruthy()
    expect(screen.getByText(t('dashboard.empty_copy'))).toBeTruthy()
  })
})
