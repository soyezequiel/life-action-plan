import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`)
})

const authMock = vi.fn()

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}))

vi.mock('../src/auth', () => ({
  auth: authMock
}))

describe('plan route canonical redirect', () => {
  beforeEach(() => {
    redirectMock.mockClear()
    authMock.mockReset()
  })

  it('redirige la ruta legacy /plan al calendario canonico', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })

    const { default: PlanPage } = await import('../app/plan/page')

    await expect(
      PlanPage({
        searchParams: Promise.resolve({
          view: 'month',
          planId: 'plan-1'
        })
      })
    ).rejects.toThrow('REDIRECT:/plan/v5?view=month&planId=plan-1&tab=calendar')
  })

  it('preserva el callback canonico cuando no hay sesion', async () => {
    authMock.mockResolvedValue(null)

    const { default: PlanPage } = await import('../app/plan/page')

    await expect(
      PlanPage({
        searchParams: Promise.resolve({
          view: 'week'
        })
      })
    ).rejects.toThrow('/auth/signin?callbackUrl=%2Fplan%2Fv5%3Fview%3Dweek%26tab%3Dcalendar')
  })
})
