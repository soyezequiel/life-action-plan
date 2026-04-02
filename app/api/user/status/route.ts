import { findCredentialConfiguration } from '../../../../src/lib/auth/credential-config'
import { isSecretStorageAvailable } from '../../../../src/lib/auth/secret-storage'
import { isCodexDebugMode } from '../../../../src/lib/dev/codex-debug'
import type { UserStatusSnapshotResult } from '../../../../src/shared/types/lap-api'
import { getLatestProfileIdForUser, getLatestProfileIdWithPlans, getPlansByProfile } from '../../_db'
import { jsonResponse } from '../../_shared'
import { getApiKeySettingKey, resolveAuthenticatedUserId, resolveUserId } from '../../_user-settings'
import { getWalletStatus } from '../../_wallet'

export const dynamic = 'force-dynamic'

function readStoredProfileId(request: Request): string | null {
  const rawValue = new URL(request.url).searchParams.get('storedProfileId')?.trim() ?? ''
  return rawValue || null
}

async function hasActiveApiKey(userId: string): Promise<boolean> {
  if (!isSecretStorageAvailable()) {
    return false
  }

  const [openAiCredential, openRouterCredential] = await Promise.all([
    findCredentialConfiguration({
      owner: 'user',
      ownerId: userId,
      providerId: 'openai',
      secretType: 'api-key',
      label: getApiKeySettingKey('openai')
    }),
    findCredentialConfiguration({
      owner: 'user',
      ownerId: userId,
      providerId: 'openrouter',
      secretType: 'api-key',
      label: getApiKeySettingKey('openrouter')
    })
  ])

  return openAiCredential?.status === 'active' || openRouterCredential?.status === 'active'
}

async function resolveHasPlan(userId: string | null, storedProfileId: string | null): Promise<{ hasPlan: boolean, latestProfileId: string | null }> {
  const latestProfileId = userId ? await getLatestProfileIdForUser(userId) : null
  const candidateProfileIds = Array.from(new Set([latestProfileId, storedProfileId].filter((value): value is string => Boolean(value))))

  for (const profileId of candidateProfileIds) {
    const plans = await getPlansByProfile(profileId)
    if (plans.length > 0) {
      return {
        hasPlan: true,
        latestProfileId,
      }
    }
  }

  if (isCodexDebugMode()) {
    const fallbackProfileId = await getLatestProfileIdWithPlans()

    if (fallbackProfileId) {
      return {
        hasPlan: true,
        latestProfileId: latestProfileId ?? fallbackProfileId,
      }
    }
  }

  return {
    hasPlan: false,
    latestProfileId,
  }
}

export async function GET(request: Request): Promise<Response> {
  const authenticatedUserId = resolveAuthenticatedUserId(request)
  const allowCodexFallback = isCodexDebugMode()

  if (!authenticatedUserId && !allowCodexFallback) {
    return jsonResponse<UserStatusSnapshotResult>({
      hasWallet: false,
      hasApiKey: false,
      hasPlan: false,
      latestProfileId: null,
    })
  }

  const storedProfileId = readStoredProfileId(request)
  const [walletStatus, hasApiKey, planStatus] = await Promise.all([
    getWalletStatus(resolveUserId(request)),
    authenticatedUserId ? hasActiveApiKey(authenticatedUserId) : Promise.resolve(false),
    resolveHasPlan(authenticatedUserId, storedProfileId),
  ])

  return jsonResponse<UserStatusSnapshotResult>({
    hasWallet: walletStatus.configured,
    hasApiKey,
    hasPlan: planStatus.hasPlan,
    latestProfileId: planStatus.latestProfileId,
  })
}
