import { analyzeObjectives, buildProfileFromFlow } from '../flow/engine'
import { createProfile, trackEvent } from '../db/db-helpers'
import { intakeRequestSchema } from '../../shared/api-schemas'
import type { IntakeRequestData, IntakeResult } from './types'

export async function processIntake(
  data: IntakeRequestData,
  userId?: string
): Promise<IntakeResult> {
  const validatedData = intakeRequestSchema.parse(data)
  const profile = buildProfileFromFlow(
    analyzeObjectives([validatedData.objetivo]),
    {
      nombre: validatedData.nombre,
      edad: String(validatedData.edad),
      ubicacion: validatedData.ubicacion,
      ocupacion: validatedData.ocupacion,
      goalClarity: validatedData.objetivo,
      motivacion: validatedData.objetivo
    }
  )
  
  // Use a fallback for userId or the resolved authenticated user id
  const profileId = await createProfile(JSON.stringify(profile), userId ?? null)
  await trackEvent('INTAKE_COMPLETED', { profileId, mode: 'express' })

  return { profileId }
}
