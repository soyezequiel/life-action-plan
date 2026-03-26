import { z } from 'zod';

import { MilestoneItemSchema, TimeEventItemSchema } from './plan-item';

export const SkeletonFrequencySchema = z.object({
  activityId: z.string(),
  title: z.string(),
  sessionsPerWeek: z.number().int().min(0),
  minutesPerSession: z.number().int().positive().optional(),
}).strict();
export type SkeletonFrequency = z.infer<typeof SkeletonFrequencySchema>;

export const SkeletonPhaseSchema = z.object({
  phaseId: z.string(),
  title: z.string(),
  startWeek: z.number().int().min(1).max(12),
  endWeek: z.number().int().min(1).max(12),
  startDate: z.string(),
  endDate: z.string(),
  goalIds: z.array(z.string()),
  objectives: z.array(z.string()),
  frequencies: z.array(SkeletonFrequencySchema),
  milestoneIds: z.array(z.string()).optional(),
}).strict().refine(
  (phase) => phase.endWeek >= phase.startWeek,
  { message: 'endWeek must be greater than or equal to startWeek', path: ['endWeek'] }
);
export type SkeletonPhase = z.infer<typeof SkeletonPhaseSchema>;

export const V5SkeletonSchema = z.object({
  horizonWeeks: z.literal(12),
  goalIds: z.array(z.string()),
  phases: z.array(SkeletonPhaseSchema),
  milestones: z.array(MilestoneItemSchema),
}).strict();
export type V5Skeleton = z.infer<typeof V5SkeletonSchema>;

export const DetailWeekSchema = z.object({
  weekIndex: z.number().int().min(1),
  startDate: z.string(),
  endDate: z.string(),
  scheduledEvents: z.array(TimeEventItemSchema),
}).strict();
export type DetailWeek = z.infer<typeof DetailWeekSchema>;

export const V5DetailSchema = z.object({
  horizonWeeks: z.number().int().min(2).max(4),
  startDate: z.string(),
  endDate: z.string(),
  scheduledEvents: z.array(TimeEventItemSchema),
  weeks: z.array(DetailWeekSchema).min(2).max(4),
}).strict();
export type V5Detail = z.infer<typeof V5DetailSchema>;

export const OperationalBufferSchema = z.object({
  id: z.string(),
  startAt: z.string(),
  durationMin: z.number().int().positive(),
  kind: z.enum(['slack', 'transition', 'recovery', 'contingency']),
  label: z.string().optional(),
}).strict();
export type OperationalBuffer = z.infer<typeof OperationalBufferSchema>;

export const OperationalDaySchema = z.object({
  date: z.string(),
  scheduledEvents: z.array(TimeEventItemSchema),
  buffers: z.array(OperationalBufferSchema),
}).strict();
export type OperationalDay = z.infer<typeof OperationalDaySchema>;

export const V5OperationalSchema = z.object({
  horizonDays: z.literal(7),
  startDate: z.string(),
  endDate: z.string(),
  frozen: z.literal(true),
  scheduledEvents: z.array(TimeEventItemSchema),
  buffers: z.array(OperationalBufferSchema),
  days: z.array(OperationalDaySchema).length(7),
  totalBufferMin: z.number().int().min(0),
}).strict();
export type V5Operational = z.infer<typeof V5OperationalSchema>;

export const V5PlanSchema = z.object({
  goalIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  skeleton: V5SkeletonSchema,
  detail: V5DetailSchema,
  operational: V5OperationalSchema,
}).strict();
export type V5Plan = z.infer<typeof V5PlanSchema>;
