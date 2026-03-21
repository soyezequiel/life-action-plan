import { z } from 'zod'

export const credentialOwnerSchema = z.enum(['backend', 'user'])
export const credentialSecretTypeSchema = z.enum(['api-key', 'wallet-connection', 'bearer-token', 'custom'])
export const credentialRecordStatusSchema = z.enum(['active', 'inactive', 'invalid'])

export const DEFAULT_CREDENTIAL_LABEL = 'default'

export const credentialLocatorSchema = z.object({
  owner: credentialOwnerSchema,
  ownerId: z.string().trim().min(1),
  providerId: z.string().trim().min(1),
  secretType: credentialSecretTypeSchema,
  label: z.string().trim().min(1).default(DEFAULT_CREDENTIAL_LABEL)
}).strict()

export const storedCredentialRecordSchema = z.object({
  id: z.string().trim().min(1),
  owner: credentialOwnerSchema,
  ownerId: z.string().trim().min(1),
  providerId: z.string().trim().min(1),
  secretType: credentialSecretTypeSchema,
  label: z.string().trim().min(1),
  encryptedValue: z.string().trim().min(1),
  status: credentialRecordStatusSchema,
  lastValidatedAt: z.string().nullable(),
  lastValidationError: z.string().nullable(),
  metadata: z.string().nullable(),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1)
}).strict()

export const credentialRecordViewSchema = z.object({
  id: z.string().trim().min(1),
  owner: credentialOwnerSchema,
  ownerId: z.string().trim().min(1),
  providerId: z.string().trim().min(1),
  secretType: credentialSecretTypeSchema,
  label: z.string().trim().min(1),
  status: credentialRecordStatusSchema,
  lastValidatedAt: z.string().nullable(),
  lastValidationError: z.string().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1)
}).strict()

export const credentialValidationResultSchema = z.object({
  status: credentialRecordStatusSchema,
  validatedAt: z.string().nullable().optional(),
  validationError: z.string().nullable().optional()
}).strict()

export type CredentialOwner = z.infer<typeof credentialOwnerSchema>
export type CredentialSecretType = z.infer<typeof credentialSecretTypeSchema>
export type CredentialRecordStatus = z.infer<typeof credentialRecordStatusSchema>
export type CredentialLocator = z.infer<typeof credentialLocatorSchema>
export type StoredCredentialRecord = z.infer<typeof storedCredentialRecordSchema>
export type CredentialRecordView = z.infer<typeof credentialRecordViewSchema>
export type CredentialValidationResult = z.infer<typeof credentialValidationResultSchema>
