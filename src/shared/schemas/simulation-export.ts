import { z } from 'zod'

// --- Export sub-schemas ---

export const simExportEdgeSchema = z.object({
  source: z.string().trim().min(1),
  target: z.string().trim().min(1)
}).strict()

export const simExportAgentLogSchema = z.object({
  nodeId: z.string().trim().min(1),
  nodeLabel: z.string().trim().min(1).max(100),
  step: z.number().int().min(1),
  phase: z.enum(['reason', 'act', 'observe']),
  agentRole: z.enum(['mundo', 'yo', 'orchestrator']),
  content: z.string().trim().min(1).max(2000),
  toolUsed: z.string().trim().max(100).nullable().default(null),
  durationMs: z.number().int().min(0),
  timestamp: z.string().trim().min(1)
}).strict()

export const simExportPromptSchema = z.object({
  nodeId: z.string().trim().min(1),
  agentRole: z.enum(['mundo', 'yo']),
  systemPrompt: z.string().trim().min(1),
  userPrompt: z.string().trim().min(1)
}).strict()

export const simExportTimelineEntrySchema = z.object({
  nodeId: z.string().trim().min(1),
  label: z.string().trim().min(1).max(100),
  granularity: z.string().trim().min(1),
  start: z.string().trim().min(1),
  end: z.string().trim().min(1),
  plannedHours: z.number().min(0),
  actualHours: z.number().min(0).nullable().default(null),
  quality: z.number().min(0).max(100).nullable().default(null),
  disruptionCount: z.number().int().min(0).default(0),
  status: z.string().trim().min(1)
}).strict()

export const simExportSummarySchema = z.object({
  totalNodes: z.number().int().min(0),
  simulatedNodes: z.number().int().min(0),
  totalFindings: z.number().int().min(0),
  criticalFindings: z.number().int().min(0),
  averageQuality: z.number().min(0).max(100).nullable(),
  totalPlannedHours: z.number().min(0),
  totalActualHours: z.number().min(0),
  completionRatio: z.number().min(0).max(1),
  llmCallsUsed: z.number().int().min(0),
  estimatedCostSats: z.number().int().min(0)
}).strict()

export const simExportBundleSchema = z.object({
  version: z.literal('1.0'),
  exportedAt: z.string().trim().min(1),
  workflow: z.object({
    id: z.string().trim().min(1),
    currentStep: z.string().trim().min(1),
    status: z.string().trim().min(1)
  }).strict(),
  profile: z.record(z.string(), z.unknown()).nullable().default(null),
  persona: z.record(z.string(), z.unknown()).nullable().default(null),
  goals: z.array(z.record(z.string(), z.unknown())).default([]),
  strategy: z.record(z.string(), z.unknown()).nullable().default(null),
  realityCheck: z.record(z.string(), z.unknown()).nullable().default(null),
  simulationTree: z.object({
    meta: z.object({
      id: z.string().trim().min(1),
      version: z.number().int().min(1),
      totalSimulations: z.number().int().min(0),
      estimatedLlmCostSats: z.number().int().min(0),
      createdAt: z.string().trim().min(1),
      updatedAt: z.string().trim().min(1)
    }).strict(),
    globalFindings: z.array(z.record(z.string(), z.unknown())).default([]),
    nodes: z.record(z.string(), z.record(z.string(), z.unknown())),
    edges: z.array(simExportEdgeSchema).default([])
  }).strict(),
  agentLogs: z.array(simExportAgentLogSchema).default([]),
  prompts: z.array(simExportPromptSchema).default([]),
  timeline: z.array(simExportTimelineEntrySchema).default([]),
  summary: simExportSummarySchema
}).strict()

export type SimExportBundle = z.infer<typeof simExportBundleSchema>
export type SimExportEdge = z.infer<typeof simExportEdgeSchema>
export type SimExportAgentLog = z.infer<typeof simExportAgentLogSchema>
export type SimExportPrompt = z.infer<typeof simExportPromptSchema>
export type SimExportTimelineEntry = z.infer<typeof simExportTimelineEntrySchema>
export type SimExportSummary = z.infer<typeof simExportSummarySchema>
