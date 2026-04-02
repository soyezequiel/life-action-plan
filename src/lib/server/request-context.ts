import { cache } from 'react'

import { auth } from '@/src/auth'
import { buildDashboardSummary } from '@/src/lib/domain/dashboard-summary'
import type { DashboardSummaryResult, PlanRow, ProgressRow } from '@/src/shared/types/lap-api'

import { getLatestProfileIdForUser, getPlansByProfile, getProgressByPlan } from '../db/db-helpers'

export const getCurrentSession = cache(async () => auth())

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

const getProgressByPlanCached = cache(async (planId: string): Promise<ProgressRow[]> => {
  return getProgressByPlan(planId)
})

export interface WorkspacePlanSelection {
  latestProfileId: string | null
  plans: PlanRow[]
  activePlan: PlanRow | null
}

export const getWorkspacePlanSelection = cache(async (
  userId: string | null,
  requestedPlanId: string | null
): Promise<WorkspacePlanSelection> => {
  const latestProfileId = await getLatestProfileIdCached(userId)
  const plans = await getPlansByProfileCached(latestProfileId)
  const activePlan = (requestedPlanId ? plans.find((plan) => plan.id === requestedPlanId) : null) ?? plans[0] ?? null

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
