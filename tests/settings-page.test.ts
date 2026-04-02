import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`)
})

const getCurrentSessionMock = vi.fn()
const getWalletStatusMock = vi.fn()
const findCredentialConfigurationMock = vi.fn()
const isSecretStorageAvailableMock = vi.fn()
const getApiKeySettingKeyMock = vi.fn((providerId: string) => `${providerId}-key`)

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}))

vi.mock('../app/api/_wallet', () => ({
  getWalletStatus: getWalletStatusMock
}))

vi.mock('../src/lib/auth/credential-config', () => ({
  findCredentialConfiguration: findCredentialConfigurationMock
}))

vi.mock('../src/lib/auth/secret-storage', () => ({
  isSecretStorageAvailable: isSecretStorageAvailableMock
}))

vi.mock('../src/lib/auth/user-settings', () => ({
  getApiKeySettingKey: getApiKeySettingKeyMock
}))

vi.mock('@/src/lib/server/request-context', () => ({
  getCurrentSession: getCurrentSessionMock
}))

vi.mock('../components/SettingsPageContent', () => ({
  default: (props: unknown) => ({
    component: 'SettingsPageContent',
    props
  })
}))

describe('settings page', () => {
  beforeEach(() => {
    redirectMock.mockClear()
    getCurrentSessionMock.mockReset()
    getWalletStatusMock.mockReset()
    findCredentialConfigurationMock.mockReset()
    isSecretStorageAvailableMock.mockReset()
    getApiKeySettingKeyMock.mockClear()
  })

  it('redirige a signin cuando no hay sesion', async () => {
    getCurrentSessionMock.mockResolvedValue(null)

    const { default: SettingsPage } = await import('../app/settings/page')

    await expect(
      SettingsPage({
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrow('REDIRECT:/auth/signin?callbackUrl=/settings')
  })

  it('monta settings sobre WorkspaceOrchestrator con props iniciales', async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: 'user-1' } })
    getWalletStatusMock.mockResolvedValue({ connected: true, balanceSats: 1200 })
    isSecretStorageAvailableMock.mockReturnValue(true)
    findCredentialConfigurationMock
      .mockResolvedValueOnce({ status: 'active' })
      .mockResolvedValueOnce(null)

    const { default: SettingsPage } = await import('../app/settings/page')
    const result = await SettingsPage({
      searchParams: Promise.resolve({
        section: 'wallet'
      })
    })

    expect(getWalletStatusMock).toHaveBeenCalledWith('user-1')
    expect(result.props).toEqual({
      section: 'wallet',
      initialWalletStatus: { connected: true, balanceSats: 1200 },
      initialApiConfigured: true
    })
  })
})
