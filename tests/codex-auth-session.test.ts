import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function createJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.signature`
}

function createCodexEnvSession(refreshToken: string): string {
  return JSON.stringify({
    tokens: {
      access_token: createJwt({ exp: 1 }),
      refresh_token: refreshToken,
      id_token: createJwt({
        'https://api.openai.com/auth': {
          chatgpt_account_id: 'acc_env_123',
        },
      }),
    },
  })
}

function createRefreshResponse(accessExp: number, refreshToken: string): Response {
  return new Response(JSON.stringify({
    access_token: createJwt({ exp: accessExp }),
    refresh_token: refreshToken,
    account_id: 'acc_env_123',
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

const originalEnv = {
  LAP_CODEX_AUTH_SESSION_JSON: process.env.LAP_CODEX_AUTH_SESSION_JSON,
  VERCEL: process.env.VERCEL,
}

describe('getCodexAuthSession with env-backed sessions', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    process.env.VERCEL = '1'
  })

  afterEach(() => {
    process.env.LAP_CODEX_AUTH_SESSION_JSON = originalEnv.LAP_CODEX_AUTH_SESSION_JSON
    process.env.VERCEL = originalEnv.VERCEL
    vi.unstubAllGlobals()
  })

  it('reuses the refreshed env session instead of re-reading the stale exported JSON', async () => {
    process.env.LAP_CODEX_AUTH_SESSION_JSON = createCodexEnvSession('refresh-1')

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const params = new URLSearchParams(String(init?.body ?? ''))
      expect(params.get('refresh_token')).toBe('refresh-1')
      return createRefreshResponse(9_999_999_999, 'refresh-2')
    })

    vi.stubGlobal('fetch', fetchMock)

    const { getCodexAuthSession } = await import('../src/lib/auth/codex-auth')

    const firstSession = await getCodexAuthSession()
    const secondSession = await getCodexAuthSession()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(firstSession.accessToken).toBe(secondSession.accessToken)
    expect(secondSession.refreshToken).toBe('refresh-2')
  })

  it('preserves rotated refresh tokens across multiple refreshes on Vercel', async () => {
    process.env.LAP_CODEX_AUTH_SESSION_JSON = createCodexEnvSession('refresh-1')

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const params = new URLSearchParams(String(init?.body ?? ''))
      const refreshToken = params.get('refresh_token')

      if (refreshToken === 'refresh-1') {
        return createRefreshResponse(1, 'refresh-2')
      }

      if (refreshToken === 'refresh-2') {
        return createRefreshResponse(9_999_999_999, 'refresh-3')
      }

      return new Response('unexpected refresh token', { status: 401 })
    })

    vi.stubGlobal('fetch', fetchMock)

    const { getCodexAuthSession } = await import('../src/lib/auth/codex-auth')

    const firstSession = await getCodexAuthSession()
    const secondSession = await getCodexAuthSession()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new URLSearchParams(String(fetchMock.mock.calls[0]?.[1]?.body ?? '')).get('refresh_token')).toBe('refresh-1')
    expect(new URLSearchParams(String(fetchMock.mock.calls[1]?.[1]?.body ?? '')).get('refresh_token')).toBe('refresh-2')
    expect(firstSession.refreshToken).toBe('refresh-2')
    expect(secondSession.refreshToken).toBe('refresh-3')
  })
})
