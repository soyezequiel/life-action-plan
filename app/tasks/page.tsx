import { auth } from '@/src/auth'
import { redirect } from 'next/navigation'

import TaskManagementMockup from '../../components/mockups/TaskManagementMockup'
import { getLatestProfileIdForUser, getPlansByProfile, getProgressByPlan } from '../../src/lib/db/db-helpers'

type SearchParams = Record<string, string | string[] | undefined>

interface TasksPageProps {
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

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const session = await auth()

  if (!session) {
    redirect('/auth/signin?callbackUrl=/tasks')
  }

  const params = await resolveSearchParams(searchParams)
  const requestedPlanId = readParam(params.planId)
  const latestProfileId = session.user?.id
    ? await getLatestProfileIdForUser(session.user.id)
    : null

  let initialTasks = undefined

  if (latestProfileId) {
    const plans = await getPlansByProfile(latestProfileId)
    const activePlan = (requestedPlanId ? plans.find((plan) => plan.id === requestedPlanId) : null) ?? plans[0] ?? null

    if (activePlan) {
      initialTasks = await getProgressByPlan(activePlan.id)
    }
  }

  return <TaskManagementMockup initialTasks={initialTasks} />
}
