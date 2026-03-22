import { z } from 'zod'

export const resourceOwnerSchema = z.enum(['backend', 'user'])
export const executionTargetSchema = z.enum(['cloud', 'backend-local', 'user-local'])
export const credentialSourceSchema = z.enum(['backend-stored', 'user-stored', 'user-supplied', 'none'])
export const chargePolicySchema = z.enum(['charge', 'skip'])
export const chargeReasonSchema = z.enum(['backend_resource', 'user_resource', 'internal_tooling'])
export const providerKindSchema = z.enum(['cloud', 'local'])
export const executionModeSchema = z.enum(['backend-cloud', 'user-cloud', 'codex-cloud', 'backend-local', 'user-local'])
export const executionResolutionSourceSchema = z.enum([
  'requested-mode',
  'auto-user-supplied',
  'auto-user-stored',
  'auto-backend-stored',
  'auto-backend-local',
  'auto-user-local',
  'auto-cloud-missing',
  'auto-local-unavailable'
])
export const executionBlockReasonSchema = z.enum([
  'unsupported_provider',
  'execution_mode_provider_mismatch',
  'cloud_credential_missing',
  'user_credential_missing',
  'backend_credential_missing',
  'codex_mode_unavailable',
  'backend_local_unavailable',
  'user_local_not_supported'
])

export const providerDescriptorSchema = z.object({
  providerId: z.string().trim().min(1),
  modelId: z.string().trim().min(1),
  providerKind: providerKindSchema
}).strict()

export const executionModeSpecSchema = z.object({
  mode: executionModeSchema,
  resourceOwner: resourceOwnerSchema,
  executionTarget: executionTargetSchema,
  allowedCredentialSources: z.array(credentialSourceSchema).min(1),
  chargePolicy: chargePolicySchema,
  chargeReason: chargeReasonSchema
}).strict()

export type ResourceOwner = z.infer<typeof resourceOwnerSchema>
export type ExecutionTarget = z.infer<typeof executionTargetSchema>
export type CredentialSource = z.infer<typeof credentialSourceSchema>
export type ChargePolicy = z.infer<typeof chargePolicySchema>
export type ChargeReason = z.infer<typeof chargeReasonSchema>
export type ProviderKind = z.infer<typeof providerKindSchema>
export type ExecutionMode = z.infer<typeof executionModeSchema>
export type ExecutionResolutionSource = z.infer<typeof executionResolutionSourceSchema>
export type ExecutionBlockReason = z.infer<typeof executionBlockReasonSchema>
export type ProviderDescriptor = z.infer<typeof providerDescriptorSchema>
export type ExecutionModeSpec = z.infer<typeof executionModeSpecSchema>

const executionModeSpecEntries = [
  {
    mode: 'backend-cloud',
    resourceOwner: 'backend',
    executionTarget: 'cloud',
    allowedCredentialSources: ['backend-stored'],
    chargePolicy: 'charge',
    chargeReason: 'backend_resource'
  },
  {
    mode: 'user-cloud',
    resourceOwner: 'user',
    executionTarget: 'cloud',
    allowedCredentialSources: ['user-stored', 'user-supplied'],
    chargePolicy: 'skip',
    chargeReason: 'user_resource'
  },
  {
    mode: 'codex-cloud',
    resourceOwner: 'backend',
    executionTarget: 'cloud',
    allowedCredentialSources: ['backend-stored'],
    chargePolicy: 'skip',
    chargeReason: 'internal_tooling'
  },
  {
    mode: 'backend-local',
    resourceOwner: 'backend',
    executionTarget: 'backend-local',
    allowedCredentialSources: ['none'],
    chargePolicy: 'charge',
    chargeReason: 'backend_resource'
  },
  {
    mode: 'user-local',
    resourceOwner: 'user',
    executionTarget: 'user-local',
    allowedCredentialSources: ['none'],
    chargePolicy: 'skip',
    chargeReason: 'user_resource'
  }
] as const satisfies readonly ExecutionModeSpec[]

export const EXECUTION_MODE_SPECS = Object.freeze(
  Object.fromEntries(
    executionModeSpecEntries.map((entry) => {
      const validated = executionModeSpecSchema.parse(entry)
      return [validated.mode, validated]
    })
  ) as Record<ExecutionMode, ExecutionModeSpec>
)

function getExpectedProviderKind(executionTarget: ExecutionTarget): ProviderKind {
  return executionTarget === 'cloud' ? 'cloud' : 'local'
}

const resourceExecutionContextBaseSchema = z.object({
  mode: executionModeSchema,
  resourceOwner: resourceOwnerSchema,
  executionTarget: executionTargetSchema,
  credentialSource: credentialSourceSchema,
  provider: providerDescriptorSchema,
  chargePolicy: chargePolicySchema,
  chargeReason: chargeReasonSchema
}).strict()

function validateResourceExecutionContext(
  value: z.infer<typeof resourceExecutionContextBaseSchema>,
  ctx: z.RefinementCtx
): void {
  const spec = EXECUTION_MODE_SPECS[value.mode]

  if (value.resourceOwner !== spec.resourceOwner) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resourceOwner'],
      message: `Execution mode ${value.mode} requires resourceOwner=${spec.resourceOwner}`
    })
  }

  if (value.executionTarget !== spec.executionTarget) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['executionTarget'],
      message: `Execution mode ${value.mode} requires executionTarget=${spec.executionTarget}`
    })
  }

  if (!spec.allowedCredentialSources.includes(value.credentialSource)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['credentialSource'],
      message: `Execution mode ${value.mode} does not allow credentialSource=${value.credentialSource}`
    })
  }

  if (value.chargePolicy !== spec.chargePolicy) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['chargePolicy'],
      message: `Execution mode ${value.mode} requires chargePolicy=${spec.chargePolicy}`
    })
  }

  if (value.chargeReason !== spec.chargeReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['chargeReason'],
      message: `Execution mode ${value.mode} requires chargeReason=${spec.chargeReason}`
    })
  }

  const expectedProviderKind = getExpectedProviderKind(value.executionTarget)
  if (value.provider.providerKind !== expectedProviderKind) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['provider', 'providerKind'],
      message: `Execution target ${value.executionTarget} requires providerKind=${expectedProviderKind}`
    })
  }
}

export const resourceExecutionContextSchema = resourceExecutionContextBaseSchema.superRefine(validateResourceExecutionContext)

const resolvedExecutionContextBaseSchema = resourceExecutionContextBaseSchema.extend({
  credentialId: z.string().trim().min(1).nullable(),
  canExecute: z.boolean(),
  resolutionSource: executionResolutionSourceSchema,
  blockReasonCode: executionBlockReasonSchema.nullable(),
  blockReasonDetail: z.string().trim().min(1).nullable()
}).strict()

export const resolvedExecutionContextSchema = resolvedExecutionContextBaseSchema.superRefine((value, ctx) => {
  validateResourceExecutionContext(value, ctx)

  if (value.canExecute && value.blockReasonCode !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['blockReasonCode'],
      message: 'Executable context cannot include a blockReasonCode'
    })
  }

  if (value.canExecute && value.blockReasonDetail !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['blockReasonDetail'],
      message: 'Executable context cannot include a blockReasonDetail'
    })
  }

  if (!value.canExecute && value.blockReasonCode === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['blockReasonCode'],
      message: 'Blocked context requires a blockReasonCode'
    })
  }

  if ((value.credentialSource === 'user-supplied' || value.credentialSource === 'none') && value.credentialId !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['credentialId'],
      message: `credentialSource=${value.credentialSource} requires credentialId=null`
    })
  }

  if (
    value.canExecute &&
    (value.credentialSource === 'backend-stored' || value.credentialSource === 'user-stored') &&
    value.credentialId === null
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['credentialId'],
      message: `Executable context with credentialSource=${value.credentialSource} requires credentialId`
    })
  }
})

export type ResourceExecutionContext = z.infer<typeof resourceExecutionContextSchema>
export type ResolvedExecutionContext = z.infer<typeof resolvedExecutionContextSchema>

export function getExecutionModeSpec(mode: ExecutionMode): ExecutionModeSpec {
  return EXECUTION_MODE_SPECS[mode]
}

export function getChargePolicyForResourceOwner(resourceOwner: ResourceOwner): ChargePolicy {
  return resourceOwner === 'backend' ? 'charge' : 'skip'
}

export function createResourceExecutionContext(input: {
  mode: ExecutionMode
  credentialSource: CredentialSource
  provider: ProviderDescriptor
}): ResourceExecutionContext {
  const spec = getExecutionModeSpec(input.mode)

  return resourceExecutionContextSchema.parse({
    mode: spec.mode,
    resourceOwner: spec.resourceOwner,
    executionTarget: spec.executionTarget,
    credentialSource: input.credentialSource,
    provider: input.provider,
    chargePolicy: spec.chargePolicy,
    chargeReason: spec.chargeReason
  })
}
