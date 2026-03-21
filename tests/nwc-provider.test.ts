import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NwcPaymentProvider } from '../src/lib/payments/nwc-provider'

const nwcStore = vi.hoisted(() => ({
  instances: [] as Array<{
    version?: string
    getWalletServiceInfo: ReturnType<typeof vi.fn>
  }>,
  versionsByUrl: new Map<string, string[]>()
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

    constructor(options?: { nostrWalletConnectUrl?: string }) {
      this.connectionUrl = options?.nostrWalletConnectUrl ?? ''
      this.getWalletServiceInfo = vi.fn(async () => ({
        versions: nwcStore.versionsByUrl.get(this.connectionUrl) ?? ['1.0'],
        capabilities: [],
        notifications: []
      }))
      nwcStore.instances.push(this)
    }

    async getInfo() {
      return {
        alias: 'Demo wallet',
        color: '#00ff00',
        pubkey: 'wallet-pubkey',
        network: 'bitcoin',
        block_height: 1,
        block_hash: 'hash',
        methods: ['get_info', 'get_balance', 'get_budget']
      }
    }

    async getBalance() {
      return { balance: 21_000 }
    }

    async getBudget() {
      return {}
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
      this.relay.close()
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
    nwcStore.instances.length = 0
    nwcStore.versionsByUrl = new Map([
      [SAMPLE_NWC_URL, ['0.0']],
      [SAMPLE_NWC_URL_V1, ['0.0', '1.0']]
    ])
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
})
