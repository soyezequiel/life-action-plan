import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`)
})

const getCurrentSessionMock = vi.fn()
const getTasksInitialDataMock = vi.fn()

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}))

vi.mock('../src/lib/server/request-context', () => ({
  getCurrentSession: getCurrentSessionMock,
  getTasksInitialData: getTasksInitialDataMock
}))

vi.mock('../components/workspace/WorkspaceOrchestrator', () => ({
  WorkspaceOrchestrator: ({ viewKey, viewProps }: { viewKey: string, viewProps: unknown }) => ({
    viewKey,
    viewProps
  })
}))

describe('tasks page', () => {
  beforeEach(() => {
    redirectMock.mockClear()
    getCurrentSessionMock.mockReset()
    getTasksInitialDataMock.mockReset()
  })

  it('redirige a signin cuando no hay sesion', async () => {
    getCurrentSessionMock.mockResolvedValue(null)

    const { default: TasksPage } = await import('../app/tasks/page')

    await expect(
      TasksPage({
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrow('REDIRECT:/auth/signin?callbackUrl=/tasks')
  })

  it('monta tasks sobre WorkspaceOrchestrator con initialTasks', async () => {
    const initialTasks = [{ id: 'task-1', descripcion: 'Revisar', completado: false }]

    getCurrentSessionMock.mockResolvedValue({ user: { id: 'user-1' } })
    getTasksInitialDataMock.mockResolvedValue(initialTasks)

    const { default: TasksPage } = await import('../app/tasks/page')
    const result = await TasksPage({
      searchParams: Promise.resolve({
        planId: 'plan-1'
      })
    })

    expect(getTasksInitialDataMock).toHaveBeenCalledWith('user-1', 'plan-1')
    expect(result.props).toEqual({
      viewKey: 'tasks',
      viewProps: {
        initialTasks
      }
    })
  })
})
