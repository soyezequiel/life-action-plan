import { Suspense } from 'react'
import { t } from '@/src/i18n'
import { redirect } from 'next/navigation'
import Dashboard from '../components/Dashboard'
import { getDeploymentMode } from '../src/lib/env/deployment'
import { getCurrentSession, getDashboardInitialData } from '../src/lib/server/request-context'

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
  const session = await getCurrentSession()

  if (!session) {
    redirect('/auth/signin')
  }

  const params = await resolveSearchParams(searchParams)
  const requestedPlanId = readParam(params.planId)
  const initialData = await getDashboardInitialData(session.user?.id ?? null, requestedPlanId)

  return (
    <Suspense fallback={<div>{t('ui.loading')}</div>}>
      <Dashboard deploymentMode={getDeploymentMode()} initialData={initialData} />
    </Suspense>
  )
}
