import { NwcPaymentProvider } from '../payments/nwc-provider'

export interface PaymentProviderStatus {
  alias: string | null
  network: string | null
  pubkey: string | null
  methods: string[]
  balanceMsats: number
  budgetTotalMsats: number | null
  budgetUsedMsats: number | null
  budgetRenewal: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never' | null
  budgetRenewsAt: number | null
}

export interface CreateInvoiceParams {
  amountSats: number
  description?: string
  expirySeconds?: number
}

export interface CreateInvoiceResult {
  paymentRequest: string
  paymentHash: string
}

export interface PayInvoiceParams {
  invoice: string
  amountSats?: number
}

export interface PayInvoiceResult {
  preimage: string
}

export interface PaymentProvider {
  getStatus: () => Promise<PaymentProviderStatus>
  createInvoice: (params: CreateInvoiceParams) => Promise<CreateInvoiceResult>
  payInvoice: (params: PayInvoiceParams) => Promise<PayInvoiceResult>
  close: () => void
}

interface PaymentProviderConfig {
  connectionUrl: string
}

export function getPaymentProvider(providerId: string, config: PaymentProviderConfig): PaymentProvider {
  if (providerId === 'nwc') {
    return new NwcPaymentProvider(config.connectionUrl)
  }

  throw new Error(`Unknown payment provider: ${providerId}`)
}
