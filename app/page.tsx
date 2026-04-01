import { Suspense } from 'react'
import { auth } from '@/src/auth'
import { redirect } from 'next/navigation'
import Dashboard from '../components/Dashboard'
import { getDeploymentMode } from '../src/lib/env/deployment'
import type { DashboardBootstrapData } from '../components/mockups/DashboardMockup'
import {
  getHabitStreak,
  getLatestProfileIdForUser,
  getPlansByProfile,
  getProfile,
  getProgressByPlanAndDate,
  getWeeklyProgressSummary
} from '../src/lib/db/db-helpers'
import { getProfileTimezone, getTodayISO, parseStoredProfile } from '../src/lib/domain/plan-helpers'

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

async function loadDashboardBootstrap(userId: string, requestedPlanId: string | null): Promise<DashboardBootstrapData | null> {
  const latestProfileId = await getLatestProfileIdForUser(userId)

  if (!latestProfileId) {
    return null
  }

  const plans = await getPlansByProfile(latestProfileId)
  const activePlan = plans.find((plan) => plan.id === requestedPlanId) ?? plans[0] ?? null

  if (!activePlan) {
    return null
  }

  const profileRow = await getProfile(activePlan.profileId)
  const profile = profileRow ? parseStoredProfile(profileRow.data) : null
  const timezone = getProfileTimezone(profile)
  const todayIso = getTodayISO(timezone)

  const [tasks, weeklySummary, streak] = await Promise.all([
    getProgressByPlanAndDate(activePlan.id, todayIso),
    getWeeklyProgressSummary(activePlan.id, 5),
    getHabitStreak(activePlan.id, todayIso).catch(() => null)
  ])

  const completedCount = tasks.filter((task) => task.completado).length
  const totalCount = tasks.length
  const hydrationProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return {
    activePlan,
    tasks,
    weeklySummary,
    streak,
    hydrationProgress,
    readingProgress: Math.min(100, Math.round(hydrationProgress * 1.2)),
    initialDateStr: '',
    initialTimeRemaining: ''
  }
}

export default async function Page({ searchParams }: PageProps) {
  const session = await auth()

  if (!session) {
    redirect('/auth/signin')
  }

  const params = await resolveSearchParams(searchParams)
  const requestedPlanId = readParam(params.planId)
  const initialData = session.user?.id
    ? await loadDashboardBootstrap(session.user.id, requestedPlanId)
    : null

  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <Dashboard deploymentMode={getDeploymentMode()} initialData={initialData} />
    </Suspense>
  )
}
