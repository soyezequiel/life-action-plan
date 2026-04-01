import { auth } from '@/src/auth'
import { redirect } from 'next/navigation'
import PlanMockupPage from '../../components/plan-viewer/PlanMockupPage'
import { getLatestProfileIdForUser, getPlansByProfile, getProgressByPlan } from '../../src/lib/db/db-helpers'

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
  const latestProfileId = session.user?.id
    ? await getLatestProfileIdForUser(session.user.id)
    : null

  let initialData: {
    activePlan: Awaited<ReturnType<typeof getPlansByProfile>>[number] | null
    tasks: Awaited<ReturnType<typeof getProgressByPlan>>
  } | null = null

  if (latestProfileId) {
    const plans = await getPlansByProfile(latestProfileId)
    const activePlan = plans[0] ?? null

    if (activePlan) {
      initialData = {
        activePlan,
        tasks: await getProgressByPlan(activePlan.id)
      }
    }
  }

  return <PlanMockupPage view={view} initialData={initialData} />
}
