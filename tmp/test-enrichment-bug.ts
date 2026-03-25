import { z as zz } from 'zod'
import { perfilSchema } from '../src/shared/schemas/perfil'
import fs from 'fs'

const state = JSON.parse(fs.readFileSync('./tmp/pipeline-state.json', 'utf8'))
const rawLlmResponse = state.phases[1].traces[0].response
const rawJson = JSON.parse(rawLlmResponse)
console.log('LLM JSON:', rawJson)

const enrichedPartialSchema = zz.object({
  despertar: zz.string().nullable().optional(),
  dormir: zz.string().nullable().optional(),
  trabajoInicio: zz.string().nullable().optional(),
  trabajoFin: zz.string().nullable().optional(),
  tiempoTransporte: zz.number().nullable().optional(),
  cronotipo: zz.enum(['matutino', 'vespertino', 'neutro']).optional(),
  horasProductivasMaximas: zz.number().min(0).max(24).optional(),
  horarioPicoEnergia: zz.string().optional(),
  horarioBajoEnergia: zz.string().optional(),
  nivelEnergia: zz.enum(['alto', 'medio', 'bajo']).optional(),
  motivacion: zz.number().int().min(1).max(5).optional(),
  estres: zz.number().int().min(1).max(5).optional(),
  horasLibresLaborales: zz.number().min(0).optional(),
  horasLibresFDS: zz.number().min(0).optional()
})

const enrichResponseSchema = zz.object({
  enrichedPartial: enrichedPartialSchema,
  inferences: zz.array(zz.object({
    field: zz.string(),
    value: zz.unknown(),
    confidence: zz.enum(['high', 'medium', 'low']),
    reason: zz.string()
  })).default([]),
  warnings: zz.array(zz.string()).default([])
})

try {
  enrichResponseSchema.parse(rawJson)
  console.log('✅ enrichResponseSchema success!')
} catch (e: any) {
  console.error('❌ enrichResponseSchema error:', e.errors)
}
