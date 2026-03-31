import { auth } from '@/src/auth'
import { redirect } from 'next/navigation'
import SettingsMockupPage from '../../components/settings/SettingsMockupPage'

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

  return <SettingsMockupPage section={section as 'backend' | 'wallet'} />
}
