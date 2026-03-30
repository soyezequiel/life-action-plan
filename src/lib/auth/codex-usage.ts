import { DateTime } from 'luxon'
import { getCodexAuthSession } from './codex-auth'

const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
const FIVE_HOUR_WINDOW_SECONDS = 5 * 60 * 60
const WEEKLY_WINDOW_SECONDS = 7 * 24 * 60 * 60

interface RawCodexUsageWindow {
  used_percent?: unknown
  limit_window_seconds?: unknown
  reset_after_seconds?: unknown
  reset_at?: unknown
}

interface RawCodexRateLimit {
  primary_window?: unknown
  secondary_window?: unknown
}

interface RawCodexCredits {
  has_credits?: unknown
  unlimited?: unknown
  balance?: unknown
  approx_local_messages?: unknown
  approx_cloud_messages?: unknown
}

export interface CodexUsageWindow {
  usedPercent: number | null
  remainingPercent: number | null
  limitWindowSeconds: number | null
  resetAfterSeconds: number | null
  resetAt: number | null
}

export interface CodexUsageRateLimit {
  primary: CodexUsageWindow | null
  secondary: CodexUsageWindow | null
  fiveHour: CodexUsageWindow | null
  weekly: CodexUsageWindow | null
}

export interface CodexCreditsUsage {
  hasCredits: boolean
  unlimited: boolean
  balance: number | null
  approxLocalMessages: number | null
  approxCloudMessages: number | null
}

export interface CodexUsageSnapshot {
  accountId: string | null
  email: string | null
  planType: string | null
  rateLimit: CodexUsageRateLimit
  codeReviewRateLimit: CodexUsageRateLimit
  credits: CodexCreditsUsage
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function normalizeBoolean(value: unknown): boolean {
  return value === true
}

function normalizeUsageWindow(value: unknown): CodexUsageWindow | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const rawWindow = value as RawCodexUsageWindow
  const usedPercent = normalizeNumber(rawWindow.used_percent)
  const limitWindowSeconds = normalizeNumber(rawWindow.limit_window_seconds)

  return {
    usedPercent,
    remainingPercent: usedPercent === null ? null : Math.max(0, 100 - usedPercent),
    limitWindowSeconds,
    resetAfterSeconds: normalizeNumber(rawWindow.reset_after_seconds),
    resetAt: normalizeNumber(rawWindow.reset_at)
  }
}

function normalizeRateLimit(value: unknown): CodexUsageRateLimit {
  const rawRateLimit = value && typeof value === 'object'
    ? value as RawCodexRateLimit
    : {}

  const primary = normalizeUsageWindow(rawRateLimit.primary_window)
  const secondary = normalizeUsageWindow(rawRateLimit.secondary_window)
  const windows = [primary, secondary].filter(Boolean) as CodexUsageWindow[]

  return {
    primary,
    secondary,
    fiveHour: windows.find((window) => window.limitWindowSeconds === FIVE_HOUR_WINDOW_SECONDS) ?? null,
    weekly: windows.find((window) => window.limitWindowSeconds === WEEKLY_WINDOW_SECONDS) ?? null
  }
}

function normalizeCredits(value: unknown): CodexCreditsUsage {
  const rawCredits = value && typeof value === 'object'
    ? value as RawCodexCredits
    : {}

  return {
    hasCredits: normalizeBoolean(rawCredits.has_credits),
    unlimited: normalizeBoolean(rawCredits.unlimited),
    balance: normalizeNumber(rawCredits.balance),
    approxLocalMessages: normalizeNumber(rawCredits.approx_local_messages),
    approxCloudMessages: normalizeNumber(rawCredits.approx_cloud_messages)
  }
}

export function parseCodexUsageSnapshot(payload: unknown): CodexUsageSnapshot {
  const rawPayload = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : {}

  return {
    accountId: normalizeString(rawPayload.account_id),
    email: normalizeString(rawPayload.email),
    planType: normalizeString(rawPayload.plan_type),
    rateLimit: normalizeRateLimit(rawPayload.rate_limit),
    codeReviewRateLimit: normalizeRateLimit(rawPayload.code_review_rate_limit),
    credits: normalizeCredits(rawPayload.credits)
  }
}

export async function fetchCodexUsageSnapshot(forceRefresh = false): Promise<CodexUsageSnapshot> {
  const session = await getCodexAuthSession(forceRefresh ? { forceRefresh: true } : undefined)
  const response = await fetch(CODEX_USAGE_URL, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'ChatGPT-Account-Id': session.accountId,
      Accept: 'application/json',
      'User-Agent': 'codex-cli'
    }
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`CODEX_USAGE_FETCH_FAILED:${response.status}:${body.trim().slice(0, 300)}`)
  }

  const payload = await response.json().catch(() => null)
  return parseCodexUsageSnapshot(payload)
}

export function hasCodexCreditsAvailable(snapshot: CodexUsageSnapshot): boolean {
  return snapshot.credits.unlimited || snapshot.credits.hasCredits
}

export function getPrimaryCodexUsageWindow(rateLimit: CodexUsageRateLimit): CodexUsageWindow | null {
  return rateLimit.fiveHour ?? rateLimit.weekly ?? rateLimit.primary ?? rateLimit.secondary
}

export function getCodexUsageWindowLabel(window: CodexUsageWindow | null): string {
  if (!window?.limitWindowSeconds) {
    return 'sin-ventana'
  }

  if (window.limitWindowSeconds === FIVE_HOUR_WINDOW_SECONDS) {
    return '5h'
  }

  if (window.limitWindowSeconds === WEEKLY_WINDOW_SECONDS) {
    return '7d'
  }

  const minutes = Math.round(window.limitWindowSeconds / 60)
  return `${minutes}m`
}

function formatResetAt(resetAt: number | null, timezone: string): string {
  if (resetAt === null) {
    return 'sin dato'
  }

  return DateTime
    .fromSeconds(resetAt, { zone: 'utc' })
    .setZone(timezone)
    .toFormat('yyyy-LL-dd HH:mm')
}

export function formatCodexCreditsLine(snapshot: CodexUsageSnapshot): string {
  const { credits } = snapshot
  const planLabel = snapshot.planType ? `plan=${snapshot.planType}` : 'plan=desconocido'

  if (credits.unlimited) {
    return `Credito Codex: ilimitado | ${planLabel}`
  }

  if (credits.hasCredits && credits.balance !== null) {
    const local = credits.approxLocalMessages !== null ? ` | local aprox=${credits.approxLocalMessages}` : ''
    const cloud = credits.approxCloudMessages !== null ? ` | cloud aprox=${credits.approxCloudMessages}` : ''
    return `Credito Codex: saldo=${credits.balance}${local}${cloud} | ${planLabel}`
  }

  return `Credito Codex: sin saldo prepago | ${planLabel}`
}

function formatCodexWindowLine(
  prefix: string,
  window: CodexUsageWindow | null,
  timezone: string
): string {
  if (!window) {
    return `${prefix}: no expuesto por el backend para esta cuenta`
  }

  const label = getCodexUsageWindowLabel(window)
  const used = window.usedPercent ?? 0
  const remaining = window.remainingPercent ?? 0
  const resetAt = formatResetAt(window.resetAt, timezone)

  return `${prefix} ${label}: ${used}% usado | ${remaining}% disponible | reinicia ${resetAt}`
}

function formatRateLimitLines(
  prefix: string,
  rateLimit: CodexUsageRateLimit,
  timezone: string
): string[] {
  const lines: string[] = []

  lines.push(rateLimit.fiveHour
    ? formatCodexWindowLine(prefix, rateLimit.fiveHour, timezone)
    : `${prefix} 5h: no expuesto por el backend para esta cuenta`)

  if (rateLimit.weekly) {
    lines.push(formatCodexWindowLine(prefix, rateLimit.weekly, timezone))
  } else if (!rateLimit.fiveHour) {
    const fallbackWindow = getPrimaryCodexUsageWindow(rateLimit)
    if (fallbackWindow) {
      lines.push(formatCodexWindowLine(prefix, fallbackWindow, timezone))
    } else {
      lines.push(`${prefix} 7d: no expuesto por el backend para esta cuenta`)
    }
  } else {
    lines.push(`${prefix} 7d: no expuesto por el backend para esta cuenta`)
  }

  return lines
}

export function formatCodexRateLimitLinesFor(
  prefix: string,
  rateLimit: CodexUsageRateLimit,
  timezone: string
): string[] {
  return formatRateLimitLines(prefix, rateLimit, timezone)
}

export function formatCodexRateLimitLines(snapshot: CodexUsageSnapshot, timezone: string): string[] {
  return formatRateLimitLines('Uso Codex', snapshot.rateLimit, timezone)
}

function formatCodexUsageDeltaForWindow(
  label: string,
  beforeWindow: CodexUsageWindow | null,
  afterWindow: CodexUsageWindow | null
): string | null {
  if (!beforeWindow || !afterWindow) {
    return null
  }

  if (!beforeWindow || !afterWindow) {
    return null
  }

  const beforeUsed = beforeWindow.usedPercent
  const afterUsed = afterWindow.usedPercent
  if (beforeUsed === null || afterUsed === null) {
    return null
  }

  const delta = afterUsed - beforeUsed
  const sign = delta > 0 ? '+' : ''
  return `Cambio uso ${label}: ${sign}${delta} pp`
}

export function formatCodexUsageDeltaLines(before: CodexUsageSnapshot | null, after: CodexUsageSnapshot | null): string[] {
  const lines = [
    formatCodexUsageDeltaForWindow('5h', before?.rateLimit.fiveHour ?? null, after?.rateLimit.fiveHour ?? null),
    formatCodexUsageDeltaForWindow('7d', before?.rateLimit.weekly ?? null, after?.rateLimit.weekly ?? null)
  ].filter(Boolean) as string[]

  if (lines.length > 0) {
    return lines
  }

  const fallbackBefore = before ? getPrimaryCodexUsageWindow(before.rateLimit) : null
  const fallbackAfter = after ? getPrimaryCodexUsageWindow(after.rateLimit) : null
  const fallbackLine = formatCodexUsageDeltaForWindow(
    fallbackAfter ? getCodexUsageWindowLabel(fallbackAfter) : 'sin-ventana',
    fallbackBefore,
    fallbackAfter
  )

  return fallbackLine ? [fallbackLine] : []
}
