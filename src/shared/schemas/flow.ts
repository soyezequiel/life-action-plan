import { z } from 'zod'

export const flowStepSchema = z.enum([
  'gate',
  'objectives',
  'intake',
  'strategy',
  'reality-check',
  'simulation',
  'presentation',
  'calendar',
  'topdown',
  'activation',
  'done'
])

export const flowStatusSchema = z.enum([
  'draft',
  'in_progress',
  'completed',
  'archived'
])

export const goalCategorySchema = z.enum([
  'carrera',
  'salud',
  'finanzas',
  'educacion',
  'hobby',
  'mixto'
])

export const goalEffortSchema = z.enum(['bajo', 'medio', 'alto'])
export const goalPrioritySchema = z.number().int().min(1).max(5)

export const goalDraftSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1).max(500),
  category: goalCategorySchema,
  effort: goalEffortSchema,
  isHabit: z.boolean().default(false),
  priority: goalPrioritySchema,
  horizonMonths: z.number().int().min(1).max(60),
  hoursPerWeek: z.number().int().min(1).max(40)
}).strict()

export const intakeQuestionTypeSchema = z.enum(['text', 'number', 'textarea', 'time', 'select', 'range'])

export const intakeQuestionSchema = z.object({
  id: z.string().trim().min(1),
  key: z.string().trim().min(1),
  label: z.string().trim().min(1).max(160),
  type: intakeQuestionTypeSchema,
  placeholder: z.string().trim().max(160).nullable().default(null),
  options: z.array(z.string().trim().min(1).max(120)).default([]),
  min: z.number().int().min(0).max(120).nullable().default(null),
  max: z.number().int().min(0).max(120).nullable().default(null),
  step: z.number().int().min(1).max(24).nullable().default(null),
  unit: z.string().trim().min(1).max(20).nullable().default(null)
}).strict()

export const intakeBlockSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(240),
  questions: z.array(intakeQuestionSchema).max(5),
  progressLabel: z.string().trim().min(1).max(80),
  completed: z.boolean().default(false)
}).strict()

export const strategicPhaseSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1).max(140),
  summary: z.string().trim().min(1).max(320),
  goalIds: z.array(z.string().trim().min(1)).default([]),
  dependencies: z.array(z.string().trim().min(1)).default([]),
  startMonth: z.number().int().min(1).max(60),
  endMonth: z.number().int().min(1).max(60),
  hoursPerWeek: z.number().int().min(1).max(40),
  milestone: z.string().trim().min(1).max(160),
  metrics: z.array(z.string().trim().min(1).max(160)).default([])
}).strict()

export const strategicPlanDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(800),
  totalMonths: z.number().int().min(1).max(60),
  estimatedWeeklyHours: z.number().int().min(1).max(80),
  phases: z.array(strategicPhaseSchema).min(1),
  milestones: z.array(z.string().trim().min(1).max(160)).default([]),
  conflicts: z.array(z.string().trim().min(1).max(240)).default([])
}).strict()

export const realityAdjustmentSchema = z.enum([
  'keep',
  'reduce_load',
  'extend_timeline',
  'auto_prioritize'
])

export const realityCheckResultSchema = z.object({
  status: z.enum(['ok', 'adjustment_required']),
  availableHours: z.number().int().min(0).max(120),
  neededHours: z.number().int().min(0).max(120),
  selectedAdjustment: realityAdjustmentSchema.default('keep'),
  summary: z.string().trim().min(1).max(320),
  recommendations: z.array(z.string().trim().min(1).max(240)).default([]),
  adjustmentsApplied: z.array(z.string().trim().min(1).max(240)).default([])
}).strict()

export const simulationIterationStatusSchema = z.enum(['PASS', 'WARN', 'FAIL'])
export const strategicSimulationMethodSchema = z.enum(['rules', 'hybrid-llm'])

export const strategicSimulationIterationSchema = z.object({
  index: z.number().int().min(1).max(5),
  status: simulationIterationStatusSchema,
  summary: z.string().trim().min(1).max(320),
  changes: z.array(z.string().trim().min(1).max(240)).default([])
}).strict()

export const strategicSimulationSnapshotSchema = z.object({
  ranAt: z.string().trim().min(1),
  method: strategicSimulationMethodSchema.default('rules'),
  finalStatus: simulationIterationStatusSchema,
  reviewSummary: z.string().trim().min(1).max(360).default(''),
  checkedAreas: z.array(z.string().trim().min(1).max(200)).min(1).max(6).default([
    'Carga semanal total',
    'Dependencias entre fases',
    'Margen de aire real en la semana'
  ]),
  findings: z.array(z.string().trim().min(1).max(240)).default([]),
  iterations: z.array(strategicSimulationIterationSchema).min(1).max(5)
}).strict()

export const presentationTimelineItemSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(140),
  window: z.string().trim().min(1).max(80),
  detail: z.string().trim().min(1).max(240),
  status: z.enum(['locked', 'editable'])
}).strict()

export const presentationCardSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1).max(140),
  body: z.string().trim().min(1).max(320),
  goalIds: z.array(z.string().trim().min(1)).default([])
}).strict()

export const presentationDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(640),
  timeline: z.array(presentationTimelineItemSchema).min(1),
  cards: z.array(presentationCardSchema).min(1),
  feedbackRounds: z.number().int().min(0).max(10).default(0),
  accepted: z.boolean().default(false),
  latestFeedback: z.string().trim().max(500).nullable().default(null)
}).strict()

export const availabilitySlotSchema = z.object({
  morning: z.boolean().default(false),
  afternoon: z.boolean().default(false),
  evening: z.boolean().default(false)
}).strict()

export const availabilityGridSchema = z.object({
  monday: availabilitySlotSchema,
  tuesday: availabilitySlotSchema,
  wednesday: availabilitySlotSchema,
  thursday: availabilitySlotSchema,
  friday: availabilitySlotSchema,
  saturday: availabilitySlotSchema,
  sunday: availabilitySlotSchema
}).strict()

export const topDownLevelSchema = z.enum(['year', 'quarter', 'month', 'week', 'day'])

export const topDownSampleSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(140),
  items: z.array(z.string().trim().min(1).max(200)).default([])
}).strict()

export const topDownLevelDraftSchema = z.object({
  level: topDownLevelSchema,
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(360),
  samples: z.array(topDownSampleSchema).default([]),
  confirmed: z.boolean().default(false),
  revisionCount: z.number().int().min(0).max(3).default(0)
}).strict()

export const flowGateStateSchema = z.object({
  choice: z.enum(['pulso', 'advanced']).default('pulso'),
  llmMode: z.enum(['service', 'own', 'codex', 'local']).default('service'),
  provider: z.string().trim().min(1).default('openai:gpt-4o-mini'),
  backendCredentialId: z.string().trim().min(1).nullable().default(null),
  hasUserApiKey: z.boolean().default(false),
  estimatedCostSats: z.number().int().min(0).default(0),
  estimatedCostUsd: z.number().min(0).default(0),
  ready: z.boolean().default(false),
  walletRequired: z.boolean().default(false),
  summary: z.string().trim().min(1).max(240).default(''),
  updatedAt: z.string().trim().min(1).nullable().default(null)
}).strict()

export const flowCalendarStateSchema = z.object({
  grid: availabilityGridSchema,
  notes: z.string().trim().max(500).default(''),
  importedIcs: z.boolean().default(false),
  summary: z.string().trim().min(1).max(240).default(''),
  updatedAt: z.string().trim().min(1).nullable().default(null)
}).strict()

export const flowTopDownStateSchema = z.object({
  levels: z.array(topDownLevelDraftSchema).default([]),
  currentLevelIndex: z.number().int().min(0).max(10).default(0),
  updatedAt: z.string().trim().min(1).nullable().default(null)
}).strict()

export const flowResumeStateSchema = z.object({
  changeSummary: z.string().trim().max(500).nullable().default(null),
  patchSummary: z.string().trim().max(500).nullable().default(null),
  askedAt: z.string().trim().min(1).nullable().default(null)
}).strict()

export const flowStateSchema = z.object({
  gate: flowGateStateSchema.nullable().default(null),
  goals: z.array(goalDraftSchema).default([]),
  intakeBlocks: z.array(intakeBlockSchema).default([]),
  intakeAnswers: z.record(z.string(), z.string()).default({}),
  strategy: strategicPlanDraftSchema.nullable().default(null),
  realityCheck: realityCheckResultSchema.nullable().default(null),
  simulation: strategicSimulationSnapshotSchema.nullable().default(null),
  presentation: presentationDraftSchema.nullable().default(null),
  calendar: flowCalendarStateSchema.nullable().default(null),
  topdown: flowTopDownStateSchema.nullable().default(null),
  activation: z.object({
    activatedAt: z.string().trim().min(1).nullable().default(null),
    planId: z.string().trim().min(1).nullable().default(null)
  }).strict().default({
    activatedAt: null,
    planId: null
  }),
  resume: flowResumeStateSchema.default({
    changeSummary: null,
    patchSummary: null,
    askedAt: null
  })
}).strict()

export const flowSessionSchema = z.object({
  id: z.string().trim().min(1),
  userId: z.string().trim().min(1).nullable(),
  profileId: z.string().trim().min(1).nullable(),
  planId: z.string().trim().min(1).nullable(),
  status: flowStatusSchema,
  currentStep: flowStepSchema,
  state: flowStateSchema,
  lastCheckpointCode: z.string().trim().min(1).nullable(),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1)
}).strict()

export const flowCheckpointSchema = z.object({
  id: z.string().trim().min(1),
  workflowId: z.string().trim().min(1),
  step: flowStepSchema,
  code: z.string().trim().min(1).max(160),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string().trim().min(1)
}).strict()

export type FlowStep = z.infer<typeof flowStepSchema>
export type FlowStatus = z.infer<typeof flowStatusSchema>
export type GoalDraft = z.infer<typeof goalDraftSchema>
export type IntakeQuestion = z.infer<typeof intakeQuestionSchema>
export type IntakeBlock = z.infer<typeof intakeBlockSchema>
export type StrategicPhase = z.infer<typeof strategicPhaseSchema>
export type StrategicPlanDraft = z.infer<typeof strategicPlanDraftSchema>
export type RealityAdjustment = z.infer<typeof realityAdjustmentSchema>
export type RealityCheckResult = z.infer<typeof realityCheckResultSchema>
export type StrategicSimulationIteration = z.infer<typeof strategicSimulationIterationSchema>
export type StrategicSimulationSnapshot = z.infer<typeof strategicSimulationSnapshotSchema>
export type PresentationTimelineItem = z.infer<typeof presentationTimelineItemSchema>
export type PresentationCard = z.infer<typeof presentationCardSchema>
export type PresentationDraft = z.infer<typeof presentationDraftSchema>
export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>
export type AvailabilityGrid = z.infer<typeof availabilityGridSchema>
export type TopDownLevel = z.infer<typeof topDownLevelSchema>
export type TopDownLevelDraft = z.infer<typeof topDownLevelDraftSchema>
export type FlowGateState = z.infer<typeof flowGateStateSchema>
export type FlowCalendarState = z.infer<typeof flowCalendarStateSchema>
export type FlowTopDownState = z.infer<typeof flowTopDownStateSchema>
export type FlowResumeState = z.infer<typeof flowResumeStateSchema>
export type FlowState = z.infer<typeof flowStateSchema>
export type FlowSession = z.infer<typeof flowSessionSchema>
export type FlowCheckpoint = z.infer<typeof flowCheckpointSchema>
