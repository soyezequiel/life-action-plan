import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { DateTime } from 'luxon'

const CODEX_AUTH_REFRESH_URL = 'https://auth.openai.com/oauth/token'
const CODEX_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const CODEX_AUTH_REFRESH_BUFFER_SECONDS = 300

interface CodexAuthTokensFile {
  id_token?: string | null
  access_token?: string | null
  refresh_token?: string | null
  account_id?: string | null
}

interface CodexAuthFile {
  auth_mode?: string | null
  last_refresh?: string | null
  tokens?: CodexAuthTokensFile | null
}

interface JwtPayload {
  exp?: number
}

export interface CodexAuthAvailability {
  available: boolean
  reason: string | null
}

export interface CodexAuthSession {
  accessToken: string
  refreshToken: string | null
  accountId: string
  idToken: string | null
}

let activeRefreshPromise: Promise<CodexAuthSession> | null = null

function getCodexHomeDir(): string {
  const configuredHome = process.env.CODEX_HOME?.trim()
  return configuredHome || path.join(homedir(), '.codex')
}

export function getCodexAuthFilePath(): string {
  return path.join(getCodexHomeDir(), 'auth.json')
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function decodeBase64UrlSegment(segment: string): string | null {
  try {
    const normalized = segment
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(segment.length / 4) * 4, '=')

    return Buffer.from(normalized, 'base64').toString('utf8')
  } catch {
    return null
  }
}

function parseJwtPayload(token: string | null): JwtPayload | null {
  if (!token) {
    return null
  }

  const [, payloadSegment] = token.split('.')
  if (!payloadSegment) {
    return null
  }

  const decoded = decodeBase64UrlSegment(payloadSegment)
  if (!decoded) {
    return null
  }

  try {
    return JSON.parse(decoded) as JwtPayload
  } catch {
    return null
  }
}

function hasFreshAccessToken(accessToken: string | null): boolean {
  if (!accessToken) {
    return false
  }

  const payload = parseJwtPayload(accessToken)
  if (typeof payload?.exp !== 'number') {
    return false
  }

  const expiresAt = DateTime.fromSeconds(payload.exp, { zone: 'utc' })
  return expiresAt > DateTime.utc().plus({ seconds: CODEX_AUTH_REFRESH_BUFFER_SECONDS })
}

function resolveAccountId(tokens: CodexAuthTokensFile | null | undefined): string | null {
  return normalizeString(tokens?.account_id)
}

async function readCodexAuthFile(filePath = getCodexAuthFilePath()): Promise<CodexAuthFile | null> {
  try {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw) as CodexAuthFile
  } catch {
    return null
  }
}

function buildCodexSession(authFile: CodexAuthFile): CodexAuthSession | null {
  const tokens = authFile.tokens ?? null
  const accessToken = normalizeString(tokens?.access_token)
  const refreshToken = normalizeString(tokens?.refresh_token)
  const accountId = resolveAccountId(tokens)
  const idToken = normalizeString(tokens?.id_token)

  if (!accountId || (!accessToken && !refreshToken)) {
    return null
  }

  return {
    accessToken: accessToken ?? '',
    refreshToken,
    accountId,
    idToken
  }
}

async function refreshCodexSession(authFile: CodexAuthFile, filePath = getCodexAuthFilePath()): Promise<CodexAuthSession> {
  const refreshToken = normalizeString(authFile.tokens?.refresh_token)

  if (!refreshToken) {
    throw new Error('CODEX_AUTH_REFRESH_TOKEN_MISSING')
  }

  const response = await fetch(CODEX_AUTH_REFRESH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CODEX_OAUTH_CLIENT_ID
    }).toString()
  })

  if (!response.ok) {
    throw new Error(`CODEX_AUTH_REFRESH_FAILED:${response.status}`)
  }

  const payload = await response.json().catch(() => null) as {
    access_token?: unknown
    refresh_token?: unknown
    id_token?: unknown
    account_id?: unknown
  } | null

  const nextAccessToken = normalizeString(payload?.access_token)
  const nextRefreshToken = normalizeString(payload?.refresh_token) ?? refreshToken
  const nextIdToken = normalizeString(payload?.id_token) ?? normalizeString(authFile.tokens?.id_token)
  const nextAccountId = normalizeString(payload?.account_id)
    ?? resolveAccountId({
      ...authFile.tokens,
      account_id: authFile.tokens?.account_id,
      id_token: nextIdToken
    })

  if (!nextAccessToken || !nextAccountId) {
    throw new Error('CODEX_AUTH_REFRESH_INVALID_RESPONSE')
  }

  const nextAuthFile: CodexAuthFile = {
    ...authFile,
    last_refresh: DateTime.utc().toISO(),
    tokens: {
      ...(authFile.tokens ?? {}),
      access_token: nextAccessToken,
      refresh_token: nextRefreshToken,
      id_token: nextIdToken,
      account_id: nextAccountId
    }
  }

  await writeFile(filePath, JSON.stringify(nextAuthFile, null, 2), 'utf8')

  return {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    accountId: nextAccountId,
    idToken: nextIdToken
  }
}

export async function getCodexAuthAvailability(): Promise<CodexAuthAvailability> {
  const filePath = getCodexAuthFilePath()
  const authFile = await readCodexAuthFile(filePath)

  if (!authFile) {
    return {
      available: false,
      reason: `No pude leer la sesion local de Codex en ${filePath}.`
    }
  }

  const session = buildCodexSession(authFile)

  if (!session) {
    return {
      available: false,
      reason: 'La sesion local de Codex no tiene los tokens necesarios para esta ruta.'
    }
  }

  return {
    available: Boolean(session.accountId && (hasFreshAccessToken(session.accessToken) || session.refreshToken)),
    reason: session.accountId && (hasFreshAccessToken(session.accessToken) || session.refreshToken)
      ? null
      : 'La sesion local de Codex no esta lista para usarse desde esta maquina.'
  }
}

export async function getCodexAuthSession(options?: { forceRefresh?: boolean }): Promise<CodexAuthSession> {
  const filePath = getCodexAuthFilePath()
  const authFile = await readCodexAuthFile(filePath)

  if (!authFile) {
    throw new Error(`CODEX_AUTH_FILE_MISSING:${filePath}`)
  }

  const session = buildCodexSession(authFile)

  if (!session) {
    throw new Error('CODEX_AUTH_SESSION_INVALID')
  }

  if (!options?.forceRefresh && hasFreshAccessToken(session.accessToken)) {
    return session
  }

  if (!session.refreshToken) {
    throw new Error('CODEX_AUTH_REFRESH_TOKEN_MISSING')
  }

  if (!activeRefreshPromise) {
    activeRefreshPromise = refreshCodexSession(authFile, filePath).finally(() => {
      activeRefreshPromise = null
    })
  }

  return activeRefreshPromise
}
