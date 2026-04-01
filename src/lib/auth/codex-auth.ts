import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { existsSync } from 'node:fs'
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
  [key: string]: unknown
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

export interface CodexAuthIdentity {
  authFilePath: string
  authSource: 'lap' | 'shared'
  accountId: string
  email: string | null
  name: string | null
  planType: string | null
}

let activeRefreshPromise: Promise<CodexAuthSession> | null = null
let cachedEnvAuthFileState: { raw: string; authFile: CodexAuthFile } | null = null

function getCodexHomeDir(): string {
  const configuredHome = process.env.CODEX_HOME?.trim()
  return configuredHome || path.join(homedir(), '.codex')
}

function getLapHomeDir(): string {
  const configuredHome = process.env.LAP_HOME?.trim()
  return configuredHome || path.join(homedir(), '.lap')
}

export function getLapCodexAuthFilePath(): string {
  return path.join(getLapHomeDir(), 'codex', 'auth.json')
}

export function getCodexAuthFilePath(): string {
  const lapAuthPath = getLapCodexAuthFilePath()
  if (existsSync(lapAuthPath)) {
    return lapAuthPath
  }

  return path.join(getCodexHomeDir(), 'auth.json')
}

export function getRuntimeCodexAuthFilePath(): string {
  return getLapCodexAuthFilePath()
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

function getNestedAuthClaims(claims: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!claims) {
    return null
  }

  const nestedAuthClaims = claims['https://api.openai.com/auth']
  return nestedAuthClaims && typeof nestedAuthClaims === 'object'
    ? nestedAuthClaims as Record<string, unknown>
    : null
}

export function extractCodexAccountIdFromIdToken(idToken: string | null | undefined): string | null {
  const payload = parseJwtPayload(normalizeString(idToken))
  const claims = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : null

  if (!claims) {
    return null
  }

  const nestedAuthRecord = getNestedAuthClaims(claims)

  const candidates = [
    claims.chatgpt_account_id,
    claims.account_id,
    claims['https://chatgpt.com/chatgpt_account_id'],
    claims['https://auth.openai.com/chatgpt_account_id'],
    nestedAuthRecord?.chatgpt_account_id,
    nestedAuthRecord?.account_id
  ]

  for (const candidate of candidates) {
    const normalized = normalizeString(candidate)
    if (normalized) {
      return normalized
    }
  }

  return null
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
  return normalizeString(tokens?.account_id) ?? extractCodexAccountIdFromIdToken(tokens?.id_token)
}

function resolveCodexAuthSource(filePath: string): 'lap' | 'shared' {
  return filePath === getLapCodexAuthFilePath() ? 'lap' : 'shared'
}

async function readCodexAuthFile(filePath = getCodexAuthFilePath()): Promise<CodexAuthFile | null> {
  const envSession = process.env.LAP_CODEX_AUTH_SESSION_JSON?.trim()
  if (envSession) {
    if (cachedEnvAuthFileState?.raw === envSession) {
      return cachedEnvAuthFileState.authFile
    }

    try {
      const authFile = JSON.parse(envSession) as CodexAuthFile
      cachedEnvAuthFileState = { raw: envSession, authFile }
      return authFile
    } catch {
      cachedEnvAuthFileState = null
      console.error('[Codex Auth] LAP_CODEX_AUTH_SESSION_JSON contains invalid JSON')
    }
  } else {
    cachedEnvAuthFileState = null
  }

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

  const isVercel = process.env.VERCEL === '1' || !!process.env.LAP_CODEX_AUTH_SESSION_JSON
  
  if (isVercel) {
    // On Vercel or when using env-based session, we don't write back to the filesystem
    // The refreshed token will be used in memory for the current request context
    const envSession = process.env.LAP_CODEX_AUTH_SESSION_JSON?.trim()
    if (envSession) {
      cachedEnvAuthFileState = {
        raw: envSession,
        authFile: nextAuthFile,
      }
    }
  } else {
    await writeFile(filePath, JSON.stringify(nextAuthFile, null, 2), 'utf8')
  }

  return {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    accountId: nextAccountId,
    idToken: nextIdToken
  }
}

export async function getCodexAuthIdentity(filePath = getRuntimeCodexAuthFilePath()): Promise<CodexAuthIdentity | null> {
  const authFile = await readCodexAuthFile(filePath)
  const tokens = authFile?.tokens ?? null
  const accountId = resolveAccountId(tokens)
  const idTokenClaims = parseJwtPayload(normalizeString(tokens?.id_token))
  const accessTokenClaims = parseJwtPayload(normalizeString(tokens?.access_token))

  if (!accountId) {
    return null
  }

  const nestedIdClaims = getNestedAuthClaims(idTokenClaims)
  const nestedAccessClaims = getNestedAuthClaims(accessTokenClaims)

  return {
    authFilePath: filePath,
    authSource: resolveCodexAuthSource(filePath),
    accountId,
    email: normalizeString(idTokenClaims?.email) ?? normalizeString(accessTokenClaims?.email),
    name: normalizeString(idTokenClaims?.name)
      ?? normalizeString(idTokenClaims?.preferred_username)
      ?? normalizeString(accessTokenClaims?.name),
    planType: normalizeString(nestedIdClaims?.chatgpt_plan_type)
      ?? normalizeString(idTokenClaims?.chatgpt_plan_type)
      ?? normalizeString(nestedAccessClaims?.chatgpt_plan_type)
      ?? normalizeString(accessTokenClaims?.chatgpt_plan_type)
  }
}

export async function getCodexAuthAvailability(): Promise<CodexAuthAvailability> {
  const filePath = getRuntimeCodexAuthFilePath()
  const authFile = await readCodexAuthFile(filePath)

  if (!authFile) {
    return {
      available: false,
      reason: `La sesion OAuth actual de Codex no es accesible desde backend/CLI. Ejecuta "npm run codex:login" para crear ${filePath}.`
    }
  }

  const session = buildCodexSession(authFile)

  if (!session) {
    return {
      available: false,
      reason: 'La sesion OAuth actual de Codex no es accesible desde backend/CLI. Ejecuta "npm run codex:login" para regenerar la sesion local de este workspace.'
    }
  }

  return {
    available: Boolean(session.accountId && (hasFreshAccessToken(session.accessToken) || session.refreshToken)),
    reason: session.accountId && (hasFreshAccessToken(session.accessToken) || session.refreshToken)
      ? null
      : 'La sesion OAuth actual de Codex no es accesible desde backend/CLI. Ejecuta "npm run codex:login" para refrescar la sesion local de este workspace.'
  }
}

export async function getCodexAuthSession(options?: { forceRefresh?: boolean }): Promise<CodexAuthSession> {
  const filePath = getRuntimeCodexAuthFilePath()
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
