import { describe, expect, it } from 'vitest'

import { resolveWorkspaceNavigation } from '../components/workspace/workspace-navigation'

describe('workspace navigation', () => {
  it('muestra solo configuraciones en setup', () => {
    const navItems = resolveWorkspaceNavigation('SETUP', 'settings')

    expect(navItems.map((item) => item.key)).toEqual(['settings'])
    expect(navItems[0]?.active).toBe(true)
  })

  it('oculta dashboard en plan y marca objetivos', () => {
    const navItems = resolveWorkspaceNavigation('PLAN', 'intake')

    expect(navItems.map((item) => item.key)).toEqual(['intake', 'settings'])
    expect(navItems.find((item) => item.key === 'dashboard')).toBeUndefined()
    expect(navItems.find((item) => item.key === 'intake')?.active).toBe(true)
  })

  it('expone la navegacion completa en ready y marca la vista activa', () => {
    const navItems = resolveWorkspaceNavigation('READY', 'tasks')

    expect(navItems.map((item) => item.key)).toEqual([
      'dashboard',
      'planner',
      'tasks',
      'intake',
      'settings'
    ])
    expect(navItems.filter((item) => item.active)).toHaveLength(1)
    expect(navItems.find((item) => item.key === 'tasks')?.active).toBe(true)
  })

  it('mantiene la estructura completa durante loading para evitar hydration mismatch', () => {
    const navItems = resolveWorkspaceNavigation('LOADING', 'dashboard')

    expect(navItems.map((item) => item.key)).toEqual([
      'dashboard',
      'planner',
      'tasks',
      'intake',
      'settings'
    ])
    expect(navItems.find((item) => item.key === 'dashboard')?.active).toBe(true)
  })
})
