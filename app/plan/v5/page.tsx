import { redirect } from 'next/navigation'

type SearchParams = Record<string, string | string[] | undefined>

interface PlanV5PageProps {
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

function redirectToPlan(tab: string | null, planId: string | null, view: string | null): never {
  if (tab === 'tasks') {
    const params = new URLSearchParams()

    if (planId) {
      params.set('planId', planId)
    }

    redirect(params.toString() ? `/tasks?${params.toString()}` : '/tasks')
  }

  const params = new URLSearchParams()

  if (planId) {
    params.set('planId', planId)
  }

  if (tab === 'progress') {
    params.set('tab', 'progress')
    redirect(`/plan?${params.toString()}`)
  }

  params.set('tab', 'calendar')

  if (view) {
    params.set('view', view)
  }

  redirect(`/plan?${params.toString()}`)
}

export default async function PlanV5Page({ searchParams }: PlanV5PageProps) {
  const params = await resolveSearchParams(searchParams)

  redirectToPlan(
    readParam(params.tab),
    readParam(params.planId),
    readParam(params.view)
  )
}
