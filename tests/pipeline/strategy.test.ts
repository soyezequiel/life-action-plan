import { describe, expect, it } from 'vitest';

import type { DomainKnowledgeCard } from '../../src/lib/domain/domain-knowledge/bank';
import type { StrategyInput } from '../../src/lib/pipeline/shared/phase-io';
import { generateStrategy, buildFallbackStrategy } from '../../src/lib/pipeline/shared/strategy';
import type { AgentRuntime } from '../../src/lib/runtime/types';

const cookingCard: DomainKnowledgeCard = {
  domainLabel: 'cocina-italiana',
  goalTypeCompatibility: ['SKILL_ACQUISITION'],
  tasks: [
    {
      id: 'task-tiramisu',
      label: 'Preparar tiramisu clasico',
      typicalDurationMin: 60,
      tags: ['postre', 'italia'],
      equivalenceGroupId: 'postres',
    },
    {
      id: 'task-panna-cotta',
      label: 'Preparar panna cotta',
      typicalDurationMin: 45,
      tags: ['postre', 'italia'],
      equivalenceGroupId: 'postres',
    },
    {
      id: 'task-cannoli',
      label: 'Practicar cannoli',
      typicalDurationMin: 75,
      tags: ['postre', 'italia'],
      equivalenceGroupId: 'postres',
    },
  ],
  metrics: [
    {
      id: 'recipes-completed',
      label: 'Recetas resueltas',
      unit: 'recetas',
      direction: 'increase',
    },
  ],
  progression: {
    levels: [
      {
        levelId: 'lvl-1',
        description: 'Base tecnica y control de mise en place',
        exitCriteria: ['Completar 4 practicas base'],
      },
      {
        levelId: 'lvl-2',
        description: 'Repeticion de postres italianos clasicos',
        exitCriteria: ['Resolver 3 postres sin mirar cada paso'],
      },
      {
        levelId: 'lvl-3',
        description: 'Ejecucion avanzada y presentacion final',
        exitCriteria: ['Servir un menu corto con consistencia'],
      },
    ],
  },
  constraints: [],
  sources: [
    {
      title: 'Chef notes',
      evidence: 'D_HEURISTIC',
    },
  ],
  generationMeta: {
    method: 'LLM_ONLY',
    confidence: 0.6,
  },
};

const strategyInput: StrategyInput = {
  goalText: 'Quiero aprender a cocinar platos italianos',
  profile: {
    freeHoursWeekday: 1,
    freeHoursWeekend: 4,
    energyLevel: 'medium',
    fixedCommitments: [],
    scheduleConstraints: [],
  },
  classification: {
    goalType: 'SKILL_ACQUISITION',
    confidence: 0.9,
    risk: 'LOW',
    extractedSignals: {
      isRecurring: true,
      hasDeliverable: false,
      hasNumericTarget: false,
      requiresSkillProgression: true,
      dependsOnThirdParties: false,
      isOpenEnded: false,
      isRelational: false,
    },
  },
  planningContext: {
    clarificationAnswers: {
      nivel: 'avanzado',
      plazo: 'antes de fin de ano',
      modalidad: 'por mi cuenta',
    },
  },
};

const pastaCookingCard: DomainKnowledgeCard = {
  ...cookingCard,
  tasks: [
    {
      id: 'task-pastas',
      label: 'Preparar pastas italianas',
      typicalDurationMin: 60,
      tags: ['pastas', 'italia'],
      equivalenceGroupId: 'pastas',
    },
    {
      id: 'task-books',
      label: 'Leer recetas de cocina',
      typicalDurationMin: 45,
      tags: ['libros', 'aprendizaje'],
      equivalenceGroupId: 'aprendizaje',
    },
    {
      id: 'task-practice',
      label: 'Practicar tecnica base',
      typicalDurationMin: 75,
      tags: ['tecnica', 'practica'],
      equivalenceGroupId: 'tecnica',
    },
  ],
};

function createUnauthorizedRuntime(): AgentRuntime {
  const runtime: AgentRuntime = {
    async chat() {
      throw new Error('Unauthorized');
    },
    async *stream() {
    },
    newContext() {
      return runtime;
    },
  };

  return runtime;
}

function createInvalidContentRuntime(): AgentRuntime {
  const runtime: AgentRuntime = {
    async chat() {
      return {
        content: 'not valid json',
        usage: {
          promptTokens: 1,
          completionTokens: 1,
        },
      };
    },
    async *stream() {
    },
    newContext() {
      return runtime;
    },
  };

  return runtime;
}

describe('buildFallbackStrategy', () => {
  it('evita fases genericas cuando hay contexto de skill y domain card', () => {
    const result = buildFallbackStrategy(strategyInput, cookingCard);

    expect(result.phases).toHaveLength(3);
    expect(result.phases.map((phase) => phase.name).join(' ')).not.toContain('Fundamentos');
    expect(result.phases.map((phase) => phase.name).join(' ')).not.toContain('Desarrollo');
    expect(result.phases.some((phase) => /cocina italiana|tiramisu|panna cotta|cannoli/i.test(`${phase.name} ${phase.focus_esAR}`))).toBe(true);
    expect(result.milestones.some((milestone) => /menu corto|receta|tiramisu|panna cotta|cannoli/i.test(milestone))).toBe(true);
  });

  it('usa senales de personalizacion para ajustar duracion, foco y horizonte', () => {
    const result = buildFallbackStrategy({
      ...strategyInput,
      planningContext: {
        clarificationAnswers: {
          subtema: 'pastas',
          metodo: 'por mi cuenta con libros',
          nivel: 'principiante',
          horizonte: '1 ano',
        },
      },
    }, pastaCookingCard);

    const summary = result.phases.map((phase) => `${phase.name} ${phase.focus_esAR}`).join(' ');

    expect(result.phases.reduce((total, phase) => total + (phase.durationWeeks ?? 0), 0)).toBe(52);
    expect(summary).toContain('pastas');
    expect(summary).toContain('libros');
    expect(summary).not.toContain('Practica guiada en principiante');
    expect(result.phases.map((phase) => phase.name).join(' ')).not.toMatch(/\b(base tecnica|practica guiada|consolidacion)\b/i);
    expect(result.phases.map((phase) => phase.name).join(' ')).not.toMatch(/\b(fase|phase)\s*\d\b/i);
  });

  it('preserva el fallback cuando el modelo responde contenido invalido', async () => {
    await expect(generateStrategy(createInvalidContentRuntime(), strategyInput, cookingCard)).resolves.toEqual(
      buildFallbackStrategy(strategyInput, cookingCard),
    );
  });

  it('propagates Unauthorized when the planner runtime rejects the request', async () => {
    await expect(generateStrategy(createUnauthorizedRuntime(), strategyInput, cookingCard)).rejects.toThrow('Unauthorized');
  });

  it('estira el horizonte de salud cuando el objetivo explicita varios meses', () => {
    const result = buildFallbackStrategy({
      ...strategyInput,
      goalText: 'Quiero bajar 50kg en 12 meses',
      classification: {
        ...strategyInput.classification,
        goalType: 'QUANT_TARGET_TRACKING',
        risk: 'HIGH_HEALTH',
      },
      planningContext: {
        clarificationAnswers: {
          peso: '117 kg',
          altura: '179 cm',
          contexto: 'evaluacion medica preventiva',
          actividades: 'cycling y swimming',
        },
      },
    });

    const summary = result.phases.map((phase) => `${phase.name} ${phase.focus_esAR}`).join(' ');

    expect(summary).toContain('117 kg');
    expect(summary).toContain('179 cm');
    expect(summary).toContain('ciclismo suave');
    expect(summary).toContain('natacion o aquagym');
    expect(summary).toContain('supervision profesional');
    expect(result.phases.map((phase) => phase.name)).not.toEqual(expect.arrayContaining([
      'Caminata constante',
      'Ciclismo suave o bici fija',
      'Natacion o aquagym',
      'Fuerza basica y movilidad',
    ]));
  });
});
