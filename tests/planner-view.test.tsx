// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PlannerView from '../components/workspace/views/PlannerView'
import { t } from '../src/i18n'

const routerReplaceMock = vi.fn()
const usePlanPackageMock = vi.fn()
let searchParams = new URLSearchParams('tab=calendar&view=week')

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: routerReplaceMock
  }),
  useSearchParams: () => searchParams
}))

vi.mock('../components/PlanCalendar', () => ({
  __esModule: true,
  default: ({ defaultView }: { defaultView: string }) => <div>calendar:{defaultView}</div>
}))

vi.mock('../src/lib/client/use-plan-package', () => ({
  usePlanPackage: (...args: unknown[]) => usePlanPackageMock(...args)
}))

vi.mock('../components/workspace/views/PlannerProgressView', () => ({
  PlannerProgressView: () => <div>progress-view</div>
}))

describe('planner view', () => {
  const initialData = {
    activePlan: {
      id: 'plan-1',
      nombre: 'Plan canonico',
      profileId: 'profile-1',
      slug: 'plan-canonico',
      manifest: '{}',
      createdAt: '',
      updatedAt: ''
    },
    tasks: [
      {
        id: 'task-1',
        planId: 'plan-1',
        descripcion: 'Primera tarea',
        completado: false,
        fecha: '2026-04-02',
        tipo: 'task',
        objetivoId: null,
        notas: null,
        createdAt: ''
      }
    ]
  } as any

  beforeEach(() => {
    routerReplaceMock.mockReset()
    usePlanPackageMock.mockReset()
    usePlanPackageMock.mockReturnValue({
      package: null,
      loading: false,
      error: null
    })
    searchParams = new URLSearchParams('tab=calendar&view=week')
  })

  it('usa day week month year en la URL canonica', async () => {
    const user = userEvent.setup()

    render(
      <PlannerView
        initialView="timeGridWeek"
        initialData={initialData}
      />
    )

    await user.click(screen.getByRole('button', { name: t('dashboard.calendar_panel.view_daily') }))

    expect(routerReplaceMock).toHaveBeenCalledWith('/plan?tab=calendar&view=day')
  })

  it('cambia a progreso dentro de /plan', async () => {
    const user = userEvent.setup()

    render(
      <PlannerView
        initialView="timeGridWeek"
        initialData={initialData}
      />
    )

    await user.click(screen.getByRole('button', { name: t('planner.tabs.progress') }))

    expect(routerReplaceMock).toHaveBeenCalledWith('/plan?tab=progress')
  })

  it('renderiza la vista de progreso cuando tab=progress', () => {
    searchParams = new URLSearchParams('tab=progress')
    usePlanPackageMock.mockReturnValue({
      package: { qualityScore: 72 },
      loading: false,
      error: null
    })

    render(
      <PlannerView
        initialView="timeGridWeek"
        initialData={initialData}
      />
    )

    expect(usePlanPackageMock).toHaveBeenCalledWith('plan-1')
    expect(screen.getByText('progress-view')).toBeTruthy()
  })
})
