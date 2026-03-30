import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getCodexAuthAvailability, getRuntimeCodexAuthFilePath } from '../src/lib/auth/codex-auth'

function createJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.signature`
}

const originalEnv = {
  LAP_HOME: process.env.LAP_HOME,
  CODEX_HOME: process.env.CODEX_HOME,
}

describe('getCodexAuthAvailability', () => {
  beforeEach(() => {
    process.env.LAP_HOME = mkdtempSync(join(tmpdir(), 'lap-home-'))
    process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), 'codex-home-'))
  })

  afterEach(() => {
    process.env.LAP_HOME = originalEnv.LAP_HOME
    process.env.CODEX_HOME = originalEnv.CODEX_HOME
  })

  it('requires the workspace auth file created by codex:login', async () => {
    const sharedAuthFile = join(process.env.CODEX_HOME as string, 'auth.json')
    mkdirSync(process.env.CODEX_HOME as string, { recursive: true })
    writeFileSync(sharedAuthFile, JSON.stringify({
      tokens: {
        access_token: createJwt({ exp: 9999999999 }),
        refresh_token: 'refresh-token',
        id_token: createJwt({
          'https://api.openai.com/auth': {
            chatgpt_account_id: 'acc_shared_123',
          },
        }),
      },
    }), 'utf8')

    const availability = await getCodexAuthAvailability()

    expect(availability).toEqual({
      available: false,
      reason: `La sesion OAuth actual de Codex no es accesible desde backend/CLI. Ejecuta "npm run codex:login" para crear ${getRuntimeCodexAuthFilePath()}.`,
    })
  })

  it('accepts the workspace auth file when codex:login created it', async () => {
    const runtimeAuthFile = getRuntimeCodexAuthFilePath()
    mkdirSync(join(process.env.LAP_HOME as string, 'codex'), { recursive: true })
    writeFileSync(runtimeAuthFile, JSON.stringify({
      tokens: {
        access_token: createJwt({ exp: 9999999999 }),
        refresh_token: 'refresh-token',
        id_token: createJwt({
          'https://api.openai.com/auth': {
            chatgpt_account_id: 'acc_lap_123',
          },
        }),
      },
    }), 'utf8')

    const availability = await getCodexAuthAvailability()

    expect(availability).toEqual({
      available: true,
      reason: null,
    })
  })
})
