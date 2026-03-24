import { z } from 'zod'

/**
 * SimPersona: Perfil de personalidad simulado del usuario.
 *
 * Inspirado en OasisAgentProfile de MiroFish-Offline:
 * genera un "personaje" del usuario con rasgos de personalidad,
 * tendencias de comportamiento y contexto vital, para que el
 * user-agent simule decisiones más realistas.
 */

export const simPersonaPersonalitySchema = z.enum([
  'disciplinado',
  'flexible',
  'procrastinador',
  'perfeccionista',
  'impulsivo',
  'constante'
])

export const simPersonaStressResponseSchema = z.enum([
  'evita',
  'enfrenta',
  'posterga',
  'se_paraliza',
  'busca_ayuda'
])

export const simPersonaMotivationSchema = z.enum([
  'intrinseca',
  'extrinseca',
  'social',
  'por_deadline'
])

export const simPersonaSchema = z.object({
  // Identidad derivada del intake
  name: z.string().trim().min(1).max(100),
  age: z.number().int().min(0).max(150),
  occupation: z.string().trim().max(200),

  // Personalidad sintetizada por LLM
  personalityType: simPersonaPersonalitySchema,
  energyPattern: z.enum(['matutino', 'vespertino', 'neutro']),
  stressResponse: simPersonaStressResponseSchema,
  motivationStyle: simPersonaMotivationSchema,

  // Tendencias de comportamiento (texto libre del LLM)
  strengths: z.array(z.string().trim().max(200)).min(1).max(5),
  weaknesses: z.array(z.string().trim().max(200)).min(1).max(5),
  likelyFailurePoints: z.array(z.string().trim().max(200)).max(5).default([]),

  // Contexto vital resumido
  dependents: z.number().int().min(0).default(0),
  healthConditions: z.array(z.string().trim().max(100)).default([]),
  weekdayFreeHours: z.number().min(0).max(24),
  weekendFreeHours: z.number().min(0).max(24),

  // Narrativa completa (como el "persona" de MiroFish)
  narrative: z.string().trim().min(10).max(1500),

  // Metadata
  generatedWith: z.enum(['llm', 'rules']),
  generatedAt: z.string().trim().min(1)
}).strict()

export type SimPersona = z.infer<typeof simPersonaSchema>
export type SimPersonaPersonality = z.infer<typeof simPersonaPersonalitySchema>
export type SimPersonaStressResponse = z.infer<typeof simPersonaStressResponseSchema>
export type SimPersonaMotivation = z.infer<typeof simPersonaMotivationSchema>
