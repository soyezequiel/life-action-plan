import { cache } from 'react'

import { auth } from '@/src/auth'
import { createCodexDebugSession, isCodexDebugMode } from '@/src/lib/dev/codex-debug'
import { buildDashboardSummary } from '@/src/lib/domain/dashboard-summary'
import type { DashboardSummaryResult, PlanRow, ProgressRow } from '@/src/shared/types/lap-api'

import { getLatestProfileIdForUser, getLatestProfileIdWithPlans, getPlan, getPlansByProfile, getProgressByPlan } from '../db/db-helpers'

export const getCurrentSession = cache(async () => {
  const session = await auth()

  if (session) {
    return session
  }

  return isCodexDebugMode() ? createCodexDebugSession() : null
})

const getLatestProfileIdCached = cache(async (userId: string | null): Promise<string | null> => {
  if (!userId) {
    return null
  }

  return getLatestProfileIdForUser(userId)
})

const getPlansByProfileCached = cache(async (profileId: string | null): Promise<PlanRow[]> => {
  if (!profileId) {
    return []
  }

  return getPlansByProfile(profileId)
})

const getPlanCached = cache(async (planId: string | null): Promise<PlanRow | null> => {
  if (!planId) {
    return null
  }

  return getPlan(planId)
})

const getLatestProfileIdWithPlansCached = cache(async (): Promise<string | null> => {
  return getLatestProfileIdWithPlans()
})

const getProgressByPlanCached = cache(async (planId: string): Promise<ProgressRow[]> => {
  return getProgressByPlan(planId)
})

export interface WorkspacePlanSelection {
  latestProfileId: string | null
  plans: PlanRow[]
  activePlan: PlanRow | null
}

async function resolveCodexFallbackSelection(requestedPlanId: string | null): Promise<WorkspacePlanSelection | null> {
  const requestedPlan = requestedPlanId ? await getPlanCached(requestedPlanId) : null
  const fallbackProfileId = requestedPlan?.profileId ?? await getLatestProfileIdWithPlansCached()

  if (!fallbackProfileId) {
    return null
  }

  const plans = await getPlansByProfileCached(fallbackProfileId)
  if (plans.length === 0) {
    return null
  }

  const activePlan = requestedPlanId
    ? plans.find((plan) => plan.id === requestedPlanId) ?? requestedPlan ?? plans[0] ?? null
    : plans[0] ?? null

  return {
    latestProfileId: fallbackProfileId,
    plans,
    activePlan,
  }
}

export const getWorkspacePlanSelection = cache(async (
  userId: string | null,
  requestedPlanId: string | null
): Promise<WorkspacePlanSelection> => {
  const latestProfileId = await getLatestProfileIdCached(userId)
  const plans = await getPlansByProfileCached(latestProfileId)
  const requestedPlan = requestedPlanId ? plans.find((plan) => plan.id === requestedPlanId) ?? null : null
  const activePlan = requestedPlan ?? plans[0] ?? null

  if (isCodexDebugMode() && ((!activePlan && plans.length === 0) || (requestedPlanId && !requestedPlan))) {
    const fallbackSelection = await resolveCodexFallbackSelection(requestedPlanId)
    if (fallbackSelection) {
      return fallbackSelection
    }
  }

  return {
    latestProfileId,
    plans,
    activePlan,
  }
})

export const getPlannerInitialData = cache(async (
  userId: string | null,
  requestedPlanId: string | null
): Promise<{ activePlan: PlanRow | null, tasks: ProgressRow[] } | null> => {
  const { activePlan } = await getWorkspacePlanSelection(userId, requestedPlanId)

  if (!activePlan) {
    return null
  }

  return {
    activePlan,
    tasks: await getProgressByPlanCached(activePlan.id),
  }
})

export const getTasksInitialData = cache(async (
  userId: string | null,
  requestedPlanId: string | null
): Promise<ProgressRow[] | undefined> => {
  const plannerData = await getPlannerInitialData(userId, requestedPlanId)
  return plannerData?.tasks
})

export const getDashboardInitialData = cache(async (
  userId: string | null,
  requestedPlanId: string | null
): Promise<DashboardSummaryResult | null> => {
  const plannerData = await getPlannerInitialData(userId, requestedPlanId)

  if (!plannerData?.activePlan) {
    return null
  }

  return buildDashboardSummary({
    plan: plannerData.activePlan,
    progressRows: plannerData.tasks,
  })
})
