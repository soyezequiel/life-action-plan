import { z } from 'zod'

export const debugMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string()
}).strict()

export const debugUsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number()
}).strict()

export const debugSpanSchema = z.object({
  traceId: z.string().uuid(),
  spanId: z.string().uuid(),
  parentSpanId: z.string().uuid().nullable(),
  skillName: z.string(),
  provider: z.string(),
  type: z.enum(['chat', 'stream']),
  status: z.enum(['pending', 'streaming', 'completed', 'error']),
  messages: z.array(debugMessageSchema),
  response: z.string().nullable(),
  error: z.string().nullable(),
  usage: debugUsageSchema.nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  metadata: z.record(z.unknown())
}).strict()

export const debugTraceSnapshotSchema = z.object({
  traceId: z.string().uuid(),
  skillName: z.string(),
  provider: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
  metadata: z.record(z.unknown()),
  spans: z.array(debugSpanSchema)
}).strict()

export const debugEventSchema = z.object({
  type: z.enum(['trace:start', 'span:start', 'span:token', 'span:complete', 'span:error', 'trace:complete']),
  traceId: z.string().uuid(),
  spanId: z.string().uuid().nullable(),
  timestamp: z.string(),
  data: z.object({
    token: z.string().optional(),
    tokens: z.array(z.string()).optional(),
    span: debugSpanSchema.optional(),
    error: z.string().optional(),
    skillName: z.string().optional(),
    provider: z.string().optional()
  }).strict()
}).strict()

export type DebugMessage = z.infer<typeof debugMessageSchema>
export type DebugUsage = z.infer<typeof debugUsageSchema>
export type DebugSpan = z.infer<typeof debugSpanSchema>
export type DebugTraceSnapshot = z.infer<typeof debugTraceSnapshotSchema>
export type DebugEvent = z.infer<typeof debugEventSchema>
