import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentRuntime } from '../../src/lib/runtime/types';
import {
  ClarificationRoundSchema,
  CriticReportSchema,
  FeasibilityReportSchema,
  GoalInterpretationSchema,
  SchedulerOutputSchema,
  StrategicDraftSchema,
  type ClarificationRound,
  type CriticReport,
  type FeasibilityReport,
  type GoalInterpretation,
  type PlanPackage,
} from '../../src/lib/pipeline/v6/types';

const hoisted = vi.hoisted(() => {
  const goalInterpreterExecute = vi.fn();
  const goalInterpreterFallback = vi.fn();
  const clarifierExecute = vi.fn();
  const clarifierFallback = vi.fn();
  const feasibilityExecute = vi.fn();
  const feasibilityFallback = vi.fn();
  const criticExecute = vi.fn();
  const criticFallback = vi.fn();
  const schedulerExecute = vi.fn();
  const schedulerFallback = vi.fn();
  const domainExpertExecute = vi.fn();
  const domainExpertFallback = vi.fn();
  const packagerExecute = vi.fn();
  const packagerFallback = vi.fn();
  const generateStrategyMock = vi.fn();
  const createDefaultRegistryMock = vi.fn();

  return {
    goalInterpreterExecute,
    goalInterpreterFallback,
    clarifierExecute,
    clarifierFallback,
    feasibilityExecute,
    feasibilityFallback,
    criticExecute,
    criticFallback,
    schedulerExecute,
    schedulerFallback,
    domainExpertExecute,
    domainExpertFallback,
    packagerExecute,
    packagerFallback,
    generateStrategyMock,
    createDefaultRegistryMock,
  };
});

vi.mock('../../src/lib/pipeline/v6/agent-registry', () => ({
  createDefaultRegistry: hoisted.createDefaultRegistryMock,
}));

vi.mock('../../src/lib/pipeline/v5/strategy', () => ({
  generateStrategy: hoisted.generateStrategyMock,
}));

function createRuntime(): AgentRuntime {
  const runtime: AgentRuntime = {
    chat: vi.fn().mockResolvedValue({
      content: '{}',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
      },
    }),
    stream: vi.fn(async function* (): AsyncIterable<string> {
    }),
    newContext: vi.fn(),
  };

  (runtime.newContext as ReturnType<typeof vi.fn>).mockReturnValue(runtime);
  return runtime;
}

async function createOrchestrator(config: Record<string, unknown> = {}) {
  const mod = await import('../../src/lib/pipeline/v6/orchestrator');
  const PlanOrchestratorCtor = (mod as { PlanOrchestrator?: new (config: Record<string, unknown>, runtime: AgentRuntime) => unknown }).PlanOrchestrator
    ?? ((mod as { default?: { PlanOrchestrator?: new (config: Record<string, unknown>, runtime: AgentRuntime) => unknown } }).default?.PlanOrchestrator);

  if (!PlanOrchestratorCtor) {
    throw new Error('PlanOrchestrator export unavailable in test environment');
  }

  return new PlanOrchestratorCtor(config, createRuntime()) as {
    run: (goalText: string, userCtx: { profile: unknown; timezone: string; locale: string }) => Promise<{
      status: string;
      package: unknown;
      pendingQuestions: ClarificationRound | null;
      scratchpad: Array<{ phase: string; tokensUsed: number }>;
      tokensUsed: number;
      iterations: number;
    }>;
    resume: (answers: Record<string, string>) => Promise<{
      status: string;
      package: unknown;
      pendingQuestions: ClarificationRound | null;
      scratchpad: Array<{ phase: string; tokensUsed: number }>;
      tokensUsed: number;
      iterations: number;
    }>;
    getProgress: () => {
      phase: string;
      iteration: number;
      maxIterations: number;
      progressScore: number;
      lastAction: string;
    };
  };
}

function createInterpretation(overrides: Partial<GoalInterpretation> = {}): GoalInterpretation {
  return GoalInterpretationSchema.parse({
    parsedGoal: 'Test goal',
    goalType: 'SKILL_ACQUISITION',
    implicitAssumptions: [],
    ambiguities: ['time available'],
    riskFlags: ['LOW'],
    suggestedDomain: null,
    confidence: 0.9,
    ...overrides,
  });
}

function createClarificationRound(overrides: Partial<ClarificationRound> = {}): ClarificationRound {
  return ClarificationRoundSchema.parse({
    questions: [],
    reasoning: 'Hay contexto suficiente.',
    informationGaps: [],
    confidence: 0.9,
    readyToAdvance: true,
    ...overrides,
  });
}

function createStrategicDraft() {
  return StrategicDraftSchema.parse({
    phases: [
      {
        name: 'Phase 1',
        durationWeeks: 4,
        focus_esAR: 'Construir base',
      },
      {
        name: 'Phase 2',
        durationWeeks: 4,
        focus_esAR: 'Consolidar',
      },
    ],
    milestones: ['Primer hito'],
  });
}

function createFeasibilityReport(overrides: Partial<FeasibilityReport> = {}): FeasibilityReport {
  return FeasibilityReportSchema.parse({
    status: 'feasible',
    hoursBudget: {
      available: 18,
      required: 8,
      gap: 0,
    },
    energyAnalysis: {
      highEnergyNeeded: 3,
      highEnergyAvailable: 10,
    },
    conflicts: [],
    suggestions: [],
    ...overrides,
  });
}

function createScheduleOutput() {
  return SchedulerOutputSchema.parse({
    events: [{
      id: 'scheduled-1',
      kind: 'time_event',
      title: 'Test block',
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
      solverTimeMs: 5,
      solverStatus: 'optimal',
    },
  });
}

function createCriticReport(overrides: Partial<CriticReport> = {}): CriticReport {
  return CriticReportSchema.parse({
    overallScore: 90,
    findings: [],
    mustFix: [],
    shouldFix: [],
    verdict: 'approve',
    reasoning: 'Plan correcto.',
    ...overrides,
  });
}

function createPackageFixture(): PlanPackage {
  return {
    plan: {
      goalIds: ['goal-v6'],
      timezone: 'UTC',
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z',
      skeleton: {
        horizonWeeks: 12,
        goalIds: ['goal-v6'],
        phases: [],
        milestones: [],
      },
      detail: {
        horizonWeeks: 2,
        startDate: '2026-03-30',
        endDate: '2026-04-12',
        scheduledEvents: [],
        weeks: [],
      },
      operational: {
        horizonDays: 7,
        startDate: '2026-03-30',
        endDate: '2026-04-05',
        frozen: true,
        scheduledEvents: [],
        buffers: [],
        days: [],
        totalBufferMin: 0,
      },
    },
    items: [],
    habitStates: [],
    slackPolicy: {
      weeklyTimeBufferMin: 120,
      maxChurnMovesPerWeek: 3,
      frozenHorizonDays: 2,
    },
    timezone: 'UTC',
    summary_esAR: 'Resumen de prueba',
    qualityScore: 80,
    implementationIntentions: [],
    warnings: [],
    tradeoffs: [],
  } as unknown as PlanPackage;
}

function createRegistry() {
  return {
    get(name: string) {
      const registry = new Map<string, unknown>([
        ['goal-interpreter', { name: 'goal-interpreter', execute: hoisted.goalInterpreterExecute, fallback: hoisted.goalInterpreterFallback }],
        ['clarifier', { name: 'clarifier', execute: hoisted.clarifierExecute, fallback: hoisted.clarifierFallback }],
        ['feasibility-checker', { name: 'feasibility-checker', execute: hoisted.feasibilityExecute, fallback: hoisted.feasibilityFallback }],
        ['critic', { name: 'critic', execute: hoisted.criticExecute, fallback: hoisted.criticFallback }],
        ['scheduler', { name: 'scheduler', execute: hoisted.schedulerExecute, fallback: hoisted.schedulerFallback }],
        ['domain-expert', { name: 'domain-expert', execute: hoisted.domainExpertExecute, fallback: hoisted.domainExpertFallback }],
        ['packager', { name: 'packager', execute: hoisted.packagerExecute, fallback: hoisted.packagerFallback }],
      ]);

      const agent = registry.get(name);
      if (!agent) {
        throw new Error(`Agent "${name}" not registered`);
      }
      return agent;
    },
  };
}

function configureHappyPath() {
  const interpretation = createInterpretation();
  const clarification = createClarificationRound();
  const strategicDraft = createStrategicDraft();
  const feasibility = createFeasibilityReport();
  const schedule = createScheduleOutput();
  const critic = createCriticReport();
  const finalPackage = createPackageFixture();

  hoisted.createDefaultRegistryMock.mockReturnValue(createRegistry());
  hoisted.goalInterpreterExecute.mockResolvedValue(interpretation);
  hoisted.goalInterpreterFallback.mockReturnValue(interpretation);
  hoisted.clarifierExecute.mockResolvedValue(clarification);
  hoisted.clarifierFallback.mockReturnValue(clarification);
  hoisted.feasibilityExecute.mockResolvedValue(feasibility);
  hoisted.feasibilityFallback.mockReturnValue(feasibility);
  hoisted.schedulerExecute.mockResolvedValue(schedule);
  hoisted.schedulerFallback.mockReturnValue(schedule);
  hoisted.criticExecute.mockResolvedValue(critic);
  hoisted.criticFallback.mockReturnValue(critic);
  hoisted.domainExpertExecute.mockResolvedValue({
    card: null,
    specificAdvice: null,
    warnings: [],
  });
  hoisted.domainExpertFallback.mockReturnValue({
    card: null,
    specificAdvice: null,
    warnings: [],
  });
  hoisted.packagerExecute.mockResolvedValue(finalPackage);
  hoisted.packagerFallback.mockReturnValue(finalPackage);
  hoisted.generateStrategyMock.mockResolvedValue(strategicDraft);

  return {
    interpretation,
    clarification,
    strategicDraft,
    feasibility,
    schedule,
    critic,
    finalPackage,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  configureHappyPath();
});

describe('PlanOrchestrator', () => {
  it('runs complete pipeline from interpret to done with mocked agents', async () => {
    const orchestrator = await createOrchestrator({});

    const result = await orchestrator.run('Test goal', {
      profile: {
        freeHoursWeekday: 2,
        freeHoursWeekend: 4,
        energyLevel: 'medium',
        fixedCommitments: [],
        scheduleConstraints: [],
      },
      timezone: 'UTC',
      locale: 'es-AR',
    });

    expect(result.status).toBe('completed');
    expect(result.package).not.toBeNull();
    expect(result.package).toEqual(createPackageFixture());
    expect(result.scratchpad.map((entry) => entry.phase)).toEqual([
      'interpret',
      'clarify',
      'plan',
      'check',
      'schedule',
      'critique',
      'package',
    ]);
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(result.iterations).toBe(7);
  });

  it('pauses at clarify phase and returns needs_input status', async () => {
    hoisted.clarifierExecute.mockResolvedValueOnce(createClarificationRound({
      questions: [{
        id: 'q-1',
        text: 'Cuantas horas tenes por semana?',
        purpose: 'Dimensionar el plan',
        type: 'number',
      }],
      reasoning: 'Falta disponibilidad.',
      informationGaps: ['time available'],
      confidence: 0.4,
      readyToAdvance: false,
    }));

    const orchestrator = await createOrchestrator({});
    const result = await orchestrator.run('Test goal', {
      profile: null,
      timezone: 'UTC',
      locale: 'es-AR',
    });

    expect(result.status).toBe('needs_input');
    expect(result.package).toBeNull();
    expect(result.pendingQuestions).toMatchObject({
      readyToAdvance: false,
      confidence: 0.4,
    });
    expect(result.pendingQuestions?.questions).toHaveLength(1);
    expect(orchestrator.getProgress()).toMatchObject({
      phase: 'clarify',
      iteration: 2,
    });
  });

  it('resumes after receiving answers and continues to plan', async () => {
    hoisted.clarifierExecute
      .mockResolvedValueOnce(createClarificationRound({
        questions: [{
          id: 'q-1',
          text: 'Cuantas horas tenes por semana?',
          purpose: 'Dimensionar el plan',
          type: 'number',
        }],
        reasoning: 'Falta disponibilidad.',
        informationGaps: ['time available'],
        confidence: 0.4,
        readyToAdvance: false,
      }))
      .mockResolvedValueOnce(createClarificationRound({
        questions: [],
        reasoning: 'Con las respuestas ya alcanza.',
        informationGaps: [],
        confidence: 0.9,
        readyToAdvance: true,
      }));

    const orchestrator = await createOrchestrator({});
    const firstResult = await orchestrator.run('Test goal', {
      profile: null,
      timezone: 'UTC',
      locale: 'es-AR',
    });

    expect(firstResult.status).toBe('needs_input');

    const resumed = await orchestrator.resume({ 'q-1': '6 horas' });

    expect(resumed.status).toBe('completed');
    expect(resumed.package).not.toBeNull();
    expect(resumed.scratchpad.filter((entry) => entry.phase === 'clarify')).toHaveLength(2);
    expect(resumed.scratchpad.some((entry) => entry.phase === 'plan')).toBe(true);
  });

  it('handles critic revise verdict by looping back to planner', async () => {
    hoisted.criticExecute
      .mockResolvedValueOnce(createCriticReport({
        overallScore: 60,
        findings: [{
          id: 'f-1',
          severity: 'critical',
          category: 'specificity',
          message: 'Faltan hitos.',
          suggestion: 'Agregar hitos intermedios.',
          affectedPhaseIds: ['phase-1'],
        }],
        mustFix: [{
          id: 'f-1',
          severity: 'critical',
          category: 'specificity',
          message: 'Faltan hitos.',
          suggestion: 'Agregar hitos intermedios.',
          affectedPhaseIds: ['phase-1'],
        }],
        shouldFix: [],
        verdict: 'revise',
        reasoning: 'Hace falta una revision.',
      }))
      .mockResolvedValueOnce(createCriticReport());

    const orchestrator = await createOrchestrator({});
    const result = await orchestrator.run('Test goal', {
      profile: {
        freeHoursWeekday: 2,
        freeHoursWeekend: 4,
        energyLevel: 'medium',
        fixedCommitments: [],
        scheduleConstraints: [],
      },
      timezone: 'UTC',
      locale: 'es-AR',
    });

    expect(result.status).toBe('completed');
    expect(hoisted.generateStrategyMock).toHaveBeenCalledTimes(2);
    expect(result.scratchpad.some((entry) => entry.phase === 'revise')).toBe(true);
    expect(result.iterations).toBe(9);
  });

  it('respects maxIterations safety valve', async () => {
    const orchestrator = await createOrchestrator({ maxIterations: 1 });
    const result = await orchestrator.run('Test goal', {
      profile: null,
      timezone: 'UTC',
      locale: 'es-AR',
    });

    expect(result.status).toBe('completed');
    expect(result.scratchpad.map((entry) => entry.phase)).toEqual(['interpret', 'package']);
    expect(result.iterations).toBe(2);
  });

  it('respects tokenBudget safety valve', async () => {
    const orchestrator = await createOrchestrator({ tokenBudgetLimit: 1 });
    const result = await orchestrator.run('Test goal', {
      profile: null,
      timezone: 'UTC',
      locale: 'es-AR',
    });

    expect(result.status).toBe('completed');
    expect(result.scratchpad.map((entry) => entry.phase)).toEqual(['interpret', 'package']);
    expect(result.tokensUsed).toBeGreaterThan(1);
  });

  it('uses agent fallback when execute() throws', async () => {
    const fallbackInterpretation = createInterpretation({
      parsedGoal: 'Fallback goal',
      confidence: 0.7,
    });

    hoisted.goalInterpreterExecute.mockRejectedValueOnce(new Error('boom'));
    hoisted.goalInterpreterFallback.mockReturnValueOnce(fallbackInterpretation);

    const orchestrator = await createOrchestrator({});
    const result = await orchestrator.run('Test goal', {
      profile: null,
      timezone: 'UTC',
      locale: 'es-AR',
    });

    expect(result.status).toBe('completed');
    expect(hoisted.goalInterpreterFallback).toHaveBeenCalledWith({ goalText: 'Test goal' });
  });

  it('getProgress returns current phase and iteration', async () => {
    hoisted.clarifierExecute.mockResolvedValueOnce(createClarificationRound({
      questions: [{
        id: 'q-1',
        text: 'Cuantas horas tenes por semana?',
        purpose: 'Dimensionar el plan',
        type: 'number',
      }],
      reasoning: 'Falta disponibilidad.',
      informationGaps: ['time available'],
      confidence: 0.4,
      readyToAdvance: false,
    }));

    const orchestrator = await createOrchestrator({});
    await orchestrator.run('Test goal', {
      profile: null,
      timezone: 'UTC',
      locale: 'es-AR',
    });

    expect(orchestrator.getProgress()).toMatchObject({
      phase: 'clarify',
      iteration: 2,
      maxIterations: 20,
      progressScore: 25,
      lastAction: 'Clarifying goal',
    });
  });

  it('scratchpad contains entries for each executed phase', async () => {
    const orchestrator = await createOrchestrator({});
    const result = await orchestrator.run('Test goal', {
      profile: {
        freeHoursWeekday: 2,
        freeHoursWeekend: 4,
        energyLevel: 'medium',
        fixedCommitments: [],
        scheduleConstraints: [],
      },
      timezone: 'UTC',
      locale: 'es-AR',
    });

    expect(result.scratchpad).toHaveLength(7);
    expect(result.scratchpad.map((entry) => entry.phase)).toEqual([
      'interpret',
      'clarify',
      'plan',
      'check',
      'schedule',
      'critique',
      'package',
    ]);
    expect(result.scratchpad.every((entry) => entry.tokensUsed >= 0)).toBe(true);
  });
});
