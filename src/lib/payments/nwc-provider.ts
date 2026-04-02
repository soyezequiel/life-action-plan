import type { nwc } from '@getalby/sdk'
import type {
  CreateInvoiceParams,
  CreateInvoiceResult,
  PaymentProvider,
  PaymentProviderStatusOptions,
  PaymentProviderStatus,
  PayInvoiceParams,
  PayInvoiceResult
} from '../providers/payment-provider'

type NwcModule = typeof import('@getalby/sdk')
type NwcClient = nwc.NWCClient
type InvoiceResponseLike = nwc.Nip47Transaction & {
  paymentRequest?: string
  paymentHash?: string
}
type SupportedNwcVersion = '1.0' | '0.0'

let nwcModulePromise: Promise<NwcModule> | null = null
const supportedVersionCache = new Map<string, SupportedNwcVersion>()
const NWC_INFO_TIMEOUT_MS = 4_500
const NWC_STATUS_TIMEOUT_MS = 1_500

async function loadNwcModule(): Promise<NwcModule> {
  if (!nwcModulePromise) {
    nwcModulePromise = import('@getalby/sdk')
  }

  return nwcModulePromise
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

async function withTimeout<T>(
  promiseFactory: () => Promise<T>,
  timeoutMs: number,
  errorCode: string,
  onTimeout: () => void,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      promiseFactory(),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          onTimeout()
          reject(new Error(errorCode))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

function isSupportedVersion(value: string | undefined): value is SupportedNwcVersion {
  return value === '1.0' || value === '0.0'
}

function selectCompatibleVersion(versions: string[]): SupportedNwcVersion | null {
  if (versions.includes('1.0')) {
    return '1.0'
  }

  if (versions.includes('0.0')) {
    return '0.0'
  }

  return null
}

export class NwcPaymentProvider implements PaymentProvider {
  private readonly connectionUrl: string
  private clientPromise: Promise<NwcClient> | null = null
  private client: NwcClient | null = null

  constructor(connectionUrl: string) {
    const normalizedConnectionUrl = connectionUrl.trim()

    if (!normalizedConnectionUrl.startsWith('nostr+walletconnect://')) {
      throw new Error('INVALID_NWC_URL')
    }

    this.connectionUrl = normalizedConnectionUrl
  }

  private async getClient(): Promise<NwcClient> {
    if (!this.clientPromise) {
      this.clientPromise = loadNwcModule()
        .then(async ({ nwc }) => {
          const client = new nwc.NWCClient({
            nostrWalletConnectUrl: this.connectionUrl
          })
          this.client = client
          await this.ensureCompatibleVersion(client)
          return client
        })
        .catch((error) => {
          this.clientPromise = null
          this.client = null
          throw error
        })
    }

    return this.clientPromise
  }

  private async runClientRequest<T>(
    client: NwcClient,
    request: () => Promise<T>,
    errorCode: string,
    timeoutMs: number,
  ): Promise<T> {
    return withTimeout(
      request,
      timeoutMs,
      errorCode,
      () => {
        this.close()
      },
    )
  }

  private async ensureCompatibleVersion(client: NwcClient): Promise<void> {
    if (isSupportedVersion(client.version)) {
      supportedVersionCache.set(this.connectionUrl, client.version)
      return
    }

    const cachedVersion = supportedVersionCache.get(this.connectionUrl)

    if (cachedVersion) {
      client.version = cachedVersion
      return
    }

    const serviceInfo = await this.runClientRequest(
      client,
      () => client.getWalletServiceInfo(),
      'WALLET_NWC_INFO_UNAVAILABLE',
      NWC_INFO_TIMEOUT_MS,
    )
    const compatibleVersion = selectCompatibleVersion(serviceInfo.versions)

    if (!compatibleVersion) {
      throw new Error('UNSUPPORTED_NWC_VERSION')
    }

    client.version = compatibleVersion
    supportedVersionCache.set(this.connectionUrl, compatibleVersion)
  }

  async getStatus(options: PaymentProviderStatusOptions = {}): Promise<PaymentProviderStatus> {
    const client = await this.getClient()
    const shouldIncludeBalance = options.includeBalance ?? true
    const shouldIncludeBudget = options.includeBudget ?? true
    const info = await this.runClientRequest(
      client,
      () => client.getInfo(),
      'WALLET_NWC_INFO_UNAVAILABLE',
      NWC_INFO_TIMEOUT_MS,
    )

    const balancePromise = shouldIncludeBalance && info.methods.includes('get_balance')
      ? this.runClientRequest(
        client,
        () => client.getBalance(),
        'WALLET_NWC_BALANCE_UNAVAILABLE',
        NWC_STATUS_TIMEOUT_MS,
      ).catch(() => ({ balance: null }))
      : Promise.resolve({ balance: null })

    const budgetPromise = shouldIncludeBudget && info.methods.includes('get_budget')
      ? this.runClientRequest(
        client,
        () => client.getBudget(),
        'WALLET_NWC_BUDGET_UNAVAILABLE',
        NWC_STATUS_TIMEOUT_MS,
      ).catch(() => ({}))
      : Promise.resolve({})

    const [balance, budget] = await Promise.all([balancePromise, budgetPromise])

    return {
      alias: info.alias || null,
      network: info.network || null,
      pubkey: info.pubkey || null,
      methods: info.methods,
      balanceMsats: typeof balance.balance === 'number' ? balance.balance : null,
      ...normalizeBudget(budget)
    }
  }

  async createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResult> {
    if (params.amountSats <= 0) {
      throw new Error('INVALID_AMOUNT')
    }

    const client = await this.getClient()
    const invoice = await client.makeInvoice({
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
    const client = await this.getClient()
    const response = await client.payInvoice({
      invoice: params.invoice,
      amount: typeof params.amountSats === 'number' ? toMilliSats(params.amountSats) : undefined
    })

    return {
      preimage: response.preimage
    }
  }

  close(): void {
    this.client?.close()
    this.client = null
    this.clientPromise = null
  }
}
