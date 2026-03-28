import { describe, expect, it, vi } from 'vitest';

import type { AgentRuntime } from '../../src/lib/runtime/types';
import { runningCard } from '../../src/lib/domain/domain-knowledge/cards/running';
import { packagePlan } from '../../src/lib/pipeline/v5/packager';
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
    scheduleResult: createScheduleOutput(),
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

function stripReasoningTrace<T extends object>(value: T): Omit<T, 'reasoningTrace'> {
  const { reasoningTrace: _reasoningTrace, ...rest } = value as T & { reasoningTrace?: unknown };
  return rest;
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
    it('returns approve verdict with score 60', () => {
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
      expect(result.verdict).toBe('approve');
      expect(result.overallScore).toBe(60);
    });

    it('returns single info finding about unavailability', () => {
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
        severity: 'info',
        category: 'feasibility',
      });
      expect(result.findings[0]?.message).toContain('Critic unavailable');
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

      expect(PlanPackageSchema.parse(stripReasoningTrace(executeResult))).toEqual(expectedPackage);
      expect(PlanPackageSchema.parse(stripReasoningTrace(fallbackResult))).toEqual(expectedPackage);
      expect(executeResult).toEqual(fallbackResult);
    });
  });
});
