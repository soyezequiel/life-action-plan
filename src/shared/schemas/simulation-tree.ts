import { z } from 'zod'
import { simPersonaSchema } from './persona-profile'

export const simGranularitySchema = z.enum(['plan', 'year', 'month', 'week', 'day', 'hour'])

export const simNodeStatusSchema = z.enum([
  'pending',
  'simulated',
  'stale',
  'affected',
  'locked'
])

export const simNodeIdSchema = z.string().trim().min(1).max(80)

export const simFindingSchema = z.object({
  id: z.string().trim().min(1),
  severity: z.enum(['critical', 'warning', 'info']),
  message: z.string().trim().min(1).max(300),
  nodeId: simNodeIdSchema,
  target: z.enum(['tree', 'strategy']).default('tree'),
  suggestedFix: z.string().trim().max(300).nullable().default(null)
}).strict()

export const simDisruptionSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(['schedule_conflict', 'energy_drop', 'external_event', 'dependency_delay', 'motivation_loss', 'health_issue']),
  description: z.string().trim().min(1).max(200),
  impactHours: z.number().min(0).max(168),
  affectedGoalIds: z.array(z.string().trim().min(1)).default([])
}).strict()

export const simResponseSchema = z.object({
  id: z.string().trim().min(1),
  action: z.enum(['reschedule', 'skip', 'reduce', 'swap', 'push_back', 'absorb']),
  description: z.string().trim().min(1).max(200),
  hoursRecovered: z.number().min(0).max(168),
  tradeoff: z.string().trim().max(200).nullable().default(null)
}).strict()

export const simIncomingAdjustmentSchema = z.object({
  fromNodeId: simNodeIdSchema,
  deltaHours: z.number(),
  reason: z.string().trim().max(200)
}).strict()

/**
 * SimActionLogEntry: registro de cada paso del loop ReACT durante la simulación.
 * Inspirado en ReportLogger de MiroFish-Offline.
 */
export const simActionLogEntrySchema = z.object({
  step: z.number().int().min(1),
  timestamp: z.string().trim().min(1),
  phase: z.enum(['reason', 'act', 'observe']),
  agentRole: z.enum(['mundo', 'yo', 'orchestrator']),
  content: z.string().trim().min(1).max(2000),
  toolUsed: z.string().trim().max(100).nullable().default(null),
  durationMs: z.number().int().min(0).default(0)
}).strict()

export const simGoalBreakdownEntrySchema = z.object({
  plannedHours: z.number().min(0),
  requiredHours: z.number().min(0).default(0),
  actualHours: z.number().min(0).nullable().default(null),
  status: z.enum(['on_track', 'behind', 'ahead', 'blocked', 'skipped']).default('on_track')
}).strict()

export const simNodeSchema = z.object({
  id: simNodeIdSchema,
  parentId: simNodeIdSchema.nullable(),
  granularity: simGranularitySchema,
  label: z.string().trim().min(1).max(100),
  period: z.object({
    start: z.string().trim().min(1),
    end: z.string().trim().min(1)
  }).strict(),
  status: simNodeStatusSchema,
  version: z.number().int().min(1).default(1),
  plannedHours: z.number().min(0).max(10000),
  actualHours: z.number().min(0).max(10000).nullable().default(null),
  quality: z.number().min(0).max(100).nullable().default(null),
  disruptions: z.array(simDisruptionSchema).default([]),
  responses: z.array(simResponseSchema).default([]),
  findings: z.array(simFindingSchema).default([]),
  goalBreakdown: z.record(z.string(), simGoalBreakdownEntrySchema).default({}),
  childIds: z.array(simNodeIdSchema).default([]),
  incomingAdjustments: z.array(simIncomingAdjustmentSchema).default([]),
  timeSlot: z.enum(['morning', 'afternoon', 'evening']).nullable().default(null),
  simulatedAt: z.string().trim().min(1).nullable().default(null),
  simulatedWith: z.enum(['rules', 'dual-agent', 'hybrid']).nullable().default(null),
  actionLog: z.array(simActionLogEntrySchema).default([])
}).strict()

export const simTreeSchema = z.object({
  id: z.string().trim().min(1),
  workflowId: z.string().trim().min(1),
  rootNodeId: simNodeIdSchema,
  nodes: z.record(simNodeIdSchema, simNodeSchema),
  globalFindings: z.array(simFindingSchema).default([]),
  totalSimulations: z.number().int().min(0).default(0),
  estimatedLlmCostSats: z.number().int().min(0).default(0),
  version: z.number().int().min(1).default(1),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  persona: simPersonaSchema.nullable().default(null)
}).strict()

export const simStrategyPatchSchema = z.object({
  type: z.enum(['extend_phase', 'add_phase', 'reorder_phases', 'adjust_hours']),
  phaseId: z.string().trim().min(1).nullable().default(null),
  goalId: z.string().trim().min(1).nullable().default(null),
  params: z.record(z.string(), z.unknown()).default({})
}).strict()

export type SimGranularity = z.infer<typeof simGranularitySchema>
export type SimNodeStatus = z.infer<typeof simNodeStatusSchema>
export type SimFinding = z.infer<typeof simFindingSchema>
export type SimDisruption = z.infer<typeof simDisruptionSchema>
export type SimResponse = z.infer<typeof simResponseSchema>
export type SimIncomingAdjustment = z.infer<typeof simIncomingAdjustmentSchema>
export type SimGoalBreakdownEntry = z.infer<typeof simGoalBreakdownEntrySchema>
export type SimNode = z.infer<typeof simNodeSchema>
export type SimTree = z.infer<typeof simTreeSchema>
export type SimStrategyPatch = z.infer<typeof simStrategyPatchSchema>
export type SimActionLogEntry = z.infer<typeof simActionLogEntrySchema>
