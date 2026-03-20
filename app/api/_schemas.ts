import { z } from 'zod'

const idSchema = z.string().uuid()
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const intakeRequestSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
  edad: z.coerce.number().int().min(0).max(150),
  ubicacion: z.string().trim().min(1).max(120),
  ocupacion: z.string().trim().min(1).max(200),
  objetivo: z.string().trim().min(1).max(500)
}).strict()

export const planBuildRequestSchema = z.object({
  profileId: idSchema,
  apiKey: z.string().trim().default(''),
  provider: z.string().trim().min(1).optional()
}).strict()

export const planListQuerySchema = z.object({
  profileId: idSchema
}).strict()

export const planSimulateRequestSchema = z.object({
  planId: idSchema,
  mode: z.enum(['interactive', 'automatic']).default('interactive')
}).strict()

export const planExportIcsRequestSchema = z.object({
  planId: idSchema
}).strict()

export const profileQuerySchema = z.object({
  profileId: idSchema
}).strict()

export const progressListQuerySchema = z.object({
  planId: idSchema,
  fecha: dateSchema
}).strict()

export const progressToggleRequestSchema = z.object({
  progressId: idSchema
}).strict()

export const streakQuerySchema = z.object({
  planId: idSchema
}).strict()

export const costQuerySchema = z.object({
  planId: idSchema
}).strict()

export const walletConnectRequestSchema = z.object({
  connectionUrl: z.string().trim().min(1)
}).strict()

export const apiKeySaveRequestSchema = z.object({
  apiKey: z.string().trim().min(1)
}).strict()

export const debugMutationRequestSchema = z.union([
  z.object({
    action: z.enum(['enable', 'disable', 'clear'])
  }).strict(),
  z.object({
    enabled: z.boolean()
  }).strict()
])
