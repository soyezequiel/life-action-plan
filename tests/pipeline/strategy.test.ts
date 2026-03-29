import { describe, expect, it } from 'vitest';

import type { DomainKnowledgeCard } from '../../src/lib/domain/domain-knowledge/bank';
import { cocinaItalianaCard } from '../../src/lib/domain/domain-knowledge/cards/cocina-italiana';
import type { StrategyInput } from '../../src/lib/pipeline/shared/phase-io';
import { generateStrategy, generateStrategyWithSource, buildFallbackStrategy } from '../../src/lib/pipeline/shared/strategy';
import { buildStrategyPrompt } from '../../src/lib/pipeline/v6/prompts/strategy-reasoning';
import { GoalSignalsSnapshotSchema } from '../../src/lib/pipeline/v6/types';
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

function createGoalSignalsSnapshot(overrides: Record<string, unknown> = {}) {
  return GoalSignalsSnapshotSchema.parse({
    parsedGoal: 'Generar 3k USD por mes desde Argentina',
    goalType: 'QUANT_TARGET_TRACKING',
    riskFlags: ['MEDIUM'],
    suggestedDomain: null,
    metric: '3k dolares por mes',
    timeframe: '12 meses',
    anchorTokens: ['react', 'python', 'remoto'],
    informationGaps: [],
    clarifyConfidence: 0.55,
    readyToAdvance: true,
    normalizedUserAnswers: [
      {
        key: 'situacion',
        questionId: 'clarify-r1-q1',
        signalKey: 'current_baseline',
        question: 'Cual es tu punto de partida hoy respecto de este objetivo?',
        answer: 'junior sin experiencia',
      },
      {
        key: 'modalidad',
        questionId: 'clarify-r1-q2',
        signalKey: 'modality',
        question: 'Que via queres priorizar?',
        answer: 'empleo remoto',
      },
      {
        key: 'restricciones',
        questionId: 'clarify-r1-q3',
        signalKey: 'constraints',
        question: 'Que limites reales tenemos que respetar?',
        answer: '6 horas por semana',
      },
      {
        key: 'recursos',
        questionId: 'clarify-r1-q4',
        signalKey: 'resources',
        question: 'Que activos ya tenes disponibles?',
        answer: 'portfolio react y python',
      },
    ],
    missingCriticalSignals: [],
    hasSufficientSignalsForPlanning: true,
    clarificationMode: 'sufficient',
    degraded: false,
    fallbackCount: 0,
    phase: 'plan',
    clarifyRounds: 1,
    ...overrides,
  });
}

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

function createReasoningRuntime(payload: unknown): AgentRuntime {
  const content = typeof payload === 'string'
    ? payload
    : `<think>planifico primero</think>${JSON.stringify(payload)}`;
  const runtime: AgentRuntime = {
    async chat() {
      return {
        content,
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

function createReasoningInput(clarificationAnswers: Record<string, string> = {}): StrategyInput {
  return {
    ...strategyInput,
    goalText: 'Quiero aprender a hacer pizza italiana',
    planningContext: {
      interpretation: {
        parsedGoal: 'Aprender pizza italiana',
        implicitAssumptions: [],
      },
      clarificationAnswers: {
        subtema: 'pizza',
        nivel: 'principiante',
        horizonte: '6 meses',
        ...clarificationAnswers,
      },
    },
  };
}

function createBroadItalianCookingInput(clarificationAnswers: Record<string, string> = {}): StrategyInput {
  return {
    ...strategyInput,
    goalText: 'Quiero aprender a cocinar platos italianos',
    planningContext: {
      interpretation: {
        parsedGoal: 'Aprender a cocinar platos italianos',
        implicitAssumptions: [],
      },
      clarificationAnswers: {
        nivel: 'principiante',
        platos: 'pizzas',
        metodo: 'videos',
        plazo: '2 meses',
        ...clarificationAnswers,
      },
    },
  };
}

function createAnchoredIncomeInput(clarificationAnswers: Record<string, string> = {}): StrategyInput {
  return {
    ...strategyInput,
    goalText: 'Quiero lograr obtener un flujo de 3k dolares por mes en argentina',
    classification: {
      goalType: 'QUANT_TARGET_TRACKING',
      confidence: 0.85,
      risk: 'MEDIUM',
      extractedSignals: {
        isRecurring: true,
        hasDeliverable: false,
        hasNumericTarget: true,
        requiresSkillProgression: false,
        dependsOnThirdParties: true,
        isOpenEnded: false,
        isRelational: false,
      },
    },
    planningContext: {
      interpretation: {
        parsedGoal: 'Generar 3k USD por mes desde Argentina',
        implicitAssumptions: [],
      },
      clarificationAnswers: {
        plazo: '12 meses',
        via: 'empleo remoto',
        experiencia: 'junior sin experiencia',
        stack: 'java, python, php, react',
        presupuesto: '50 usd',
        ...clarificationAnswers,
      },
    },
  };
}

function createReasoningPayload(phases: Array<{
  id: string;
  title: string;
  summary: string;
  startMonth: number;
  endMonth: number;
}>): unknown {
  return {
    title: 'Plan de pizza italiana',
    summary: 'Roadmap para practicar pizza italiana con progreso observable.',
    totalMonths: Math.max(...phases.map((phase) => phase.endMonth)),
    estimatedWeeklyHours: 4,
    phases,
    milestones: phases.map((phase, index) => ({
      id: `m-${index + 1}`,
      label: `Hito ${index + 1}: ${phase.title}`,
      targetMonth: phase.endMonth,
      phaseId: phase.id,
    })),
    conflicts: [],
  };
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

  it('comprime el fallback de skill cuando el horizonte pedido es corto', () => {
    const result = buildFallbackStrategy({
      ...strategyInput,
      planningContext: {
        clarificationAnswers: {
          subtema: 'pastas',
          metodo: 'libros',
          nivel: 'principiante',
          horizonte: '2 meses',
        },
      },
    }, pastaCookingCard);

    expect(result.phases.map((phase) => phase.durationWeeks)).toEqual([3, 3, 2]);
    expect(result.phases.reduce((total, phase) => total + (phase.durationWeeks ?? 0), 0)).toBe(8);
  });

  it('alinea la cocina corta con videos y referencias concretas sin forzar libros', () => {
    const result = buildFallbackStrategy({
      ...strategyInput,
      planningContext: {
        clarificationAnswers: {
          subtema: 'pasta',
          metodo: 'videos',
          nivel: 'principiante',
          horizonte: '1 mes',
        },
      },
    }, cocinaItalianaCard);

    const summary = [
      ...result.phases.map((phase) => `${phase.name} ${phase.focus_esAR}`),
      ...result.milestones,
    ].join(' ');

    expect(result.phases.map((phase) => phase.durationWeeks)).toEqual([2, 1, 1]);
    expect(summary).toContain('videos');
    expect(summary).toContain('pastas italianas');
    expect(summary).not.toContain('pasta italianas');
    expect(summary).not.toContain('lectura de recetas italianas en libros');
    expect(summary).not.toContain('base de libros');
    expect(summary).toMatch(/pomodoro|aglio e olio|cacio e pepe|tecnica base/i);
  });

  it('mantiene un foco inicial en pizza sin perder la base de pastas cuando el objetivo sigue siendo cocina italiana amplia', () => {
    const result = buildFallbackStrategy({
      ...strategyInput,
      goalText: 'Quiero aprender a cocinar platos italianos',
      planningContext: {
        clarificationAnswers: {
          platos: 'pizzas',
          metodo: 'videos',
          nivel: 'principiante',
          plazo: '1 mes',
        },
      },
    }, cocinaItalianaCard);

    const summary = [
      ...result.phases.map((phase) => `${phase.name} ${phase.focus_esAR}`),
      ...result.milestones,
    ].join(' ');

    expect(result.phases.map((phase) => phase.durationWeeks)).toEqual([2, 1, 1]);
    expect(summary).toContain('pizza');
    expect(summary).toContain('pasta');
    expect(summary).toContain('videos');
    expect(summary).toContain('platos italianos clasicos');
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

  it('reutiliza anclas del intake en el fallback generico sin depender de reglas por dominio', () => {
    const result = buildFallbackStrategy(createAnchoredIncomeInput());
    const summary = [
      ...result.phases.map((phase) => `${phase.name} ${phase.focus_esAR}`),
      ...result.milestones,
    ].join(' ').toLowerCase();

    expect(summary).toMatch(/3k|3000/);
    expect(summary).toContain('12 meses');
    expect(summary).toContain('remoto');
    expect(summary).toContain('react');
  });

  it('no contamina el fallback generico con señales culinarias cuando el objetivo no tiene card de dominio', () => {
    const result = buildFallbackStrategy(createAnchoredIncomeInput({
      experiencia: 'trabaje en la crypta un tiempo como cm y como editor de videos usando ia para clips de instagram',
      via: 'empleo remoto',
    }));
    const summary = result.phases.map((phase) => `${phase.name} ${phase.focus_esAR}`).join(' ').toLowerCase();

    expect(summary).not.toContain('con apoyo de trabaje en la crypta');
    expect(summary).not.toContain('cocina');
  });

  it('prioriza el plazo explicito y evita usar numeros sueltos como anclas tematicas', () => {
    const result = buildFallbackStrategy(createAnchoredIncomeInput({
      experiencia: 'trabaje de desarrollador junior full stack por 2 meses',
      presupuesto: '50 usd',
      plazo: '12 meses',
      via: 'empleo remoto',
      stack: 'react y java',
    }));
    const phaseNames = result.phases.map((phase) => phase.name.toLowerCase()).join(' ');
    const summary = result.phases.map((phase) => `${phase.name} ${phase.focus_esAR}`).join(' ').toLowerCase();

    expect(phaseNames).not.toContain('12 y 50');
    expect(summary).toContain('12 meses');
    expect(summary).not.toMatch(/\b2 meses\b/);
  });

  it('usa GoalSignalsSnapshot como fuente prioritaria en el fallback general aunque no haya domain card', () => {
    const result = buildFallbackStrategy({
      ...createAnchoredIncomeInput({
        experiencia: 'dato ruidoso que no deberia desplazar el snapshot',
      }),
      planningContext: {
        interpretation: {
          parsedGoal: 'Generar 3k USD por mes desde Argentina',
          implicitAssumptions: [],
        },
        clarificationAnswers: {
          experiencia: 'dato ruidoso que no deberia desplazar el snapshot',
        },
        goalSignalsSnapshot: createGoalSignalsSnapshot({
          clarificationMode: 'degraded_skip',
          missingCriticalSignals: ['success_criteria'],
          hasSufficientSignalsForPlanning: false,
        }),
      },
    });
    const summary = result.phases.map((phase) => `${phase.name} ${phase.focus_esAR}`).join(' ').toLowerCase();

    expect(summary).toContain('3k dolares por mes');
    expect(summary).toContain('12 meses');
    expect(summary).toContain('empleo remoto');
    expect(summary).toContain('junior sin experiencia');
    expect(summary).toContain('6 horas por semana');
    expect(summary).toContain('portfolio react y python');
    expect(summary).toContain('best-effort');
    expect(summary).not.toContain('falta dominio');
  });
});

describe('generateStrategyWithSource validation', () => {
  it('acepta un horizonte semantico por duracion aunque no repita 6 meses literal', async () => {
    const result = await generateStrategyWithSource(
      createReasoningRuntime(createReasoningPayload([
        {
          id: 'phase-1',
          title: 'Pizza principiante: masa y fermentacion',
          summary: 'Practica pizza italiana con foco en amasado, hidratacion y control del horno.',
          startMonth: 1,
          endMonth: 3,
        },
        {
          id: 'phase-2',
          title: 'Pizza principiante: servicio y repeticion',
          summary: 'Consolida pizza italiana con rutinas repetibles y criterios de calidad observables.',
          startMonth: 4,
          endMonth: 6,
        },
      ])),
      createReasoningInput(),
      cookingCard,
    );

    expect(result.source).toBe('llm');
    expect(result.fallbackCode).toBeUndefined();
  });

  it.each(['seis meses', 'medio año'])('acepta variantes textuales del horizonte: %s', async (horizonLabel) => {
    const result = await generateStrategyWithSource(
      createReasoningRuntime(createReasoningPayload([
        {
          id: 'phase-1',
          title: `Pizza principiante para ${horizonLabel}`,
          summary: 'Practica pizza italiana con metas visibles desde el inicio.',
          startMonth: 1,
          endMonth: 3,
        },
        {
          id: 'phase-2',
          title: 'Pizza principiante: ejecucion final',
          summary: `Cierra un plan de ${horizonLabel} con pizza italiana consistente y servicio reproducible.`,
          startMonth: 4,
          endMonth: 6,
        },
      ])),
      createReasoningInput(),
      cookingCard,
    );

    expect(result.source).toBe('llm');
    expect(result.fallbackCode).toBeUndefined();
  });

  it('informa el failedCheck cuando la salida omite el nivel', async () => {
    const result = await generateStrategyWithSource(
      createReasoningRuntime(createReasoningPayload([
        {
          id: 'phase-1',
          title: 'Pizza italiana: masa y fermentacion',
          summary: 'Practica pizza italiana durante seis meses con foco en tecnica base.',
          startMonth: 1,
          endMonth: 3,
        },
        {
          id: 'phase-2',
          title: 'Pizza italiana: hornos y servicio',
          summary: 'Consolida pizza italiana con sesiones estables hasta completar el horizonte.',
          startMonth: 4,
          endMonth: 6,
        },
      ])),
      createReasoningInput(),
      cookingCard,
    );

    expect(result.source).toBe('fallback');
    expect(result.fallbackCode).toBe('STRATEGY_VALIDATION_FAILED');
    expect(result.fallbackMessage).toContain('cooking.level');
  });

  it('acepta la salida reasoning cuando titulo y resumen incluyen pizza y principiante', async () => {
    const result = await generateStrategyWithSource(
      createReasoningRuntime(createReasoningPayload([
        {
          id: 'phase-1',
          title: 'Pizza principiante: base tecnica',
          summary: 'Plan de seis meses para pizza italiana principiante con practica y feedback semanal.',
          startMonth: 1,
          endMonth: 2,
        },
        {
          id: 'phase-2',
          title: 'Pizza principiante: repeticion y servicio',
          summary: 'Pizza italiana para principiante con estandares observables y cierre de medio año.',
          startMonth: 3,
          endMonth: 6,
        },
      ])),
      createReasoningInput(),
      cookingCard,
    );

    expect(result.source).toBe('llm');
    expect(result.output.phases).toHaveLength(2);
  });

  it('rechaza cocina italiana amplia si el plan se reduce solo al subtema y pierde la base de pastas', async () => {
    const result = await generateStrategyWithSource(
      createReasoningRuntime(createReasoningPayload([
        {
          id: 'phase-1',
          title: 'Pizza principiante: masa y fermentacion',
          summary: 'Practica pizza italiana con videos y foco en tecnica base.',
          startMonth: 1,
          endMonth: 1,
        },
        {
          id: 'phase-2',
          title: 'Pizza principiante: repeticion y servicio',
          summary: 'Consolida pizza italiana en 2 meses con criterios visibles de calidad.',
          startMonth: 2,
          endMonth: 2,
        },
      ])),
      createBroadItalianCookingInput(),
      cookingCard,
    );

    expect(result.source).toBe('fallback');
    expect(result.fallbackCode).toBe('STRATEGY_VALIDATION_FAILED');
    expect(result.fallbackMessage).toContain('cooking.domain_scope');
  });

  it('acepta cocina italiana amplia cuando el plan mantiene pizza como foco e incluye base de pastas', async () => {
    const result = await generateStrategyWithSource(
      createReasoningRuntime(createReasoningPayload([
        {
          id: 'phase-1',
          title: 'Pizza principiante y base italiana',
          summary: 'Practica pizza italiana con videos mientras arma una base de pasta al pomodoro para cocina italiana principiante en 2 meses.',
          startMonth: 1,
          endMonth: 1,
        },
        {
          id: 'phase-2',
          title: 'Pastas italianas repetibles con foco en pizza',
          summary: 'Consolida pasta al pomodoro y cacio e pepe sin perder pizza como foco inicial dentro de un plan de 2 meses.',
          startMonth: 2,
          endMonth: 2,
        },
      ])),
      createBroadItalianCookingInput(),
      cookingCard,
    );

    expect(result.source).toBe('llm');
    expect(result.fallbackCode).toBeUndefined();
  });

  it('acepta fases superpuestas cuyo rango de meses coincide con el horizonte', async () => {
    const result = await generateStrategyWithSource(
      createReasoningRuntime(createReasoningPayload([
        {
          id: 'phase-1',
          title: 'Pastas principiante: semanas 1-3',
          summary: 'Semanas 1-3 de un plan de 2 meses para pastas italianas con videos.',
          startMonth: 1,
          endMonth: 1,
        },
        {
          id: 'phase-2',
          title: 'Pastas principiante: semanas 4-6',
          summary: 'Semanas 4-6 de un plan de 2 meses para pastas italianas con videos.',
          startMonth: 1,
          endMonth: 2,
        },
        {
          id: 'phase-3',
          title: 'Pastas principiante: semanas 7-8',
          summary: 'Semanas 7-8 de un plan de 2 meses para pastas italianas con videos.',
          startMonth: 2,
          endMonth: 2,
        },
      ])),
      createBroadItalianCookingInput({ platos: 'pastas' }),
      cookingCard,
    );

    // Phases span months 1-2 (8 weeks), matching the "2 meses" target.
    // totalSpanWeeks is computed from the month range, not the sum of individual durations.
    expect(result.source).toBe('llm');
    expect(result.fallbackCode).toBeUndefined();
  });

  it('rechaza plan cuyo rango de meses excede el horizonte solicitado', async () => {
    const result = await generateStrategyWithSource(
      createReasoningRuntime(createReasoningPayload([
        {
          id: 'phase-1',
          title: 'Pastas principiante: mes 1',
          summary: 'Mes 1 de un plan de 2 meses para pastas italianas con videos.',
          startMonth: 1,
          endMonth: 2,
        },
        {
          id: 'phase-2',
          title: 'Pastas principiante: mes 2-3',
          summary: 'Meses 2-3 de un plan de 2 meses para pastas italianas con videos.',
          startMonth: 2,
          endMonth: 4,
        },
        {
          id: 'phase-3',
          title: 'Pastas principiante: mes 4-5',
          summary: 'Meses 4-5 de un plan de 2 meses para pastas italianas con videos.',
          startMonth: 4,
          endMonth: 5,
        },
      ])),
      createBroadItalianCookingInput({ platos: 'pastas' }),
      cookingCard,
    );

    // Phases span months 1-5 (20 weeks), far exceeding the "2 meses" (8 weeks) target.
    expect(result.source).toBe('fallback');
    expect(result.fallbackCode).toBe('STRATEGY_VALIDATION_FAILED');
    expect(result.fallbackMessage).toContain('cooking.horizon');
  });

  it('rechaza salidas intercambiables si ignoran las anclas concretas del intake', async () => {
    const result = await generateStrategyWithSource(
      createReasoningRuntime(createReasoningPayload([
        {
          id: 'phase-1',
          title: 'Presupuesto mensual hacia 3000 usd',
          summary: 'Plan de 12 meses para ahorrar mas, controlar gastos y acumular un colchon financiero.',
          startMonth: 1,
          endMonth: 6,
        },
        {
          id: 'phase-2',
          title: 'Ahorro acumulado y disciplina financiera',
          summary: 'Continua 12 meses con control de consumo, presupuesto y recortes para sostener el ahorro.',
          startMonth: 7,
          endMonth: 12,
        },
      ])),
      createAnchoredIncomeInput(),
    );

    expect(result.source).toBe('fallback');
    expect(result.fallbackCode).toBe('STRATEGY_VALIDATION_FAILED');
    expect(result.fallbackMessage).toContain('intake.anchor_coverage');
  });

  it('acepta salidas cuando preservan metrica, plazo y anclas del intake', async () => {
    const result = await generateStrategyWithSource(
      createReasoningRuntime(createReasoningPayload([
        {
          id: 'phase-1',
          title: 'Empleo remoto con React y Python: base visible',
          summary: 'Primeros 4 meses para ordenar portfolio, GitHub y pruebas visibles con React y Python desde Argentina.',
          startMonth: 1,
          endMonth: 4,
        },
        {
          id: 'phase-2',
          title: 'Entrevistas remotas y pipeline a 3000 usd por mes',
          summary: 'Sostiene 12 meses de empleo remoto con entrevistas, feedback del mercado y foco en llegar a 3000 usd por mes.',
          startMonth: 5,
          endMonth: 12,
        },
      ])),
      createAnchoredIncomeInput(),
    );

    expect(result.source).toBe('llm');
    expect(result.fallbackCode).toBeUndefined();
  });

  it('acepta variantes numericas equivalentes para la metrica del intake', async () => {
    const result = await generateStrategyWithSource(
      createReasoningRuntime(createReasoningPayload([
        {
          id: 'phase-1',
          title: 'Empleo remoto con React y Java: base visible',
          summary: 'Primeros 4 meses para ordenar portfolio, GitHub y pruebas visibles con React y Java desde Argentina.',
          startMonth: 1,
          endMonth: 4,
        },
        {
          id: 'phase-2',
          title: 'Entrevistas remotas y pipeline a 3.000 dolares por mes',
          summary: 'Sostiene 12 meses de empleo remoto con React, Java y feedback del mercado para llegar a 3.000 dolares por mes.',
          startMonth: 5,
          endMonth: 12,
        },
      ])),
      createAnchoredIncomeInput({ stack: 'react y java' }),
    );

    expect(result.source).toBe('llm');
    expect(result.fallbackCode).toBeUndefined();
  });

  it('acepta una metrica escrita como 3 k usd con espacio intermedio', async () => {
    const result = await generateStrategyWithSource(
      createReasoningRuntime(createReasoningPayload([
        {
          id: 'phase-1',
          title: 'Empleo remoto con React y Java: base visible para 3 k usd',
          summary: 'Primeros 4 meses para ordenar portfolio, GitHub y pruebas visibles con React y Java desde Argentina.',
          startMonth: 1,
          endMonth: 4,
        },
        {
          id: 'phase-2',
          title: 'Entrevistas remotas y pipeline a 3 k usd por mes',
          summary: 'Sostiene 12 meses de empleo remoto con React, Java y feedback del mercado para llegar a 3 k usd por mes.',
          startMonth: 5,
          endMonth: 12,
        },
      ])),
      createAnchoredIncomeInput({ stack: 'react y java' }),
    );

    expect(result.source).toBe('llm');
    expect(result.fallbackCode).toBeUndefined();
  });

  it('no aplica validaciones de cocina a un objetivo financiero aunque una respuesta mencione videos', async () => {
    const result = await generateStrategyWithSource(
      createReasoningRuntime(createReasoningPayload([
        {
          id: 'phase-1',
          title: 'Base remota con React y Java hacia 3000 usd',
          summary: 'Primeros 4 meses para ordenar portfolio, GitHub y entrevistas remotas desde Argentina.',
          startMonth: 1,
          endMonth: 4,
        },
        {
          id: 'phase-2',
          title: 'Pipeline remoto y ofertas hacia 3000 usd netos',
          summary: 'Meses 5-12 con foco en empleo remoto, feedback del mercado y cierres graduales hasta 3000 usd netos.',
          startMonth: 5,
          endMonth: 12,
        },
      ])),
      createAnchoredIncomeInput({
        experiencia: 'trabaje en la crypta un tiempo como cm y como editor de videos usando ia para clips de instagram',
        via: 'empleo remoto',
        stack: 'react y java',
      }),
    );

    expect(result.source).toBe('llm');
    expect(result.fallbackCode).toBeUndefined();
  });

  it('inyecta el snapshot de senales prioritarias en el prompt del planner', async () => {
    let capturedPrompt = '';
    const runtime: AgentRuntime = {
      async chat(messages) {
        capturedPrompt = String(messages[0]?.content ?? '');
        return {
          content: JSON.stringify(createReasoningPayload([
            {
              id: 'phase-1',
              title: 'Base remota con React y Python',
              summary: 'Primeros 4 meses con portfolio visible y empleo remoto.',
              startMonth: 1,
              endMonth: 4,
            },
            {
              id: 'phase-2',
              title: 'Pipeline remoto hacia 3k dolares por mes',
              summary: 'Meses 5-12 con entrevistas remotas y foco en 3k dolares por mes.',
              startMonth: 5,
              endMonth: 12,
            },
          ])),
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

    await generateStrategyWithSource(runtime, {
      ...createAnchoredIncomeInput(),
      planningContext: {
        interpretation: {
          parsedGoal: 'Generar 3k USD por mes desde Argentina',
          implicitAssumptions: [],
        },
        clarificationAnswers: {
          via: 'dato secundario',
        },
        goalSignalsSnapshot: createGoalSignalsSnapshot({
          clarificationMode: 'degraded_skip',
          missingCriticalSignals: ['success_criteria'],
          hasSufficientSignalsForPlanning: false,
        }),
      },
    });

    expect(capturedPrompt).toContain('SENALES UNIVERSALES PRIORITARIAS');
    expect(capturedPrompt).toContain('3k dolares por mes');
    expect(capturedPrompt).toContain('12 meses');
    expect(capturedPrompt).toContain('empleo remoto');
    expect(capturedPrompt).toContain('junior sin experiencia');
    expect(capturedPrompt).toContain('clarification_mode: degraded_skip');
    expect(capturedPrompt).toContain('NO inventes dominio, metrica, plazo, baseline ni mecanismo');
  });
});

describe('isStructuralPhaseTitle - specificity gate', () => {
  function createStructuralGateInput(): StrategyInput {
    return createReasoningInput({
      subtema: 'pizza',
      nivel: 'principiante',
      horizonte: '6 meses',
    });
  }

  async function evaluateTitle(title: string): Promise<{ source: string; fallbackCode?: string; fallbackMessage?: string }> {
    const result = await generateStrategyWithSource(
      createReasoningRuntime(createReasoningPayload([
        {
          id: 'phase-1',
          title,
          summary: 'Practica pizza italiana para principiante durante seis meses con foco en tecnica, repeticion y ejecucion consistente.',
          startMonth: 1,
          endMonth: 6,
        },
      ])),
      createStructuralGateInput(),
      cookingCard,
    );

    return {
      source: result.source,
      fallbackCode: result.fallbackCode,
      fallbackMessage: result.fallbackMessage,
    };
  }

  it.each([
    'Fase 1',
    'Base',
    'fundamentos',
    'Introduccion',
    'Nivel 2',
    'Consolidacion',
    'Practica guiada en principiante',
    'Base: intro',
  ])('bloquea titulos genericos: %s', async (title) => {
    const result = await evaluateTitle(title);

    expect(result.source).toBe('fallback');
    expect(result.fallbackCode).toBe('STRATEGY_VALIDATION_FAILED');
    expect(result.fallbackMessage).toContain('output.structural_phase_title');
  });

  it.each([
    'Base segura y chequeo inicial de cocina italiana',
    'Fundamentos de pasta fresca con tecnica de amasado',
    'Consolidacion de repertorio de cocina italiana',
    'Introduccion a las pastas italianas clasicas con salsa',
    'Primer repertorio de pastas italianas con videos',
    'Recetas repetibles de pizza napolitana',
    'Menu corto y ejecucion consistente de cocina italiana',
  ])('permite titulos especificos: %s', async (title) => {
    const result = await evaluateTitle(title);

    expect(result.source).toBe('llm');
    expect(result.fallbackCode).toBeUndefined();
    expect(result.fallbackMessage).toBeUndefined();
  });
});

describe('buildStrategyPrompt domain alignment', () => {
  it('expone los exit criteria del dominio para alinear planner y critic', () => {
    const prompt = buildStrategyPrompt({
      goalText: 'Quiero aprender a cocinar platos italianos',
      goalType: 'SKILL_ACQUISITION',
      interpretation: {
        parsedGoal: 'Aprender a cocinar platos italianos',
        implicitAssumptions: [],
      },
      userProfile: {
        freeHoursWeekday: 1,
        freeHoursWeekend: 4,
        energyLevel: 'medium',
        fixedCommitments: [],
      },
      domainContext: {
        card: cocinaItalianaCard,
      },
      clarificationAnswers: {
        platos: 'pizzas',
        metodo: 'videos',
        nivel: 'principiante',
        plazo: '1 mes',
      },
    });

    expect(prompt).toContain('Criterios de salida por nivel');
    expect(prompt).toContain('Preparar 3 recetas de pasta con resultados repetibles');
    expect(prompt).toContain('Entender la logica de una receta escrita sin ayuda paso a paso');
  });

  it('aclara que el subtema inicial no reemplaza el objetivo amplio de cocina italiana', () => {
    const prompt = buildStrategyPrompt({
      goalText: 'Quiero aprender a cocinar platos italianos',
      goalType: 'SKILL_ACQUISITION',
      interpretation: {
        parsedGoal: 'Aprender a cocinar platos italianos',
        implicitAssumptions: [],
      },
      userProfile: {
        freeHoursWeekday: 1,
        freeHoursWeekend: 4,
        energyLevel: 'medium',
        fixedCommitments: [],
      },
      domainContext: {
        card: cocinaItalianaCard,
      },
      clarificationAnswers: {
        platos: 'pizzas',
        metodo: 'videos',
        nivel: 'principiante',
        plazo: '1 mes',
      },
    });

    expect(prompt).toContain('El subtema elegido por el usuario es una puerta de entrada');
    expect(prompt).toContain('no debes convertir todo el plan en pizza');
  });

  it('expone una regla general para preservar las anclas del intake', () => {
    const prompt = buildStrategyPrompt({
      goalText: 'Quiero lograr obtener un flujo de 3k dolares por mes en argentina',
      goalType: 'QUANT_TARGET_TRACKING',
      interpretation: {
        parsedGoal: 'Generar 3k USD por mes desde Argentina',
        implicitAssumptions: [],
      },
      userProfile: {
        freeHoursWeekday: 1,
        freeHoursWeekend: 4,
        energyLevel: 'medium',
        fixedCommitments: [],
      },
      domainContext: null,
      clarificationAnswers: {
        plazo: '12 meses',
        via: 'empleo remoto',
        stack: 'react y python',
      },
    });

    expect(prompt).toContain('ANCLAJES DEL INTAKE');
    expect(prompt).toContain('via preferida');
    expect(prompt).toContain('mecanismo causal');
  });

  it('prioriza el plazo tipado frente a una duracion incidental en otra respuesta', () => {
    const prompt = buildStrategyPrompt({
      goalText: 'Quiero lograr obtener un flujo de 3k dolares por mes en argentina',
      goalType: 'QUANT_TARGET_TRACKING',
      interpretation: {
        parsedGoal: 'Generar 3k USD por mes desde Argentina',
        implicitAssumptions: [],
      },
      userProfile: {
        freeHoursWeekday: 1,
        freeHoursWeekend: 4,
        energyLevel: 'medium',
        fixedCommitments: [],
      },
      domainContext: null,
      clarificationAnswers: {
        '¿Cuál es tu experiencia laboral previa o las habilidades principales que podrías ofrecer en un trabajo o proyecto remoto?': 'trabaje de desarrollador junior full stack por 2 meses',
        '¿En qué plazo objetivo te gustaría empezar a generar de forma estable los 3.000 USD mensuales?': '12 meses',
        'senal tipada - general: plazo': '12 meses',
      },
    });

    expect(prompt).toContain('El usuario pidio un plazo de 12 mes(es)');
    expect(prompt).not.toContain('El usuario pidio un plazo de 2 mes(es)');
  });

  it('ancla meta, metrica, horizonte y via en el checklist de invariantes', () => {
    const prompt = buildStrategyPrompt({
      goalText: 'Quiero lograr obtener un flujo de 3k dolares por mes en argentina',
      goalType: 'QUANT_TARGET_TRACKING',
      interpretation: {
        parsedGoal: 'Generar 3k USD por mes desde Argentina',
        implicitAssumptions: [],
      },
      userProfile: {
        freeHoursWeekday: 1,
        freeHoursWeekend: 4,
        energyLevel: 'medium',
        fixedCommitments: [],
      },
      domainContext: null,
      clarificationAnswers: {
        'senal tipada - general: plazo': '12 meses',
        via: 'empleo remoto',
        stack: 'react y python',
      },
    });

    expect(prompt).toContain('CHECKLIST DE INVARIANTES');
    expect(prompt).toContain('Meta literal: "Quiero lograr obtener un flujo de 3k dolares por mes en argentina"');
    expect(prompt).toContain('3k dolares por mes');
    expect(prompt).toContain('Horizonte literal a preservar: "12 meses"');
    expect(prompt).toContain('Via o palanca explicitada: "empleo remoto"');
    expect(prompt).toContain('No inventes profesiones, industrias, mercados ni disciplinas.');
  });

  it('exige self-check y bloqueo claro antes del JSON final', () => {
    const prompt = buildStrategyPrompt({
      goalText: 'Quiero aprender a cocinar platos italianos',
      goalType: 'SKILL_ACQUISITION',
      interpretation: {
        parsedGoal: 'Aprender a cocinar platos italianos',
        implicitAssumptions: [],
      },
      userProfile: {
        freeHoursWeekday: 1,
        freeHoursWeekend: 4,
        energyLevel: 'medium',
        fixedCommitments: [],
      },
      domainContext: {
        card: cocinaItalianaCard,
      },
      clarificationAnswers: {
        platos: 'pizzas',
        metodo: 'videos',
        nivel: 'principiante',
        plazo: '1 mes',
      },
    });

    expect(prompt).toContain('SELF-CHECK OBLIGATORIO');
    expect(prompt).toContain('datos_criticos: ok|missing');
    expect(prompt).toContain('BLOQUEO CLARO:');
    expect(prompt).toContain('No inventes datos para completar el plan.');
  });

  it('incluye ejemplos buenos y malos para preservar alcance y ejecutabilidad', () => {
    const prompt = buildStrategyPrompt({
      goalText: 'Quiero aprender a cocinar platos italianos',
      goalType: 'SKILL_ACQUISITION',
      interpretation: {
        parsedGoal: 'Aprender a cocinar platos italianos',
        implicitAssumptions: [],
      },
      userProfile: {
        freeHoursWeekday: 1,
        freeHoursWeekend: 4,
        energyLevel: 'medium',
        fixedCommitments: [],
      },
      domainContext: {
        card: cocinaItalianaCard,
      },
      clarificationAnswers: {
        platos: 'pizzas',
        metodo: 'videos',
        nivel: 'principiante',
        plazo: '1 mes',
      },
    });

    expect(prompt).toContain('EJEMPLOS BUENOS / MALOS');
    expect(prompt).toContain('Portfolio y postulaciones React/Python para empleo remoto rumbo a 3k USD/mes');
    expect(prompt).toContain('Construir presencia online y explorar ingresos digitales');
    expect(prompt).toContain('Base de masas, salsas y pasta corta para cocina italiana con entrada por pizza');
    expect(prompt).toContain('Lanzar un microemprendimiento de pizzas por Instagram');
  });

  it('muestra el bloque signal-first y deja el dominio como overlay opcional', () => {
    const prompt = buildStrategyPrompt({
      goalText: 'Quiero lograr obtener un flujo de 3k dolares por mes en argentina',
      goalType: 'QUANT_TARGET_TRACKING',
      interpretation: {
        parsedGoal: 'Generar 3k USD por mes desde Argentina',
        implicitAssumptions: [],
      },
      userProfile: {
        freeHoursWeekday: 1,
        freeHoursWeekend: 4,
        energyLevel: 'medium',
        fixedCommitments: [],
      },
      domainContext: null,
      goalSignalsSnapshot: createGoalSignalsSnapshot({
        clarificationMode: 'degraded_skip',
        missingCriticalSignals: ['success_criteria'],
        hasSufficientSignalsForPlanning: false,
      }),
      clarificationAnswers: {
        via: 'empleo remoto',
      },
    });

    expect(prompt).toContain('SENALES UNIVERSALES PRIORITARIAS');
    expect(prompt).toContain('current_baseline: junior sin experiencia');
    expect(prompt).toContain('modality: empleo remoto');
    expect(prompt).toContain('missing_critical_signals: success_criteria');
    expect(prompt).toContain('OVERLAY DE DOMINIO OPCIONAL');
    expect(prompt).toContain('El dominio es un overlay');
    expect(prompt).toContain('si el snapshot marca `clarificationMode = degraded_skip`');
  });
});
