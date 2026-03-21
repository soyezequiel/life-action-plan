const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeLoginIdentifier(value: string): string {
  return value.trim()
}

export function extractEmailFromLoginIdentifier(value: string): string | null {
  const normalized = normalizeLoginIdentifier(value).toLowerCase()
  return EMAIL_PATTERN.test(normalized) ? normalized : null
}
