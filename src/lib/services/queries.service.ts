import { getPlan, getProfile, getPlansByProfile } from '../db/db-helpers'
import { parseStoredProfile } from '../domain/plan-helpers'
import { apiErrorMessages } from '../../shared/api-utils'

export async function fetchProfile(profileId: string) {
  const profileRow = await getProfile(profileId)
  if (!profileRow) {
    throw new Error(apiErrorMessages.profileNotFound())
  }
  const profile = parseStoredProfile(profileRow.data)
  if (!profile) {
    throw new Error(apiErrorMessages.profileNotFound())
  }
  return profile
}

export async function fetchPlan(planId: string) {
  const planRow = await getPlan(planId)
  if (!planRow) {
    throw new Error(apiErrorMessages.planNotFound())
  }
  return planRow
}

export async function fetchUserPlans(profileId: string) {
  return getPlansByProfile(profileId)
}
