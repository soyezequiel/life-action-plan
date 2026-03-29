import { describe, expect, it, vi } from 'vitest';

import type { AgentRuntime } from '../../src/lib/runtime/types';
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
  });

  describe('clarifierAgent.fallback', () => {
    it('returns readyToAdvance true with confidence 0.6', () => {
      const input: ClarifierInput = {
        interpretation: createInterpretation(),
        previousAnswers: {},
        profileSummary: null,
      };

      const result = clarifierAgent.fallback(input);

      expect(ClarificationRoundSchema.parse(result)).toEqual(result);
      expect(result.readyToAdvance).toBe(true);
      expect(result.confidence).toBe(0.6);
    });

    it('returns empty questions array', () => {
      const input: ClarifierInput = {
        interpretation: createInterpretation(),
        previousAnswers: {},
        profileSummary: null,
      };

      expect(clarifierAgent.fallback(input).questions).toEqual([]);
    });
  });

  describe('clarifierAgent.execute', () => {
    it('propagates Unauthorized from the runtime', async () => {
      const input: ClarifierInput = {
        interpretation: createInterpretation(),
        previousAnswers: {},
        profileSummary: null,
      };

      await expect(clarifierAgent.execute(input, createUnauthorizedRuntime())).rejects.toThrow('Unauthorized');
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
        domainCard: null,
        previousCriticReports: [],
      };

      await expect(criticAgent.execute(input, createUnauthorizedRuntime())).rejects.toThrow('Unauthorized');
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
      const packagerModule = await import('../../src/lib/pipeline/shared/packager');
      const packagePlanImpl = 'packagePlan' in packagerModule
        ? packagerModule.packagePlan
        : packagerModule.default.packagePlan;
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
      expect(result.qualityIssues?.map((issue) => issue.code)).not.toContain('domain_mismatch');
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
      expect(result.intakeCoverage?.missingSignals).toEqual([]);
      expect(result.intakeCoverage?.requiredSignals).toEqual(expect.arrayContaining([
        'health_weight',
        'health_height',
        'health_supervision',
      ]));
    });
  });
});
