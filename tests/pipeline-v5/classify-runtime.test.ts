import { describe, expect, it } from 'vitest';

import { classifyGoalWithRuntime } from '../../src/lib/pipeline/v5/classify';
import type { AgentRuntime, LLMMessage, LLMResponse } from '../../src/lib/runtime/types';

function makeRuntime(content: unknown): AgentRuntime {
  async function chat(_messages: LLMMessage[]): Promise<LLMResponse> {
    return {
      content: JSON.stringify(content),
      usage: { promptTokens: 12, completionTokens: 12 },
    };
  }

  return {
    chat,
    async *stream() {
      yield '';
    },
    newContext() {
      return makeRuntime(content);
    },
  };
}

describe('classifyGoalWithRuntime', () => {
  it('sube confianza cuando heuristica y LLM coinciden', async () => {
    const result = await classifyGoalWithRuntime(
      makeRuntime({
        goalType: 'SKILL_ACQUISITION',
        confidence: 0.95,
        risk: 'LOW',
        signals: ['skill'],
      }),
      'Aprender a tocar la guitarra',
    );

    expect(result.goalType).toBe('SKILL_ACQUISITION');
    expect(result.confidence).toBe(0.95);
  });

  it('usa el LLM para resolver una heuristica ambigua', async () => {
    const result = await classifyGoalWithRuntime(
      makeRuntime({
        goalType: 'RELATIONAL_EMOTIONAL',
        confidence: 0.9,
        risk: 'MEDIUM',
        signals: ['relational'],
      }),
      'Quiero conectar mejor con mi pareja',
    );

    expect(result.goalType).toBe('RELATIONAL_EMOTIONAL');
    expect(result.risk).toBe('MEDIUM');
  });

  it('preserva siempre el riesgo mas conservador', async () => {
    const result = await classifyGoalWithRuntime(
      makeRuntime({
        goalType: 'QUANT_TARGET_TRACKING',
        confidence: 0.91,
        risk: 'LOW',
        signals: ['quant'],
      }),
      'Invertir mis ahorros en acciones',
    );

    expect(result.goalType).toBe('QUANT_TARGET_TRACKING');
    expect(result.risk).toBe('HIGH_FINANCE');
  });
});
