import { describe, expect, it } from 'vitest';

import { clarifierAgent } from '../../src/lib/pipeline/v6/agents/clarifier-agent';
import type { ClarifierInput } from '../../src/lib/pipeline/v6/agents/clarifier-agent';
import { GoalSignalsSnapshotSchema } from '../../src/lib/pipeline/v6/types';

function createInput(overrides: Partial<ClarifierInput> = {}): ClarifierInput {
  return {
    interpretation: {
      parsedGoal: 'Conseguir un trabajo remoto',
      goalType: 'SKILL_ACQUISITION',
      implicitAssumptions: [],
      ambiguities: ['plazo', 'situacion actual'],
      riskFlags: ['LOW'],
      suggestedDomain: null,
      confidence: 0.8,
    },
    previousAnswers: {},
    goalSignalsSnapshot: GoalSignalsSnapshotSchema.parse({
      parsedGoal: 'Conseguir un trabajo remoto',
      goalType: 'SKILL_ACQUISITION',
      riskFlags: ['LOW'],
      suggestedDomain: null,
      metric: null,
      timeframe: null,
      anchorTokens: [],
      informationGaps: ['timeframe', 'current_baseline', 'constraints'],
      clarifyConfidence: null,
      readyToAdvance: null,
      normalizedUserAnswers: [],
      missingCriticalSignals: ['timeframe', 'current_baseline', 'constraints'],
      hasSufficientSignalsForPlanning: false,
      clarificationMode: 'needs_input',
      degraded: false,
      fallbackCount: 0,
      phase: 'clarify',
      clarifyRounds: 1,
    }),
    profileSummary: null,
    skipClarification: false,
    ...overrides,
  };
}

describe('clarifierAgent', () => {
  it('fallback asks deterministic universal questions when critical signals are missing', () => {
    const result = clarifierAgent.fallback(createInput());

    expect(result.readyToAdvance).toBe(false);
    expect(result.informationGaps).toEqual(['timeframe', 'current_baseline', 'constraints']);
    expect(result.questions.map((question) => question.id)).toEqual(['q1', 'q2', 'q3']);
    expect(result.questions.map((question) => question.text)).toEqual([
      'En que plazo queres ver un primer resultado claro?',
      'Cual es tu punto de partida hoy respecto de este objetivo?',
      'Que limites reales de tiempo, energia o agenda tenemos que respetar?',
    ]);
  });

  it('does not re-ask answered signals and falls back to the remaining missing ones', async () => {
    const runtime = {
      chat: async () => ({
        content: JSON.stringify({
          questions: [
            {
              id: 'q1',
              text: 'Cual es tu punto de partida hoy respecto de este objetivo?',
              purpose: 'Ubicar el nivel inicial real',
              type: 'text',
            },
          ],
          informationGaps: ['current_baseline'],
          reasoning: 'El modelo eligio una pregunta repetida.',
          confidence: 0.7,
          readyToAdvance: true,
        }),
        usage: { promptTokens: 0, completionTokens: 0 },
      }),
      stream: async function* () {
      },
      newContext() {
        return this;
      },
    };
    const input = createInput({
      goalSignalsSnapshot: GoalSignalsSnapshotSchema.parse({
        ...createInput().goalSignalsSnapshot,
        normalizedUserAnswers: [
          {
            key: 'clarify-r1-q-1',
            questionId: 'clarify-r1-q-1',
            signalKey: 'current_baseline',
            question: 'Cual es tu punto de partida hoy respecto de este objetivo?',
            answer: 'Estoy empezando',
          },
        ],
        missingCriticalSignals: ['timeframe', 'constraints'],
      }),
      previousAnswers: {
        'Cual es tu punto de partida hoy respecto de este objetivo?': 'Estoy empezando',
      },
    });

    const result = await clarifierAgent.execute(input, runtime);

    expect(result.readyToAdvance).toBe(false);
    expect(result.informationGaps).toEqual(['timeframe', 'constraints']);
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]?.text).toBe('En que plazo queres ver un primer resultado claro?');
    expect(result.questions[1]?.text).toBe('Que limites reales de tiempo, energia o agenda tenemos que respetar?');
  });

  it('advances only when the snapshot already marks the signals as sufficient', async () => {
    const runtime = {
      chat: async () => ({
        content: JSON.stringify({
          questions: [
            {
              id: 'q1',
              text: 'Cuantas horas tenes por semana?',
              purpose: 'Dimensionar el plan',
              type: 'number',
            },
          ],
          informationGaps: ['constraints'],
          reasoning: 'El modelo quiso seguir preguntando.',
          confidence: 0.4,
          readyToAdvance: false,
        }),
        usage: { promptTokens: 0, completionTokens: 0 },
      }),
      stream: async function* () {
      },
      newContext() {
        return this;
      },
    };
    const input = createInput({
      goalSignalsSnapshot: GoalSignalsSnapshotSchema.parse({
        ...createInput().goalSignalsSnapshot,
        informationGaps: [],
        missingCriticalSignals: [],
        hasSufficientSignalsForPlanning: true,
        clarificationMode: 'sufficient',
      }),
    });

    const result = await clarifierAgent.execute(input, runtime);

    expect(result.readyToAdvance).toBe(true);
    expect(result.informationGaps).toEqual([]);
    expect(result.questions).toEqual([]);
  });

  it('renumbers duplicated raw ids into unique stable ids inside the same round', async () => {
    const runtime = {
      chat: async () => ({
        content: JSON.stringify({
          questions: [
            {
              id: 'clarify-r1-q',
              text: 'En que plazo queres ver un primer resultado claro?',
              purpose: 'Ajustar el horizonte del plan',
              type: 'text',
              signalKey: 'timeframe',
            },
            {
              id: 'clarify-r1-q',
              text: 'Cual es tu punto de partida hoy respecto de este objetivo?',
              purpose: 'Ubicar el nivel inicial real',
              type: 'text',
              signalKey: 'current_baseline',
            },
          ],
          informationGaps: ['timeframe', 'current_baseline'],
          reasoning: 'Faltan dos señales críticas.',
          confidence: 0.4,
          readyToAdvance: false,
        }),
        usage: { promptTokens: 0, completionTokens: 0 },
      }),
      stream: async function* () {
      },
      newContext() {
        return this;
      },
    };

    const input = createInput({
      goalSignalsSnapshot: GoalSignalsSnapshotSchema.parse({
        ...createInput().goalSignalsSnapshot,
        informationGaps: ['timeframe', 'current_baseline'],
        missingCriticalSignals: ['timeframe', 'current_baseline'],
      }),
    });

    const result = await clarifierAgent.execute(input, runtime);

    expect(result.readyToAdvance).toBe(false);
    expect(result.questions.map((question) => question.id)).toEqual(['q1', 'q2']);
    expect(new Set(result.questions.map((question) => question.id)).size).toBe(2);
  });
});
