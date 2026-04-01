import { auth } from '@/src/auth'
import { redirect } from 'next/navigation'
import SettingsMockupPage from '../../components/settings/SettingsMockupPage'
import { getWalletStatus } from '../api/_wallet'
import { findCredentialConfiguration } from '../../src/lib/auth/credential-config'
import { isSecretStorageAvailable } from '../../src/lib/auth/secret-storage'
import { getApiKeySettingKey } from '../../src/lib/auth/user-settings'

type SearchParams = Record<string, string | string[] | undefined>

interface SettingsPageProps {
  searchParams?: Promise<SearchParams>
}

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' && value[0].trim() ? value[0].trim() : null
  }

  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function resolveSearchParams(searchParams: Promise<SearchParams> | undefined): Promise<SearchParams> {
  if (!searchParams) {
    return {}
  }

  return (await searchParams) ?? {}
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const session = await auth()

  if (!session) {
    redirect('/auth/signin?callbackUrl=/settings')
  }

  const params = await resolveSearchParams(searchParams)
  const section = readParam(params.section) ?? 'backend'
  const userId = session.user?.id
  const secureStorageAvailable = isSecretStorageAvailable()

  const [initialWalletStatus, initialOpenAiCredential, initialOpenRouterCredential] = await Promise.all([
    getWalletStatus(userId),
    userId && secureStorageAvailable
      ? findCredentialConfiguration({
          owner: 'user',
          ownerId: userId,
          providerId: 'openai',
          secretType: 'api-key',
          label: getApiKeySettingKey('openai')
        })
      : Promise.resolve(null),
    userId && secureStorageAvailable
      ? findCredentialConfiguration({
          owner: 'user',
          ownerId: userId,
          providerId: 'openrouter',
          secretType: 'api-key',
          label: getApiKeySettingKey('openrouter')
        })
      : Promise.resolve(null)
  ])

  const initialApiConfigured = secureStorageAvailable
    && (initialOpenAiCredential?.status === 'active' || initialOpenRouterCredential?.status === 'active')

  return (
    <SettingsMockupPage
      section={section as 'backend' | 'wallet'}
      initialWalletStatus={initialWalletStatus}
      initialApiConfigured={initialApiConfigured}
    />
  )
}
