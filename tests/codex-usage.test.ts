import { describe, expect, it } from 'vitest'
import {
  formatCodexCreditsLine,
  formatCodexRateLimitLines,
  formatCodexUsageDeltaLines,
  parseCodexUsageSnapshot
} from '../src/lib/auth/codex-usage'

describe('codex usage', () => {
  it('normaliza la respuesta de uso y clasifica la ventana semanal', () => {
    const snapshot = parseCodexUsageSnapshot({
      account_id: 'user-123',
      email: 'lap@example.com',
      plan_type: 'free',
      rate_limit: {
        primary_window: {
          used_percent: 3,
          limit_window_seconds: 604800,
          reset_after_seconds: 600000,
          reset_at: 1775154697
        },
        secondary_window: null
      },
      code_review_rate_limit: {
        primary_window: {
          used_percent: 0,
          limit_window_seconds: 604800,
          reset_after_seconds: 604800,
          reset_at: 1775155775
        }
      },
      credits: {
        has_credits: false,
        unlimited: false,
        balance: null,
        approx_local_messages: null,
        approx_cloud_messages: null
      }
    })

    expect(snapshot.planType).toBe('free')
    expect(snapshot.rateLimit.weekly?.usedPercent).toBe(3)
    expect(snapshot.rateLimit.weekly?.remainingPercent).toBe(97)
    expect(snapshot.credits.hasCredits).toBe(false)
  })

  it('formatea credito, uso y delta para la terminal', () => {
    const before = parseCodexUsageSnapshot({
      plan_type: 'plus',
      rate_limit: {
        primary_window: {
          used_percent: 4,
          limit_window_seconds: 18000,
          reset_at: 1775000000
        },
        secondary_window: {
          used_percent: 10,
          limit_window_seconds: 604800,
          reset_at: 1775154697
        }
      },
      credits: {
        has_credits: true,
        unlimited: false,
        balance: 12
      }
    })
    const after = parseCodexUsageSnapshot({
      plan_type: 'plus',
      rate_limit: {
        primary_window: {
          used_percent: 5,
          limit_window_seconds: 18000,
          reset_at: 1775000000
        },
        secondary_window: {
          used_percent: 11,
          limit_window_seconds: 604800,
          reset_at: 1775154697
        }
      },
      credits: {
        has_credits: true,
        unlimited: false,
        balance: 11
      }
    })

    expect(formatCodexCreditsLine(before)).toBe('Credito Codex: saldo=12 | plan=plus')
    expect(formatCodexRateLimitLines(before, 'America/Buenos_Aires')).toEqual([
      expect.stringContaining('Uso Codex 5h: 4% usado | 96% disponible'),
      expect.stringContaining('Uso Codex 7d: 10% usado | 90% disponible')
    ])
    expect(formatCodexUsageDeltaLines(before, after)).toEqual([
      'Cambio uso 5h: +1 pp',
      'Cambio uso 7d: +1 pp'
    ])
  })

  it('explica cuando la ventana corta no viene en la respuesta', () => {
    const snapshot = parseCodexUsageSnapshot({
      plan_type: 'free',
      rate_limit: {
        primary_window: {
          used_percent: 3,
          limit_window_seconds: 604800,
          reset_at: 1775154697
        }
      }
    })

    expect(formatCodexRateLimitLines(snapshot, 'America/Buenos_Aires')).toEqual([
      'Uso Codex 5h: no expuesto por el backend para esta cuenta',
      expect.stringContaining('Uso Codex 7d: 3% usado | 97% disponible')
    ])
  })
})
