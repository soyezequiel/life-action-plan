import { nwc } from '@getalby/sdk'
import type {
  CreateInvoiceParams,
  CreateInvoiceResult,
  PaymentProvider,
  PaymentProviderStatus,
  PayInvoiceParams,
  PayInvoiceResult
} from '../providers/payment-provider'

type InvoiceResponseLike = nwc.Nip47Transaction & {
  paymentRequest?: string
  paymentHash?: string
}

function normalizeBudget(budget: nwc.Nip47GetBudgetResponse): Pick<
  PaymentProviderStatus,
  'budgetTotalMsats' | 'budgetUsedMsats' | 'budgetRenewal' | 'budgetRenewsAt'
> {
  if ('total_budget' in budget && typeof budget.total_budget === 'number') {
    return {
      budgetTotalMsats: budget.total_budget,
      budgetUsedMsats: budget.used_budget,
      budgetRenewal: budget.renewal_period,
      budgetRenewsAt: typeof budget.renews_at === 'number' ? budget.renews_at : null
    }
  }

  return {
    budgetTotalMsats: null,
    budgetUsedMsats: null,
    budgetRenewal: null,
    budgetRenewsAt: null
  }
}

function toMilliSats(amountSats: number): number {
  return Math.max(1, Math.round(amountSats * 1000))
}

export class NwcPaymentProvider implements PaymentProvider {
  private readonly client: nwc.NWCClient

  constructor(connectionUrl: string) {
    const normalizedConnectionUrl = connectionUrl.trim()

    if (!normalizedConnectionUrl.startsWith('nostr+walletconnect://')) {
      throw new Error('INVALID_NWC_URL')
    }

    this.client = new nwc.NWCClient({
      nostrWalletConnectUrl: normalizedConnectionUrl
    })
  }

  async getStatus(): Promise<PaymentProviderStatus> {
    const [info, balance, budget] = await Promise.all([
      this.client.getInfo(),
      this.client.getBalance(),
      this.client.getBudget().catch(() => ({}))
    ])

    return {
      alias: info.alias || null,
      network: info.network || null,
      pubkey: info.pubkey || null,
      methods: info.methods,
      balanceMsats: balance.balance,
      ...normalizeBudget(budget)
    }
  }

  async createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResult> {
    if (params.amountSats <= 0) {
      throw new Error('INVALID_AMOUNT')
    }

    const invoice = await this.client.makeInvoice({
      amount: toMilliSats(params.amountSats),
      description: params.description,
      expiry: params.expirySeconds
    })
    const normalizedInvoice = invoice as InvoiceResponseLike

    return {
      paymentRequest: normalizedInvoice.paymentRequest ?? normalizedInvoice.invoice,
      paymentHash: normalizedInvoice.paymentHash ?? normalizedInvoice.payment_hash
    }
  }

  async payInvoice(params: PayInvoiceParams): Promise<PayInvoiceResult> {
    const response = await this.client.payInvoice({
      invoice: params.invoice,
      amount: typeof params.amountSats === 'number' ? toMilliSats(params.amountSats) : undefined
    })

    return {
      preimage: response.preimage
    }
  }

  close(): void {
    this.client.close()
  }
}
