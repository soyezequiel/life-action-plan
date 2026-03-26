import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  DomainKnowledgeCardSchema,
  getKnowledgeCard,
  type DomainKnowledgeCard,
} from '@lib/domain/domain-knowledge/bank';
import { generateDomainCard } from '@lib/domain/domain-knowledge/generator';
import type { GoalClassification } from '@lib/domain/goal-taxonomy';
import type { AgentRuntime, LLMMessage, LLMResponse } from '@lib/runtime/types';

const BASE_CLASSIFICATION: GoalClassification = {
  goalType: 'SKILL_ACQUISITION',
  confidence: 0.82,
  risk: 'LOW',
  extractedSignals: {
    isRecurring: false,
    hasDeliverable: false,
    hasNumericTarget: false,
    requiresSkillProgression: true,
    dependsOnThirdParties: false,
    isOpenEnded: false,
    isRelational: false,
  },
};

function makeRuntime(content: string): AgentRuntime {
  async function chat(_messages: LLMMessage[]): Promise<LLMResponse> {
    return {
      content,
      usage: { promptTokens: 0, completionTokens: 0 },
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

function makeCard(overrides: Partial<DomainKnowledgeCard> = {}): DomainKnowledgeCard {
  return {
    domainLabel: 'respuesta-llm',
    goalTypeCompatibility: ['SKILL_ACQUISITION', 'RECURRENT_HABIT'],
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
      method: 'RAG',
      confidence: 0.99,
    },
    ...overrides,
  };
}

describe('generateDomainCard', () => {
  it('genera una card valida para un dominio desconocido', async () => {
    const result = await generateDomainCard(
      makeRuntime(JSON.stringify(makeCard())),
      {
        goalText: 'Quiero aprender a comer mejor sin complicarme',
        classification: BASE_CLASSIFICATION,
        domainLabel: ' Nutricion Basica ',
      },
    );

    expect(() => DomainKnowledgeCardSchema.parse(result)).not.toThrow();
    expect(result.domainLabel).toBe('nutricion-basica');
    expect(result.generationMeta).toEqual({ method: 'LLM_ONLY', confidence: 0.6 });

    const stored = await getKnowledgeCard('nutricion-basica');
    expect(stored).toEqual(result);
  });

  it('fuerza domainLabel y generationMeta del input aunque el LLM devuelva otros valores', async () => {
    const result = await generateDomainCard(
      makeRuntime(
        JSON.stringify(
          makeCard({
            domainLabel: 'WRONG',
            generationMeta: { method: 'RAG', confidence: 0.99 },
          }),
        ),
      ),
      {
        goalText: 'Quiero organizar una mudanza al exterior',
        classification: {
          ...BASE_CLASSIFICATION,
          goalType: 'HIGH_UNCERTAINTY_TRANSFORM',
        },
        domainLabel: 'Mudanza Exterior',
      },
    );

    expect(result.domainLabel).toBe('mudanza-exterior');
    expect(result.generationMeta).toEqual({ method: 'LLM_ONLY', confidence: 0.6 });
  });

  it('lanza error si el LLM devuelve JSON invalido para el schema', async () => {
    const invalidCard = {
      domainLabel: 'finanzas-simple',
      goalTypeCompatibility: ['QUANT_TARGET_TRACKING'],
      metrics: [
        {
          id: 'ahorro',
          label: 'Ahorro mensual',
          unit: 'pesos',
          direction: 'increase',
        },
      ],
      constraints: [
        {
          id: 'no-endeudarse',
          description: 'No asumir deudas nuevas solo para llegar antes.',
          severity: 'BLOCKER',
        },
      ],
      sources: [
        {
          title: 'Consejos generales de presupuesto',
          evidence: 'D_HEURISTIC',
        },
      ],
      generationMeta: {
        method: 'LLM_ONLY',
        confidence: 0.6,
      },
    };

    await expect(
      generateDomainCard(makeRuntime(JSON.stringify(invalidCard)), {
        goalText: 'Quiero aprender a ahorrar',
        classification: {
          ...BASE_CLASSIFICATION,
          goalType: 'QUANT_TARGET_TRACKING',
        },
        domainLabel: 'Finanzas Simple',
      }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it('parsea JSON envuelto en markdown code block', async () => {
    const markdownWrappedCard = `\`\`\`json
${JSON.stringify(makeCard({ domainLabel: 'huerta-llm' }), null, 2)}
\`\`\``;

    const result = await generateDomainCard(makeRuntime(markdownWrappedCard), {
      goalText: 'Quiero arrancar una huerta en casa',
      classification: BASE_CLASSIFICATION,
      domainLabel: 'Huerta Hogar',
    });

    expect(result.domainLabel).toBe('huerta-hogar');
    expect(() => DomainKnowledgeCardSchema.parse(result)).not.toThrow();
  });
});
