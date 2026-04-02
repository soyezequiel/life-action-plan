import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const getLatestProfileIdForUserMock = vi.fn()
const getLatestProfileIdWithPlansMock = vi.fn()
const getPlanMock = vi.fn()
const getPlansByProfileMock = vi.fn()
const getProgressByPlanMock = vi.fn()

vi.mock('@/src/auth', () => ({
  auth: authMock,
}))

vi.mock('../src/lib/db/db-helpers', () => ({
  getLatestProfileIdForUser: getLatestProfileIdForUserMock,
  getLatestProfileIdWithPlans: getLatestProfileIdWithPlansMock,
  getPlan: getPlanMock,
  getPlansByProfile: getPlansByProfileMock,
  getProgressByPlan: getProgressByPlanMock,
}))

describe('request-context codex mode', () => {
  const originalCodexFlag = process.env.LAP_CODEX_DEV_MODE

  beforeEach(() => {
    vi.resetModules()
    authMock.mockReset()
    getLatestProfileIdForUserMock.mockReset()
    getLatestProfileIdWithPlansMock.mockReset()
    getPlanMock.mockReset()
    getPlansByProfileMock.mockReset()
    getProgressByPlanMock.mockReset()
    delete process.env.LAP_CODEX_DEV_MODE
  })

  afterEach(() => {
    if (typeof originalCodexFlag === 'string') {
      process.env.LAP_CODEX_DEV_MODE = originalCodexFlag
    } else {
      delete process.env.LAP_CODEX_DEV_MODE
    }
  })

  it('crea una sesion sintetica cuando no hay auth real y codex mode esta activo', async () => {
    process.env.LAP_CODEX_DEV_MODE = '1'
    authMock.mockResolvedValue(null)

    const { getCurrentSession } = await import('../src/lib/server/request-context')
    const session = await getCurrentSession()

    expect(session).toMatchObject({
      user: {
        id: 'local-user',
        name: 'Codex Debug',
      },
    })
  })

  it('cae a un plan existente en la base cuando el usuario actual no tiene planes', async () => {
    process.env.LAP_CODEX_DEV_MODE = '1'
    authMock.mockResolvedValue({
      user: {
        id: 'local-user',
      },
    })

    const debugPlan = {
      id: 'plan-debug',
      profileId: 'profile-debug',
      nombre: 'Plan de debug',
      slug: 'plan-de-debug',
      manifest: '{}',
      createdAt: '2026-04-01T10:00:00.000Z',
      updatedAt: '2026-04-02T10:00:00.000Z',
      deletedAt: null,
    }

    getLatestProfileIdForUserMock.mockResolvedValue(null)
    getLatestProfileIdWithPlansMock.mockResolvedValue('profile-debug')
    getPlansByProfileMock.mockImplementation(async (profileId: string) => (
      profileId === 'profile-debug' ? [debugPlan] : []
    ))
    getPlanMock.mockResolvedValue(debugPlan)
    getProgressByPlanMock.mockResolvedValue([])

    const { getWorkspacePlanSelection } = await import('../src/lib/server/request-context')
    const selection = await getWorkspacePlanSelection('local-user', null)

    expect(selection.latestProfileId).toBe('profile-debug')
    expect(selection.plans).toEqual([debugPlan])
    expect(selection.activePlan).toEqual(debugPlan)
  })
})
