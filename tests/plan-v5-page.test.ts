import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`)
})

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}))

describe('plan v5 page', () => {
  beforeEach(() => {
    redirectMock.mockClear()
  })

  it('redirige tareas al tablero canonico de tasks', async () => {
    const { default: PlanV5Page } = await import('../app/plan/v5/page')

    await expect(
      PlanV5Page({
        searchParams: Promise.resolve({
          tab: 'tasks',
          planId: 'plan-1'
        })
      })
    ).rejects.toThrow('REDIRECT:/tasks?planId=plan-1')
  })

  it('redirige progreso a /plan con tab=progress', async () => {
    const { default: PlanV5Page } = await import('../app/plan/v5/page')

    await expect(
      PlanV5Page({
        searchParams: Promise.resolve({
          tab: 'progress',
          planId: 'plan-1'
        })
      })
    ).rejects.toThrow('REDIRECT:/plan?planId=plan-1&tab=progress')
  })

  it('redirige calendario a /plan conservando la vista', async () => {
    const { default: PlanV5Page } = await import('../app/plan/v5/page')

    await expect(
      PlanV5Page({
        searchParams: Promise.resolve({
          tab: 'calendar',
          planId: 'plan-1',
          view: 'day'
        })
      })
    ).rejects.toThrow('REDIRECT:/plan?planId=plan-1&tab=calendar&view=day')
  })
})
