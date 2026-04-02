import { redirect } from 'next/navigation'

import TaskManagementMockup from '../../components/mockups/TaskManagementMockup'
import { getCurrentSession, getTasksInitialData } from '../../src/lib/server/request-context'

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
  const session = await getCurrentSession()

  if (!session) {
    redirect('/auth/signin?callbackUrl=/tasks')
  }

  const params = await resolveSearchParams(searchParams)
  const requestedPlanId = readParam(params.planId)
  const initialTasks = await getTasksInitialData(session.user?.id ?? null, requestedPlanId)

  return <TaskManagementMockup initialTasks={initialTasks} />
}
