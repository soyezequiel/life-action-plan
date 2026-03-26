import { describe, expect, it } from 'vitest'
import {
  buildBrowserOpenCommand,
  buildCodexAuthorizeUrl
} from '../src/lib/auth/codex-browser-login'

describe('codex browser login', () => {
  it('construye la URL de autorizacion con PKCE y callback local', () => {
    const redirectUri = 'http://localhost:1455/auth/callback'
    const authUrl = buildCodexAuthorizeUrl(redirectUri, 'state-123', 'challenge-456')
    const url = new URL(authUrl)
    const params = url.searchParams

    expect(url.origin + url.pathname).toBe('https://auth.openai.com/oauth/authorize')
    expect(params.get('response_type')).toBe('code')
    expect(params.get('client_id')).toBe('app_EMoamEEZ73f0CkXaXp7hrann')
    expect(params.get('redirect_uri')).toBe(redirectUri)
    expect(params.get('scope')).toBe(
      'openid profile email offline_access api.connectors.read api.connectors.invoke'
    )
    expect(params.get('code_challenge')).toBe('challenge-456')
    expect(params.get('code_challenge_method')).toBe('S256')
    expect(params.get('id_token_add_organizations')).toBe('true')
    expect(params.get('codex_cli_simplified_flow')).toBe('true')
    expect(params.get('state')).toBe('state-123')
    expect(params.get('originator')).toBe('codex_cli_rs')
  })

  it('agrega el workspace autorizado cuando se pasa uno explicito', () => {
    const redirectUri = 'http://localhost:1455/auth/callback'
    const authUrl = buildCodexAuthorizeUrl(
      redirectUri,
      'state-123',
      'challenge-456',
      'ws-789'
    )
    const params = new URL(authUrl).searchParams

    expect(params.get('allowed_workspace_id')).toBe('ws-789')
  })

  it('usa un launcher directo en Windows para no romper la query', () => {
    const browserCommand = buildBrowserOpenCommand(
      'https://auth.openai.com/oauth/authorize?response_type=code&client_id=abc',
      'win32'
    )

    expect(browserCommand.command).toBe('rundll32')
    expect(browserCommand.args).toEqual([
      'url.dll,FileProtocolHandler',
      'https://auth.openai.com/oauth/authorize?response_type=code&client_id=abc'
    ])
  })
})
