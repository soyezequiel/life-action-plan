import { analyzeObjectives, buildProfileFromFlow } from '../flow/engine'
import { createProfile, getLatestProfileIdForUser, trackEvent, updateProfile } from '../db/db-helpers'
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
  
  // Buscar perfil existente para el usuario autenticado
  const existingProfileId = userId ? await getLatestProfileIdForUser(userId) : null
  let profileId: string

  if (existingProfileId) {
    // Si ya existe, actualizamos sus datos y el timestamp para marcarlo como más activo
    await updateProfile(existingProfileId, JSON.stringify(profile))
    profileId = existingProfileId
    await trackEvent('INTAKE_UPDATED', { profileId, mode: 'express' })
  } else {
    // Si no, creamos uno nuevo
    profileId = await createProfile(JSON.stringify(profile), userId ?? null)
    await trackEvent('INTAKE_COMPLETED', { profileId, mode: 'express' })
  }

  return { profileId }
}
