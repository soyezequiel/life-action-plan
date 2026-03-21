import { z } from 'zod'
import {
  credentialOwnerSchema,
  credentialRecordStatusSchema,
  credentialSecretTypeSchema
} from '../../src/shared/schemas'

const idSchema = z.string().uuid()
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const cloudApiProviderSchema = z.enum(['openai', 'openrouter'])
const buildResourceModeSchema = z.enum(['auto', 'backend', 'user'])
const credentialMetadataSchema = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.unknown())
]).nullable()

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
  provider: z.string().trim().min(1).optional(),
  backendCredentialId: z.string().trim().min(1).optional(),
  resourceMode: buildResourceModeSchema.optional()
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
  fecha: dateSchema.optional()
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
  apiKey: z.string().trim().min(1),
  provider: cloudApiProviderSchema.default('openai')
}).strict()

export const buildUsagePreviewQuerySchema = z.object({
  provider: z.string().trim().min(1).optional(),
  hasUserApiKey: z.string().trim().optional(),
  backendCredentialId: z.string().trim().min(1).optional(),
  resourceMode: buildResourceModeSchema.optional()
}).strict()

export const credentialListQuerySchema = z.object({
  owner: credentialOwnerSchema.optional(),
  ownerId: z.string().trim().min(1).optional(),
  providerId: z.string().trim().min(1).optional(),
  secretType: credentialSecretTypeSchema.optional(),
  status: credentialRecordStatusSchema.optional(),
  label: z.string().trim().min(1).optional()
}).strict()

export const credentialSaveRequestSchema = z.object({
  owner: credentialOwnerSchema,
  ownerId: z.string().trim().min(1).optional(),
  providerId: z.string().trim().min(1),
  secretType: credentialSecretTypeSchema,
  label: z.string().trim().min(1).optional(),
  secretValue: z.string().trim().min(1),
  status: credentialRecordStatusSchema.optional(),
  metadata: credentialMetadataSchema.optional()
}).strict()

export const credentialUpdateRequestSchema = z.object({
  label: z.string().trim().min(1).nullable().optional(),
  secretValue: z.string().trim().min(1).optional(),
  status: credentialRecordStatusSchema.optional(),
  metadata: credentialMetadataSchema.optional()
}).strict().refine((value) => (
  typeof value.label !== 'undefined'
  || typeof value.secretValue !== 'undefined'
  || typeof value.status !== 'undefined'
  || typeof value.metadata !== 'undefined'
), {
  message: 'EMPTY_CREDENTIAL_UPDATE'
})

export const debugMutationRequestSchema = z.union([
  z.object({
    action: z.enum(['enable', 'disable', 'clear'])
  }).strict(),
  z.object({
    enabled: z.boolean()
  }).strict()
])
