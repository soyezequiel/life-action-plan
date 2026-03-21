export function normalizeWalletConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error'
  const normalized = message.toLowerCase()

  if (message === 'INVALID_NWC_URL') {
    return message
  }

  if (
    normalized.includes('no info event') &&
    normalized.includes('13194')
  ) {
    return 'WALLET_NWC_INFO_UNAVAILABLE'
  }

  return message
}
