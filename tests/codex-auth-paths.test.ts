import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getCodexAuthFilePath, getLapCodexAuthFilePath } from '../src/lib/auth/codex-auth'

const originalEnv = {
  LAP_HOME: process.env.LAP_HOME,
  CODEX_HOME: process.env.CODEX_HOME
}

describe('codex auth paths', () => {
  beforeEach(() => {
    process.env.LAP_HOME = mkdtempSync(join(tmpdir(), 'lap-home-'))
    process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), 'codex-home-'))
  })

  afterEach(() => {
    process.env.LAP_HOME = originalEnv.LAP_HOME
    process.env.CODEX_HOME = originalEnv.CODEX_HOME
  })

  it('prefiere el auth file de LAP cuando existe', () => {
    const lapAuthFile = join(process.env.LAP_HOME as string, 'codex', 'auth.json')
    const codexAuthFile = join(process.env.CODEX_HOME as string, 'auth.json')
    mkdirSync(join(process.env.LAP_HOME as string, 'codex'), { recursive: true })
    mkdirSync(process.env.CODEX_HOME as string, { recursive: true })
    writeFileSync(lapAuthFile, JSON.stringify({ tokens: {} }), 'utf8')
    writeFileSync(codexAuthFile, JSON.stringify({ tokens: {} }), 'utf8')

    expect(getLapCodexAuthFilePath()).toBe(lapAuthFile)
    expect(getCodexAuthFilePath()).toBe(lapAuthFile)
  })

  it('cae al auth compartido cuando LAP no existe', () => {
    const codexAuthFile = join(process.env.CODEX_HOME as string, 'auth.json')
    mkdirSync(process.env.CODEX_HOME as string, { recursive: true })
    writeFileSync(codexAuthFile, JSON.stringify({ tokens: {} }), 'utf8')

    expect(getCodexAuthFilePath()).toBe(codexAuthFile)
  })
})
