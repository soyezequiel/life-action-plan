export function normalizeWalletConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error'
  const normalized = message.toLowerCase()

  if (message === 'INVALID_NWC_URL') {
    return message
  }

  if (
    normalized.includes('unsupported_nwc_version') ||
    normalized.includes('unsupported_version')
  ) {
    return 'WALLET_NWC_INFO_UNAVAILABLE'
  }

  if (
    normalized.includes('no info event') &&
    normalized.includes('13194')
  ) {
    return 'WALLET_NWC_INFO_UNAVAILABLE'
  }

  if (
    normalized.includes('reply timeout') ||
    normalized.includes('wallet_status_timeout') ||
    normalized.includes('wallet_nwc_info_unavailable') ||
    normalized.includes('wallet_nwc_balance_unavailable') ||
    normalized.includes('wallet_nwc_budget_unavailable')
  ) {
    return 'WALLET_NWC_INFO_UNAVAILABLE'
  }

  return message
}
