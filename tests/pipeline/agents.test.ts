import { describe, expect, it, vi } from 'vitest';

import type { AgentRuntime } from '../../src/lib/runtime/types';
import { cocinaItalianaCard } from '../../src/lib/domain/domain-knowledge/cards/cocina-italiana';
import { runningCard } from '../../src/lib/domain/domain-knowledge/cards/running';
import { packagePlan } from '../../src/lib/pipeline/shared/packager';
import { clarifierAgent } from '../../src/lib/pipeline/v6/agents/clarifier-agent';
import type { ClarifierInput } from '../../src/lib/pipeline/v6/agents/clarifier-agent';
import { criticAgent } from '../../src/lib/pipeline/v6/agents/critic-agent';
import type { CriticInput } from '../../src/lib/pipeline/v6/agents/critic-agent';
import { domainExpertAgent } from '../../src/lib/pipeline/v6/agents/domain-expert';
import type { DomainExpertInput } from '../../src/lib/pipeline/v6/agents/domain-expert';
import { feasibilityCheckerAgent } from '../../src/lib/pipeline/v6/agents/feasibility-checker';
import type { FeasibilityInput } from '../../src/lib/pipeline/v6/agents/feasibility-checker';
import { goalInterpreterAgent } from '../../src/lib/pipeline/v6/agents/goal-interpreter';
import { packagerAgent } from '../../src/lib/pipeline/v6/agents/packager-agent';
import type { PackagerInput } from '../../src/lib/pipeline/v6/agents/packager-agent';
import { schedulerAgent } from '../../src/lib/pipeline/v6/agents/scheduler-agent';
import type { SchedulerInput } from '../../src/lib/pipeline/v6/agents/scheduler-agent';
import {
  ClarificationRoundSchema,
  CriticReportSchema,
  FeasibilityReportSchema,
  GoalInterpretationSchema,
  GoalSignalsSnapshotSchema,
  OrchestratorContextSchema,
  PlanPackageSchema,
  SchedulerOutputSchema,
  StrategicDraftSchema,
} from '../../src/lib/pipeline/v6/types';

const emptyStream = async function* (): AsyncIterable<string> {
};

const mockRuntime: AgentRuntime = {
  chat: vi.fn().mockResolvedValue({
    content: '{}',
    usage: {
      promptTokens: 0,
      completionTokens: 0,
    },
  }),
  stream: vi.fn(emptyStream),
  newContext: vi.fn(),
};

(mockRuntime.newContext as ReturnType<typeof vi.fn>).mockReturnValue(mockRuntime);

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

function createJsonRuntime(payload: Record<string, unknown>): AgentRuntime {
  const content = JSON.stringify(payload);
  const runtime: AgentRuntime = {
    async chat() {
      return {
        content,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
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

function createInterpretation() {
  return GoalInterpretationSchema.parse({
    parsedGoal: 'Aprender guitarra',
    goalType: 'SKILL_ACQUISITION',
    implicitAssumptions: [],
    ambiguities: ['horas disponibles'],
    riskFlags: ['LOW'],
    suggestedDomain: 'guitarra',
    confidence: 0.8,
  });
}

function createClarifierInput(overrides: Partial<ClarifierInput> = {}): ClarifierInput {
  return {
    interpretation: createInterpretation(),
    previousAnswers: {},
    goalSignalsSnapshot: GoalSignalsSnapshotSchema.parse({
      parsedGoal: 'Aprender guitarra',
      goalType: 'SKILL_ACQUISITION',
      riskFlags: ['LOW'],
      suggestedDomain: 'guitarra',
      metric: null,
      timeframe: null,
      anchorTokens: [],
      informationGaps: [],
      clarifyConfidence: null,
      readyToAdvance: null,
      normalizedUserAnswers: [],
      missingCriticalSignals: [],
      hasSufficientSignalsForPlanning: true,
      clarificationMode: 'sufficient',
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

function createCriticGoalSignalsSnapshot(overrides: Record<string, unknown> = {}) {
  return GoalSignalsSnapshotSchema.parse({
    parsedGoal: 'Generar 3k USD por mes desde Argentina',
    goalType: 'QUANT_TARGET_TRACKING',
    riskFlags: ['MEDIUM'],
    suggestedDomain: null,
    metric: '3k dolares por mes',
    timeframe: '12 meses',
    anchorTokens: ['react', 'python', 'remoto'],
    informationGaps: [],
    clarifyConfidence: 0.8,
    readyToAdvance: true,
    normalizedUserAnswers: [
      {
        key: 'baseline',
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
    ],
    missingCriticalSignals: [],
    hasSufficientSignalsForPlanning: true,
    clarificationMode: 'sufficient',
    degraded: false,
    fallbackCount: 0,
    phase: 'critique',
    clarifyRounds: 1,
    ...overrides,
  });
}

function createStrategicDraft() {
  return StrategicDraftSchema.parse({
    phases: [
      {
        name: 'Base',
        durationWeeks: 4,
        focus_esAR: 'Practicar acordes y ritmo',
      },
    ],
    milestones: ['Sostener 4 semanas de practica'],
  });
}

function createScheduleOutput() {
  return SchedulerOutputSchema.parse({
    events: [{
      id: 'session-1',
      kind: 'time_event',
      title: 'Practica de guitarra',
      status: 'active',
      goalIds: ['goal-v6'],
      startAt: '2026-03-30T18:00:00.000Z',
      durationMin: 45,
      rigidity: 'soft',
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z',
    }],
    unscheduled: [],
    tradeoffs: [],
    metrics: {
      fillRate: 1,
      solverTimeMs: 10,
      solverStatus: 'optimal',
    },
  });
}

function createPackagerContext() {
  return OrchestratorContextSchema.parse({
    goalText: 'Aprender guitarra',
    interpretation: createInterpretation(),
    clarificationRounds: [],
    userAnswers: {},
    userProfile: {
      freeHoursWeekday: 2,
      freeHoursWeekend: 4,
      energyLevel: 'medium',
      fixedCommitments: [],
      scheduleConstraints: [],
    },
    domainCard: null,
    strategicDraft: createStrategicDraft(),
    feasibilityReport: FeasibilityReportSchema.parse({
      status: 'feasible',
      hoursBudget: { available: 18, required: 6, gap: 0 },
      energyAnalysis: { highEnergyNeeded: 2, highEnergyAvailable: 10 },
      conflicts: [],
      suggestions: [],
    }),
    scheduleResult: {
      solverOutput: createScheduleOutput(),
      tradeoffs: [],
      qualityScore: 88,
      unscheduledCount: 0,
    },
    criticReport: CriticReportSchema.parse({
      overallScore: 88,
      findings: [],
      mustFix: [],
      shouldFix: [],
      verdict: 'approve',
      reasoning: 'Plan consistente.',
    }),
    revisionHistory: [],
    finalPackage: null,
  });
}

function createExpectedPackage() {
  return PlanPackageSchema.parse(packagePlan({
    goalText: 'Aprender guitarra',
    goalId: 'goal-v6',
    timezone: 'UTC',
    weekStartDate: '2026-03-30T00:00:00.000Z',
    requestedDomain: 'guitarra',
    classification: {
      goalType: 'SKILL_ACQUISITION',
      confidence: 0.8,
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
    },
    profile: {
      freeHoursWeekday: 2,
      freeHoursWeekend: 4,
      energyLevel: 'medium',
      fixedCommitments: [],
      scheduleConstraints: [],
    },
    roadmap: createStrategicDraft(),
    finalSchedule: createScheduleOutput(),
  }));
}

describe('agent fallbacks (no LLM)', () => {
  describe('goalInterpreterAgent.fallback', () => {
    it('returns valid GoalInterpretation with empty ambiguities', () => {
      const result = goalInterpreterAgent.fallback({ goalText: 'Aprender guitarra' });

      expect(GoalInterpretationSchema.parse(result)).toEqual(result);
      expect(result.ambiguities).toEqual([]);
    });

    it('uses heuristic classification', () => {
      const result = goalInterpreterAgent.fallback({ goalText: 'Aprender guitarra' });

      expect(result.goalType).toBe('SKILL_ACQUISITION');
      expect(result.parsedGoal).toBe('Aprender guitarra');
    });

    it('does not invent a domain when the agent leaves suggestedDomain empty', async () => {
      const runtime = createJsonRuntime({
        parsedGoal: 'Generar ingresos remotos',
        goalType: 'QUANT_TARGET_TRACKING',
        confidence: 0.8,
        implicitAssumptions: [],
        ambiguities: ['plazo'],
        riskFlags: ['MEDIUM'],
        suggestedDomain: null,
      });

      const result = await goalInterpreterAgent.execute({
        goalText: 'Quiero lograr obtener un flujo de 3k dolares por mes en argentina',
      }, runtime);

      expect(result.suggestedDomain).toBeNull();
    });
  });

  describe('clarifierAgent.fallback', () => {
    it('returns readyToAdvance true with confidence 0.6', () => {
      const input = createClarifierInput();

      const result = clarifierAgent.fallback(input);

      expect(ClarificationRoundSchema.parse(result)).toEqual(result);
      expect(result.readyToAdvance).toBe(true);
      expect(result.confidence).toBe(0.6);
    });

    it('returns empty questions array', () => {
      const input = createClarifierInput();

      expect(clarifierAgent.fallback(input).questions).toEqual([]);
    });
  });

  describe('clarifierAgent.execute', () => {
    it('propagates Unauthorized from the runtime', async () => {
      const input = createClarifierInput();

      await expect(clarifierAgent.execute(input, createUnauthorizedRuntime())).rejects.toThrow('Unauthorized');
    });

    it('does not advance when there are still valid clarification questions even if the model reports high confidence', async () => {
      const input = createClarifierInput();

      const result = await clarifierAgent.execute(input, createJsonRuntime({
        questions: [{
          id: 'availability-hours',
          text: '¿Cuántas horas reales por semana podés dedicarle?',
          purpose: 'Para ajustar la carga semanal del plan.',
          type: 'number',
          min: 1,
          max: 20,
        }],
        reasoning: 'Falta disponibilidad horaria.',
        informationGaps: ['Horas reales por semana'],
        confidence: 0.97,
        readyToAdvance: true,
      }));

      expect(result.readyToAdvance).toBe(false);
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0]).toMatchObject({
        id: 'q1',
        type: 'number',
        min: 1,
        max: 20,
      });
      expect(result.informationGaps).toEqual(['horas_reales_por_semana']);
    });

    it('normalizes ids sequentially and keeps stable snake_case gap keys', async () => {
      const input = createClarifierInput();

      const result = await clarifierAgent.execute(input, createJsonRuntime({
        questions: [
          {
            id: 'availability-hours',
            text: '¿Cuántas horas semanales reales podés dedicarle?',
            purpose: 'Para dimensionar un ritmo sostenible.',
            type: 'number',
          },
          {
            id: 'deadline??',
            text: '¿Tenés una fecha límite concreta?',
            purpose: 'Para definir el horizonte del plan.',
            type: 'text',
          },
        ],
        reasoning: 'Faltan dos anclas operativas.',
        informationGaps: ['Disponibilidad semanal real', 'Fecha límite concreta'],
        confidence: 0.61,
        readyToAdvance: false,
      }));

      expect(result.readyToAdvance).toBe(false);
      expect(result.questions.map((question) => question.id)).toEqual(['q1', 'q2']);
      expect(result.informationGaps).toEqual([
        'disponibilidad_semanal_real',
        'fecha_limite_concreta',
      ]);
    });

    it('drops questions that exactly repeat data already answered in previous rounds', async () => {
      const input: ClarifierInput = {
        interpretation: createInterpretation(),
        previousAnswers: {
          '¿Cuántas horas reales por semana podés dedicarle?': '6',
        },
        profileSummary: null,
      };

      const result = await clarifierAgent.execute(input, createJsonRuntime({
        questions: [{
          id: 'availability',
          text: '¿Cuántas horas reales por semana podés dedicarle?',
          purpose: 'Para ajustar la carga semanal del plan.',
          type: 'number',
        }],
        reasoning: 'La salida del modelo repite una pregunta ya respondida.',
        informationGaps: ['horas_reales_por_semana'],
        confidence: 0.4,
        readyToAdvance: false,
      }));

      expect(result.readyToAdvance).toBe(true);
      expect(result.questions).toEqual([]);
      expect(result.informationGaps).toEqual([]);
    });

    it('filters English questions, renumbers survivors, and downgrades invalid select fields', async () => {
      const input: ClarifierInput = {
        interpretation: createInterpretation(),
        previousAnswers: {},
        profileSummary: null,
      };

      const result = await clarifierAgent.execute(input, createJsonRuntime({
        questions: [
          {
            id: 'budget',
            text: 'What is your budget?',
            purpose: 'Need budget for the plan.',
            type: 'number',
          },
          {
            id: 'format',
            text: '¿Preferís clases o videos?',
            purpose: 'Para elegir el formato principal.',
            type: 'select',
            options: ['Clases', 'Videos'],
          },
          {
            id: 'deadline',
            text: '¿Qué plazo estimado tenés en meses?',
            purpose: 'Para definir el ritmo del plan.',
            type: 'select',
          },
        ],
        reasoning: 'Hay dos faltantes útiles.',
        informationGaps: ['learning_format', 'target_months'],
        confidence: 0.5,
        readyToAdvance: false,
      }));

      expect(result.readyToAdvance).toBe(false);
      expect(result.questions).toHaveLength(2);
      expect(result.questions[0]).toMatchObject({
        id: 'q1',
        type: 'select',
        options: ['Clases', 'Videos'],
      });
      expect(result.questions[1]).toMatchObject({
        id: 'q2',
        type: 'text',
      });
      expect(result.informationGaps).toEqual(['learning_format', 'target_months']);
    });

    it('deduplicates repeated questions and derives fallback gap keys when the model omits them', async () => {
      const input: ClarifierInput = {
        interpretation: createInterpretation(),
        previousAnswers: {},
        profileSummary: null,
      };

      const result = await clarifierAgent.execute(input, createJsonRuntime({
        questions: [
          {
            id: 'deadline-a',
            text: '¿Tenés una fecha límite concreta?',
            purpose: 'Para fijar el horizonte del plan.',
            type: 'text',
          },
          {
            id: 'deadline-b',
            text: '¿Tenés una fecha límite concreta?',
            purpose: 'Para fijar el horizonte del plan.',
            type: 'text',
          },
          {
            id: 'availability',
            text: '¿Cuántas horas semanales reales podés dedicarle?',
            purpose: 'Para ajustar el volumen semanal.',
            type: 'number',
          },
        ],
        reasoning: 'Faltan plazo y disponibilidad.',
        informationGaps: [],
        confidence: 0.42,
        readyToAdvance: false,
      }));

      expect(result.readyToAdvance).toBe(false);
      expect(result.questions.map((question) => question.id)).toEqual(['q1', 'q2']);
      expect(result.questions.map((question) => question.text)).toEqual([
        '¿Tenés una fecha límite concreta?',
        '¿Cuántas horas semanales reales podés dedicarle?',
      ]);
      expect(result.informationGaps).toEqual([
        'fecha_limite_concreta',
        'horas_semanales_reales_dedicarle',
      ]);
    });
  });

  describe('feasibilityCheckerAgent.fallback', () => {
    it('returns feasible status with calculated hours budget', () => {
      const input: FeasibilityInput = {
        strategicDraft: createStrategicDraft(),
        freeHoursWeekday: 2,
        freeHoursWeekend: 4,
        energyPattern: 'morning',
        fixedCommitments: [],
        scheduleConstraints: [],
      };

      const result = feasibilityCheckerAgent.fallback(input);

      expect(FeasibilityReportSchema.parse(result)).toEqual(result);
      expect(result.status).toBe('feasible');
      expect(result.hoursBudget).toEqual({
        available: 18,
        required: 0,
        gap: 0,
      });
    });

    it('returns empty suggestions array', () => {
      const input: FeasibilityInput = {
        strategicDraft: createStrategicDraft(),
        freeHoursWeekday: 2,
        freeHoursWeekend: 4,
        energyPattern: 'morning',
        fixedCommitments: [],
        scheduleConstraints: [],
      };

      expect(feasibilityCheckerAgent.fallback(input).suggestions).toEqual([]);
    });
  });

  describe('criticAgent.fallback', () => {
    it('returns revise verdict with degraded score 35', () => {
      const input: CriticInput = {
        goalText: 'Aprender guitarra',
        goalType: 'SKILL_ACQUISITION',
        profileSummary: '2h libres',
        strategicDraft: createStrategicDraft() as unknown as Record<string, unknown>,
        scheduleQualityScore: 80,
        unscheduledCount: 0,
        scheduleTradeoffs: [],
        goalSignalsSnapshot: createCriticGoalSignalsSnapshot({
          parsedGoal: 'Aprender guitarra',
          goalType: 'SKILL_ACQUISITION',
          metric: null,
          timeframe: null,
          anchorTokens: ['guitarra'],
        }),
        domainCard: null,
        previousCriticReports: [],
      };

      const result = criticAgent.fallback(input);

      expect(CriticReportSchema.parse(result)).toEqual(result);
      expect(result.verdict).toBe('revise');
      expect(result.overallScore).toBe(35);
    });

    it('returns single critical finding about unavailability', () => {
      const input: CriticInput = {
        goalText: 'Aprender guitarra',
        goalType: 'SKILL_ACQUISITION',
        profileSummary: '2h libres',
        strategicDraft: createStrategicDraft() as unknown as Record<string, unknown>,
        scheduleQualityScore: 80,
        unscheduledCount: 0,
        scheduleTradeoffs: [],
        goalSignalsSnapshot: createCriticGoalSignalsSnapshot({
          parsedGoal: 'Aprender guitarra',
          goalType: 'SKILL_ACQUISITION',
          metric: null,
          timeframe: null,
          anchorTokens: ['guitarra'],
        }),
        domainCard: null,
        previousCriticReports: [],
      };

      const result = criticAgent.fallback(input);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        severity: 'critical',
        category: 'feasibility',
      });
      expect(result.findings[0]?.message).toContain('Critic unavailable');
    });
  });

  describe('criticAgent.execute', () => {
    it('propagates Unauthorized from the runtime', async () => {
      const input: CriticInput = {
        goalText: 'Aprender guitarra',
        goalType: 'SKILL_ACQUISITION',
        profileSummary: '2h libres',
        strategicDraft: createStrategicDraft() as unknown as Record<string, unknown>,
        scheduleQualityScore: 80,
        unscheduledCount: 0,
        scheduleTradeoffs: [],
        goalSignalsSnapshot: createCriticGoalSignalsSnapshot({
          parsedGoal: 'Aprender guitarra',
          goalType: 'SKILL_ACQUISITION',
          metric: null,
          timeframe: null,
          anchorTokens: ['guitarra'],
        }),
        domainCard: null,
        previousCriticReports: [],
      };

      await expect(criticAgent.execute(input, createUnauthorizedRuntime())).rejects.toThrow('Unauthorized');
    });

    it('drops hallucinated budget findings when the context never mentions budget constraints', async () => {
      const input: CriticInput = {
        goalText: 'Quiero aprender a cocinar platos italianos',
        goalType: 'SKILL_ACQUISITION',
        profileSummary: '2h libres entre semana, 4h libres el fin de semana, energia media',
        strategicDraft: {
          phases: [
            { id: 'phase-1', name: 'Primer repertorio de pastas italianas con libros', durationWeeks: 3 },
            { id: 'phase-2', name: 'Recetas repetibles de pastas italianas', durationWeeks: 3 },
            { id: 'phase-3', name: 'Menu corto de pastas italianas para 2 meses', durationWeeks: 2 },
          ],
        },
        scheduleQualityScore: 90,
        unscheduledCount: 0,
        scheduleTradeoffs: [],
        goalSignalsSnapshot: createCriticGoalSignalsSnapshot(),
        domainCard: cocinaItalianaCard,
        previousCriticReports: [],
      };

      const result = await criticAgent.execute(input, createJsonRuntime({
        overallScore: 68,
        findings: [{
          id: 'f-budget',
          severity: 'critical',
          category: 'feasibility',
          message: 'El plan ignora una restriccion presupuestaria clave para comprar ingredientes.',
          suggestion: 'Agregar controles de gasto en cada fase.',
          affectedPhaseIds: ['phase-1', 'phase-2', 'phase-3'],
        }],
        verdict: 'revise',
        reasoning: 'Sin presupuesto el plan no seria viable.',
      }));

      expect(result.findings).toEqual([]);
      expect(result.mustFix).toEqual([]);
      expect(result.verdict).toBe('approve');
      expect(result.overallScore).toBe(75);
    });

    it('keeps budget findings when the context explicitly mentions a tight budget', async () => {
      const input: CriticInput = {
        goalText: 'Quiero aprender a cocinar platos italianos con presupuesto acotado',
        goalType: 'SKILL_ACQUISITION',
        profileSummary: '2h libres entre semana, 4h libres el fin de semana, presupuesto limitado para ingredientes',
        strategicDraft: {
          phases: [
            { id: 'phase-1', name: 'Primer repertorio de pastas italianas con libros', durationWeeks: 3 },
          ],
        },
        scheduleQualityScore: 90,
        unscheduledCount: 0,
        scheduleTradeoffs: [],
        goalSignalsSnapshot: createCriticGoalSignalsSnapshot(),
        domainCard: cocinaItalianaCard,
        previousCriticReports: [],
      };

      const result = await criticAgent.execute(input, createJsonRuntime({
        overallScore: 68,
        findings: [{
          id: 'f-budget',
          severity: 'critical',
          category: 'feasibility',
          message: 'El plan ignora una restriccion presupuestaria clave para comprar ingredientes.',
          suggestion: 'Agregar controles de gasto en cada fase.',
          affectedPhaseIds: ['phase-1'],
        }],
        verdict: 'revise',
        reasoning: 'Sin presupuesto el plan no seria viable.',
      }));

      expect(result.findings).toHaveLength(1);
      expect(result.mustFix).toHaveLength(1);
      expect(result.verdict).toBe('revise');
    });

    it('drops spurious domain findings when there is no confirmed domain card', async () => {
      const input: CriticInput = {
        goalText: 'Quiero lograr obtener un flujo de 3k dolares por mes en argentina',
        goalType: 'QUANT_TARGET_TRACKING',
        profileSummary: '6 horas por semana, energia media',
        strategicDraft: {
          phases: [
            { id: 'phase-1', name: 'Base remota con React y Python', durationWeeks: 16 },
            { id: 'phase-2', name: 'Entrevistas remotas hacia 3k dolares', durationWeeks: 16 },
          ],
        },
        scheduleQualityScore: 84,
        unscheduledCount: 0,
        scheduleTradeoffs: [],
        goalSignalsSnapshot: createCriticGoalSignalsSnapshot({
          clarificationMode: 'degraded_skip',
          missingCriticalSignals: ['success_criteria'],
          hasSufficientSignalsForPlanning: false,
        }),
        domainCard: null,
        previousCriticReports: [],
      };

      const result = await criticAgent.execute(input, createJsonRuntime({
        overallScore: 62,
        findings: [
          {
            id: 'f-domain',
            severity: 'critical',
            category: 'domain',
            message: 'Faltan best practices de dominio para escalar una agencia de reclutamiento tech.',
            suggestion: 'Agregar una fase de especializacion sectorial.',
            affectedPhaseIds: ['phase-1'],
          },
          {
            id: 'f-signal',
            severity: 'warning',
            category: 'specificity',
            message: 'El plan necesita dejar mas explicito el criterio de exito porque viene de degraded_skip.',
            suggestion: 'Mantener el foco en empleo remoto y 3k dolares sin inventar otro mecanismo.',
            affectedPhaseIds: ['phase-2'],
          },
        ],
        verdict: 'revise',
        reasoning: 'Faltan anclas de dominio y un criterio de exito mas explicito.',
      }));

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        category: 'specificity',
        severity: 'warning',
      });
      expect(result.findings[0]?.message).toContain('degraded_skip');
      expect(result.findings.some((finding) => finding.category === 'domain')).toBe(false);
    });

    it('keeps domain findings when there is a confirmed domain card', async () => {
      const input: CriticInput = {
        goalText: 'Quiero aprender a cocinar platos italianos',
        goalType: 'SKILL_ACQUISITION',
        profileSummary: '2h libres entre semana, 4h libres el fin de semana, energia media',
        strategicDraft: {
          phases: [
            { id: 'phase-1', name: 'Primer repertorio de pastas italianas con libros', durationWeeks: 3 },
          ],
        },
        scheduleQualityScore: 90,
        unscheduledCount: 0,
        scheduleTradeoffs: [],
        goalSignalsSnapshot: createCriticGoalSignalsSnapshot({
          parsedGoal: 'Aprender cocina italiana',
          goalType: 'SKILL_ACQUISITION',
          metric: null,
          timeframe: '2 meses',
          anchorTokens: ['pastas', 'videos'],
        }),
        domainCard: cocinaItalianaCard,
        previousCriticReports: [],
      };

      const result = await criticAgent.execute(input, createJsonRuntime({
        overallScore: 70,
        findings: [{
          id: 'f-domain',
          severity: 'warning',
          category: 'domain',
          message: 'La progresion de cocina italiana salta demasiado rapido y omite practicas base del dominio.',
          suggestion: 'Agregar una fase de base italiana antes del cierre.',
          affectedPhaseIds: ['phase-1'],
        }],
        verdict: 'revise',
        reasoning: 'Hay un riesgo de progresion de dominio.',
      }));

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        category: 'domain',
        severity: 'warning',
      });
    });
  });

  describe('schedulerAgent.fallback', () => {
    it('returns result without tradeoffs', () => {
      const input: SchedulerInput = {
        strategicDraft: createStrategicDraft(),
        userProfile: {
          freeHoursWeekday: 2,
          freeHoursWeekend: 4,
          energyLevel: 'medium',
          fixedCommitments: [],
          scheduleConstraints: [],
        },
        availability: [{
          day: 'monday',
          startTime: '18:00',
          endTime: '20:00',
        }],
        blocked: [],
        domainCard: runningCard,
      };

      const result = schedulerAgent.fallback(input);

      expect(result.tradeoffs).toEqual([]);
      expect(result.solverOutput.metrics.solverStatus).toBe('fallback_unavailable');
    });
  });

  describe('domainExpertAgent.fallback', () => {
    it('returns null card when domain not found', () => {
      const input: DomainExpertInput = {
        domainLabel: 'desconocido-total',
        goalType: 'SKILL_ACQUISITION',
        specificQuestion: null,
      };

      const result = domainExpertAgent.fallback(input);

      expect(result.card).toBeNull();
      expect(result.specificAdvice).toBeNull();
    });
  });

  describe('packagerAgent.fallback', () => {
    it('returns same as execute (deterministic)', async () => {
      const input: PackagerInput = {
        context: createPackagerContext(),
        scratchpad: [{
          phase: 'package',
          agent: 'packager',
          iteration: 1,
          action: 'Empaqueto',
          reasoning: 'Cierro el flujo.',
          result: 'Paquete listo',
          tokensUsed: 12,
          timestamp: '2026-03-30T00:00:00.000Z',
        }],
      };

      const executeResult = await packagerAgent.execute(input, mockRuntime);
      const fallbackResult = packagerAgent.fallback(input);
      const expectedPackage = createExpectedPackage();

      expect(PlanPackageSchema.parse(executeResult)).toEqual({
        ...expectedPackage,
        reasoningTrace: input.scratchpad,
      });
      expect(PlanPackageSchema.parse(fallbackResult)).toEqual({
        ...expectedPackage,
        reasoningTrace: input.scratchpad,
      });
      expect(executeResult).toEqual(fallbackResult);
    });
  });

  describe('packagePlan validation', () => {
    it('canonicalizes cooking aliases before checking package coherence', async () => {
      const { packagePlan: packagePlanImpl } = await import('../../src/lib/pipeline/shared/packager');
      const result = packagePlanImpl({
        goalText: 'Quiero aprender a cocinar platos italianos',
        goalId: 'goal-cocina',
        timezone: 'UTC',
        weekStartDate: '2026-03-30T00:00:00.000Z',
        requestedDomain: 'cooking',
        clarificationAnswers: {
          level: 'principiante',
          subtopic: 'pastas',
          method: 'libros',
          horizon: '1 año',
        },
        classification: {
          goalType: 'SKILL_ACQUISITION',
          confidence: 0.9,
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
        },
        profile: {
          freeHoursWeekday: 2,
          freeHoursWeekend: 4,
          energyLevel: 'medium',
          fixedCommitments: [],
          scheduleConstraints: [],
        },
        roadmap: {
          phases: [
            { name: 'Dominar pasta seca y salsas base', durationWeeks: 12, focus_esAR: 'Practicar pastas italianas con apoyo de libros y recetas base.' },
            { name: 'Cocinar un menu corto de pastas', durationWeeks: 12, focus_esAR: 'Convertir las lecturas de libros en platos repetibles de pasta.' },
          ],
          milestones: [
            'Completar dos platos de pasta tomados de libros de cocina',
          ],
        },
        finalSchedule: {
          events: [
            {
              id: 'cook-1',
              kind: 'time_event',
              title: 'Practicar pasta seca con salsa de tomate',
              status: 'active',
              goalIds: ['goal-cocina'],
              startAt: '2026-03-30T18:00:00.000Z',
              durationMin: 60,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
            {
              id: 'cook-2',
              kind: 'time_event',
              title: 'Leer libro de cocina y preparar mise en place para pasta',
              status: 'active',
              goalIds: ['goal-cocina'],
              startAt: '2026-04-01T18:00:00.000Z',
              durationMin: 45,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
          ],
          unscheduled: [],
          tradeoffs: [],
          metrics: {
            fillRate: 1,
            solverTimeMs: 8,
            solverStatus: 'optimal',
          },
        },
      });

      expect(result.requestDomain).toBe('cocina-italiana');
      expect(result.packageDomain).toBe('cocina-italiana');
      expect(result.qualityIssues?.map((issue: { code: string }) => issue.code)).not.toContain('domain_mismatch');
      expect(result.intakeCoverage?.requiredSignals).toEqual(expect.arrayContaining([
        'cooking_subtopic',
        'cooking_method',
        'cooking_level',
      ]));
    });

    it('does not flag goal mismatch for health plans that reuse critical intake signals', () => {
      const result = packagePlan({
        goalText: 'Quiero bajar 50kg en 12 meses',
        goalId: 'goal-salud',
        timezone: 'UTC',
        weekStartDate: '2026-03-30T00:00:00.000Z',
        requestedDomain: 'salud',
        clarificationAnswers: {
          metrics: '117 kg y 179 cm',
          medical: 'ninguna',
          activities: 'ciclismo y natacion',
          support: 'sin apoyo todavia',
        },
        classification: {
          goalType: 'QUANT_TARGET_TRACKING',
          confidence: 0.95,
          risk: 'HIGH_HEALTH',
          extractedSignals: {
            isRecurring: false,
            hasDeliverable: false,
            hasNumericTarget: true,
            requiresSkillProgression: false,
            dependsOnThirdParties: false,
            isOpenEnded: false,
            isRelational: false,
          },
        },
        profile: {
          freeHoursWeekday: 2,
          freeHoursWeekend: 4,
          energyLevel: 'medium',
          fixedCommitments: [],
          scheduleConstraints: [],
        },
        roadmap: {
          phases: [
            {
              name: 'Base segura y chequeo inicial de salud',
              durationWeeks: 16,
              focus_esAR: 'Tomar 117 kg y 179 cm como referencia. Antes de tratar esto como aceptable, dejar claro que necesita supervision profesional.',
            },
            {
              name: 'Constancia con actividad viable y bajo impacto',
              durationWeeks: 18,
              focus_esAR: 'Sostener ciclismo y natacion como actividades viables sin castigar el cuerpo.',
            },
            {
              name: 'Seguimiento sostenible y ajustes de salud',
              durationWeeks: 18,
              focus_esAR: 'Buscar una tendencia estable con supervision profesional y chequeos de seguridad.',
            },
          ],
          milestones: [
            'Tener una referencia inicial clara de peso y medidas',
            'Sostener ciclismo y natacion durante varias semanas',
            'Evitar atajos agresivos y mantener una progresion segura',
          ],
        },
        finalSchedule: {
          events: [
            {
              id: 'health-1',
              kind: 'time_event',
              title: 'Ciclismo suave o bici fija',
              status: 'active',
              goalIds: ['goal-salud'],
              startAt: '2026-03-30T18:00:00.000Z',
              durationMin: 45,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
            {
              id: 'health-2',
              kind: 'time_event',
              title: 'Natacion o aquagym',
              status: 'active',
              goalIds: ['goal-salud'],
              startAt: '2026-04-01T18:00:00.000Z',
              durationMin: 40,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
            {
              id: 'health-3',
              kind: 'time_event',
              title: 'Supervision profesional y chequeo de seguridad',
              status: 'active',
              goalIds: ['goal-salud'],
              startAt: '2026-04-03T18:00:00.000Z',
              durationMin: 20,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
          ],
          unscheduled: [],
          tradeoffs: [],
          metrics: {
            fillRate: 1,
            solverTimeMs: 9,
            solverStatus: 'optimal',
          },
        },
      });

      expect(result.qualityIssues?.map((issue) => issue.code)).not.toContain('goal_mismatch');
      expect(result.intakeCoverage?.missingSignals).not.toEqual(expect.arrayContaining([
        'metric',
        'timeframe',
      ]));
      expect(result.intakeCoverage?.requiredSignals).toEqual(expect.arrayContaining([
        'health_weight',
        'health_height',
        'health_supervision',
      ]));
    });

    it('accepts short cooking horizons when the roadmap matches the requested weeks', () => {
      const result = packagePlan({
        goalText: 'Quiero aprender a cocinar platos italianos',
        goalId: 'goal-cocina-corta',
        timezone: 'UTC',
        weekStartDate: '2026-03-30T00:00:00.000Z',
        requestedDomain: 'cocina-italiana',
        clarificationAnswers: {
          subtema: 'pastas',
          metodo: 'libros',
          nivel: 'principiante',
          horizonte: '2 meses',
        },
        classification: {
          goalType: 'SKILL_ACQUISITION',
          confidence: 0.9,
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
        },
        profile: {
          freeHoursWeekday: 2,
          freeHoursWeekend: 4,
          energyLevel: 'medium',
          fixedCommitments: [],
          scheduleConstraints: [],
        },
        roadmap: {
          phases: [
            { name: 'Primer repertorio de pastas italianas con libros', durationWeeks: 3, focus_esAR: 'Practicar pastas italianas con apoyo de libros y recetas base.' },
            { name: 'Recetas repetibles de pastas italianas', durationWeeks: 3, focus_esAR: 'Convertir la lectura en platos repetibles de pasta.' },
            { name: 'Menu corto de pastas italianas para 2 meses', durationWeeks: 2, focus_esAR: 'Cerrar el horizonte de 2 meses con un menu corto de pastas italianas.' },
          ],
          milestones: [
            'Completar una rutina base estable de pastas italianas',
            'Resolver pastas italianas sin depender paso a paso de la receta',
            'Preparar un menu corto de pastas italianas con calidad consistente',
          ],
        },
        finalSchedule: {
          events: [
            {
              id: 'cook-short-1',
              kind: 'time_event',
              title: 'Practicar pasta seca con salsa de tomate',
              status: 'active',
              goalIds: ['goal-cocina-corta'],
              startAt: '2026-03-30T18:00:00.000Z',
              durationMin: 60,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
            {
              id: 'cook-short-2',
              kind: 'time_event',
              title: 'Leer libro de cocina y preparar mise en place para pasta',
              status: 'active',
              goalIds: ['goal-cocina-corta'],
              startAt: '2026-04-01T18:00:00.000Z',
              durationMin: 45,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
          ],
          unscheduled: [],
          tradeoffs: [],
          metrics: {
            fillRate: 1,
            solverTimeMs: 8,
            solverStatus: 'optimal',
          },
        },
      });

      expect(result.publicationState).toBe('publishable');
      expect(result.intakeCoverage?.requiredSignals).toEqual(expect.arrayContaining([
        'cooking_subtopic',
        'cooking_method',
        'cooking_level',
        'cooking_horizon',
      ]));
      expect(result.intakeCoverage?.missingSignals).not.toEqual(expect.arrayContaining([
        'metric',
        'timeframe',
      ]));
      expect(result.plan.skeleton.horizonWeeks).toBe(8);
      expect(result.plan.skeleton.phases.map((phase) => ({
        title: phase.title,
        startWeek: phase.startWeek,
        endWeek: phase.endWeek,
      }))).toEqual([
        {
          title: 'Primer repertorio de pastas italianas con libros',
          startWeek: 1,
          endWeek: 3,
        },
        {
          title: 'Recetas repetibles de pastas italianas',
          startWeek: 4,
          endWeek: 6,
        },
        {
          title: 'Menu corto de pastas italianas para 2 meses',
          startWeek: 7,
          endWeek: 8,
        },
      ]);
    });

    it('keeps explicit cooking goals publishable when the overlay and confirmed signals are preserved by paraphrase', () => {
      const result = packagePlan({
        goalText: 'Quiero aprender cocina italiana, especialmente pastas y salsas, y poder cocinar un menu simple en 3 meses.',
        goalId: 'goal-cocina-overlay',
        timezone: 'UTC',
        weekStartDate: '2026-03-30T00:00:00.000Z',
        requestedDomain: 'cocina-italiana',
        goalSignalsSnapshot: GoalSignalsSnapshotSchema.parse({
          parsedGoal: 'Aprender cocina italiana con foco en pastas y salsas en 3 meses',
          goalType: 'SKILL_ACQUISITION',
          riskFlags: ['LOW'],
          suggestedDomain: 'cocina-italiana',
          metric: null,
          timeframe: '3 meses',
          anchorTokens: ['pasta', 'salsa'],
          informationGaps: [],
          clarifyConfidence: 0.88,
          readyToAdvance: true,
          normalizedUserAnswers: [
            {
              key: 'nivel',
              questionId: 'clarify-r1-q1',
              signalKey: 'current_baseline',
              question: 'Cual es tu punto de partida hoy?',
              answer: 'Basico',
            },
            {
              key: 'metodo',
              questionId: 'clarify-r1-q2',
              signalKey: 'modality',
              question: 'Como queres aprender?',
              answer: 'videos y practica guiada',
            },
          ],
          missingCriticalSignals: [],
          hasSufficientSignalsForPlanning: true,
          clarificationMode: 'sufficient',
          degraded: false,
          fallbackCount: 0,
          phase: 'critique',
          clarifyRounds: 1,
        }),
        clarificationAnswers: {
          subtema: 'pastas y salsas',
          metodo: 'videos y practica guiada',
          nivel: 'principiante',
          horizonte: '3 meses',
        },
        classification: {
          goalType: 'SKILL_ACQUISITION',
          confidence: 0.92,
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
        },
        profile: {
          freeHoursWeekday: 2,
          freeHoursWeekend: 4,
          energyLevel: 'medium',
          fixedCommitments: [],
          scheduleConstraints: [],
        },
        roadmap: {
          phases: [
            {
              name: 'Primer repertorio de pasta y salsas con apoyo guiado',
              durationWeeks: 4,
              focus_esAR: 'Practicar tecnicas base de pasta y salsas con apoyo de videos y repeticion guiada.',
            },
            {
              name: 'Repeticion autonoma de platos italianos simples',
              durationWeeks: 4,
              focus_esAR: 'Convertir la referencia externa en ejecucion repetible de pasta y salsa.',
            },
            {
              name: 'Menu corto italiano para invitados',
              durationWeeks: 4,
              focus_esAR: 'Cerrar un menu simple de pasta con salsa sin depender paso a paso del video.',
            },
          ],
          milestones: [
            'Resolver una pasta con salsa roja',
            'Resolver una pasta con salsa blanca',
            'Servir un menu corto italiano completo',
          ],
        },
        finalSchedule: {
          events: [
            {
              id: 'cook-overlay-1',
              kind: 'time_event',
              title: 'Estudiar tecnicas base de masa y salsa',
              status: 'active',
              goalIds: ['goal-cocina-overlay'],
              startAt: '2026-03-30T18:00:00.000Z',
              durationMin: 45,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
            {
              id: 'cook-overlay-2',
              kind: 'time_event',
              title: 'Preparar una receta nueva para compartir',
              status: 'active',
              goalIds: ['goal-cocina-overlay'],
              startAt: '2026-04-01T18:00:00.000Z',
              durationMin: 60,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
          ],
          unscheduled: [],
          tradeoffs: [],
          metrics: {
            fillRate: 1,
            solverTimeMs: 9,
            solverStatus: 'optimal',
          },
        },
      });

      expect(result.publicationState).toBe('publishable');
      expect(result.requestDomain).toBe('cocina-italiana');
      expect(result.packageDomain).toBe('cocina-italiana');
      expect(result.qualityIssues?.map((issue) => issue.code)).not.toContain('goal_mismatch');
      expect(result.intakeCoverage?.missingSignals).not.toContain('timeframe');
      expect(result.intakeCoverage?.requiredSignals).toEqual(expect.arrayContaining([
        'timeframe',
        'cooking_subtopic',
        'cooking_method',
        'cooking_horizon',
      ]));
    });

    it('does not block the cooking overlay when scheduled events stay concrete and aligned to the roadmap', () => {
      const result = packagePlan({
        goalText: 'Quiero aprender cocina italiana, especialmente pastas y salsas, y poder cocinar un menu simple en 3 meses.',
        goalId: 'goal-cocina-calendar-fix',
        timezone: 'UTC',
        weekStartDate: '2026-03-30T00:00:00.000Z',
        requestedDomain: 'cocina-italiana',
        goalSignalsSnapshot: GoalSignalsSnapshotSchema.parse({
          parsedGoal: 'Aprender cocina italiana enfocada en pastas y salsas y poder preparar un menu sencillo dentro de 3 meses.',
          goalType: 'SKILL_ACQUISITION',
          riskFlags: ['LOW'],
          suggestedDomain: 'cocina-italiana',
          metric: null,
          timeframe: '3 meses',
          anchorTokens: ['aprender', 'cocina', 'italiana', 'pasta', 'salsas'],
          informationGaps: [],
          clarifyConfidence: 0.9,
          readyToAdvance: true,
          normalizedUserAnswers: [
            {
              key: 'nivel',
              questionId: 'clarify-r1-q1',
              signalKey: 'current_baseline',
              question: 'Cual es tu nivel actual?',
              answer: 'Principiante absoluto',
            },
          ],
          missingCriticalSignals: [],
          hasSufficientSignalsForPlanning: true,
          clarificationMode: 'sufficient',
          degraded: false,
          fallbackCount: 0,
          phase: 'package',
          clarifyRounds: 1,
        }),
        clarificationAnswers: {
          nivel: 'Principiante absoluto',
          horizonte: '3 meses',
          metodo: 'videos y practica guiada',
        },
        classification: {
          goalType: 'SKILL_ACQUISITION',
          confidence: 0.92,
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
        },
        profile: {
          freeHoursWeekday: 2,
          freeHoursWeekend: 4,
          energyLevel: 'medium',
          fixedCommitments: [],
          scheduleConstraints: [],
        },
        roadmap: {
          phases: [
            {
              name: 'Rutina principiante de mise en place y lectura de recetas de pastas italianas (mes 1)',
              durationWeeks: 2,
              focus_esAR: 'Dedicar las primeras semanas a una referencia confiable, mise en place y tecnicas base de pasta.',
            },
            {
              name: 'Practica principiante de masas y pastas frescas con salsas base italianas (meses 1-2)',
              durationWeeks: 5,
              focus_esAR: 'Repetir masas simples y conectar cada una con salsas base italianas hasta lograr textura y sabor consistentes.',
            },
            {
              name: 'Ensayo de menu simple de pastas y salsas italianas listo en 3 meses para principiante absoluto (meses 2-3)',
              durationWeeks: 5,
              focus_esAR: 'Ensayar un menu simple de pasta y salsa para dos comensales con mise en place y emplatado ordenados.',
            },
          ],
          milestones: [
            'Mise en place y lectura dominadas durante 4 sesiones',
            'Tres pastas y salsas italianas repetibles por principiante absoluto',
            'Menu simple italiano de pastas y salsas servido dentro de los 3 meses',
          ],
        },
        finalSchedule: {
          events: [
            {
              id: 'cook-calendar-fix-1',
              kind: 'time_event',
              title: 'Estudiar una referencia concreta de cocina italiana',
              status: 'active',
              goalIds: ['goal-cocina-calendar-fix'],
              startAt: '2026-03-30T18:00:00.000Z',
              durationMin: 25,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
            {
              id: 'cook-calendar-fix-2',
              kind: 'time_event',
              title: 'Practicar salsas base italianas',
              status: 'active',
              goalIds: ['goal-cocina-calendar-fix'],
              startAt: '2026-04-01T18:00:00.000Z',
              durationMin: 35,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
            {
              id: 'cook-calendar-fix-3',
              kind: 'time_event',
              title: 'Practica de pastas italianas',
              status: 'active',
              goalIds: ['goal-cocina-calendar-fix'],
              startAt: '2026-04-03T18:00:00.000Z',
              durationMin: 45,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
          ],
          unscheduled: [],
          tradeoffs: [],
          metrics: {
            fillRate: 1,
            solverTimeMs: 8,
            solverStatus: 'optimal',
          },
        },
      });

      expect(result.publicationState).toBe('publishable');
      expect(result.qualityIssues?.map((issue) => issue.code)).not.toContain('calendar_phase_leak');
      expect(result.requestDomain).toBe('cocina-italiana');
      expect(result.packageDomain).toBe('cocina-italiana');
      expect(result.plan.skeleton.horizonWeeks).toBe(12);
    });

    it('still blocks a real calendar phase leak when the event title copies the phase label', () => {
      const result = packagePlan({
        goalText: 'Quiero aprender cocina italiana, especialmente pastas y salsas, y poder cocinar un menu simple en 3 meses.',
        goalId: 'goal-cocina-real-leak',
        timezone: 'UTC',
        weekStartDate: '2026-03-30T00:00:00.000Z',
        requestedDomain: 'cocina-italiana',
        classification: {
          goalType: 'SKILL_ACQUISITION',
          confidence: 0.92,
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
        },
        profile: {
          freeHoursWeekday: 2,
          freeHoursWeekend: 4,
          energyLevel: 'medium',
          fixedCommitments: [],
          scheduleConstraints: [],
        },
        roadmap: {
          phases: [
            {
              name: 'Practica principiante de masas y pastas frescas con salsas base italianas',
              durationWeeks: 6,
              focus_esAR: 'Repetir masas y salsas base hasta estabilizar la tecnica.',
            },
          ],
          milestones: [
            'Resolver una pasta y una salsa base con consistencia',
          ],
        },
        finalSchedule: {
          events: [
            {
              id: 'cook-real-leak-1',
              kind: 'time_event',
              title: 'Salsas base italianas',
              status: 'active',
              goalIds: ['goal-cocina-real-leak'],
              startAt: '2026-03-30T18:00:00.000Z',
              durationMin: 35,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
          ],
          unscheduled: [],
          tradeoffs: [],
          metrics: {
            fillRate: 1,
            solverTimeMs: 8,
            solverStatus: 'optimal',
          },
        },
      });

      expect(result.publicationState).toBe('failed_for_quality_review');
      expect(result.qualityIssues?.map((issue) => issue.code)).toContain('calendar_phase_leak');
    });

    it('keeps general goals publishable when wording changes but confirmed signals stay aligned', () => {
      const result = packagePlan({
        goalText: 'Quiero conseguir trabajo remoto estable como desarrollador en 10 meses',
        goalId: 'goal-general-paraphrase',
        timezone: 'UTC',
        weekStartDate: '2026-03-30T00:00:00.000Z',
        goalSignalsSnapshot: GoalSignalsSnapshotSchema.parse({
          parsedGoal: 'Conseguir trabajo remoto estable como desarrollador en 10 meses',
          goalType: 'QUANT_TARGET_TRACKING',
          riskFlags: ['LOW'],
          suggestedDomain: null,
          metric: null,
          timeframe: '10 meses',
          anchorTokens: ['react', 'portfolio'],
          informationGaps: [],
          clarifyConfidence: 0.84,
          readyToAdvance: true,
          normalizedUserAnswers: [
            {
              key: 'modalidad',
              questionId: 'clarify-r1-q1',
              signalKey: 'modality',
              question: 'Que via queres priorizar?',
              answer: 'empleo remoto',
            },
            {
              key: 'baseline',
              questionId: 'clarify-r1-q2',
              signalKey: 'current_baseline',
              question: 'Cual es tu punto de partida?',
              answer: 'portfolio chico con React',
            },
          ],
          missingCriticalSignals: [],
          hasSufficientSignalsForPlanning: true,
          clarificationMode: 'sufficient',
          degraded: false,
          fallbackCount: 0,
          phase: 'critique',
          clarifyRounds: 1,
        }),
        clarificationAnswers: {
          modalidad: 'empleo remoto',
          baseline: 'portfolio chico con React',
          horizonte: '10 meses',
        },
        classification: {
          goalType: 'QUANT_TARGET_TRACKING',
          confidence: 0.9,
          risk: 'LOW',
          extractedSignals: {
            isRecurring: true,
            hasDeliverable: false,
            hasNumericTarget: false,
            requiresSkillProgression: true,
            dependsOnThirdParties: true,
            isOpenEnded: false,
            isRelational: false,
          },
        },
        profile: {
          freeHoursWeekday: 2,
          freeHoursWeekend: 4,
          energyLevel: 'medium',
          fixedCommitments: [],
          scheduleConstraints: [],
        },
        roadmap: {
          phases: [
            {
              name: 'Base demostrable para entrevistas distribuidas',
              durationWeeks: 14,
              focus_esAR: 'Expandir portfolio React y traducirlo a evidencia concreta para empleo remoto.',
            },
            {
              name: 'Pipeline de aplicaciones con feedback real',
              durationWeeks: 13,
              focus_esAR: 'Sostener postulaciones y entrevistas para empleo remoto con iteracion sobre el portfolio.',
            },
            {
              name: 'Cierre de oferta y onboarding remoto',
              durationWeeks: 13,
              focus_esAR: 'Cerrar una oferta remota estable sin perder continuidad en React y portfolio.',
            },
          ],
          milestones: [
            'Portfolio con casos publicables',
            'Entrevistas remotas en curso',
            'Oferta remota aceptada',
          ],
        },
        finalSchedule: {
          events: [
            {
              id: 'general-paraphrase-1',
              kind: 'time_event',
              title: 'Pulir un caso demostrable del portfolio',
              status: 'active',
              goalIds: ['goal-general-paraphrase'],
              startAt: '2026-03-30T18:00:00.000Z',
              durationMin: 60,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
            {
              id: 'general-paraphrase-2',
              kind: 'time_event',
              title: 'Enviar postulaciones y registrar feedback',
              status: 'active',
              goalIds: ['goal-general-paraphrase'],
              startAt: '2026-04-01T18:00:00.000Z',
              durationMin: 45,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
          ],
          unscheduled: [],
          tradeoffs: [],
          metrics: {
            fillRate: 1,
            solverTimeMs: 8,
            solverStatus: 'optimal',
          },
        },
      });

      expect(result.publicationState).toBe('publishable');
      expect(result.qualityIssues?.map((issue) => issue.code)).not.toContain('goal_mismatch');
      expect(result.intakeCoverage?.missingSignals).not.toContain('timeframe');
      expect(result.intakeCoverage?.missingSignals).not.toContain('modality');
    });

    it('still blocks packages that drop the critical goal signals and drift to another objective', () => {
      const result = packagePlan({
        goalText: 'Quiero conseguir trabajo remoto estable como desarrollador en 10 meses',
        goalId: 'goal-general-misaligned',
        timezone: 'UTC',
        weekStartDate: '2026-03-30T00:00:00.000Z',
        goalSignalsSnapshot: GoalSignalsSnapshotSchema.parse({
          parsedGoal: 'Conseguir trabajo remoto estable como desarrollador en 10 meses',
          goalType: 'QUANT_TARGET_TRACKING',
          riskFlags: ['LOW'],
          suggestedDomain: null,
          metric: null,
          timeframe: '10 meses',
          anchorTokens: ['react', 'portfolio'],
          informationGaps: [],
          clarifyConfidence: 0.84,
          readyToAdvance: true,
          normalizedUserAnswers: [
            {
              key: 'modalidad',
              questionId: 'clarify-r1-q1',
              signalKey: 'modality',
              question: 'Que via queres priorizar?',
              answer: 'empleo remoto',
            },
          ],
          missingCriticalSignals: [],
          hasSufficientSignalsForPlanning: true,
          clarificationMode: 'sufficient',
          degraded: false,
          fallbackCount: 0,
          phase: 'critique',
          clarifyRounds: 1,
        }),
        clarificationAnswers: {
          modalidad: 'empleo remoto',
          horizonte: '10 meses',
        },
        classification: {
          goalType: 'QUANT_TARGET_TRACKING',
          confidence: 0.9,
          risk: 'LOW',
          extractedSignals: {
            isRecurring: true,
            hasDeliverable: false,
            hasNumericTarget: false,
            requiresSkillProgression: true,
            dependsOnThirdParties: true,
            isOpenEnded: false,
            isRelational: false,
          },
        },
        profile: {
          freeHoursWeekday: 2,
          freeHoursWeekend: 4,
          energyLevel: 'medium',
          fixedCommitments: [],
          scheduleConstraints: [],
        },
        roadmap: {
          phases: [
            {
              name: 'Borrador inicial de novela',
              durationWeeks: 4,
              focus_esAR: 'Escribir escenas y voz narrativa sin relacion con entrevistas ni empleo remoto.',
            },
            {
              name: 'Revision literaria',
              durationWeeks: 4,
              focus_esAR: 'Editar capitulos y consistencia narrativa.',
            },
          ],
          milestones: [
            'Primer capitulo completo',
            'Borrador revisado',
          ],
        },
        finalSchedule: {
          events: [
            {
              id: 'general-misaligned-1',
              kind: 'time_event',
              title: 'Escribir una escena de ficcion',
              status: 'active',
              goalIds: ['goal-general-misaligned'],
              startAt: '2026-03-30T18:00:00.000Z',
              durationMin: 60,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
          ],
          unscheduled: [],
          tradeoffs: [],
          metrics: {
            fillRate: 1,
            solverTimeMs: 8,
            solverStatus: 'optimal',
          },
        },
      });

      expect(result.publicationState).toBe('failed_for_quality_review');
      expect(result.qualityIssues?.map((issue) => issue.code)).toContain('goal_mismatch');
      expect(result.intakeCoverage?.missingSignals).toContain('timeframe');
      expect(result.qualityIssues?.find((issue) => issue.code === 'goal_mismatch')?.message).toContain('timeframe');
    });

    it('does not infer health domain from monetary pesos in finance goals', () => {
      const result = packagePlan({
        goalText: 'Quiero lograr obtener un flujo de 3k dolares por mes en argentina',
        goalId: 'goal-ingresos',
        timezone: 'UTC',
        weekStartDate: '2026-03-30T00:00:00.000Z',
        goalSignalsSnapshot: createCriticGoalSignalsSnapshot(),
        clarificationAnswers: {
          plazo: '12 meses',
          via: 'empleo remoto',
          stack: 'react y java',
          moneda: 'equivalente en pesos argentinos despues de impuestos',
        },
        classification: {
          goalType: 'QUANT_TARGET_TRACKING',
          confidence: 0.92,
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
        profile: {
          freeHoursWeekday: 2,
          freeHoursWeekend: 4,
          energyLevel: 'medium',
          fixedCommitments: [],
          scheduleConstraints: [],
        },
        roadmap: {
          phases: [
            {
              name: 'Base remota con React y Java hacia 3.000 dolares',
              durationWeeks: 16,
              focus_esAR: 'Ordenar portfolio, GitHub y entrevistas remotas desde Argentina para sostener una meta de 3.000 dolares por mes.',
            },
            {
              name: 'Pipeline comercial remoto y primeras ofertas en dolares',
              durationWeeks: 16,
              focus_esAR: 'Enviar postulaciones y propuestas con foco en empleo remoto, validacion de tarifas y brecha hacia 3.000 dolares.',
            },
            {
              name: 'Cierre de ingresos remotos hacia 3.000 dolares por mes',
              durationWeeks: 16,
              focus_esAR: 'Negociar oferta o cartera estable para acercarse a 3.000 dolares por mes sin perder el foco en remoto, React y Java.',
            },
          ],
          milestones: [
            'Portfolio remoto con React y Java publicado',
            'Primeras entrevistas o propuestas pagas en dolares',
            'Brecha hacia 3.000 dolares documentada con ofertas reales',
          ],
        },
        finalSchedule: {
          events: [
            {
              id: 'income-1',
              kind: 'time_event',
              title: 'Actualizar portfolio remoto con React y Java',
              status: 'active',
              goalIds: ['goal-ingresos'],
              startAt: '2026-03-30T18:00:00.000Z',
              durationMin: 90,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
            {
              id: 'income-2',
              kind: 'time_event',
              title: 'Aplicar a empleo remoto y registrar feedback',
              status: 'active',
              goalIds: ['goal-ingresos'],
              startAt: '2026-04-01T18:00:00.000Z',
              durationMin: 60,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
          ],
          unscheduled: [],
          tradeoffs: [],
          metrics: {
            fillRate: 1,
            solverTimeMs: 11,
            solverStatus: 'optimal',
          },
        },
      });

      expect(result.requestDomain).toBeNull();
      expect(result.packageDomain).toBeNull();
      expect(result.publicationState).toBe('publishable');
      expect(result.qualityIssues?.map((issue) => issue.code)).not.toContain('goal_mismatch');
      expect(result.intakeCoverage?.missingSignals).not.toEqual(expect.arrayContaining([
        'metric',
        'timeframe',
      ]));
      expect(result.intakeCoverage?.requiredSignals).not.toEqual(expect.arrayContaining([
        'health_weight',
        'health_height',
        'health_supervision',
      ]));
    });

    it('keeps open creative goals publishable without forcing a domain when signals are preserved', () => {
      const result = packagePlan({
        goalText: 'Quiero armar una serie personal de ilustraciones para publicar en 6 meses',
        goalId: 'goal-creativo',
        timezone: 'UTC',
        weekStartDate: '2026-03-30T00:00:00.000Z',
        goalSignalsSnapshot: GoalSignalsSnapshotSchema.parse({
          parsedGoal: 'Armar una serie personal de ilustraciones para publicar en 6 meses',
          goalType: 'IDENTITY_EXPLORATION',
          riskFlags: ['LOW'],
          suggestedDomain: null,
          metric: '12 ilustraciones publicadas',
          timeframe: '6 meses',
          anchorTokens: ['ilustracion', 'serie', 'portfolio'],
          informationGaps: [],
          clarifyConfidence: 0.82,
          readyToAdvance: true,
          normalizedUserAnswers: [
            {
              key: 'modalidad',
              questionId: 'q1',
              signalKey: 'modality',
              question: 'Que formato queres priorizar?',
              answer: 'proyecto personal con portfolio publico',
            },
            {
              key: 'exito',
              questionId: 'q2',
              signalKey: 'success_criteria',
              question: 'Como sabras que funciono?',
              answer: 'cerrar una serie de 12 ilustraciones listas para publicar',
            },
          ],
          missingCriticalSignals: [],
          hasSufficientSignalsForPlanning: true,
          clarificationMode: 'sufficient',
          degraded: false,
          fallbackCount: 0,
          phase: 'package',
          clarifyRounds: 1,
        }),
        clarificationAnswers: {
          modalidad: 'proyecto personal con portfolio publico',
          exito: 'cerrar una serie de 12 ilustraciones listas para publicar',
        },
        classification: {
          goalType: 'IDENTITY_EXPLORATION',
          confidence: 0.88,
          risk: 'LOW',
          extractedSignals: {
            isRecurring: false,
            hasDeliverable: true,
            hasNumericTarget: true,
            requiresSkillProgression: true,
            dependsOnThirdParties: false,
            isOpenEnded: true,
            isRelational: false,
          },
        },
        profile: {
          freeHoursWeekday: 2,
          freeHoursWeekend: 5,
          energyLevel: 'medium',
          fixedCommitments: [],
          scheduleConstraints: [],
        },
        roadmap: {
          phases: [
            {
              name: 'Lenguaje visual de la serie',
              durationWeeks: 8,
              focus_esAR: 'Definir el tono de la serie de ilustracion y preparar un portfolio simple para publicar 12 ilustraciones en 6 meses.',
            },
            {
              name: 'Produccion de ilustraciones publicables',
              durationWeeks: 8,
              focus_esAR: 'Completar ilustraciones consistentes para cerrar una serie de 12 piezas publicables en el plazo de 6 meses.',
            },
            {
              name: 'Cierre y publicacion del portfolio',
              durationWeeks: 8,
              focus_esAR: 'Ordenar la serie final y publicarla como portfolio personal dentro de 6 meses.',
            },
          ],
          milestones: [
            'Definir la serie y su tono visual',
            'Llegar a 8 ilustraciones consistentes',
            'Publicar 12 ilustraciones en el portfolio personal dentro de 6 meses',
          ],
        },
        finalSchedule: {
          events: [
            {
              id: 'creative-1',
              kind: 'time_event',
              title: 'Bocetar ilustracion para la serie personal',
              status: 'active',
              goalIds: ['goal-creativo'],
              startAt: '2026-03-30T18:00:00.000Z',
              durationMin: 90,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
            {
              id: 'creative-2',
              kind: 'time_event',
              title: 'Cerrar una ilustracion para el portfolio publico',
              status: 'active',
              goalIds: ['goal-creativo'],
              startAt: '2026-04-01T18:00:00.000Z',
              durationMin: 90,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
          ],
          unscheduled: [],
          tradeoffs: [],
          metrics: {
            fillRate: 1,
            solverTimeMs: 7,
            solverStatus: 'optimal',
          },
        },
      });

      expect(result.requestDomain).toBeNull();
      expect(result.packageDomain).toBeNull();
      expect(result.publicationState).toBe('publishable');
      expect(result.qualityIssues?.map((issue) => issue.code)).not.toContain('goal_mismatch');
      expect(result.intakeCoverage?.missingSignals).toEqual([]);
    });

    it('marks degraded_skip as an explicit package risk instead of a domain failure', () => {
      const result = packagePlan({
        goalText: 'Quiero publicar una serie corta de ilustraciones en 3 meses',
        goalId: 'goal-degraded-skip',
        timezone: 'UTC',
        weekStartDate: '2026-03-30T00:00:00.000Z',
        goalSignalsSnapshot: GoalSignalsSnapshotSchema.parse({
          parsedGoal: 'Publicar una serie corta de ilustraciones en 3 meses',
          goalType: 'IDENTITY_EXPLORATION',
          riskFlags: ['LOW'],
          suggestedDomain: null,
          metric: '12 ilustraciones',
          timeframe: '3 meses',
          anchorTokens: ['ilustracion', 'serie'],
          informationGaps: ['baseline', 'constraints'],
          clarifyConfidence: 0.62,
          readyToAdvance: true,
          normalizedUserAnswers: [
            {
              key: 'modalidad',
              questionId: 'q1',
              signalKey: 'modality',
              question: 'Que formato queres priorizar?',
              answer: 'serie personal',
            },
          ],
          missingCriticalSignals: ['current_baseline', 'constraints'],
          hasSufficientSignalsForPlanning: false,
          clarificationMode: 'degraded_skip',
          degraded: true,
          fallbackCount: 1,
          phase: 'package',
          clarifyRounds: 2,
        }),
        clarificationAnswers: {
          modalidad: 'serie personal',
        },
        classification: {
          goalType: 'IDENTITY_EXPLORATION',
          confidence: 0.75,
          risk: 'LOW',
          extractedSignals: {
            isRecurring: false,
            hasDeliverable: true,
            hasNumericTarget: true,
            requiresSkillProgression: true,
            dependsOnThirdParties: false,
            isOpenEnded: true,
            isRelational: false,
          },
        },
        profile: {
          freeHoursWeekday: 2,
          freeHoursWeekend: 3,
          energyLevel: 'medium',
          fixedCommitments: [],
          scheduleConstraints: [],
        },
        roadmap: {
          phases: [
            {
              name: 'Serie inicial de ilustracion',
              durationWeeks: 6,
              focus_esAR: 'Empezar una serie de ilustracion personal y sostener el ritmo.',
            },
          ],
          milestones: [
            'Llegar a 12 ilustraciones en 3 meses',
          ],
        },
        finalSchedule: {
          events: [
            {
              id: 'degraded-1',
              kind: 'time_event',
              title: 'Terminar una ilustracion para la serie',
              status: 'active',
              goalIds: ['goal-degraded-skip'],
              startAt: '2026-03-30T18:00:00.000Z',
              durationMin: 90,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
          ],
          unscheduled: [],
          tradeoffs: [],
          metrics: {
            fillRate: 1,
            solverTimeMs: 7,
            solverStatus: 'optimal',
          },
        },
      });

      expect(result.requestDomain).toBeNull();
      expect(result.packageDomain).toBeNull();
      expect(result.publicationState).toBe('requires_regeneration');
      expect(result.qualityIssues?.map((issue) => issue.code)).not.toContain('goal_mismatch');
      expect(result.qualityIssues?.map((issue) => issue.code)).toContain('intake_signals_missing');
    });

    it('keeps health safety blocked as requires_supervision when supervision is missing', () => {
      const result = packagePlan({
        goalText: 'Quiero bajar 50kg en 12 meses',
        goalId: 'goal-salud-sin-supervision',
        timezone: 'UTC',
        weekStartDate: '2026-03-30T00:00:00.000Z',
        requestedDomain: 'salud',
        goalSignalsSnapshot: GoalSignalsSnapshotSchema.parse({
          ...createCriticGoalSignalsSnapshot(),
          goalType: 'QUANT_TARGET_TRACKING',
          riskFlags: ['HIGH_HEALTH'],
          suggestedDomain: 'salud',
          metric: 'bajar 50kg',
          timeframe: '12 meses',
          anchorTokens: ['ciclismo', 'natacion'],
          normalizedUserAnswers: [
            {
              key: 'baseline',
              questionId: 'q1',
              signalKey: 'current_baseline',
              question: 'Cual es tu punto de partida?',
              answer: '117 kg y 179 cm',
            },
            {
              key: 'actividades',
              questionId: 'q2',
              signalKey: 'modality',
              question: 'Que actividades toleras?',
              answer: 'ciclismo y natacion',
            },
          ],
        }),
        clarificationAnswers: {
          metrics: '117 kg y 179 cm',
          activities: 'ciclismo y natacion',
          support: 'sin apoyo todavia',
        },
        classification: {
          goalType: 'QUANT_TARGET_TRACKING',
          confidence: 0.95,
          risk: 'HIGH_HEALTH',
          extractedSignals: {
            isRecurring: false,
            hasDeliverable: false,
            hasNumericTarget: true,
            requiresSkillProgression: false,
            dependsOnThirdParties: false,
            isOpenEnded: false,
            isRelational: false,
          },
        },
        profile: {
          freeHoursWeekday: 2,
          freeHoursWeekend: 4,
          energyLevel: 'medium',
          fixedCommitments: [],
          scheduleConstraints: [],
        },
        roadmap: {
          phases: [
            {
              name: 'Base con actividad viable',
              durationWeeks: 12,
              focus_esAR: 'Tomar ciclismo y natacion como actividades viables sin empujar atajos agresivos.',
            },
          ],
          milestones: [
            'Sostener actividad viable varias semanas',
          ],
        },
        finalSchedule: {
          events: [
            {
              id: 'health-no-support-1',
              kind: 'time_event',
              title: 'Ciclismo suave',
              status: 'active',
              goalIds: ['goal-salud-sin-supervision'],
              startAt: '2026-03-30T18:00:00.000Z',
              durationMin: 45,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
            {
              id: 'health-no-support-2',
              kind: 'time_event',
              title: 'Natacion tranquila',
              status: 'active',
              goalIds: ['goal-salud-sin-supervision'],
              startAt: '2026-04-01T18:00:00.000Z',
              durationMin: 40,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
          ],
          unscheduled: [],
          tradeoffs: [],
          metrics: {
            fillRate: 1,
            solverTimeMs: 7,
            solverStatus: 'optimal',
          },
        },
      });

      expect(result.publicationState).toBe('requires_supervision');
      expect(result.qualityIssues?.map((issue) => issue.code)).toContain('health_safety_gap');
    });

    it('detects video-based cooking methods without relying on book language', () => {
      const result = packagePlan({
        goalText: 'Quiero aprender a cocinar platos italianos',
        goalId: 'goal-cocina-videos',
        timezone: 'UTC',
        weekStartDate: '2026-03-30T00:00:00.000Z',
        requestedDomain: 'cocina-italiana',
        clarificationAnswers: {
          subtema: 'pasta',
          metodo: 'videos',
          nivel: 'principiante',
          horizonte: '1 mes',
        },
        classification: {
          goalType: 'SKILL_ACQUISITION',
          confidence: 0.9,
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
        },
        profile: {
          freeHoursWeekday: 2,
          freeHoursWeekend: 4,
          energyLevel: 'medium',
          fixedCommitments: [],
          scheduleConstraints: [],
        },
        roadmap: {
          phases: [
            {
              name: 'Primer repertorio de pastas italianas con videos',
              durationWeeks: 2,
              focus_esAR: 'Tomar videos paso a paso de pasta al pomodoro como referencia concreta y fijar la tecnica base.',
            },
            {
              name: 'Recetas repetibles de pastas italianas',
              durationWeeks: 1,
              focus_esAR: 'Repetir cacio e pepe y aglio e olio hasta estabilizar textura, sal y punto.',
            },
            {
              name: 'Menu corto de pastas italianas para 1 mes',
              durationWeeks: 1,
              focus_esAR: 'Cerrar 1 mes con dos platos de pasta resueltos a partir de videos y practica repetida.',
            },
          ],
          milestones: [
            'Completar una rutina base estable de pastas italianas',
            'Resolver pastas italianas sin depender paso a paso del video',
            'Preparar un menu corto de pastas italianas con calidad consistente',
          ],
        },
        finalSchedule: {
          events: [
            {
              id: 'cook-video-1',
              kind: 'time_event',
              title: 'Ver video paso a paso de pasta al pomodoro',
              status: 'active',
              goalIds: ['goal-cocina-videos'],
              startAt: '2026-03-30T18:00:00.000Z',
              durationMin: 35,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
            {
              id: 'cook-video-2',
              kind: 'time_event',
              title: 'Practicar pasta al pomodoro y ajustar coccion',
              status: 'active',
              goalIds: ['goal-cocina-videos'],
              startAt: '2026-04-01T18:00:00.000Z',
              durationMin: 60,
              rigidity: 'soft',
              createdAt: '2026-03-30T00:00:00.000Z',
              updatedAt: '2026-03-30T00:00:00.000Z',
            },
          ],
          unscheduled: [],
          tradeoffs: [],
          metrics: {
            fillRate: 1,
            solverTimeMs: 8,
            solverStatus: 'optimal',
          },
        },
      });

      const methodUsage = result.intakeCoverage?.signalUsage.find((usage) => usage.signal === 'cooking_method');

      expect(methodUsage).toMatchObject({
        signal: 'cooking_method',
        expectedValue: 'videos',
        used: true,
      });
      expect(methodUsage?.evidence).toEqual(expect.arrayContaining(['videos']));
      expect(result.intakeCoverage?.missingSignals).not.toContain('cooking_method');
    });
  });
});
