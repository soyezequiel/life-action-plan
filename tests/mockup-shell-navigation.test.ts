import { describe, expect, it, vi } from 'vitest'

import { resolveMockupNavigation } from '../components/midnight-mint/mockup-shell.navigation'

describe('mockup shell navigation', () => {
  it('respeta la navegacion y footer custom cuando se proveen', () => {
    const onLogout = vi.fn()

    const result = resolveMockupNavigation({
      onboardingStep: 'READY',
      pathname: '/settings',
      variant: null,
      sidebarNav: [
        { label: 'Dashboard', icon: 'dashboard', href: '/' },
        { label: 'Objetivos', icon: 'flag', href: '/intake', active: true }
      ],
      sidebarFooter: [{ label: 'Salir ya', icon: 'logout', onClick: onLogout }],
      onLogout
    })

    expect(result.navItems).toHaveLength(2)
    expect(result.navItems[1]?.active).toBe(true)
    expect(result.footerItems).toHaveLength(1)
    expect(result.footerItems[0]?.label).toBe('Salir ya')
    expect(result.currentSectionLabel).toBe('Objetivos')
  })

  it('arma la navegacion canonica para un usuario listo', () => {
    const result = resolveMockupNavigation({
      onboardingStep: 'READY',
      pathname: '/intake',
      variant: null,
      onLogout: vi.fn()
    })

    expect(result.navItems.map((item) => item.label)).toEqual([
      'Dashboard',
      'Planificador',
      'Tareas Activas',
      'Objetivos',
      'Configuraciones'
    ])
    expect(result.navItems[3]?.active).toBe(true)
    expect(result.currentSectionLabel).toBe('Objetivos')
    expect(result.footerItems[0]?.label).toBe('Salir')
  })
})
