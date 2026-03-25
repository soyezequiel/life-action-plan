import { z } from 'zod';

export const PlanItemKindSchema = z.enum([
  'time_event',
  'flex_task',
  'milestone',
  'metric',
  'trigger_rule'
]);
export type PlanItemKind = z.infer<typeof PlanItemKindSchema>;

export const PlanItemStatusSchema = z.enum([
  'draft', 'active', 'done', 'canceled', 'blocked', 'waiting'
]);
export type PlanItemStatus = z.infer<typeof PlanItemStatusSchema>;

const BasePlanItemSchema = z.object({
  id: z.string(),
  kind: PlanItemKindSchema,
  title: z.string(),
  notes: z.string().optional(),
  status: PlanItemStatusSchema,
  goalIds: z.array(z.string()),
  projectId: z.string().optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TimeEventItemSchema = BasePlanItemSchema.extend({
  kind: z.literal('time_event'),
  startAt: z.string(),
  durationMin: z.number(),
  recurrence: z.object({
    freq: z.enum(['daily', 'weekly', 'monthly']),
    interval: z.number().optional(),
    byWeekday: z.array(z.string()).optional(),
    until: z.string().optional()
  }).optional(),
  rigidity: z.enum(['hard', 'soft'])
}).strict();
export type TimeEventItem = z.infer<typeof TimeEventItemSchema>;

export const FlexTaskItemSchema = BasePlanItemSchema.extend({
  kind: z.literal('flex_task'),
  estimateMin: z.number().optional(),
  dueDate: z.string().optional(),
  deadlineAt: z.string().optional(),
  chunking: z.object({
    enabled: z.boolean(),
    minChunkMin: z.number()
  }).optional(),
  timeboxed: z.array(z.object({
    startAt: z.string(),
    durationMin: z.number()
  })).optional()
}).strict();
export type FlexTaskItem = z.infer<typeof FlexTaskItemSchema>;

export const MilestoneItemSchema = BasePlanItemSchema.extend({
  kind: z.literal('milestone'),
  dueDate: z.string(),
  expectedEffortMin: z.number().optional(),
  dependencies: z.array(z.object({
    dependsOnId: z.string(),
    type: z.enum(['finish_to_start', 'start_to_start'])
  })).optional(),
  childItemIds: z.array(z.string()).optional()
}).strict();
export type MilestoneItem = z.infer<typeof MilestoneItemSchema>;

export const MetricItemSchema = BasePlanItemSchema.extend({
  kind: z.literal('metric'),
  metricKey: z.string(),
  unit: z.string().optional(),
  direction: z.enum(['increase', 'decrease', 'maintain']),
  target: z.object({
    targetValue: z.number(),
    targetDate: z.string().optional()
  }),
  cadence: z.object({
    freq: z.enum(['daily', 'weekly', 'monthly']),
    aggregation: z.enum(['sum', 'count', 'avg', 'last'])
  }).optional(),
  series: z.array(z.object({
    at: z.string(),
    value: z.number()
  })).optional(),
  checkinTemplate: z.object({
    title: z.string(),
    estimateMin: z.number().optional()
  }).optional()
}).strict();
export type MetricItem = z.infer<typeof MetricItemSchema>;

export const TriggerRuleItemSchema = BasePlanItemSchema.extend({
  kind: z.literal('trigger_rule'),
  enabled: z.boolean(),
  conditions: z.array(z.object({
    left: z.object({
      type: z.enum(['status', 'metric', 'date', 'label']),
      ref: z.string().optional()
    }),
    op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'days_since']),
    right: z.object({
      value: z.union([z.string(), z.number(), z.boolean()])
    })
  })),
  actions: z.array(z.object({
    type: z.enum(['create_task', 'update_status', 'create_time_event']),
    payload: z.record(z.unknown())
  })),
  throttle: z.object({
    minHoursBetweenRuns: z.number()
  }).optional()
}).strict();
export type TriggerRuleItem = z.infer<typeof TriggerRuleItemSchema>;

export const PlanItemSchema = z.discriminatedUnion('kind', [
  TimeEventItemSchema,
  FlexTaskItemSchema,
  MilestoneItemSchema,
  MetricItemSchema,
  TriggerRuleItemSchema
]);
export type PlanItem = z.infer<typeof PlanItemSchema>;

// Helpers
export function isTimeEvent(item: PlanItem): item is TimeEventItem {
  return item.kind === 'time_event';
}

export function isFlexTask(item: PlanItem): item is FlexTaskItem {
  return item.kind === 'flex_task';
}

export function isMilestone(item: PlanItem): item is MilestoneItem {
  return item.kind === 'milestone';
}

export function isMetric(item: PlanItem): item is MetricItem {
  return item.kind === 'metric';
}

export function isTriggerRule(item: PlanItem): item is TriggerRuleItem {
  return item.kind === 'trigger_rule';
}
