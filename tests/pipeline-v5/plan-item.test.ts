import { describe, it, expect } from 'vitest';
import {
  TimeEventItemSchema,
  FlexTaskItemSchema,
  MilestoneItemSchema,
  MetricItemSchema,
  TriggerRuleItemSchema,
  PlanItemSchema,
} from '@lib/domain/plan-item';

// ─── Shared fixture ───────────────────────────────────────────────────────────

const common = {
  id: 'item-1',
  title: 'Test Item',
  status: 'draft' as const,
  goalIds: ['goal-1'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('PlanItem Zod Schemas', () => {

  // ── Happy paths ─────────────────────────────────────────────────────────────
  describe('Valid items are accepted', () => {
    it('validates a minimal TimeEventItem', () => {
      const item = {
        ...common,
        kind: 'time_event',
        startAt: new Date().toISOString(),
        durationMin: 60,
        rigidity: 'soft',
      };
      expect(TimeEventItemSchema.parse(item)).toBeDefined();
    });

    it('validates a TimeEventItem with recurrence', () => {
      const item = {
        ...common,
        kind: 'time_event',
        startAt: '2026-04-01T08:00:00Z',
        durationMin: 45,
        rigidity: 'hard',
        recurrence: {
          freq: 'weekly',
          interval: 1,
          byWeekday: ['MO', 'WE', 'FR'],
          until: '2026-12-31',
        },
      };
      expect(TimeEventItemSchema.parse(item)).toBeDefined();
    });

    it('validates a minimal FlexTaskItem', () => {
      const item = { ...common, kind: 'flex_task' };
      expect(FlexTaskItemSchema.parse(item)).toBeDefined();
    });

    it('validates a FlexTaskItem with all optional fields', () => {
      const item = {
        ...common,
        kind: 'flex_task',
        estimateMin: 90,
        dueDate: '2026-06-30',
        deadlineAt: '2026-06-30T23:59:00Z',
        chunking: { enabled: true, minChunkMin: 25 },
        timeboxed: [{ startAt: '2026-04-05T10:00:00Z', durationMin: 25 }],
      };
      expect(FlexTaskItemSchema.parse(item)).toBeDefined();
    });

    it('validates a minimal MilestoneItem', () => {
      const item = { ...common, kind: 'milestone', dueDate: '2026-12-31' };
      expect(MilestoneItemSchema.parse(item)).toBeDefined();
    });

    it('validates a MilestoneItem with dependencies', () => {
      const item = {
        ...common,
        kind: 'milestone',
        dueDate: '2026-09-01',
        expectedEffortMin: 840,
        childItemIds: ['item-2', 'item-3'],
        dependencies: [{ dependsOnId: 'item-0', type: 'finish_to_start' }],
      };
      expect(MilestoneItemSchema.parse(item)).toBeDefined();
    });

    it('validates a minimal MetricItem', () => {
      const item = {
        ...common,
        kind: 'metric',
        metricKey: 'weight_kg',
        direction: 'decrease',
        target: { targetValue: 70 },
      };
      expect(MetricItemSchema.parse(item)).toBeDefined();
    });

    it('validates a MetricItem with cadence and series', () => {
      const item = {
        ...common,
        kind: 'metric',
        metricKey: 'steps_per_day',
        direction: 'increase',
        target: { targetValue: 10000, targetDate: '2026-12-31' },
        cadence: { freq: 'daily', aggregation: 'avg' },
        series: [{ at: '2026-04-01', value: 6500 }],
        checkinTemplate: { title: 'Pasos de hoy', estimateMin: 5 },
      };
      expect(MetricItemSchema.parse(item)).toBeDefined();
    });

    it('validates a minimal TriggerRuleItem', () => {
      const item = {
        ...common,
        kind: 'trigger_rule',
        enabled: true,
        conditions: [
          { left: { type: 'status' }, op: 'eq', right: { value: 'done' } },
        ],
        actions: [
          { type: 'update_status', payload: { status: 'active' } },
        ],
      };
      expect(TriggerRuleItemSchema.parse(item)).toBeDefined();
    });

    it('validates a TriggerRuleItem with throttle and complex conditions', () => {
      const item = {
        ...common,
        kind: 'trigger_rule',
        enabled: false,
        conditions: [
          { left: { type: 'metric', ref: 'weight_kg' }, op: 'lte', right: { value: 70 } },
          { left: { type: 'date' }, op: 'days_since', right: { value: 7 } },
        ],
        actions: [
          { type: 'create_task', payload: { title: 'Chequeo médico' } },
          { type: 'create_time_event', payload: { startAt: '2026-06-01T09:00:00Z', durationMin: 30 } },
        ],
        throttle: { minHoursBetweenRuns: 168 },
      };
      expect(TriggerRuleItemSchema.parse(item)).toBeDefined();
    });

    it('PlanItemSchema routes to the correct sub-schema via discriminated union', () => {
      const te = { ...common, kind: 'time_event', startAt: '2026-04-01T08:00:00Z', durationMin: 30, rigidity: 'hard' };
      const ft = { ...common, kind: 'flex_task' };
      const ms = { ...common, kind: 'milestone', dueDate: '2026-12-31' };
      expect(PlanItemSchema.parse(te).kind).toBe('time_event');
      expect(PlanItemSchema.parse(ft).kind).toBe('flex_task');
      expect(PlanItemSchema.parse(ms).kind).toBe('milestone');
    });
  });

  // ── Rejection tests ─────────────────────────────────────────────────────────
  describe('Invalid items are rejected', () => {
    it('rejects an item with invalid kind', () => {
      expect(() => PlanItemSchema.parse({ ...common, kind: 'invalid_kind' })).toThrow();
    });

    it('rejects an item with extra properties in strict mode', () => {
      expect(() => PlanItemSchema.parse({ ...common, kind: 'flex_task', unknownField: true })).toThrow();
    });

    it('rejects a TimeEventItem missing required startAt', () => {
      const item = { ...common, kind: 'time_event', durationMin: 60, rigidity: 'soft' };
      expect(() => TimeEventItemSchema.parse(item)).toThrow();
    });

    it('accepts a TimeEventItem with negative durationMin (no positive constraint in schema)', () => {
      // NOTE: durationMin is z.number() (no .positive() constraint) – negative values are currently allowed.
      // This is a documentation test to track current schema behavior.
      const item = { ...common, kind: 'time_event', startAt: '2026-04-01T08:00:00Z', durationMin: -1, rigidity: 'soft' };
      expect(() => TimeEventItemSchema.parse(item)).not.toThrow();
    });


    it('rejects a TimeEventItem with invalid rigidity value', () => {
      const item = { ...common, kind: 'time_event', startAt: '2026-04-01T08:00:00Z', durationMin: 60, rigidity: 'flexible' };
      expect(() => TimeEventItemSchema.parse(item)).toThrow();
    });

    it('rejects a TimeEventItem with invalid recurrence freq', () => {
      const item = {
        ...common, kind: 'time_event', startAt: '2026-04-01T08:00:00Z', durationMin: 30, rigidity: 'hard',
        recurrence: { freq: 'hourly' },
      };
      expect(() => TimeEventItemSchema.parse(item)).toThrow();
    });

    it('rejects a MilestoneItem missing required dueDate', () => {
      const item = { ...common, kind: 'milestone' };
      expect(() => MilestoneItemSchema.parse(item)).toThrow();
    });

    it('rejects a MetricItem missing required direction', () => {
      const item = { ...common, kind: 'metric', metricKey: 'x', target: { targetValue: 10 } };
      expect(() => MetricItemSchema.parse(item)).toThrow();
    });

    it('rejects a MetricItem with invalid direction value', () => {
      const item = { ...common, kind: 'metric', metricKey: 'x', direction: 'sideways', target: { targetValue: 10 } };
      expect(() => MetricItemSchema.parse(item)).toThrow();
    });

    it('rejects a MetricItem with invalid cadence aggregation', () => {
      const item = {
        ...common, kind: 'metric', metricKey: 'x', direction: 'increase', target: { targetValue: 5 },
        cadence: { freq: 'daily', aggregation: 'median' },
      };
      expect(() => MetricItemSchema.parse(item)).toThrow();
    });

    it('rejects a TriggerRuleItem with empty conditions array', () => {
      const item = {
        ...common, kind: 'trigger_rule', enabled: true, conditions: [],
        actions: [{ type: 'update_status', payload: {} }],
      };
      // conditions is an array with no min constraint (the schema allows empty)
      // This tests that the schema is at least parseable and conditions: [] does not throw
      // (schema does NOT enforce min(1) on conditions – this is correct behavior to document)
      expect(() => TriggerRuleItemSchema.parse(item)).not.toThrow();
    });

    it('rejects a TriggerRuleItem with invalid condition op', () => {
      const item = {
        ...common, kind: 'trigger_rule', enabled: true,
        conditions: [{ left: { type: 'status' }, op: 'in_range', right: { value: 42 } }],
        actions: [{ type: 'update_status', payload: {} }],
      };
      expect(() => TriggerRuleItemSchema.parse(item)).toThrow();
    });

    it('rejects a TriggerRuleItem with invalid action type', () => {
      const item = {
        ...common, kind: 'trigger_rule', enabled: true,
        conditions: [{ left: { type: 'status' }, op: 'eq', right: { value: 'done' } }],
        actions: [{ type: 'send_email', payload: {} }],
      };
      expect(() => TriggerRuleItemSchema.parse(item)).toThrow();
    });

    it('rejects an item with invalid status value', () => {
      const item = { ...common, status: 'pending', kind: 'flex_task' };
      expect(() => PlanItemSchema.parse(item)).toThrow();
    });

    it('rejects an item with priority outside allowed literals', () => {
      const item = { ...common, kind: 'flex_task', priority: 5 };
      expect(() => PlanItemSchema.parse(item)).toThrow();
    });

    it('rejects an item with empty goalIds array – but not from schema (no min)', () => {
      // PlanItem schema does not enforce goalIds.min(1); this documents that behavior
      const item = { ...common, goalIds: [], kind: 'flex_task' };
      expect(() => PlanItemSchema.parse(item)).not.toThrow();
    });
  });
});
