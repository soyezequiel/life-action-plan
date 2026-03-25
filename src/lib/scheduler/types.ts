import { z } from 'zod';
import { TimeEventItemSchema, type TimeEventItem } from '../domain/plan-item';

export const AvailabilityWindowSchema = z.object({
  day: z.string(),
  startTime: z.string(),
  endTime: z.string(),
}).strict();
export type AvailabilityWindow = z.infer<typeof AvailabilityWindowSchema>;

export const BlockedSlotSchema = z.object({
  day: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  reason: z.string(),
}).strict();
export type BlockedSlot = z.infer<typeof BlockedSlotSchema>;

export const SchedulingPreferenceSchema = z.object({
  type: z.string(),
  weight: z.number(),
}).strict();
export type SchedulingPreference = z.infer<typeof SchedulingPreferenceSchema>;

export const ActivityRequestSchema = z.object({
  id: z.string(),
  label: z.string(),
  durationMin: z.number(),
  frequencyPerWeek: z.number(),
  goalId: z.string(),
  constraintTier: z.enum(['hard', 'soft_strong', 'soft_weak']),
  preferredSlots: z.array(z.string()).optional(),
  avoidDays: z.array(z.string()).optional(),
  minRestDaysBetween: z.number().optional(),
}).strict();
export type ActivityRequest = z.infer<typeof ActivityRequestSchema>;

export const SchedulerInputSchema = z.object({
  activities: z.array(ActivityRequestSchema),
  availability: z.array(AvailabilityWindowSchema),
  blocked: z.array(BlockedSlotSchema),
  preferences: z.array(SchedulingPreferenceSchema),
  weekStartDate: z.string(),
}).strict();
export type SchedulerInput = z.infer<typeof SchedulerInputSchema>;

export const UnscheduledItemSchema = z.object({
  activityId: z.string(),
  reason: z.string(),
  suggestion_esAR: z.string(),
}).strict();
export type UnscheduledItem = z.infer<typeof UnscheduledItemSchema>;

export const TradeoffSchema = z.object({
  planA: z.object({ description_esAR: z.string() }).strict(),
  planB: z.object({ description_esAR: z.string() }).strict(),
  question_esAR: z.string(),
}).strict();
export type Tradeoff = z.infer<typeof TradeoffSchema>;

export const SchedulerMetricsSchema = z.object({
  fillRate: z.number(),
  solverTimeMs: z.number(),
  solverStatus: z.string(),
}).strict();
export type SchedulerMetrics = z.infer<typeof SchedulerMetricsSchema>;

export const SchedulerOutputSchema = z.object({
  events: z.array(TimeEventItemSchema),
  unscheduled: z.array(UnscheduledItemSchema),
  tradeoffs: z.array(TradeoffSchema).optional(),
  metrics: SchedulerMetricsSchema,
}).strict();
export type SchedulerOutput = z.infer<typeof SchedulerOutputSchema>;
