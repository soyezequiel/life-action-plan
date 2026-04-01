import { auth } from '@/src/auth'
import { redirect } from 'next/navigation'

import PlanificadorPage from '../../components/plan-viewer/PlanificadorPage'
import { getLatestProfileIdForUser, getPlansByProfile, getProgressByPlan } from '../../src/lib/db/db-helpers'
import type { PlannerViewProps } from '../../components/workspace/types'

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

function resolveInitialView(view: string | null): PlannerViewProps['initialView'] {
  switch (view) {
    case 'year':
      return 'multiMonthYear'
    case 'month':
      return 'dayGridMonth'
    case 'week':
      return 'timeGridWeek'
    case 'day':
      return 'timeGridDay'
    default:
      return 'timeGridWeek'
  }
}

export default async function PlanPage({ searchParams }: PlanPageProps) {
  const session = await auth()

  if (!session) {
    redirect('/auth/signin?callbackUrl=/plan')
  }

  const params = await resolveSearchParams(searchParams)
  const requestedPlanId = readParam(params.planId)
  const latestProfileId = session.user?.id
    ? await getLatestProfileIdForUser(session.user.id)
    : null

  let initialData: PlannerViewProps['initialData'] = null

  if (latestProfileId) {
    const plans = await getPlansByProfile(latestProfileId)
    const activePlan = (requestedPlanId ? plans.find((plan) => plan.id === requestedPlanId) : null) ?? plans[0] ?? null

    if (activePlan) {
      initialData = {
        activePlan,
        tasks: await getProgressByPlan(activePlan.id)
      }
    }
  }

  return (
    <PlanificadorPage
      initialView={resolveInitialView(readParam(params.view))}
      initialData={initialData}
    />
  )
}
