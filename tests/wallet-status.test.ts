import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const canUseWalletSecretStorageMock = vi.hoisted(() => vi.fn())
const loadWalletConnectionUrlMock = vi.hoisted(() => vi.fn())
const getPaymentProviderMock = vi.hoisted(() => vi.fn())

vi.mock('../src/lib/payments/wallet-connection', () => ({
  canUseWalletSecretStorage: canUseWalletSecretStorageMock,
  clearWalletConnectionUrl: vi.fn(),
  loadWalletConnectionUrl: loadWalletConnectionUrlMock,
  saveWalletConnectionUrl: vi.fn()
}))

vi.mock('../src/lib/providers/payment-provider', () => ({
  getPaymentProvider: getPaymentProviderMock
}))

vi.mock('../src/lib/auth/credential-config', () => ({
  DEFAULT_BACKEND_OWNER_ID: 'backend-default',
  listCredentialConfigurations: vi.fn(async () => [])
}))

vi.mock('../src/lib/providers/provider-metadata', () => ({
  DEFAULT_OPENAI_BUILD_MODEL: 'gpt-4o-mini',
  getDefaultBuildModelForProvider: vi.fn(() => 'gpt-4o-mini')
}))

vi.mock('../src/lib/runtime/build-execution', () => ({
  resolvePlanBuildExecution: vi.fn(async () => ({
    billingPolicy: {
      chargeable: false,
      estimatedCostUsd: 0,
      estimatedCostSats: 0,
      skipReasonCode: 'operation_not_chargeable'
    }
  }))
}))

vi.mock('../app/api/_domain', () => ({
  canChargeOperation: vi.fn(async () => ({ decision: 'skipped', reasonCode: 'operation_not_chargeable' })),
  getPaymentProvider: getPaymentProviderMock
}))

vi.mock('../app/api/_db', () => ({
  trackEvent: vi.fn(async () => undefined)
}))

describe('wallet status', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    canUseWalletSecretStorageMock.mockReturnValue(true)
    loadWalletConnectionUrlMock.mockResolvedValue('nostr+walletconnect://demo?relay=wss://relay.example.com&secret=test')
    getPaymentProviderMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('degrada a disconnected cuando la wallet no responde a tiempo', async () => {
    const closeMock = vi.fn()

    getPaymentProviderMock.mockReturnValue({
      getStatus: vi.fn(() => new Promise(() => {})),
      close: closeMock
    })

    const { getWalletStatus } = await import('../app/api/_wallet')

    const statusPromise = getWalletStatus('user-1')
    await vi.advanceTimersByTimeAsync(6_500)

    await expect(statusPromise).resolves.toEqual({
      configured: true,
      connected: false,
      canUseSecureStorage: true,
      alias: undefined,
      balanceSats: undefined,
      budgetSats: undefined,
      budgetUsedSats: undefined
    })
    expect(closeMock).toHaveBeenCalledTimes(1)
  }, 10_000)

  it('corta la conexion cuando la wallet no responde durante el alta inicial', async () => {
    const closeMock = vi.fn()
    const getStatusMock = vi.fn(() => new Promise(() => {}))

    getPaymentProviderMock.mockReturnValue({
      getStatus: getStatusMock,
      close: closeMock
    })

    const { connectWallet } = await import('../app/api/_wallet')

    const resultPromise = connectWallet(
      'nostr+walletconnect://demo?relay=wss://relay.example.com&secret=test',
      'user-1'
    )
    await vi.advanceTimersByTimeAsync(6_500)

    await expect(resultPromise).resolves.toEqual({
      success: false,
      status: {
        configured: false,
        connected: false,
        canUseSecureStorage: true,
        alias: undefined,
        balanceSats: undefined,
        budgetSats: undefined,
        budgetUsedSats: undefined
      },
      error: 'WALLET_NWC_INFO_UNAVAILABLE'
    })
    expect(getStatusMock).toHaveBeenCalledWith({
      includeBalance: false,
      includeBudget: false
    })
    expect(closeMock).toHaveBeenCalledTimes(1)
  }, 10_000)
})
