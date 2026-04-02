import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NwcPaymentProvider } from '../src/lib/payments/nwc-provider'

const nwcStore = vi.hoisted(() => ({
  instances: [] as Array<{
    version?: string
    getWalletServiceInfo: ReturnType<typeof vi.fn>
    getInfo: ReturnType<typeof vi.fn>
    getBalance: ReturnType<typeof vi.fn>
    getBudget: ReturnType<typeof vi.fn>
    closeClient: ReturnType<typeof vi.fn>
  }>,
  versionsByUrl: new Map<string, string[]>(),
  getWalletServiceInfoByUrl: new Map<string, () => Promise<{ versions: string[]; capabilities: string[]; notifications: string[] }>>(),
  getInfoByUrl: new Map<string, () => Promise<{
    alias: string
    color: string
    pubkey: string
    network: string
    block_height: number
    block_hash: string
    methods: string[]
  }>>(),
  getBalanceByUrl: new Map<string, () => Promise<{ balance: number | null }>>(),
  getBudgetByUrl: new Map<string, () => Promise<Record<string, never>>>()
}))

vi.mock('@getalby/sdk', () => {
  class MockNWCClient {
    relay = {
      connected: true,
      close: vi.fn()
    }
    relayUrl = 'wss://relay.example.com'
    secret = 'secret'
    lud16 = undefined
    walletPubkey = 'wallet-pubkey'
    options = {
      relayUrl: 'wss://relay.example.com',
      walletPubkey: 'wallet-pubkey',
      secret: 'secret'
    }
    version: string | undefined
    private readonly connectionUrl: string
    readonly getWalletServiceInfo: ReturnType<typeof vi.fn>
    readonly getInfo: ReturnType<typeof vi.fn>
    readonly getBalance: ReturnType<typeof vi.fn>
    readonly getBudget: ReturnType<typeof vi.fn>
    readonly closeClient: ReturnType<typeof vi.fn>

    constructor(options?: { nostrWalletConnectUrl?: string }) {
      this.connectionUrl = options?.nostrWalletConnectUrl ?? ''
      this.getWalletServiceInfo = vi.fn(async () => {
        const override = nwcStore.getWalletServiceInfoByUrl.get(this.connectionUrl)
        if (override) {
          return override()
        }

        return {
          versions: nwcStore.versionsByUrl.get(this.connectionUrl) ?? ['1.0'],
          capabilities: [],
          notifications: []
        }
      })
      this.getInfo = vi.fn(async () => {
        const override = nwcStore.getInfoByUrl.get(this.connectionUrl)
        if (override) {
          return override()
        }

        return {
          alias: 'Demo wallet',
          color: '#00ff00',
          pubkey: 'wallet-pubkey',
          network: 'bitcoin',
          block_height: 1,
          block_hash: 'hash',
          methods: ['get_info', 'get_balance', 'get_budget']
        }
      })
      this.getBalance = vi.fn(async () => {
        const override = nwcStore.getBalanceByUrl.get(this.connectionUrl)
        if (override) {
          return override()
        }

        return { balance: 21_000 }
      })
      this.getBudget = vi.fn(async () => {
        const override = nwcStore.getBudgetByUrl.get(this.connectionUrl)
        if (override) {
          return override()
        }

        return {}
      })
      this.closeClient = vi.fn(() => {
        this.relay.close()
      })
      nwcStore.instances.push(this)
    }

    async makeInvoice() {
      return {
        invoice: 'lnbc1demo',
        payment_hash: 'hash-demo'
      }
    }

    async payInvoice() {
      return { preimage: 'preimage-demo' }
    }

    close() {
      this.closeClient()
    }
  }

  return {
    nwc: {
      NWCClient: MockNWCClient
    }
  }
})

const SAMPLE_NWC_URL = 'nostr+walletconnect://69effe7b49a6dd5cf525bd0905917a5005ffe480b58eeb8e861418cf3ae760d9?relay=wss://relay.getalby.com&secret=c60320b3ecb6c15557510d1518ef41194e9f9337c82621ddef3f979f668bfebd'
const SAMPLE_NWC_URL_V1 = 'nostr+walletconnect://69effe7b49a6dd5cf525bd0905917a5005ffe480b58eeb8e861418cf3ae760d0?relay=wss://relay.getalby.com&secret=c60320b3ecb6c15557510d1518ef41194e9f9337c82621ddef3f979f668bfeb0'

describe('nwc payment provider', () => {
  beforeEach(() => {
    vi.useRealTimers()
    nwcStore.instances.length = 0
    nwcStore.versionsByUrl = new Map([
      [SAMPLE_NWC_URL, ['0.0']],
      [SAMPLE_NWC_URL_V1, ['0.0', '1.0']]
    ])
    nwcStore.getWalletServiceInfoByUrl = new Map()
    nwcStore.getInfoByUrl = new Map()
    nwcStore.getBalanceByUrl = new Map()
    nwcStore.getBudgetByUrl = new Map()
  })

  it('cachea la version compatible por conexion y evita renegociarla en cada provider', async () => {
    const firstProvider = new NwcPaymentProvider(SAMPLE_NWC_URL)
    await firstProvider.getStatus()
    firstProvider.close()

    expect(nwcStore.instances[0]?.getWalletServiceInfo).toHaveBeenCalledTimes(1)
    expect(nwcStore.instances[0]?.version).toBe('0.0')

    const secondProvider = new NwcPaymentProvider(SAMPLE_NWC_URL)
    await secondProvider.getStatus()
    secondProvider.close()

    expect(nwcStore.instances[1]?.getWalletServiceInfo).not.toHaveBeenCalled()
    expect(nwcStore.instances[1]?.version).toBe('0.0')
  })

  it('prefiere NIP-44 cuando la billetera ya ofrece la version nueva', async () => {
    const provider = new NwcPaymentProvider(SAMPLE_NWC_URL_V1)

    await provider.getStatus()

    expect(nwcStore.instances[0]?.version).toBe('1.0')
    expect(nwcStore.instances[0]?.getWalletServiceInfo).toHaveBeenCalledTimes(1)
  })

  it('corta en getInfo cuando la billetera no responde y no dispara balance ni budget', async () => {
    vi.useFakeTimers()
    nwcStore.getInfoByUrl.set(SAMPLE_NWC_URL, () => new Promise(() => {}))

    const provider = new NwcPaymentProvider(SAMPLE_NWC_URL)
    const statusPromise = provider.getStatus()
    const rejection = expect(statusPromise).rejects.toThrow('WALLET_NWC_INFO_UNAVAILABLE')

    await vi.advanceTimersByTimeAsync(4_500)

    await rejection
    expect(nwcStore.instances[0]?.getInfo).toHaveBeenCalledTimes(1)
    expect(nwcStore.instances[0]?.getBalance).not.toHaveBeenCalled()
    expect(nwcStore.instances[0]?.getBudget).not.toHaveBeenCalled()
    expect(nwcStore.instances[0]?.closeClient).toHaveBeenCalledTimes(1)
  })

  it('permite validar la conexion sin pedir balance ni budget', async () => {
    const provider = new NwcPaymentProvider(SAMPLE_NWC_URL)

    const status = await provider.getStatus({
      includeBalance: false,
      includeBudget: false
    })

    expect(status).toEqual(expect.objectContaining({
      alias: 'Demo wallet',
      methods: ['get_info', 'get_balance', 'get_budget'],
      balanceMsats: null,
      budgetTotalMsats: null,
      budgetUsedMsats: null
    }))
    expect(nwcStore.instances[0]?.getBalance).not.toHaveBeenCalled()
    expect(nwcStore.instances[0]?.getBudget).not.toHaveBeenCalled()
  })

  it('degrada balance y budget a null cuando la wallet responde solo con info', async () => {
    nwcStore.getBalanceByUrl.set(SAMPLE_NWC_URL, async () => {
      throw new Error('reply timeout')
    })
    nwcStore.getBudgetByUrl.set(SAMPLE_NWC_URL, async () => {
      throw new Error('reply timeout')
    })

    const provider = new NwcPaymentProvider(SAMPLE_NWC_URL)
    const status = await provider.getStatus()

    expect(status).toEqual(expect.objectContaining({
      alias: 'Demo wallet',
      methods: ['get_info', 'get_balance', 'get_budget'],
      balanceMsats: null,
      budgetTotalMsats: null,
      budgetUsedMsats: null
    }))
  })
})
