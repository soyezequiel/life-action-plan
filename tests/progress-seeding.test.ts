import { describe, expect, it } from 'vitest'
import { resolveProgressSeedDate } from '../src/lib/db/db-helpers'

describe('progress seeding', () => {
  it('never seeds week-one tasks into the past when the plan starts mid-week', () => {
    const monday = resolveProgressSeedDate(1, 'lunes', 'America/Argentina/Buenos_Aires', '2026-03-22')
    const tuesday = resolveProgressSeedDate(1, 'martes', 'America/Argentina/Buenos_Aires', '2026-03-22')
    const thursday = resolveProgressSeedDate(2, 'jueves', 'America/Argentina/Buenos_Aires', '2026-03-22')

    expect(monday).toBe('2026-03-23')
    expect(tuesday).toBe('2026-03-24')
    expect(thursday).toBe('2026-03-26')
  })
})
