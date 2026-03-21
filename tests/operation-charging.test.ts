import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  canUseWalletSecretStorageMock,
  loadWalletConnectionUrlMock,
  getPaymentProviderMock,
  updateOperationChargeMock
} = vi.hoisted(() => ({
  canUseWalletSecretStorageMock: vi.fn(),
  loadWalletConnectionUrlMock: vi.fn(),
  getPaymentProviderMock: vi.fn(),
  updateOperationChargeMock: vi.fn()
}))

vi.mock('../src/lib/payments/wallet-connection', () => ({
  canUseWalletSecretStorage: canUseWalletSecretStorageMock,
  loadWalletConnectionUrl: loadWalletConnectionUrlMock
}))

vi.mock('../src/lib/providers/payment-provider', () => ({
  getPaymentProvider: getPaymentProviderMock
}))

vi.mock('../src/lib/db/db-helpers', () => ({
  updateOperationCharge: updateOperationChargeMock
}))

import {
  canChargeOperation,
  chargeOperation,
  quoteOperationCharge,
  recordChargeResult
} from '../src/lib/payments/operation-charging'

describe('operation charging domain', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    canUseWalletSecretStorageMock.mockReset()
    loadWalletConnectionUrlMock.mockReset()
    getPaymentProviderMock.mockReset()
    updateOperationChargeMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('no marca gratis un build local solo por el nombre del modelo', () => {
    const result = quoteOperationCharge({
      operation: 'plan_build',
      model: 'ollama:qwen3:8b'
    })

    expect(result.chargeable).toBe(true)
    expect(result.reasonCode).toBeNull()
    expect(result.estimatedCostSats).toBeGreaterThan(0)
    expect(getPaymentProviderMock).not.toHaveBeenCalled()
  })

  it('rechaza cuando el presupuesto de la billetera no alcanza', async () => {
    vi.stubEnv('LAP_LIGHTNING_RECEIVER_NWC_URL', 'receiver-url')
    canUseWalletSecretStorageMock.mockReturnValue(true)
    loadWalletConnectionUrlMock.mockResolvedValue('wallet-url')

    const receiverProvider = {
      close: vi.fn(),
      getStatus: vi.fn(),
      createInvoice: vi.fn(),
      payInvoice: vi.fn()
    }
    const walletProvider = {
      close: vi.fn(),
      getStatus: vi.fn(async () => ({
        alias: 'Casa',
        network: 'mainnet',
        pubkey: 'pubkey',
        methods: ['get_info', 'get_balance', 'pay_invoice'],
        balanceMsats: 100_000,
        budgetTotalMsats: 2_000,
        budgetUsedMsats: 1_000,
        budgetRenewal: 'daily',
        budgetRenewsAt: null
      })),
      createInvoice: vi.fn(),
      payInvoice: vi.fn()
    }

    getPaymentProviderMock.mockImplementation((_providerId, config: { connectionUrl: string }) => (
      config.connectionUrl === 'receiver-url' ? receiverProvider : walletProvider
    ))

    const result = await canChargeOperation({
      operation: 'plan_build',
      model: 'openai:gpt-4o-mini',
      estimatedCostUsd: 0.001,
      estimatedCostSats: 2
    })

    expect(result).toEqual(expect.objectContaining({
      decision: 'rejected',
      reasonCode: 'insufficient_budget',
      wallet: expect.objectContaining({
        alias: 'Casa',
        budgetRemainingSats: 1
      })
    }))
  })

  it('cobra por NWC cuando la billetera y el receptor estan listos', async () => {
    vi.stubEnv('LAP_LIGHTNING_RECEIVER_NWC_URL', 'receiver-url')
    vi.stubEnv('LAP_LIGHTNING_INVOICE_EXPIRY_SECONDS', '120')
    canUseWalletSecretStorageMock.mockReturnValue(true)
    loadWalletConnectionUrlMock.mockResolvedValue('wallet-url')

    const receiverProvider = {
      close: vi.fn(),
      getStatus: vi.fn(),
      createInvoice: vi.fn(async () => ({
        paymentRequest: 'lnbc1-paid',
        paymentHash: 'hash-1'
      })),
      payInvoice: vi.fn()
    }
    const walletProvider = {
      close: vi.fn(),
      getStatus: vi.fn(async () => ({
        alias: 'Casa',
        network: 'mainnet',
        pubkey: 'pubkey',
        methods: ['get_info', 'get_balance', 'pay_invoice'],
        balanceMsats: 500_000,
        budgetTotalMsats: 500_000,
        budgetUsedMsats: 0,
        budgetRenewal: 'daily',
        budgetRenewsAt: null
      })),
      createInvoice: vi.fn(),
      payInvoice: vi.fn(async () => ({
        preimage: 'preimage-1'
      }))
    }

    getPaymentProviderMock.mockImplementation((_providerId, config: { connectionUrl: string }) => (
      config.connectionUrl === 'receiver-url' ? receiverProvider : walletProvider
    ))

    const result = await chargeOperation({
      operation: 'plan_build',
      amountSats: 2,
      description: 'LAP plan build'
    })

    expect(receiverProvider.createInvoice).toHaveBeenCalledWith({
      amountSats: 2,
      description: 'LAP plan build',
      expirySeconds: 120
    })
    expect(walletProvider.payInvoice).toHaveBeenCalledWith({
      invoice: 'lnbc1-paid'
    })
    expect(result).toEqual(expect.objectContaining({
      status: 'paid',
      chargedSats: 2,
      paymentProvider: 'nwc',
      lightningPaymentHash: 'hash-1',
      lightningPreimage: 'preimage-1'
    }))
  })

  it('normaliza errores de pago insuficiente como rechazo', async () => {
    vi.stubEnv('LAP_LIGHTNING_RECEIVER_NWC_URL', 'receiver-url')
    canUseWalletSecretStorageMock.mockReturnValue(true)
    loadWalletConnectionUrlMock.mockResolvedValue('wallet-url')

    const receiverProvider = {
      close: vi.fn(),
      getStatus: vi.fn(),
      createInvoice: vi.fn(async () => ({
        paymentRequest: 'lnbc1-paid',
        paymentHash: 'hash-1'
      })),
      payInvoice: vi.fn()
    }
    const walletProvider = {
      close: vi.fn(),
      getStatus: vi.fn(async () => ({
        alias: 'Casa',
        network: 'mainnet',
        pubkey: 'pubkey',
        methods: ['get_info', 'get_balance', 'pay_invoice'],
        balanceMsats: 500_000,
        budgetTotalMsats: null,
        budgetUsedMsats: null,
        budgetRenewal: null,
        budgetRenewsAt: null
      })),
      createInvoice: vi.fn(),
      payInvoice: vi.fn(async () => {
        throw new Error('insufficient balance')
      })
    }

    getPaymentProviderMock.mockImplementation((_providerId, config: { connectionUrl: string }) => (
      config.connectionUrl === 'receiver-url' ? receiverProvider : walletProvider
    ))

    const result = await chargeOperation({
      operation: 'plan_build',
      amountSats: 3,
      description: 'LAP plan build'
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'rejected',
      chargedSats: 0,
      reasonCode: 'insufficient_balance'
    }))
  })

  it('persiste el resultado normalizado del cobro en el tracking', async () => {
    updateOperationChargeMock.mockResolvedValue({
      id: 'charge-1',
      status: 'paid'
    })

    await recordChargeResult('charge-1', {
      status: 'paid',
      paymentProvider: 'nwc',
      chargedSats: 2,
      lightningPaymentHash: 'hash-1',
      providerReference: 'hash-1'
    })

    expect(updateOperationChargeMock).toHaveBeenCalledWith('charge-1', expect.objectContaining({
      status: 'paid',
      paymentProvider: 'nwc',
      chargedSats: 2,
      lightningPaymentHash: 'hash-1',
      providerReference: 'hash-1'
    }))
  })
})
