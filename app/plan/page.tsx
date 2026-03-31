import { auth } from '@/src/auth'
import { redirect } from 'next/navigation'
import PlanMockupPage from '../../components/plan-viewer/PlanMockupPage'

type SearchParams = Record<string, string | string[] | undefined>

interface PlanPageProps {
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

export default async function PlanPage({ searchParams }: PlanPageProps) {
  const session = await auth()

  if (!session) {
    redirect('/auth/signin?callbackUrl=/plan')
  }

  const params = await resolveSearchParams(searchParams)
  const view = (readParam(params.view) ?? 'year') as 'day' | 'week' | 'month' | 'year'

  return <PlanMockupPage view={view} />
}
