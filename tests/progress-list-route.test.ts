import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProgressByPlanMock: vi.fn(),
  getProgressByPlanAndDateMock: vi.fn()
}))

vi.mock('../app/api/_db', () => ({
  getProgressByPlan: mocks.getProgressByPlanMock,
  getProgressByPlanAndDate: mocks.getProgressByPlanAndDateMock
}))

import { GET } from '../app/api/progress/list/route'

describe('progress list route', () => {
  beforeEach(() => {
    mocks.getProgressByPlanMock.mockReset()
    mocks.getProgressByPlanAndDateMock.mockReset()
    mocks.getProgressByPlanMock.mockResolvedValue([])
    mocks.getProgressByPlanAndDateMock.mockResolvedValue([])
  })

  it('lista todo el plan cuando fecha no viene en la query', async () => {
    const response = await GET(new Request(
      'http://localhost/api/progress/list?planId=11111111-1111-4111-8111-111111111111'
    ))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([])
    expect(mocks.getProgressByPlanMock).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(mocks.getProgressByPlanAndDateMock).not.toHaveBeenCalled()
  })

  it('mantiene el filtro por fecha cuando viene en la query', async () => {
    const response = await GET(new Request(
      'http://localhost/api/progress/list?planId=11111111-1111-4111-8111-111111111111&fecha=2026-03-21'
    ))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([])
    expect(mocks.getProgressByPlanAndDateMock).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '2026-03-21'
    )
  })
})
