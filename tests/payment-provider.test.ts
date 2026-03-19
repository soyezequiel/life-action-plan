import { describe, expect, it } from 'vitest'
import { getPaymentProvider } from '../src/providers/payment-provider'

const SAMPLE_NWC_URL = 'nostr+walletconnect://69effe7b49a6dd5cf525bd0905917a5005ffe480b58eeb8e861418cf3ae760d9?relay=wss://nostr-relay.getalby.com&secret=c60320b3ecb6c15557510d1518ef41194e9f9337c82621ddef3f979f668bfebd'

describe('getPaymentProvider', () => {
  it('crea un provider NWC con la interfaz esperada', () => {
    const provider = getPaymentProvider('nwc', { connectionUrl: SAMPLE_NWC_URL })

    expect(provider).toBeDefined()
    expect(provider.getStatus).toBeTypeOf('function')
    expect(provider.createInvoice).toBeTypeOf('function')
    expect(provider.payInvoice).toBeTypeOf('function')
    expect(provider.close).toBeTypeOf('function')

    provider.close()
  })

  it('rechaza connection strings inválidos', () => {
    expect(() => getPaymentProvider('nwc', { connectionUrl: 'https://example.com' })).toThrow('INVALID_NWC_URL')
  })

  it('rechaza providers desconocidos', () => {
    expect(() => getPaymentProvider('lightningd', { connectionUrl: SAMPLE_NWC_URL })).toThrow('Unknown payment provider')
  })
})
