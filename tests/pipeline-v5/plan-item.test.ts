import { describe, it, expect } from 'vitest';
import { 
  TimeEventItemSchema, 
  FlexTaskItemSchema, 
  MilestoneItemSchema, 
  MetricItemSchema, 
  TriggerRuleItemSchema,
  PlanItemSchema
} from '@lib/domain/plan-item';

describe('PlanItem Zod Schemas', () => {
  const common = {
    id: 'item-1',
    title: 'Test Item',
    status: 'draft',
    goalIds: ['goal-1'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('validates a valid TimeEventItem', () => {
    const item = {
      ...common,
      kind: 'time_event',
      startAt: new Date().toISOString(),
      durationMin: 60,
      rigidity: 'soft',
    };
    expect(TimeEventItemSchema.parse(item)).toBeDefined();
  });

  it('validates a valid FlexTaskItem', () => {
    const item = {
      ...common,
      kind: 'flex_task',
      estimateMin: 30,
    };
    expect(FlexTaskItemSchema.parse(item)).toBeDefined();
  });

  it('validates a valid MilestoneItem', () => {
    const item = {
      ...common,
      kind: 'milestone',
      dueDate: '2026-12-31',
    };
    expect(MilestoneItemSchema.parse(item)).toBeDefined();
  });

  it('validates a valid MetricItem', () => {
    const item = {
      ...common,
      kind: 'metric',
      metricKey: 'weight_kg',
      direction: 'decrease',
      target: { targetValue: 70 },
    };
    expect(MetricItemSchema.parse(item)).toBeDefined();
  });

  it('validates a valid TriggerRuleItem', () => {
    const item = {
      ...common,
      kind: 'trigger_rule',
      enabled: true,
      conditions: [
        { left: { type: 'status' }, op: 'eq', right: { value: 'done' } }
      ],
      actions: [
        { type: 'update_status', payload: { status: 'active' } }
      ]
    };
    expect(TriggerRuleItemSchema.parse(item)).toBeDefined();
  });

  it('rejects an item with invalid kind', () => {
    const item = { ...common, kind: 'invalid_kind' };
    expect(() => PlanItemSchema.parse(item)).toThrow();
  });

  it('rejects an item with extra properties (strict mode)', () => {
    const item = {
      ...common,
      kind: 'flex_task',
      something_else: 'not allowed'
    };
    expect(() => PlanItemSchema.parse(item)).toThrow();
  });
});
