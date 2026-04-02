import type { Session } from 'next-auth'

import { DEFAULT_USER_ID } from '../auth/user-settings'

interface CodexDebugEnv {
  NODE_ENV?: string
  LAP_CODEX_DEV_MODE?: string
  NEXT_PUBLIC_LAP_CODEX_DEV_MODE?: string
  npm_config_codex?: string
}

function isTruthyFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase() ?? ''
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function isCodexDebugMode(env: CodexDebugEnv = process.env): boolean {
  if ((env.NODE_ENV?.trim().toLowerCase() ?? '') === 'production') {
    return false
  }

  return isTruthyFlag(env.LAP_CODEX_DEV_MODE)
    || isTruthyFlag(env.NEXT_PUBLIC_LAP_CODEX_DEV_MODE)
    || isTruthyFlag(env.npm_config_codex)
}

export function createCodexDebugSession(): Session {
  return {
    user: {
      id: DEFAULT_USER_ID,
      name: 'Codex Debug',
      email: 'codex-debug@lap.local',
    },
    expires: '2999-12-31T23:59:59.999Z',
  }
}
