import { describe, expect, it } from 'vitest'
import { extractCodexAccountIdFromIdToken } from '../src/lib/auth/codex-auth'

function createJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.signature`
}

describe('extractCodexAccountIdFromIdToken', () => {
  it('lee chatgpt_account_id anidado en https://api.openai.com/auth', () => {
    const idToken = createJwt({
      'https://api.openai.com/auth': {
        chatgpt_account_id: 'acc_nested_123'
      }
    })

    expect(extractCodexAccountIdFromIdToken(idToken)).toBe('acc_nested_123')
  })

  it('sigue leyendo claims planos cuando existen', () => {
    const idToken = createJwt({
      chatgpt_account_id: 'acc_flat_456'
    })

    expect(extractCodexAccountIdFromIdToken(idToken)).toBe('acc_flat_456')
  })
})
