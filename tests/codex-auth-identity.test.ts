import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getCodexAuthIdentity } from '../src/lib/auth/codex-auth'

function createJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.signature`
}

const originalEnv = {
  LAP_HOME: process.env.LAP_HOME,
  CODEX_HOME: process.env.CODEX_HOME
}

describe('getCodexAuthIdentity', () => {
  beforeEach(() => {
    process.env.LAP_HOME = mkdtempSync(join(tmpdir(), 'lap-home-'))
    process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), 'codex-home-'))
  })

  afterEach(() => {
    process.env.LAP_HOME = originalEnv.LAP_HOME
    process.env.CODEX_HOME = originalEnv.CODEX_HOME
  })

  it('expone email, nombre, plan y fuente para la sesion independiente de LAP', async () => {
    const authFilePath = join(process.env.LAP_HOME as string, 'codex', 'auth.json')
    mkdirSync(join(process.env.LAP_HOME as string, 'codex'), { recursive: true })
    writeFileSync(authFilePath, JSON.stringify({
      tokens: {
        id_token: createJwt({
          email: 'lap@example.com',
          name: 'Cuenta LAP',
          'https://api.openai.com/auth': {
            chatgpt_account_id: 'acc_lap_123',
            chatgpt_plan_type: 'plus'
          }
        }),
        access_token: createJwt({ exp: 9999999999 })
      }
    }), 'utf8')

    const identity = await getCodexAuthIdentity(authFilePath)

    expect(identity).toEqual({
      authFilePath,
      authSource: 'lap',
      accountId: 'acc_lap_123',
      email: 'lap@example.com',
      name: 'Cuenta LAP',
      planType: 'plus'
    })
  })
})
