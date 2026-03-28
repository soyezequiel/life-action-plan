import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const ORCHESTRATOR_DRIVER = `
const scenario = process.argv[process.argv.length - 1];

const mod = await import(__ORCHESTRATOR_MODULE_URL__);
const PlanOrchestrator = mod.PlanOrchestrator ?? mod.default?.PlanOrchestrator;

if (!PlanOrchestrator) {
  throw new Error('PlanOrchestrator export unavailable');
}

const runtime = {
  chat: async () => ({
    content: '{}',
    usage: {
      promptTokens: 0,
      completionTokens: 0,
    },
  }),
  stream: async function* () {
  },
  newContext() {
    return runtime;
  },
};

const interpretationBase = {
  parsedGoal: 'Test goal',
  goalType: 'SKILL_ACQUISITION',
  implicitAssumptions: [],
  ambiguities: ['time available'],
  riskFlags: ['LOW'],
  suggestedDomain: null,
  confidence: 0.9,
};

const clarificationAdvance = {
  questions: [],
  reasoning: 'Hay contexto suficiente.',
  informationGaps: [],
  confidence: 0.9,
  readyToAdvance: true,
};

const clarificationNeedsInput = {
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
};

const strategicDraft = {
  phases: [
    { name: 'Phase 1', durationWeeks: 4, focus_esAR: 'Construir base' },
    { name: 'Phase 2', durationWeeks: 4, focus_esAR: 'Consolidar' },
  ],
  milestones: ['Primer hito'],
};

const revisedDraft = {
  phases: [
    { name: 'Phase 1', durationWeeks: 3, focus_esAR: 'Base corregida' },
    { name: 'Phase 2', durationWeeks: 5, focus_esAR: 'Consolidacion corregida' },
  ],
  milestones: ['Hito corregido'],
};

const feasibilityBase = {
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
};

const scheduleBase = {
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
};

const criticApprove = {
  overallScore: 90,
  findings: [],
  mustFix: [],
  shouldFix: [],
  verdict: 'approve',
  reasoning: 'Plan correcto.',
};

const criticRevise = {
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
};

const packageFixture = {
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
};

const userCtx = {
  profile: {
    freeHoursWeekday: 2,
    freeHoursWeekend: 4,
    energyLevel: 'medium',
    fixedCommitments: [],
    scheduleConstraints: [],
  },
  timezone: 'UTC',
  locale: 'es-AR',
};

const agentState = {
  fallbackCalled: false,
  strategyCalls: 0,
};

const clarifierQueue = [];
const criticQueue = [];

function buildOrchestrator(config = {}) {
  const orchestrator = new PlanOrchestrator(config, runtime);
  const internal = orchestrator;

  const agentMap = {
    'goal-interpreter': {
      name: 'goal-interpreter',
      async execute(input) {
        if (scenario === 'fallback') {
          throw new Error('boom');
        }
        return { ...interpretationBase, parsedGoal: input.goalText };
      },
      fallback(input) {
        agentState.fallbackCalled = true;
        return { ...interpretationBase, parsedGoal: scenario === 'fallback' ? 'Fallback goal' : input.goalText, confidence: scenario === 'fallback' ? 0.7 : 0.9 };
      },
    },
    clarifier: {
      name: 'clarifier',
      async execute() {
        return clarifierQueue.shift() ?? clarificationAdvance;
      },
      fallback() {
        return clarificationAdvance;
      },
    },
    'feasibility-checker': {
      name: 'feasibility-checker',
      async execute() {
        return feasibilityBase;
      },
      fallback() {
        return feasibilityBase;
      },
    },
    scheduler: {
      name: 'scheduler',
      async execute() {
        return {
          solverOutput: scheduleBase,
          tradeoffs: [],
          qualityScore: 100,
          unscheduledCount: 0,
        };
      },
      fallback() {
        return {
          solverOutput: scheduleBase,
          tradeoffs: [],
          qualityScore: 100,
          unscheduledCount: 0,
        };
      },
    },
    critic: {
      name: 'critic',
      async execute() {
        return criticQueue.shift() ?? criticApprove;
      },
      fallback() {
        return criticApprove;
      },
    },
    packager: {
      name: 'packager',
      async execute(input) {
        if (scenario === 'max_iterations') {
          internal.state.maxIterations = 999;
        }
        if (scenario === 'token_budget') {
          internal.state.tokenBudget.limit = 999999;
        }
        return {
          ...packageFixture,
          reasoningTrace: input.scratchpad,
        };
      },
      fallback(input) {
        if (scenario === 'max_iterations') {
          internal.state.maxIterations = 999;
        }
        if (scenario === 'token_budget') {
          internal.state.tokenBudget.limit = 999999;
        }
        return {
          ...packageFixture,
          reasoningTrace: input.scratchpad,
        };
      },
    },
  };

  internal.getAgent = async (name) => agentMap[name] ?? null;
  if (scenario === 'needs_input' || scenario === 'progress' || scenario === 'resume' || scenario === 'revise') {
    internal.shouldForceFinish = () => false;
  }
  internal.executePlan = async () => {
    agentState.strategyCalls += 1;
    return strategicDraft;
  };
  internal.executeRevise = async () => {
    internal.lastAction = 'Revising plan based on critic feedback';
    internal.state.revisionCycles += 1;
    agentState.strategyCalls += 1;

    if (internal.context.criticReport) {
      internal.context.revisionHistory.push({
        findings: internal.context.criticReport.mustFix,
        appliedFixes: [],
      });
    }

    return revisedDraft;
  };
  internal.run = async (goalText, ctx) => {
    internal.initializeContext(goalText, ctx);
    internal.state.phase = 'interpret';
    internal.registry = {
      get(name) {
        return agentMap[name];
      },
    };
    return internal.executeLoop();
  };

  return orchestrator;
}

let payload;

if (scenario === 'complete' || scenario === 'scratchpad') {
  const orchestrator = buildOrchestrator();
  const result = await orchestrator.run('Test goal', userCtx);
  payload = { result, progress: orchestrator.getProgress(), strategyCalls: agentState.strategyCalls, fallbackCalled: agentState.fallbackCalled };
} else if (scenario === 'needs_input' || scenario === 'progress') {
  clarifierQueue.push(clarificationNeedsInput);
  const orchestrator = buildOrchestrator();
  const result = await orchestrator.run('Test goal', { ...userCtx, profile: null });
  payload = { result, progress: orchestrator.getProgress() };
} else if (scenario === 'resume') {
  clarifierQueue.push(clarificationNeedsInput, clarificationAdvance);
  const orchestrator = buildOrchestrator();
  const firstResult = await orchestrator.run('Test goal', { ...userCtx, profile: null });
  const resumed = await orchestrator.resume({ 'q-1': '6 horas' });
  payload = { firstResult, resumed, progress: orchestrator.getProgress(), strategyCalls: agentState.strategyCalls };
} else if (scenario === 'revise') {
  criticQueue.push(criticRevise, criticApprove);
  const orchestrator = buildOrchestrator();
  const result = await orchestrator.run('Test goal', userCtx);
  payload = { result, progress: orchestrator.getProgress(), strategyCalls: agentState.strategyCalls };
} else if (scenario === 'max_iterations') {
  const orchestrator = buildOrchestrator({ maxIterations: 1 });
  const result = await orchestrator.run('Test goal', { ...userCtx, profile: null });
  payload = { result, progress: orchestrator.getProgress() };
} else if (scenario === 'token_budget') {
  const orchestrator = buildOrchestrator({ tokenBudgetLimit: 1 });
  const result = await orchestrator.run('Test goal', { ...userCtx, profile: null });
  payload = { result, progress: orchestrator.getProgress() };
} else if (scenario === 'fallback') {
  const orchestrator = buildOrchestrator();
  const result = await orchestrator.run('Test goal', { ...userCtx, profile: null });
  payload = { result, progress: orchestrator.getProgress(), fallbackCalled: agentState.fallbackCalled };
} else {
  throw new Error('Unknown scenario: ' + scenario);
}

console.log(JSON.stringify(payload));
`;

function runScenario(scenario: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lap-orchestrator-'));
  const driverPath = path.join(tempDir, 'driver.mts');
  const orchestratorModuleUrl = pathToFileURL(
    path.join(process.cwd(), 'src', 'lib', 'pipeline', 'v6', 'orchestrator.ts'),
  ).href;
  const driverSource = ORCHESTRATOR_DRIVER.replace(
    '__ORCHESTRATOR_MODULE_URL__',
    JSON.stringify(orchestratorModuleUrl),
  );
  fs.writeFileSync(driverPath, driverSource, 'utf8');

  const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const result = spawnSync(
    process.execPath,
    [tsxCli, driverPath, scenario],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 8,
    },
  );

  if (result.status !== 0) {
    if (result.error) {
      throw result.error;
    }

    throw new Error([
      `Scenario ${scenario} failed.`,
      result.stdout?.trim(),
      result.stderr?.trim(),
    ].filter(Boolean).join('\n\n'));
  }

  return JSON.parse(result.stdout.trim()) as Record<string, unknown>;
}

describe('PlanOrchestrator', () => {
  it('runs complete pipeline from interpret to done with mocked agents', () => {
    const payload = runScenario('complete');
    const result = payload.result as {
      status: string;
      package: Record<string, unknown> | null;
      scratchpad: Array<{ phase: string }>;
      tokensUsed: number;
      iterations: number;
    };

    expect(result.status).toBe('completed');
    expect(result.package).not.toBeNull();
    expect(result.scratchpad.map((entry) => entry.phase)).toEqual([
      'interpret',
      'clarify',
      'plan',
      'check',
      'schedule',
      'critique',
      'package',
    ]);
    expect((result.package as { reasoningTrace?: Array<{ phase: string }> }).reasoningTrace).toEqual(result.scratchpad);
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(result.iterations).toBe(7);
  });

  it('pauses at clarify phase and returns needs_input status', () => {
    const payload = runScenario('needs_input');
    const result = payload.result as {
      status: string;
      package: null;
      pendingQuestions: { questions: unknown[]; confidence: number; readyToAdvance: boolean } | null;
    };

    expect(result.status).toBe('needs_input');
    expect(result.package).toBeNull();
    expect(result.pendingQuestions?.readyToAdvance).toBe(false);
    expect(result.pendingQuestions?.confidence).toBe(0.4);
    expect(result.pendingQuestions?.questions).toHaveLength(1);
  });

  it('resumes after receiving answers and continues to plan', () => {
    const payload = runScenario('resume');
    const firstResult = payload.firstResult as { status: string };
    const resumed = payload.resumed as {
      status: string;
      package: Record<string, unknown> | null;
      scratchpad: Array<{ phase: string }>;
    };

    expect(firstResult.status).toBe('needs_input');
    expect(resumed.status).toBe('completed');
    expect(resumed.package).not.toBeNull();
    expect(resumed.scratchpad.filter((entry) => entry.phase === 'clarify')).toHaveLength(2);
    expect(resumed.scratchpad.some((entry) => entry.phase === 'plan')).toBe(true);
  });

  it('handles critic revise verdict by looping back to planner', () => {
    const payload = runScenario('revise');
    const result = payload.result as {
      status: string;
      scratchpad: Array<{ phase: string }>;
      iterations: number;
    };

    expect(result.status).toBe('completed');
    expect(payload.strategyCalls).toBe(2);
    expect(result.scratchpad.some((entry) => entry.phase === 'revise')).toBe(true);
    expect(result.iterations).toBe(9);
  });

  it('respects maxIterations safety valve', () => {
    const payload = runScenario('max_iterations');
    const result = payload.result as {
      status: string;
      scratchpad: Array<{ phase: string }>;
      iterations: number;
    };

    expect(result.status).toBe('completed');
    expect(result.scratchpad.map((entry) => entry.phase)).toEqual(['interpret', 'package']);
    expect(result.iterations).toBe(2);
  });

  it('respects tokenBudget safety valve', () => {
    const payload = runScenario('token_budget');
    const result = payload.result as {
      status: string;
      scratchpad: Array<{ phase: string }>;
      tokensUsed: number;
    };

    expect(result.status).toBe('completed');
    expect(result.scratchpad.map((entry) => entry.phase)).toEqual(['interpret', 'package']);
    expect(result.tokensUsed).toBeGreaterThan(1);
  });

  it('uses agent fallback when execute() throws', () => {
    const payload = runScenario('fallback');
    const result = payload.result as { status: string };

    expect(result.status).toBe('completed');
    expect(payload.fallbackCalled).toBe(true);
  });

  it('getProgress returns current phase and iteration', () => {
    const payload = runScenario('progress');
    const progress = payload.progress as {
      phase: string;
      iteration: number;
      maxIterations: number;
      progressScore: number;
      lastAction: string;
    };

    expect(progress).toMatchObject({
      phase: 'clarify',
      iteration: 2,
      maxIterations: 20,
      progressScore: 25,
      lastAction: 'Clarifying goal',
    });
  });

  it('scratchpad contains entries for each executed phase', () => {
    const payload = runScenario('scratchpad');
    const result = payload.result as {
      scratchpad: Array<{ phase: string; tokensUsed: number }>;
    };

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
