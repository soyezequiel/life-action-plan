import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { DateTime } from 'luxon'
import {
  extractCodexAccountIdFromIdToken,
  getLapCodexAuthFilePath
} from './codex-auth'

const CODEX_AUTH_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize'
const CODEX_AUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token'
const CODEX_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const CODEX_AUTH_SCOPES = 'openid profile email offline_access api.connectors.read api.connectors.invoke'
const CODEX_REDIRECT_PATH = '/auth/callback'
const DEFAULT_LOGIN_PORT = 1455

interface OAuthTokenResponse {
  access_token?: unknown
  refresh_token?: unknown
  id_token?: unknown
  account_id?: unknown
}

export interface CodexBrowserLoginOptions {
  authFilePath?: string
  port?: number
  openBrowser?: boolean
  workspaceId?: string
}

export interface CodexBrowserLoginResult {
  authFilePath: string
  accountId: string
  redirectUri: string
  accessToken: string
}

export interface BrowserOpenCommand {
  command: string
  args: string[]
}

interface PkcePair {
  verifier: string
  challenge: string
}

interface LoginFlowResult {
  accessToken: string
  refreshToken: string
  idToken: string
  accountId: string
}

interface OAuthErrorPayload {
  error?: unknown
  error_description?: unknown
  message?: unknown
}

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function createPkcePair(): PkcePair {
  const verifier = toBase64Url(randomBytes(64))
  const challenge = toBase64Url(createHash('sha256').update(verifier).digest())

  return { verifier, challenge }
}

export function buildCodexAuthorizeUrl(
  redirectUri: string,
  state: string,
  challenge: string,
  workspaceId?: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CODEX_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: CODEX_AUTH_SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    state,
    originator: 'codex_cli_rs'
  })

  if (workspaceId?.trim()) {
    params.set('allowed_workspace_id', workspaceId.trim())
  }

  return `${CODEX_AUTH_AUTHORIZE_URL}?${params.toString()}`
}

export function buildBrowserOpenCommand(
  url: string,
  platform: NodeJS.Platform = process.platform
): BrowserOpenCommand {
  // Avoid `cmd /c start` on Windows; shell parsing can split OAuth query params on `&`.
  if (platform === 'win32') {
    return {
      command: 'rundll32',
      args: ['url.dll,FileProtocolHandler', url]
    }
  }

  if (platform === 'darwin') {
    return {
      command: 'open',
      args: [url]
    }
  }

  return {
    command: 'xdg-open',
    args: [url]
  }
}

function openBrowser(url: string): void {
  try {
    const browserOpenCommand = buildBrowserOpenCommand(url)
    spawn(browserOpenCommand.command, browserOpenCommand.args, {
      detached: true,
      stdio: 'ignore'
    }).unref()
  } catch {
    // If the browser cannot be opened automatically, the URL is still printed in terminal.
  }
}

async function exchangeAuthorizationCode(
  code: string,
  verifier: string,
  redirectUri: string
): Promise<LoginFlowResult> {
  const response = await fetch(CODEX_AUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CODEX_OAUTH_CLIENT_ID,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier
    }).toString()
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    let errorDetail = `CODEX_LOGIN_EXCHANGE_FAILED:${response.status}`

    if (errorBody.trim()) {
      try {
        const payload = JSON.parse(errorBody) as OAuthErrorPayload
        const errorCode = typeof payload.error === 'string' ? payload.error.trim() : ''
        const errorDescription = typeof payload.error_description === 'string'
          ? payload.error_description.trim()
          : ''
        const errorMessage = typeof payload.message === 'string' ? payload.message.trim() : ''
        const detail = [errorCode, errorDescription || errorMessage].filter(Boolean).join(': ')

        if (detail) {
          errorDetail = `CODEX_LOGIN_EXCHANGE_FAILED:${response.status}:${detail}`
        }
      } catch {
        errorDetail = `CODEX_LOGIN_EXCHANGE_FAILED:${response.status}:${errorBody.trim().slice(0, 300)}`
      }
    }

    throw new Error(errorDetail)
  }

  const payload = await response.json().catch(() => null) as OAuthTokenResponse | null
  const accessToken = typeof payload?.access_token === 'string' ? payload.access_token.trim() : ''
  const refreshToken = typeof payload?.refresh_token === 'string' ? payload.refresh_token.trim() : ''
  const idToken = typeof payload?.id_token === 'string' ? payload.id_token.trim() : ''
  const accountId = typeof payload?.account_id === 'string'
    ? payload.account_id.trim()
    : extractCodexAccountIdFromIdToken(idToken) ?? ''

  if (!accessToken || !refreshToken || !idToken || !accountId) {
    throw new Error('CODEX_LOGIN_EXCHANGE_INVALID_RESPONSE')
  }

  return {
    accessToken,
    refreshToken,
    idToken,
    accountId
  }
}

async function persistAuthFile(authFilePath: string, loginResult: LoginFlowResult): Promise<void> {
  const authFile = {
    auth_mode: 'chatgpt',
    last_refresh: DateTime.utc().toISO(),
    tokens: {
      access_token: loginResult.accessToken,
      refresh_token: loginResult.refreshToken,
      id_token: loginResult.idToken,
      account_id: loginResult.accountId
    }
  }

  await mkdir(path.dirname(authFilePath), { recursive: true })
  await writeFile(authFilePath, JSON.stringify(authFile, null, 2), {
    encoding: 'utf8',
    mode: 0o600
  })
}

function writeHtml(response: ServerResponse, statusCode: number, title: string, message: string): void {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8'
  })
  response.end(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.5; }
      code { background: #f2f2f2; padding: 0 0.25rem; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <p>${message}</p>
  </body>
</html>`)
}

function extractRequestUrl(request: IncomingMessage): URL {
  return new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
}

function formatLoginErrorMessage(error: unknown): string {
  const fallback = 'No se pudo completar la autenticacion. Volve a intentar desde la terminal.'
  if (!(error instanceof Error) || !error.message.trim()) {
    return fallback
  }

  if (error.message.startsWith('CODEX_LOGIN_EXCHANGE_INVALID_RESPONSE')) {
    return 'El proveedor devolvio tokens, pero sin el account id esperado.'
  }

  if (error.message.startsWith('CODEX_LOGIN_EXCHANGE_FAILED:')) {
    return `Fallo el intercambio del codigo OAuth. ${error.message}`
  }

  return `${fallback} ${error.message}`
}

export async function loginCodexWithBrowser(
  options: CodexBrowserLoginOptions = {}
): Promise<CodexBrowserLoginResult> {
  const authFilePath = options.authFilePath ?? getLapCodexAuthFilePath()
  const pkce = createPkcePair()
  const state = toBase64Url(randomBytes(32))

  let redirectUri = ''
  let resolveResult: ((result: CodexBrowserLoginResult) => void) | null = null
  let rejectResult: ((error: unknown) => void) | null = null

  const resultPromise = new Promise<CodexBrowserLoginResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })

  const server = createServer(async (request, response) => {
    const requestUrl = extractRequestUrl(request)

    if (request.method !== 'GET' || requestUrl.pathname !== CODEX_REDIRECT_PATH) {
      writeHtml(response, 404, 'No encontrado', 'Esta ruta no forma parte del inicio de sesion.')
      return
    }

    const code = requestUrl.searchParams.get('code')?.trim() ?? ''
    const returnedState = requestUrl.searchParams.get('state')?.trim() ?? ''

    if (!code) {
      writeHtml(response, 400, 'Falta el codigo', 'El navegador regreso sin el codigo de autorizacion.')
      return
    }

    if (returnedState !== state) {
      writeHtml(response, 400, 'Estado invalido', 'La respuesta del navegador no coincide con esta sesion de login.')
      return
    }

    try {
      const loginResult = await exchangeAuthorizationCode(code, pkce.verifier, redirectUri)
      await persistAuthFile(authFilePath, loginResult)
      writeHtml(
        response,
        200,
        'Sesion completada',
        'Ya podes volver a la terminal. Esta ventana se puede cerrar.'
      )

      resolveResult?.({
        authFilePath,
        accountId: loginResult.accountId,
        redirectUri,
        accessToken: loginResult.accessToken
      })
    } catch (error) {
      const errorMessage = formatLoginErrorMessage(error)
      console.error('[Codex Login] Fallo en callback:', error)
      writeHtml(response, 500, 'Error de login', errorMessage)
      rejectResult?.(error)
    } finally {
      server.close()
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? DEFAULT_LOGIN_PORT, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address !== 'object') {
        reject(new Error('CODEX_LOGIN_SERVER_ADDRESS_UNAVAILABLE'))
        return
      }

      redirectUri = `http://localhost:${address.port}${CODEX_REDIRECT_PATH}`
      resolve()
    })
  })

  const authUrl = buildCodexAuthorizeUrl(redirectUri, state, pkce.challenge, options.workspaceId)
  console.error(`[Codex Login] Abriendo navegador en ${authUrl}`)

  if (options.openBrowser !== false) {
    openBrowser(authUrl)
  }

  return await resultPromise
}
