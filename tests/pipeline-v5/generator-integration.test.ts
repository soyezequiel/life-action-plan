import { describe, expect, it } from 'vitest';

import type { DomainKnowledgeCard } from '../../src/lib/domain/domain-knowledge/bank';
import { FlowRunnerV5 } from '../../src/lib/pipeline/v5/runner';
import type { UserProfileV5 } from '../../src/lib/pipeline/v5/phase-io-v5';
import type { AgentRuntime, LLMMessage, LLMResponse } from '../../src/lib/runtime/types';
import type { AvailabilityWindow } from '../../src/lib/scheduler/types';

const WEEK_START = '2026-03-30T00:00:00Z';
const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const DEFAULT_PROFILE: UserProfileV5 = {
  freeHoursWeekday: 3,
  freeHoursWeekend: 5,
  energyLevel: 'medium',
  fixedCommitments: ['Trabajo de 9 a 18'],
  scheduleConstraints: ['Evitar trasnochar'],
};

function jsonResponse(content: unknown): LLMResponse {
  return {
    content: JSON.stringify(content),
    usage: { promptTokens: 10, completionTokens: 10 },
  };
}

function makeAvailability(startTime = '06:00', endTime = '22:00'): AvailabilityWindow[] {
  return WEEK_DAYS.map((day) => ({ day, startTime, endTime }));
}

function createRuntime(handler: (prompt: string) => Promise<LLMResponse> | LLMResponse): AgentRuntime {
  async function chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const prompt = messages[messages.length - 1]?.content ?? '';
    return handler(prompt);
  }

  return {
    chat,
    async *stream() {
      yield '';
    },
    newContext() {
      return createRuntime(handler);
    },
  };
}

function makeConfig(
  text: string,
  runtime: AgentRuntime,
  extra: Partial<ConstructorParameters<typeof FlowRunnerV5>[0]> = {},
): ConstructorParameters<typeof FlowRunnerV5>[0] {
  return {
    runtime,
    text,
    answers: {
      disponibilidad: 'Entre semana tengo dos o tres horas y el finde un poco mas.',
    },
    availability: makeAvailability(),
    weekStartDate: WEEK_START,
    goalId: 'goal-v5-generator-test',
    ...extra,
  };
}

function makeCard(overrides: Partial<DomainKnowledgeCard> = {}): DomainKnowledgeCard {
  return {
    domainLabel: 'respuesta-llm',
    goalTypeCompatibility: ['SKILL_ACQUISITION', 'QUANT_TARGET_TRACKING'],
    tasks: [
      {
        id: 'leer-base',
        label: 'Leer una guia simple',
        typicalDurationMin: 30,
        tags: ['base', 'lectura'],
        equivalenceGroupId: 'aprendizaje-base',
      },
      {
        id: 'practica-corta',
        label: 'Hacer una practica corta',
        typicalDurationMin: 40,
        tags: ['practica'],
        equivalenceGroupId: 'aprendizaje-practica',
      },
      {
        id: 'repaso-semanal',
        label: 'Repasar lo aprendido',
        typicalDurationMin: 20,
        tags: ['repaso'],
        equivalenceGroupId: 'aprendizaje-base',
      },
    ],
    metrics: [
      {
        id: 'avance-semanal',
        label: 'Avance semanal',
        unit: 'pasos',
        direction: 'increase',
      },
    ],
    progression: {
      levels: [
        {
          levelId: 'inicio',
          description: 'Entiende lo basico y sostiene una rutina simple.',
          exitCriteria: ['Completar 2 semanas seguidas', 'Poder explicar lo aprendido en palabras simples'],
        },
      ],
    },
    constraints: [
      {
        id: 'no-saltar-base',
        description: 'No pasar a temas mas complejos sin entender lo basico.',
        severity: 'WARNING',
      },
    ],
    sources: [
      {
        title: 'Guia practica general',
        evidence: 'D_HEURISTIC',
      },
    ],
    generationMeta: {
      method: 'MANUAL',
      confidence: 0.95,
    },
    ...overrides,
  };
}

describe('FlowRunnerV5 domain knowledge generator integration', () => {
  it('genera una card dinamica durante classify cuando no hay card estatica especifica', async () => {
    let chatCalls = 0;
    const runtime = createRuntime((prompt) => {
      chatCalls += 1;
      expect(prompt).toContain('Genera una DomainKnowledgeCard');

      return jsonResponse(
        makeCard({
          domainLabel: 'finanzas-incorrecto',
          generationMeta: {
            method: 'RAG',
            confidence: 0.99,
          },
        }),
      );
    });

    const runner = new FlowRunnerV5(makeConfig('Quiero aprender a invertir en bolsa', runtime));

    await runner.executePhase('classify');

    const context = runner.getContext();

    expect(chatCalls).toBe(1);
    expect(context.domainCard).toBeDefined();
    expect(context.domainCard?.domainLabel).toBe('invertir-bolsa');
    expect(context.domainCard?.generationMeta.method).toBe('LLM_ONLY');
  });

  it('degrada sin romper strategy cuando falla la generacion y no hay fallback por goalType', async () => {
    let generatorCalls = 0;
    let strategyCalls = 0;
    const runtime = createRuntime((prompt) => {
      if (prompt.includes('Genera una DomainKnowledgeCard')) {
        generatorCalls += 1;
        throw new Error('generator failed');
      }

      if (prompt.includes('Eres un planificador estrategico experto.')) {
        strategyCalls += 1;
        return jsonResponse({
          phases: [
            {
              name: 'Exploracion',
              durationWeeks: 2,
              focus_esAR: 'Ordenar el panorama antes de tomar decisiones grandes.',
            },
          ],
          milestones: ['Tener un mapa claro de opciones y restricciones'],
        });
      }

      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });

    const runner = new FlowRunnerV5(
      makeConfig('Quiero mudarme a un pais raro e inusual', runtime),
      { profile: DEFAULT_PROFILE },
    );

    await runner.executePhase('classify');

    const contextAfterClassify = runner.getContext();
    expect(generatorCalls).toBe(1);
    expect(contextAfterClassify.classification?.goalType).toBe('HIGH_UNCERTAINTY_TRANSFORM');
    expect(contextAfterClassify.domainCard).toBeUndefined();

    await runner.executePhase('strategy');

    const context = runner.getContext();
    expect(strategyCalls).toBe(1);
    expect(context.strategy?.phases).toHaveLength(1);
    expect(context.strategy?.milestones).toContain('Tener un mapa claro de opciones y restricciones');
    expect(context.domainCard).toBeUndefined();
  });

  it('no invoca el generador cuando ya existe una card estatica especifica', async () => {
    let chatCalls = 0;
    const runtime = createRuntime(() => {
      chatCalls += 1;
      return jsonResponse({ unexpected: true });
    });

    const runner = new FlowRunnerV5(makeConfig('Quiero empezar a correr', runtime));

    await runner.executePhase('classify');

    const context = runner.getContext();

    expect(chatCalls).toBe(0);
    expect(context.domainCard?.domainLabel).toBe('running');
    expect(context.domainCard?.generationMeta.method).toBe('MANUAL');
  });
});
