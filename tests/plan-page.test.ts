import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`)
})

const getCurrentSessionMock = vi.fn()
const getPlannerInitialDataMock = vi.fn()

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}))

vi.mock('../src/lib/server/request-context', () => ({
  getCurrentSession: getCurrentSessionMock,
  getPlannerInitialData: getPlannerInitialDataMock,
}))

vi.mock('../components/plan-viewer/PlanificadorPage', () => ({
  default: ({ initialView, initialData }: { initialView: string, initialData: unknown }) => ({
    initialView,
    initialData,
  })
}))

describe('plan page', () => {
  beforeEach(() => {
    redirectMock.mockClear()
    getCurrentSessionMock.mockReset()
    getPlannerInitialDataMock.mockReset()
  })

  it('redirige a signin cuando no hay sesion', async () => {
    getCurrentSessionMock.mockResolvedValue(null)

    const { default: PlanPage } = await import('../app/plan/page')

    await expect(
      PlanPage({
        searchParams: Promise.resolve({
          view: 'week'
        })
      })
    ).rejects.toThrow('REDIRECT:/auth/signin?callbackUrl=/plan')
  })

  it('resuelve la vista inicial y pasa los datos precargados al planner', async () => {
    const initialData = {
      activePlan: { id: 'plan-1', nombre: 'Plan', profileId: 'profile-1', slug: 'plan', manifest: '{}', createdAt: '', updatedAt: '' },
      tasks: [],
    }

    getCurrentSessionMock.mockResolvedValue({ user: { id: 'user-1' } })
    getPlannerInitialDataMock.mockResolvedValue(initialData)

    const { default: PlanPage } = await import('../app/plan/page')
    const result = await PlanPage({
      searchParams: Promise.resolve({
        view: 'month',
        planId: 'plan-1'
      })
    })

    expect(getPlannerInitialDataMock).toHaveBeenCalledWith('user-1', 'plan-1')
    expect(result.props).toEqual({
      initialView: 'dayGridMonth',
      initialData,
    })
  })
})
