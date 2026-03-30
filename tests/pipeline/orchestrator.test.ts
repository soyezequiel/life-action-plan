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
  informationGaps: ['constraints'],
  confidence: 0.4,
  readyToAdvance: false,
};

const clarificationCriticalBatch = {
  questions: [
    {
      id: 'q-1',
      text: 'Cual es tu punto de partida hoy respecto de este objetivo?',
      purpose: 'Ubicar el nivel inicial real',
      type: 'text',
    },
    {
      id: 'q-2',
      text: 'En que plazo queres ver un primer resultado claro?',
      purpose: 'Ajustar el horizonte del plan',
      type: 'text',
    },
    {
      id: 'q-3',
      text: 'Que limites reales de tiempo, energia o agenda tenemos que respetar?',
      purpose: 'Evitar un plan imposible de sostener',
      type: 'text',
    },
  ],
  reasoning: 'Faltan baseline, plazo y constraints.',
  informationGaps: ['current_baseline', 'timeframe', 'constraints'],
  confidence: 0.35,
  readyToAdvance: false,
};

const clarificationStillMissingCritical = {
  questions: [
    {
      id: 'q-1',
      text: 'Cual es tu punto de partida hoy respecto de este objetivo?',
      purpose: 'Ubicar el nivel inicial real',
      type: 'text',
    },
    {
      id: 'q-2',
      text: 'En que plazo queres ver un primer resultado claro?',
      purpose: 'Ajustar el horizonte del plan',
      type: 'text',
    },
  ],
  reasoning: 'Siguen faltando baseline y plazo.',
  informationGaps: ['current_baseline', 'timeframe'],
  confidence: 0.35,
  readyToAdvance: false,
};

const clarificationRoundOne = {
  questions: [
    {
      id: 'q1',
      text: 'Que tipo de trabajo remoto queres priorizar?',
      purpose: 'Entender la via de ingresos',
      type: 'text',
    },
    {
      id: 'q2',
      text: 'Cual es tu situacion financiera actual?',
      purpose: 'Entender el punto de partida',
      type: 'text',
    },
    {
      id: 'q3',
      text: 'Que plazo objetivo tenes para llegar a la meta?',
      purpose: 'Calibrar el horizonte',
      type: 'text',
    },
  ],
  reasoning: 'Faltan via, situacion financiera y plazo.',
  informationGaps: ['modality', 'current_baseline', 'timeframe'],
  confidence: 0.35,
  readyToAdvance: false,
};

const clarificationRoundTwoWithReusedIds = {
  questions: [
    {
      id: 'q1',
      text: 'Que stack tecnico manejas hoy?',
      purpose: 'Orientar el mercado objetivo',
      type: 'text',
    },
    {
      id: 'q2',
      text: 'Preferis empleo remoto o freelancing?',
      purpose: 'Definir la modalidad',
      type: 'text',
    },
    {
      id: 'q3',
      text: 'Estas dispuesto a capacitarte mas?',
      purpose: 'Evaluar upskilling',
      type: 'text',
    },
  ],
  reasoning: 'Faltan stack, modalidad y disposicion de capacitacion.',
  informationGaps: ['resources', 'modality', 'success_criteria'],
  confidence: 0.45,
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

const sufficientGoalText = 'Mejorar mi nivel actual en 12 semanas';

const agentState = {
  fallbackCalled: false,
  strategyCalls: 0,
};

const criticInputs: unknown[] = [];
const packagerInputs: unknown[] = [];
const clarifierQueue = [];
const criticQueue = [];

function attachMockInternals(orchestrator, agentMap) {
  const internal = orchestrator;
  internal.getAgent = async (name) => agentMap[name] ?? null;
  if (
    scenario === 'needs_input'
    || scenario === 'progress'
    || scenario === 'resume'
    || scenario === 'resume_empty_skip'
    || scenario === 'resume_restore'
    || scenario === 'clarify_limit_pause'
    || scenario === 'clarify_limit_resume'
    || scenario === 'reused_question_ids'
  ) {
    internal.getForceFinishReason = () => null;
  }
  internal.executePlan = async () => {
    if (scenario === 'planner_unauthorized') {
      throw new Error('Unauthorized');
    }
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
}

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
        if (scenario === 'metadata') {
          return {
            solverOutput: {
              ...scheduleBase,
              unscheduled: [],
              metrics: {
                fillRate: 0.42,
                solverTimeMs: 5,
                solverStatus: 'optimal',
              },
            },
            tradeoffs: [{
              planA: { description_esAR: 'Compactar la semana y sacar una practica.' },
              planB: { description_esAR: 'Mantener el ritmo actual y dejar mas aire.' },
              question_esAR: 'Preferis compactar la semana o dejar aire?',
            }],
            qualityScore: 87,
            unscheduledCount: 2,
          };
        }
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
      async execute(input) {
        criticInputs.push(input);
        if (scenario === 'critic_unauthorized') {
          throw new Error('Unauthorized');
        }
        return criticQueue.shift() ?? criticApprove;
      },
      fallback() {
        return criticApprove;
      },
    },
    packager: {
      name: 'packager',
      async execute(input) {
        packagerInputs.push(input);
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

  attachMockInternals(orchestrator, agentMap);
  return orchestrator;
}

let payload;

if (scenario === 'complete' || scenario === 'scratchpad') {
  const orchestrator = buildOrchestrator();
  const result = await orchestrator.run(sufficientGoalText, userCtx);
  payload = { result, progress: orchestrator.getProgress(), strategyCalls: agentState.strategyCalls, fallbackCalled: agentState.fallbackCalled };
} else if (scenario === 'needs_input' || scenario === 'progress') {
  clarifierQueue.push(clarificationNeedsInput);
  const orchestrator = buildOrchestrator();
  const result = await orchestrator.run('Test goal', { ...userCtx, profile: null });
  payload = {
    result,
    progress: orchestrator.getProgress(),
    snapshot: orchestrator.getSnapshot(),
    debugTrace: orchestrator.getDebugTrace(),
  };
} else if (scenario === 'resume') {
  clarifierQueue.push(clarificationCriticalBatch, clarificationAdvance);
  const orchestrator = buildOrchestrator();
  const firstResult = await orchestrator.run('Test goal', { ...userCtx, profile: null });
  const firstRoundQuestions = firstResult.pendingQuestions?.questions ?? [];
  const resumed = await orchestrator.resume(Object.fromEntries(firstRoundQuestions.map((question, index) => [
    question.id,
    ['nivel inicial bajo', '12 semanas', '6 horas por semana'][index] ?? ('respuesta-' + (index + 1)),
  ])));
  payload = {
    firstResult,
    resumed,
    progress: orchestrator.getProgress(),
    strategyCalls: agentState.strategyCalls,
    debugTrace: orchestrator.getDebugTrace(),
    snapshot: orchestrator.getSnapshot(),
  };
} else if (scenario === 'resume_empty_skip') {
  clarifierQueue.push(clarificationNeedsInput, clarificationAdvance);
  const orchestrator = buildOrchestrator();
  const firstResult = await orchestrator.run('Test goal', { ...userCtx, profile: null });
  const resumed = await orchestrator.resume({});
  payload = {
    firstResult,
    resumed,
    progress: orchestrator.getProgress(),
    debugTrace: orchestrator.getDebugTrace(),
    snapshot: orchestrator.getSnapshot(),
  };
} else if (scenario === 'resume_restore') {
  clarifierQueue.push(clarificationCriticalBatch, clarificationAdvance);
  const orchestrator = buildOrchestrator();
  const firstResult = await orchestrator.run('Test goal', { ...userCtx, profile: null });
  const firstRoundQuestions = firstResult.pendingQuestions?.questions ?? [];
  const snapshot = orchestrator.getSnapshot();
  const restored = PlanOrchestrator.restore(snapshot, runtime);
  attachMockInternals(restored, {
    'goal-interpreter': orchestrator.getAgent ? await orchestrator.getAgent('goal-interpreter') : null,
    clarifier: orchestrator.getAgent ? await orchestrator.getAgent('clarifier') : null,
    'feasibility-checker': orchestrator.getAgent ? await orchestrator.getAgent('feasibility-checker') : null,
    scheduler: orchestrator.getAgent ? await orchestrator.getAgent('scheduler') : null,
    critic: orchestrator.getAgent ? await orchestrator.getAgent('critic') : null,
    packager: orchestrator.getAgent ? await orchestrator.getAgent('packager') : null,
  });
  const resumed = await restored.resume(Object.fromEntries(firstRoundQuestions.map((question, index) => [
    question.id,
    ['nivel inicial bajo', '12 semanas', '6 horas por semana'][index] ?? ('respuesta-' + (index + 1)),
  ])));
  payload = {
    firstResult,
    snapshot,
    restoredSnapshot: restored.getSnapshot(),
    resumed,
    debugTrace: restored.getDebugTrace(),
  };
} else if (scenario === 'clarify_limit_pause') {
  clarifierQueue.push(clarificationNeedsInput);
  const orchestrator = buildOrchestrator({ maxClarifyRounds: 1 });
  const result = await orchestrator.run('Test goal', { ...userCtx, profile: null });
  payload = { result, progress: orchestrator.getProgress() };
} else if (scenario === 'clarify_limit_resume') {
  clarifierQueue.push(clarificationNeedsInput, clarificationStillMissingCritical);
  const orchestrator = buildOrchestrator({ maxClarifyRounds: 1 });
  const firstResult = await orchestrator.run('Test goal', { ...userCtx, profile: null });
  const firstQuestionId = firstResult.pendingQuestions?.questions?.[0]?.id ?? 'q-1';
  const resumed = await orchestrator.resume({ [firstQuestionId]: '6 horas' });
  payload = {
    firstResult,
    resumed,
    progress: orchestrator.getProgress(),
    strategyCalls: agentState.strategyCalls,
    snapshot: orchestrator.getSnapshot(),
  };
} else if (scenario === 'reused_question_ids') {
  clarifierQueue.push(clarificationRoundOne, clarificationRoundTwoWithReusedIds);
  const orchestrator = buildOrchestrator();
  const firstResult = await orchestrator.run('Test goal', { ...userCtx, profile: null });
  const firstRoundQuestions = firstResult.pendingQuestions?.questions ?? [];
  const answers = Object.fromEntries(firstRoundQuestions.map((question, index) => [
    question.id,
    ['remoto', 'sin ingresos', '12 meses'][index] ?? ('respuesta-' + (index + 1)),
  ]));
  const secondPause = await orchestrator.resume(answers);
  payload = {
    firstResult,
    secondPause,
    snapshot: orchestrator.getSnapshot(),
    debugTrace: orchestrator.getDebugTrace(),
  };
} else if (scenario === 'revise') {
  criticQueue.push(criticRevise, criticApprove);
  const orchestrator = buildOrchestrator();
  const result = await orchestrator.run(sufficientGoalText, userCtx);
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
  const result = await orchestrator.run(sufficientGoalText, userCtx);
  payload = { result, progress: orchestrator.getProgress(), fallbackCalled: agentState.fallbackCalled };
} else if (scenario === 'planner_unauthorized') {
  const orchestrator = buildOrchestrator();
  const result = await orchestrator.run(sufficientGoalText, userCtx);
  payload = { result, progress: orchestrator.getProgress() };
} else if (scenario === 'critic_unauthorized') {
  const orchestrator = buildOrchestrator();
  const result = await orchestrator.run(sufficientGoalText, userCtx);
  payload = { result, progress: orchestrator.getProgress() };
} else if (scenario === 'planner_validation_fallback_publishable') {
  const orchestrator = buildOrchestrator();
  const internal = orchestrator;
  internal.initializeContext('Test goal', userCtx);
  internal.state.phase = 'done';
  internal.context.criticReport = criticApprove;
  internal.context.finalPackage = {
    ...packageFixture,
    publicationState: 'publishable',
    warnings: [],
    qualityIssues: [],
  };
  internal.agentOutcomes.push({
    agent: 'planner',
    phase: 'plan',
    source: 'fallback',
    errorCode: 'Error',
    errorMessage: 'Planner output failed validation: check "cooking.horizon" did not pass. Fallback strategy was used.',
    durationMs: 15,
  });
  const result = internal.buildFinalResult();
  payload = { result };
} else if (scenario === 'planner_timeout_fallback_publishable_finance') {
  const orchestrator = buildOrchestrator();
  const internal = orchestrator;
  internal.initializeContext('Quiero ordenar mis finanzas personales y ahorrar 200000 en 6 meses', userCtx);
  internal.state.phase = 'done';
  internal.context.interpretation = {
    parsedGoal: 'Ordenar finanzas personales y ahorrar 200000 en 6 meses',
    goalType: 'QUANT_TARGET_TRACKING',
    implicitAssumptions: [],
    ambiguities: [],
    riskFlags: ['MEDIUM'],
    suggestedDomain: 'personal finance',
    confidence: 0.91,
  };
  internal.context.goalSignalsSnapshot = {
    ...internal.context.goalSignalsSnapshot,
    parsedGoal: 'Ordenar finanzas personales y ahorrar 200000 en 6 meses',
    goalType: 'QUANT_TARGET_TRACKING',
    metric: '200000',
    timeframe: '6 meses',
    anchorTokens: ['ordenar', 'finanzas', 'personales', 'empezar', 'ahorrar', 'forma'],
    missingCriticalSignals: [],
    hasSufficientSignalsForPlanning: true,
    clarificationMode: 'sufficient',
  };
  internal.context.criticReport = criticApprove;
  internal.context.finalPackage = {
    ...packageFixture,
    publicationState: 'requires_regeneration',
    warnings: [],
    qualityIssues: [],
  };
  internal.agentOutcomes.push({
    agent: 'planner',
    phase: 'plan',
    source: 'fallback',
    errorCode: 'Error',
    errorMessage: 'El asistente tardo demasiado en responder. Intentalo de nuevo.',
    durationMs: 60019,
  });
  const result = internal.buildFinalResult();
  payload = { result };
} else if (scenario === 'planner_validation_fallback_publishable_finance') {
  const orchestrator = buildOrchestrator();
  const internal = orchestrator;
  internal.initializeContext('Quiero ordenar mis finanzas personales y ahorrar 150000 pesos por mes en 6 meses', userCtx);
  internal.state.phase = 'done';
  internal.context.interpretation = {
    parsedGoal: 'Ordenar finanzas personales y ahorrar 150000 pesos por mes en 6 meses',
    goalType: 'QUANT_TARGET_TRACKING',
    implicitAssumptions: [],
    ambiguities: [],
    riskFlags: ['MEDIUM'],
    suggestedDomain: 'personal finance',
    confidence: 0.91,
  };
  internal.context.goalSignalsSnapshot = {
    ...internal.context.goalSignalsSnapshot,
    parsedGoal: 'Ordenar finanzas personales y ahorrar 150000 pesos por mes en 6 meses',
    goalType: 'QUANT_TARGET_TRACKING',
    metric: '150000 pesos por mes',
    timeframe: '6 meses',
    anchorTokens: ['pesos', 'variable', '250000'],
    missingCriticalSignals: [],
    hasSufficientSignalsForPlanning: true,
    clarificationMode: 'sufficient',
  };
  internal.context.criticReport = criticApprove;
  internal.context.finalPackage = {
    ...packageFixture,
    publicationState: 'requires_regeneration',
    warnings: [],
    qualityIssues: [],
  };
  internal.agentOutcomes.push({
    agent: 'planner',
    phase: 'plan',
    source: 'fallback',
    errorCode: 'Error',
    errorMessage: 'Planner output failed validation: check \"intake.anchor_coverage\" did not pass. Fallback strategy was used.',
    durationMs: 60019,
  });
  const result = internal.buildFinalResult();
  payload = { result };
} else if (scenario === 'health_requires_supervision_trace') {
  const orchestrator = buildOrchestrator();
  const internal = orchestrator;
  internal.initializeContext('Quiero bajar 50kg en 12 meses', userCtx);
  internal.state.phase = 'done';
  internal.context.interpretation = {
    parsedGoal: 'Bajar 50kg en 12 meses',
    goalType: 'QUANT_TARGET_TRACKING',
    implicitAssumptions: [],
    ambiguities: [],
    riskFlags: ['HIGH_HEALTH'],
    suggestedDomain: 'salud',
    confidence: 0.93,
  };
  internal.context.criticReport = criticApprove;
  internal.context.finalPackage = {
    ...packageFixture,
    publicationState: 'requires_regeneration',
    warnings: [],
    qualityIssues: [
      {
        code: 'health_safety_gap',
        severity: 'blocking',
        message: 'Hace falta supervision profesional.',
      },
    ],
  };
  internal.agentOutcomes.push({
    agent: 'planner',
    phase: 'plan',
    source: 'fallback',
    errorCode: 'Error',
    errorMessage: 'Planner output failed validation: check "health.supervision" did not pass. Fallback strategy was used.',
    durationMs: 21,
  });
  const result = internal.buildFinalResult();
  payload = { result };
} else if (scenario === 'health_negated_supervision_trace') {
  const orchestrator = buildOrchestrator();
  const internal = orchestrator;
  internal.initializeContext('Quiero bajar 15 kilos en 3 meses', userCtx);
  internal.state.phase = 'done';
  internal.context.interpretation = {
    parsedGoal: 'Bajar 15 kilos en 3 meses',
    goalType: 'QUANT_TARGET_TRACKING',
    implicitAssumptions: [],
    ambiguities: [],
    riskFlags: ['HIGH_HEALTH'],
    suggestedDomain: 'salud',
    confidence: 0.91,
  };
  internal.context.criticReport = {
    ...criticRevise,
    reasoning: 'El plan evita la supervision profesional pese a que el ritmo requerido excede lo permitido sin aval medico.',
  };
  internal.context.finalPackage = {
    ...packageFixture,
    publicationState: 'requires_regeneration',
    warnings: [
      'Mantener visible el contexto de seguridad confirmado: no tengo seguimiento medico ni nutricionista ahora y no quiero basar esto en una supervision profesional por el momento.',
    ],
    qualityIssues: [],
    implementationIntentions: [
      'Si llega el fin de semana, entonces agendo un control medico y nutricional.',
    ],
  };
  internal.agentOutcomes.push({
    agent: 'planner',
    phase: 'plan',
    source: 'fallback',
    errorCode: 'Error',
    errorMessage: 'Planner output failed validation: check "health.supervision" did not pass. Fallback strategy was used.',
    durationMs: 21,
  });
  const result = internal.buildFinalResult();
  payload = { result };
} else if (scenario === 'metadata') {
  const orchestrator = buildOrchestrator();
  const result = await orchestrator.run(sufficientGoalText, userCtx);
  payload = {
    result,
    progress: orchestrator.getProgress(),
    criticInput: criticInputs[0] ?? null,
    packagerInput: packagerInputs[0] ?? null,
    debugTrace: orchestrator.getDebugTrace(),
  };
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
      degraded: boolean;
      agentOutcomes: Array<{ agent: string; source: string; phase: string }>;
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
    expect(result.degraded).toBe(false);
    expect(result.agentOutcomes).toEqual([
      expect.objectContaining({ agent: 'goal-interpreter', phase: 'interpret', source: 'llm' }),
      expect.objectContaining({ agent: 'clarifier', phase: 'clarify', source: 'llm' }),
      expect.objectContaining({ agent: 'feasibility-checker', phase: 'check', source: 'llm' }),
      expect.objectContaining({ agent: 'scheduler', phase: 'schedule', source: 'deterministic' }),
      expect.objectContaining({ agent: 'critic', phase: 'critique', source: 'llm' }),
      expect.objectContaining({ agent: 'packager', phase: 'package', source: 'deterministic' }),
    ]);
  });

  it('pauses at clarify phase and returns needs_input status', () => {
    const payload = runScenario('needs_input');
    const result = payload.result as {
      status: string;
      package: null;
      pendingQuestions: { questions: unknown[]; confidence: number; readyToAdvance: boolean } | null;
      degraded: boolean;
      agentOutcomes: Array<{ source: string }>;
    };

    expect(result.status).toBe('needs_input');
    expect(result.package).toBeNull();
    expect(result.pendingQuestions?.readyToAdvance).toBe(false);
    expect(result.pendingQuestions?.confidence).toBe(0.4);
    expect(result.pendingQuestions?.questions).toHaveLength(1);
    expect(result.degraded).toBe(false);
    expect(result.agentOutcomes.every((entry) => entry.source !== 'fallback')).toBe(true);
  });

  it('creates an initial goal signals snapshot after interpret without forcing a domain', () => {
    const payload = runScenario('needs_input');
    const debugTrace = payload.debugTrace as Array<{
      action: string;
      details?: {
        goalSignalsSnapshot?: {
          parsedGoal: string | null;
          goalType: string | null;
          suggestedDomain: string | null;
          riskFlags: string[];
          informationGaps: string[];
          missingCriticalSignals: string[];
          hasSufficientSignalsForPlanning: boolean;
          clarificationMode: string;
          degraded: boolean;
          fallbackCount: number;
          phase: string;
          clarifyRounds: number;
        };
      } | null;
    }>;

    const interpretSummary = debugTrace.find((event) => event.action === 'interpret.summary');
    expect(interpretSummary?.details?.goalSignalsSnapshot).toMatchObject({
      parsedGoal: 'Test goal',
      goalType: 'SKILL_ACQUISITION',
      suggestedDomain: null,
      riskFlags: ['LOW'],
      informationGaps: ['timeframe', 'current_baseline', 'constraints'],
      missingCriticalSignals: ['timeframe', 'current_baseline', 'constraints'],
      hasSufficientSignalsForPlanning: false,
      clarificationMode: 'needs_input',
      degraded: false,
      fallbackCount: 0,
      phase: 'interpret',
      clarifyRounds: 0,
    });
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

  it('updates the goal signals snapshot with normalized answers on resume', () => {
    const payload = runScenario('resume');
    const debugTrace = payload.debugTrace as Array<{
      action: string;
      details?: {
        goalSignalsSnapshot?: {
          normalizedUserAnswers: Array<{
            questionId: string | null;
            signalKey: string | null;
            question: string;
            answer: string;
          }>;
          phase: string;
          missingCriticalSignals: string[];
          hasSufficientSignalsForPlanning: boolean;
          clarificationMode: string;
        };
      } | null;
    }>;
    const snapshot = payload.snapshot as {
      context: {
        goalSignalsSnapshot?: {
          normalizedUserAnswers: Array<{
            questionId: string | null;
            signalKey: string | null;
            question: string;
            answer: string;
          }>;
          readyToAdvance: boolean | null;
          clarifyConfidence: number | null;
          missingCriticalSignals: string[];
          hasSufficientSignalsForPlanning: boolean;
          clarificationMode: string;
        };
      };
    };

    const resumedEvent = debugTrace.find((event) => event.action === 'session.resumed');
    expect(resumedEvent?.details?.goalSignalsSnapshot).toMatchObject({
      phase: 'clarify',
      normalizedUserAnswers: [
        {
          questionId: 'clarify-r1-q-1',
          signalKey: 'current_baseline',
          question: 'Cual es tu punto de partida hoy respecto de este objetivo?',
          answer: 'nivel inicial bajo',
        },
        {
          questionId: 'clarify-r1-q-2',
          signalKey: 'timeframe',
          question: 'En que plazo queres ver un primer resultado claro?',
          answer: '12 semanas',
        },
        {
          questionId: 'clarify-r1-q-3',
          signalKey: 'constraints',
          question: 'Que limites reales de tiempo, energia o agenda tenemos que respetar?',
          answer: '6 horas por semana',
        },
      ],
      missingCriticalSignals: [],
      hasSufficientSignalsForPlanning: true,
      clarificationMode: 'sufficient',
    });
    expect(snapshot.context.goalSignalsSnapshot).toMatchObject({
      normalizedUserAnswers: [
        {
          questionId: 'clarify-r1-q-1',
          signalKey: 'current_baseline',
          question: 'Cual es tu punto de partida hoy respecto de este objetivo?',
          answer: 'nivel inicial bajo',
        },
        {
          questionId: 'clarify-r1-q-2',
          signalKey: 'timeframe',
          question: 'En que plazo queres ver un primer resultado claro?',
          answer: '12 semanas',
        },
        {
          questionId: 'clarify-r1-q-3',
          signalKey: 'constraints',
          question: 'Que limites reales de tiempo, energia o agenda tenemos que respetar?',
          answer: '6 horas por semana',
        },
      ],
      readyToAdvance: true,
      clarifyConfidence: 0.9,
      missingCriticalSignals: [],
      hasSufficientSignalsForPlanning: true,
      clarificationMode: 'sufficient',
    });
  });

  it('does not jump blindly to plan on empty resume and keeps the session waiting in clarify', () => {
    const payload = runScenario('resume_empty_skip');
    const firstResult = payload.firstResult as { status: string };
    const resumed = payload.resumed as {
      status: string;
      pendingQuestions: { questions: unknown[]; readyToAdvance: boolean } | null;
      package: Record<string, unknown> | null;
    };
    const debugTrace = payload.debugTrace as Array<{
      action: string;
      phase: string | null;
      details?: {
        goalSignalsSnapshot?: {
          missingCriticalSignals: string[];
          hasSufficientSignalsForPlanning: boolean;
          clarificationMode: string;
        };
      } | null;
    }>;
    const snapshot = payload.snapshot as {
      context: {
        goalSignalsSnapshot?: {
          missingCriticalSignals: string[];
          hasSufficientSignalsForPlanning: boolean;
          clarificationMode: string;
        };
      };
    };

    expect(firstResult.status).toBe('needs_input');
    expect(resumed.status).toBe('needs_input');
    expect(resumed.package).toBeNull();
    expect(resumed.pendingQuestions?.readyToAdvance).toBe(false);
    expect(resumed.pendingQuestions?.questions).toHaveLength(1);
    const resumedEvent = debugTrace.find((event) => event.action === 'session.resumed');
    expect(resumedEvent).toMatchObject({
      phase: 'clarify',
      details: {
        goalSignalsSnapshot: {
          missingCriticalSignals: ['timeframe', 'current_baseline', 'constraints'],
          hasSufficientSignalsForPlanning: false,
          clarificationMode: 'needs_input',
        },
      },
    });
    expect(snapshot.context.goalSignalsSnapshot).toMatchObject({
      missingCriticalSignals: ['timeframe', 'current_baseline', 'constraints'],
      hasSufficientSignalsForPlanning: false,
      clarificationMode: 'needs_input',
    });
  });

  it('still pauses for input when the last allowed clarify round returns questions', () => {
    const payload = runScenario('clarify_limit_pause');
    const result = payload.result as {
      status: string;
      pendingQuestions: { questions: unknown[]; readyToAdvance: boolean } | null;
    };

    expect(result.status).toBe('needs_input');
    expect(result.pendingQuestions?.readyToAdvance).toBe(false);
    expect(result.pendingQuestions?.questions).toHaveLength(1);
  });

  it('keeps clarify active after the limit when critical signals are still missing', () => {
    const payload = runScenario('clarify_limit_resume');
    const firstResult = payload.firstResult as { status: string };
    const resumed = payload.resumed as {
      status: string;
      pendingQuestions: { questions: unknown[]; readyToAdvance: boolean } | null;
    };

    expect(firstResult.status).toBe('needs_input');
    expect(resumed.status).toBe('needs_input');
    expect(resumed.pendingQuestions?.readyToAdvance).toBe(false);
    expect(resumed.pendingQuestions?.questions).toHaveLength(2);
  });

  it('preserves answers from different clarification rounds even if the model reuses q1/q2/q3 ids', () => {
    const payload = runScenario('reused_question_ids');
    const secondPause = payload.secondPause as {
      status: string;
      pendingQuestions: { questions: Array<{ id: string }> } | null;
    };
    const snapshot = payload.snapshot as {
      context: {
        userAnswers: Record<string, string>;
        clarificationRounds: Array<{ questions: Array<{ id: string }> }>;
      };
    };

    expect(secondPause.status).toBe('needs_input');
    expect(secondPause.pendingQuestions?.questions.every((question) => question.id.startsWith('clarify-r2-'))).toBe(true);
    expect(snapshot.context.clarificationRounds[0]?.questions[0]?.id).toBe('clarify-r1-q1');
    expect(snapshot.context.clarificationRounds[1]?.questions[0]?.id).toBe('clarify-r2-q1');
    expect(snapshot.context.userAnswers).toMatchObject({
      'Que tipo de trabajo remoto queres priorizar?': 'remoto',
      'Cual es tu situacion financiera actual?': 'sin ingresos',
      'Que plazo objetivo tenes para llegar a la meta?': '12 meses',
    });
  });

  it('persists debug trace and agent outcomes in snapshots used for resume', () => {
    const payload = runScenario('resume');
    const debugTrace = payload.debugTrace as Array<{ action: string }>;
    const snapshot = payload.snapshot as {
      debugTrace: Array<{ action: string }>;
      agentOutcomes: Array<{ agent: string; phase: string }>;
    };

    expect(debugTrace.some((event) => event.action === 'session.paused')).toBe(true);
    expect(debugTrace.some((event) => event.action === 'session.resumed')).toBe(true);
    expect(snapshot.debugTrace.some((event) => event.action === 'session.paused')).toBe(true);
    expect(snapshot.agentOutcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ agent: 'goal-interpreter', phase: 'interpret' }),
    ]));
  });

  it('persists goal signals snapshots across restore and resume', () => {
    const payload = runScenario('resume_restore');
    const firstResult = payload.firstResult as { status: string };
    const snapshot = payload.snapshot as {
      context: {
        goalSignalsSnapshot?: {
          informationGaps: string[];
          readyToAdvance: boolean | null;
          normalizedUserAnswers: Array<unknown>;
          missingCriticalSignals: string[];
          hasSufficientSignalsForPlanning: boolean;
          clarificationMode: string;
        };
      };
    };
    const restoredSnapshot = payload.restoredSnapshot as {
      context: {
        goalSignalsSnapshot?: {
          normalizedUserAnswers: Array<{
            questionId: string | null;
            signalKey: string | null;
            question: string;
            answer: string;
          }>;
          readyToAdvance: boolean | null;
          phase: string;
          missingCriticalSignals: string[];
          hasSufficientSignalsForPlanning: boolean;
          clarificationMode: string;
        };
      };
    };
    const resumed = payload.resumed as { status: string };

    expect(firstResult.status).toBe('needs_input');
    expect(snapshot.context.goalSignalsSnapshot).toMatchObject({
      informationGaps: ['timeframe', 'current_baseline', 'constraints'],
      readyToAdvance: false,
      normalizedUserAnswers: [],
      missingCriticalSignals: ['timeframe', 'current_baseline', 'constraints'],
      hasSufficientSignalsForPlanning: false,
      clarificationMode: 'needs_input',
    });
    expect(resumed.status).toBe('completed');
    expect(restoredSnapshot.context.goalSignalsSnapshot).toMatchObject({
      phase: 'done',
      readyToAdvance: true,
      missingCriticalSignals: [],
      hasSufficientSignalsForPlanning: true,
      clarificationMode: 'sufficient',
      normalizedUserAnswers: [
        {
          questionId: 'clarify-r1-q-1',
          signalKey: 'current_baseline',
          question: 'Cual es tu punto de partida hoy respecto de este objetivo?',
          answer: 'nivel inicial bajo',
        },
        {
          questionId: 'clarify-r1-q-2',
          signalKey: 'timeframe',
          question: 'En que plazo queres ver un primer resultado claro?',
          answer: '12 semanas',
        },
        {
          questionId: 'clarify-r1-q-3',
          signalKey: 'constraints',
          question: 'Que limites reales de tiempo, energia o agenda tenemos que respetar?',
          answer: '6 horas por semana',
        },
      ],
    });
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
    expect(result.scratchpad.filter((entry) => entry.phase === 'critique')).toHaveLength(2);
    expect(result.iterations).toBe(9);
  });

  it('preserves scheduler metadata when handing off to critic and packager', () => {
    const payload = runScenario('metadata');
    const criticInput = payload.criticInput as {
      scheduleQualityScore: number;
      unscheduledCount: number;
      scheduleTradeoffs: string[];
      goalSignalsSnapshot: {
        timeframe: string | null;
        clarificationMode: string;
        hasSufficientSignalsForPlanning: boolean;
        anchorTokens: string[];
      };
    };
    const packagerInput = payload.packagerInput as {
      context: {
        scheduleResult?: {
          qualityScore?: number;
          unscheduledCount?: number;
          tradeoffs?: Array<{ question_esAR: string }>;
        } | null;
      };
    };

    expect(criticInput).toMatchObject({
      scheduleQualityScore: 87,
      unscheduledCount: 2,
      scheduleTradeoffs: [
        expect.objectContaining({
          question_esAR: 'Preferis compactar la semana o dejar aire?',
        }),
      ],
      goalSignalsSnapshot: {
        timeframe: '12 semanas',
        clarificationMode: 'sufficient',
        hasSufficientSignalsForPlanning: true,
        anchorTokens: expect.arrayContaining(['mejorar', 'nivel']),
      },
    });
    expect(packagerInput.context.scheduleResult).toMatchObject({
      qualityScore: 87,
      unscheduledCount: 2,
      tradeoffs: [
        expect.objectContaining({
          question_esAR: 'Preferis compactar la semana o dejar aire?',
        }),
      ],
    });
  });

  it('emits high-value phase summaries in the debug trace', () => {
    const payload = runScenario('metadata');
    const debugTrace = payload.debugTrace as Array<{
      action: string;
      details?: Record<string, unknown> | null;
    }>;

    expect(debugTrace).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'interpret.summary',
        details: expect.objectContaining({
          partialKind: 'interpretation',
          normalizedGoal: 'Mejorar mi nivel actual en 12 semanas',
        }),
      }),
      expect.objectContaining({
        action: 'plan.summary',
        details: expect.objectContaining({
          partialKind: 'roadmap',
          phaseCount: 2,
        }),
      }),
      expect.objectContaining({
        action: 'check.summary',
        details: expect.objectContaining({
          partialKind: 'feasibility',
          availableHours: 18,
          requiredHours: 8,
        }),
      }),
      expect.objectContaining({
        action: 'schedule.summary',
        details: expect.objectContaining({
          partialKind: 'schedule',
          unscheduledCount: 2,
          solverStatus: 'optimal',
        }),
      }),
      expect.objectContaining({
        action: 'critic.report',
        details: expect.objectContaining({
          partialKind: 'critic_round',
        }),
      }),
      expect.objectContaining({
        action: 'publication.evaluated',
        details: expect.objectContaining({
          partialKind: 'publication',
          fallbackLedger: [],
        }),
      }),
    ]));
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
    const result = payload.result as {
      status: string;
      package: { qualityScore: number; warnings: string[] } | null;
      degraded: boolean;
      agentOutcomes: Array<{ agent: string; source: string; errorMessage: string | null }>;
    };

    expect(result.status).toBe('completed');
    expect(payload.fallbackCalled).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.package).not.toBeNull();
    expect(result.package?.qualityScore).toBeLessThanOrEqual(60);
    expect(result.package?.warnings).toContain(
      'Este plan se genero parcialmente con datos de respaldo y requiere revision antes de tomarlo como valido.',
    );
    expect(result.agentOutcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agent: 'goal-interpreter',
        source: 'fallback',
        errorMessage: 'boom',
      }),
    ]));
  });

  it('surfaces planner Unauthorized in agentOutcomes and keeps the degraded signal explicit', () => {
    const payload = runScenario('planner_unauthorized');
    const result = payload.result as {
      status: string;
      package: { qualityScore: number; warnings: string[] } | null;
      degraded: boolean;
      agentOutcomes: Array<{ agent: string; source: string; errorCode: string | null }>;
    };

    expect(result.status).toBe('failed');
    expect(result.degraded).toBe(true);
    expect(result.agentOutcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agent: 'planner',
        source: 'fallback',
        errorCode: 'UNAUTHORIZED',
      }),
    ]));
  });

  it('surfaces critic Unauthorized in agentOutcomes and keeps the degraded signal explicit', () => {
    const payload = runScenario('critic_unauthorized');
    const result = payload.result as {
      status: string;
      package: { qualityScore: number; warnings: string[] } | null;
      degraded: boolean;
      agentOutcomes: Array<{ agent: string; source: string; errorCode: string | null }>;
    };

    expect(result.status).toBe('failed');
    expect(result.degraded).toBe(true);
    expect(result.agentOutcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agent: 'critic',
        source: 'fallback',
        errorCode: 'UNAUTHORIZED',
      }),
    ]));
  });

  it('allows a validated planner fallback to publish when critic and package approve it', () => {
    const payload = runScenario('planner_validation_fallback_publishable');
    const result = payload.result as {
      status: string;
      degraded: boolean;
      publicationState: string;
      package: { publicationState: string; warnings: string[]; qualityScore: number } | null;
    };

    expect(result.status).toBe('completed');
    expect(result.degraded).toBe(true);
    expect(result.publicationState).toBe('ready');
    expect(result.package?.publicationState).toBe('publishable');
    expect(result.package?.warnings).toContain(
      'Este plan se genero parcialmente con datos de respaldo y requiere revision antes de tomarlo como valido.',
    );
    expect(result.package?.warnings).not.toContain(
      'No se puede publicar este plan: la revision critica fallo y hace falta regenerarlo con un proveedor que responda bien.',
    );
    expect(result.package?.qualityScore).toBe(60);
  });

  it('allows a finance planner timeout fallback to publish when signals were sufficient and critic approved the result', () => {
    const payload = runScenario('planner_timeout_fallback_publishable_finance');
    const result = payload.result as {
      status: string;
      degraded: boolean;
      publicationState: string;
      package: { publicationState: string; warnings: string[]; qualityScore: number } | null;
      blockingAgents?: Array<{ agent: string; errorMessage: string | null }>;
    };

    expect(result.status).toBe('completed');
    expect(result.degraded).toBe(true);
    expect(result.publicationState).toBe('ready');
    expect(result.package?.publicationState).toBe('publishable');
    expect(result.blockingAgents).toEqual([]);
    expect(result.package?.warnings).toContain(
      'Este plan se genero parcialmente con datos de respaldo y requiere revision antes de tomarlo como valido.',
    );
  });

  it('allows a finance planner validation fallback to publish when sufficient signals were already covered', () => {
    const payload = runScenario('planner_validation_fallback_publishable_finance');
    const result = payload.result as {
      status: string;
      degraded: boolean;
      publicationState: string;
      package: { publicationState: string; warnings: string[]; qualityScore: number } | null;
      blockingAgents?: Array<{ agent: string; errorMessage: string | null }>;
    };

    expect(result.status).toBe('completed');
    expect(result.degraded).toBe(true);
    expect(result.publicationState).toBe('ready');
    expect(result.package?.publicationState).toBe('publishable');
    expect(result.blockingAgents).toEqual([]);
    expect(result.package?.warnings).toContain(
      'Este plan se genero parcialmente con datos de respaldo y requiere revision antes de tomarlo como valido.',
    );
  });

  it('keeps requires_supervision ahead of generic planner degradation in health goals', () => {
    const payload = runScenario('health_requires_supervision_trace');
    const result = payload.result as {
      status: string;
      publicationState: string;
      failureCode: string | null;
      package: {
        publicationState: string;
        qualityIssues: Array<{ code: string }>;
      } | null;
      blockingAgents?: Array<{ agent: string }>;
    };

    expect(result.status).toBe('failed');
    expect(result.publicationState).toBe('blocked');
    expect(result.failureCode).toBe('requires_supervision');
    expect(result.package?.publicationState).toBe('requires_supervision');
    expect(result.package?.qualityIssues.map((issue) => issue.code)).toContain('HEALTH_SAFETY_SUPERVISION_MISSING');
    expect(result.blockingAgents).toEqual([]);
  });

  it('treats negated supervision wording as missing supervision in health goals', () => {
    const payload = runScenario('health_negated_supervision_trace');
    const result = payload.result as {
      status: string;
      publicationState: string;
      failureCode: string | null;
      package: {
        publicationState: string;
        warnings: string[];
      } | null;
      blockingAgents?: Array<{ agent: string }>;
    };

    expect(result.status).toBe('failed');
    expect(result.publicationState).toBe('blocked');
    expect(result.failureCode).toBe('requires_supervision');
    expect(result.package?.publicationState).toBe('requires_supervision');
    expect(result.package?.warnings).toContain(
      'No se puede publicar este plan de salud sin una referencia clara a seguimiento profesional o supervision clinica.',
    );
    expect(result.blockingAgents).toEqual([]);
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
