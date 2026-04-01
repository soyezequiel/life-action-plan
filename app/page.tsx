import { Suspense } from 'react'
import { auth } from '@/src/auth'
import { t } from '@/src/i18n'
import { redirect } from 'next/navigation'
import Dashboard from '../components/Dashboard'
import { getDeploymentMode } from '../src/lib/env/deployment'
import { buildDashboardSummary } from '../src/lib/domain/dashboard-summary'
import { getLatestProfileIdForUser, getPlansByProfile, getProgressByPlan } from '../src/lib/db/db-helpers'

type SearchParams = Record<string, string | string[] | undefined>

interface PageProps {
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

export default async function Page({ searchParams }: PageProps) {
  const session = await auth()

  if (!session) {
    redirect('/auth/signin')
  }

  const params = await resolveSearchParams(searchParams)
  const requestedPlanId = readParam(params.planId)
  const latestProfileId = session.user?.id
    ? await getLatestProfileIdForUser(session.user.id)
    : null

  let initialData = null

  if (latestProfileId) {
    const plans = await getPlansByProfile(latestProfileId)
    const activePlan = (requestedPlanId ? plans.find((plan) => plan.id === requestedPlanId) : null) ?? plans[0] ?? null

    if (activePlan) {
      initialData = await buildDashboardSummary({
        plan: activePlan,
        progressRows: await getProgressByPlan(activePlan.id)
      })
    }
  }

  return (
    <Suspense fallback={<div>{t('ui.loading')}</div>}>
      <Dashboard deploymentMode={getDeploymentMode()} initialData={initialData} />
    </Suspense>
  )
}
