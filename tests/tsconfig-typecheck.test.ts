import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('tsconfig typecheck', () => {
  it('mantiene tmp excluido del typecheck', async () => {
    const raw = await readFile(new URL('../tsconfig.typecheck.json', import.meta.url), 'utf8')
    const parsed = JSON.parse(raw) as { exclude?: string[] }

    expect(parsed.exclude).toContain('tmp')
  })
})
