import { z } from 'zod'
import {
  availabilityGridSchema,
  credentialOwnerSchema,
  credentialRecordStatusSchema,
  credentialSecretTypeSchema,
  interactiveSessionCreateRequestSchema as interactiveSessionCreateRequestSchemaBase,
  interactiveSessionDeleteResponseSchema as interactiveSessionDeleteResponseSchemaBase,
  interactiveSessionInputRequestSchema as interactiveSessionInputRequestSchemaBase,
  interactiveSessionResponseSchema as interactiveSessionResponseSchemaBase,
  flowStepSchema,
  goalDraftSchema,
  realityAdjustmentSchema
} from './schemas'

const idSchema = z.string().uuid()
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const cloudApiProviderSchema = z.enum(['openai', 'openrouter'])
const buildResourceModeSchema = z.enum(['auto', 'backend', 'user', 'codex'])
const thinkingModeSchema = z.enum(['enabled', 'disabled'])
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
}).passthrough()

export const planBuildRequestSchema = z.object({
  profileId: idSchema,
  apiKey: z.string().trim().default(''),
  provider: z.string().trim().min(1).optional(),
  backendCredentialId: z.string().trim().min(1).optional(),
  resourceMode: buildResourceModeSchema.optional(),
  thinkingMode: thinkingModeSchema.optional()
}).passthrough()

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

export const registerRequestSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(128),
  email: z.string().email().optional(),
  name: z.string().trim().min(1).max(120).optional()
}).strict()

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(128)
}).strict()

export const deleteAccountRequestSchema = z.object({
  confirmation: z.literal('ELIMINAR')
}).strict()

export const vaultBackupRequestSchema = z.object({
  encryptedBlob: z.string().trim().min(1),
  salt: z.string().trim().min(1)
}).strict()

export const claimLocalDataRequestSchema = z.object({
  localProfileId: idSchema,
  localWorkflowId: idSchema.optional()
}).strict()

export const flowSessionCreateRequestSchema = z.object({
  workflowId: idSchema.optional(),
  sourceWorkflowId: idSchema.optional(),
  intent: z.enum(['default', 'redo-profile', 'change-objectives', 'restart-flow']).default('default')
}).strict()

export const flowGateRequestSchema = z.object({
  choice: z.enum(['pulso', 'advanced']).default('pulso'),
  llmMode: z.enum(['service', 'own', 'codex', 'local']).default('service'),
  provider: z.string().trim().min(1).default('openai:gpt-4o-mini'),
  backendCredentialId: z.string().trim().min(1).nullable().optional(),
  hasUserApiKey: z.boolean().optional()
}).strict()

export const flowObjectivesRequestSchema = z.object({
  objectives: z.array(z.string().trim().min(1).max(500)).min(1).max(5),
  orderedGoalIds: z.array(z.string().trim().min(1)).default([]),
  goals: z.array(goalDraftSchema).optional()
}).strict()

export const flowIntakeRequestSchema = z.object({
  answers: z.record(z.string(), z.string()).default({}),
  isAutoSave: z.boolean().optional()
}).strict()

export const flowRealityCheckRequestSchema = z.object({
  adjustment: realityAdjustmentSchema.default('keep')
}).strict()

export const flowPresentationRequestSchema = z.object({
  accept: z.boolean().default(false),
  feedback: z.string().trim().max(500).default(''),
  edits: z.array(z.object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1).max(160).optional(),
    detail: z.string().trim().min(1).max(320).optional()
  }).strict()).default([])
}).strict()

export const flowCalendarRequestSchema = z.object({
  grid: availabilityGridSchema.optional(),
  notes: z.string().trim().max(500).default(''),
  icsText: z.string().trim().max(20000).optional()
}).strict()

export const flowTopDownRequestSchema = z.object({
  action: z.enum(['generate', 'confirm', 'revise', 'back']).default('generate')
}).strict()

export const flowResumePatchRequestSchema = z.object({
  changeSummary: z.string().trim().max(500).default('')
}).strict()

export const flowStepQuerySchema = z.object({
  step: flowStepSchema.optional()
}).strict()
 
export const credentialCheckQuerySchema = z.object({
  provider: z.string().trim().min(1).optional(),
  resourceMode: buildResourceModeSchema.optional(),
  backendCredentialId: z.string().trim().min(1).optional()
}).strict()


export const interactiveSessionCreateRequestSchema = interactiveSessionCreateRequestSchemaBase
export const interactiveSessionResponseSchema = interactiveSessionResponseSchemaBase
export const interactiveSessionInputRequestSchema = interactiveSessionInputRequestSchemaBase
export const interactiveSessionDeleteResponseSchema = interactiveSessionDeleteResponseSchemaBase

export const debugMutationRequestSchema = z.union([
  z.object({
    action: z.enum(['enable', 'disable', 'clear'])
  }).strict(),
  z.object({
    enabled: z.boolean()
  }).strict()
])
