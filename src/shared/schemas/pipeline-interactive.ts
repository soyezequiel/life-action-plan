import { z } from 'zod'

import { AvailabilityWindowSchema, BlockedSlotSchema, SchedulingPreferenceSchema } from '../../lib/scheduler/types'
import { HabitStateSchema } from '../../lib/domain/habit-state'
import { SlackPolicySchema } from '../../lib/domain/slack-policy'

const pipelineV5PhaseSchema = z.enum([
  'classify',
  'requirements',
  'profile',
  'strategy',
  'template',
  'schedule',
  'hardValidate',
  'softValidate',
  'coveVerify',
  'repair',
  'package',
  'adapt'
])

const interactivePauseTypeSchema = z.enum([
  'classify_review',
  'requirements_answer',
  'profile_edit',
  'schedule_edit',
  'package_review'
])

const interactivePhaseChoiceSchema = z.enum([
  'classify',
  'requirements',
  'profile',
  'schedule'
])

export const interactiveSessionStatusSchema = z.enum([
  'active',
  'completed',
  'abandoned',
  'error'
])

const requestedModeSchema = z.enum([
  'backend-cloud',
  'backend-local',
  'user-cloud',
  'codex-cloud'
])

const deploymentModeSchema = z.enum([
  'local',
  'vercel-preview',
  'vercel-production'
])

const interactiveActivityLogSchema = z.object({
  progressionKey: z.string().trim().min(1).optional(),
  activityId: z.string().trim().min(1).optional(),
  planItemId: z.string().trim().min(1).optional(),
  occurredAt: z.string().trim().min(1),
  scheduledStartAt: z.string().trim().min(1).optional(),
  plannedMinutes: z.number().optional(),
  completedMinutes: z.number().optional(),
  overlapMinutes: z.number().optional(),
  note: z.string().trim().max(500).optional(),
  outcome: z.enum(['SUCCESS', 'PARTIAL', 'MISSED'])
}).strict()

export const pausePointSnapshotSchema = z.object({
  id: z.string().uuid(),
  phase: pipelineV5PhaseSchema,
  type: interactivePauseTypeSchema,
  output: z.unknown(),
  userInput: z.unknown().optional(),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1)
}).strict()

export const interactiveConfigSchema = z.object({
  pausePoints: z.object({
    classify: z.enum(['always', 'low_confidence', 'never']).default('low_confidence'),
    requirements: z.enum(['always', 'never']).default('always'),
    profile: z.enum(['always', 'never']).default('always'),
    schedule: z.enum(['always', 'never']).default('always'),
    package: z.enum(['always', 'never']).default('always')
  }).strict(),
  autoSkipThreshold: z.number().min(0).max(1).default(0.85),
  sessionTTLMinutes: z.number().int().min(1).max(24 * 60).default(30)
}).strict()

export const interactiveSessionRuntimeRequestSchema = z.object({
  modelId: z.string().trim().min(1),
  requestedMode: requestedModeSchema.nullable().default(null),
  backendCredentialId: z.string().trim().min(1).nullable().default(null),
  userId: z.string().trim().min(1).nullable().default(null),
  deploymentMode: deploymentModeSchema,
  allowUserLocalExecution: z.boolean().default(false),
  thinkingMode: z.enum(['enabled', 'disabled']).default('disabled')
}).strict()

export const interactiveSessionSeedSchema = z.object({
  goalText: z.string().trim().min(1).max(1000),
  profileId: z.string().trim().min(1).nullable().default(null),
  workflowId: z.string().trim().min(1).nullable().default(null),
  goalId: z.string().trim().min(1).nullable().default(null),
  domainHint: z.string().trim().min(1).nullable().default(null),
  timezone: z.string().trim().min(1),
  weekStartDate: z.string().trim().min(1),
  availability: z.array(AvailabilityWindowSchema).default([]),
  blocked: z.array(BlockedSlotSchema).default([]),
  preferences: z.array(SchedulingPreferenceSchema).default([]),
  answers: z.record(z.string(), z.string()).default({}),
  previousProgressionKeys: z.array(z.string().trim().min(1)).default([]),
  initialHabitStates: z.array(HabitStateSchema).default([]),
  activityLogs: z.array(interactiveActivityLogSchema).default([]),
  adaptiveAnchorAt: z.string().trim().min(1).nullable().default(null),
  slackPolicy: SlackPolicySchema.nullable().default(null)
}).strict()

export const interactiveSessionStateSchema = z.object({
  request: interactiveSessionRuntimeRequestSchema,
  seed: interactiveSessionSeedSchema,
  config: interactiveConfigSchema
}).strict()

export const interactiveSessionCreateRequestSchema = z.object({
  goalText: z.string().trim().min(1).max(1000),
  profileId: z.string().trim().min(1).optional(),
  workflowId: z.string().trim().min(1).optional(),
  provider: z.string().trim().min(1).optional(),
  resourceMode: z.enum(['auto', 'backend', 'user', 'codex']).optional(),
  backendCredentialId: z.string().trim().min(1).optional(),
  thinkingMode: z.enum(['enabled', 'disabled']).optional(),
  apiKey: z.string().trim().min(1).optional()
}).strict()

export const interactiveSessionInputRequestSchema = z.object({
  pauseId: z.string().uuid(),
  input: z.unknown()
}).strict()

export const interactivePauseFromPhaseSchema = interactivePhaseChoiceSchema

export const interactiveSessionSnapshotPreviewSchema = z.object({
  interactiveMode: z.boolean().optional(),
  currentPausePoint: pausePointSnapshotSchema.nullable().optional(),
  pauseHistory: z.array(pausePointSnapshotSchema).optional(),
  run: z.object({
    goalText: z.string().nullable().optional()
  }).passthrough().optional(),
  phases: z.record(
    z.object({
      output: z.unknown().optional()
    }).passthrough()
  ).optional()
}).passthrough()

export const interactiveSessionResponseSchema = z.object({
  sessionId: z.string().trim().min(1),
  status: interactiveSessionStatusSchema,
  pausePoint: pausePointSnapshotSchema.nullable(),
  snapshot: interactiveSessionSnapshotPreviewSchema,
  planId: z.string().trim().min(1).nullable()
}).strict()

export const interactiveSessionDeleteResponseSchema = z.object({
  status: z.literal('deleted')
}).strict()

export type PausePointSnapshot = z.infer<typeof pausePointSnapshotSchema>
export type InteractiveConfig = z.infer<typeof interactiveConfigSchema>
export type InteractiveSessionRuntimeRequest = z.infer<typeof interactiveSessionRuntimeRequestSchema>
export type InteractiveSessionSeed = z.infer<typeof interactiveSessionSeedSchema>
export type InteractiveSessionState = z.infer<typeof interactiveSessionStateSchema>
export type InteractiveSessionCreateRequest = z.infer<typeof interactiveSessionCreateRequestSchema>
export type InteractiveSessionInputRequest = z.infer<typeof interactiveSessionInputRequestSchema>
export type InteractivePauseType = z.infer<typeof interactivePauseTypeSchema>
export type InteractivePauseFromPhase = z.infer<typeof interactivePauseFromPhaseSchema>
export type InteractiveSessionStatus = z.infer<typeof interactiveSessionStatusSchema>
export type InteractiveSessionResponsePayload = z.infer<typeof interactiveSessionResponseSchema>
export type InteractiveSessionSnapshotPreview = z.infer<typeof interactiveSessionSnapshotPreviewSchema>
export type InteractiveSessionDeleteResponse = z.infer<typeof interactiveSessionDeleteResponseSchema>
