import { describe, expect, it } from 'vitest';

import {
  nextPhase,
  phaseProgressScore,
  requiresUserInput,
} from '../../src/lib/pipeline/v6/state-machine';
import {
  CriticReportSchema,
  FeasibilityReportSchema,
  OrchestratorContextSchema,
  GoalSignalsSnapshotSchema,
  OrchestratorStateSchema,
  type OrchestratorContext,
  type OrchestratorPhase,
  type OrchestratorState,
} from '../../src/lib/pipeline/v6/types';

function createState(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return OrchestratorStateSchema.parse({
    phase: 'interpret',
    iteration: 0,
    maxIterations: 20,
    clarifyRounds: 0,
    maxClarifyRounds: 3,
    revisionCycles: 0,
    maxRevisionCycles: 2,
    tokenBudget: {
      used: 0,
      limit: 1_000,
    },
    progressScore: 0,
    scratchpad: [],
    ...overrides,
  });
}

function createContext(overrides: Partial<OrchestratorContext> = {}): OrchestratorContext {
  return OrchestratorContextSchema.parse({
    goalText: 'Aprender guitarra',
    interpretation: null,
    clarificationRounds: [],
    userAnswers: {},
    userProfile: null,
    domainCard: null,
    strategicDraft: null,
    feasibilityReport: null,
    scheduleResult: null,
    criticReport: null,
    revisionHistory: [],
    finalPackage: null,
    ...overrides,
  });
}

function createGoalSignalsSnapshot(overrides: Record<string, unknown> = {}) {
  return GoalSignalsSnapshotSchema.parse({
    parsedGoal: 'Aprender guitarra',
    goalType: 'SKILL_ACQUISITION',
    riskFlags: ['LOW'],
    suggestedDomain: null,
    metric: null,
    timeframe: null,
    anchorTokens: [],
    informationGaps: ['timeframe', 'current_baseline', 'constraints'],
    clarifyConfidence: null,
    readyToAdvance: null,
    normalizedUserAnswers: [],
    missingCriticalSignals: ['timeframe', 'current_baseline', 'constraints'],
    hasSufficientSignalsForPlanning: false,
    clarificationMode: 'needs_input',
    degraded: false,
    fallbackCount: 0,
    phase: 'clarify',
    clarifyRounds: 1,
    ...overrides,
  });
}

describe('nextPhase', () => {
  it('interpret always transitions to clarify', () => {
    expect(nextPhase('interpret', createState(), createContext(), null)).toBe('clarify');
  });

  it('clarify transitions to plan only when the signal snapshot says planning is sufficient', () => {
    const context = createContext({
      interpretation: {
        parsedGoal: 'Aprender guitarra',
        goalType: 'SKILL_ACQUISITION',
        implicitAssumptions: [],
        ambiguities: ['horas disponibles'],
        riskFlags: ['LOW'],
        suggestedDomain: 'guitarra',
        confidence: 0.5,
      },
      goalSignalsSnapshot: createGoalSignalsSnapshot({
        informationGaps: [],
        missingCriticalSignals: [],
        hasSufficientSignalsForPlanning: true,
        clarificationMode: 'sufficient',
        readyToAdvance: true,
      }),
    });

    expect(nextPhase(
      'clarify',
      createState({ phase: 'clarify' }),
      context,
      {
        questions: [],
        reasoning: 'Hay contexto suficiente.',
        informationGaps: [],
        confidence: 0.8,
        readyToAdvance: true,
      },
    )).toBe('plan');
  });

  it('clarify stays in clarify when critical signals are still missing even if the round says ready', () => {
    expect(nextPhase(
      'clarify',
      createState({ phase: 'clarify', clarifyRounds: 1, maxClarifyRounds: 3 }),
      createContext({
        goalSignalsSnapshot: createGoalSignalsSnapshot({
          readyToAdvance: true,
          clarifyConfidence: 0.9,
        }),
      }),
      {
        questions: [],
        reasoning: 'El modelo no devolvio preguntas.',
        informationGaps: [],
        confidence: 0.9,
        readyToAdvance: true,
      },
    )).toBe('clarify');
  });

  it('clarify stays in clarify when degraded_skip is visible but critical signals are still missing', () => {
    expect(nextPhase(
      'clarify',
      createState({ phase: 'clarify', clarifyRounds: 2, maxClarifyRounds: 3 }),
      createContext({
        goalSignalsSnapshot: createGoalSignalsSnapshot({
          clarificationMode: 'degraded_skip',
        }),
      }),
      {
        questions: [{
          id: 'q-1',
          text: 'Cuantas horas tenes?',
          purpose: 'Dimensionar el plan',
          type: 'number',
        }],
        reasoning: 'Sigue faltando informacion.',
        informationGaps: ['constraints'],
        confidence: 0.2,
        readyToAdvance: false,
      },
    )).toBe('clarify');
  });

  it('clarify stays in clarify when maxClarifyRounds is reached but critical questions are still pending', () => {
    expect(nextPhase(
      'clarify',
      createState({ phase: 'clarify', clarifyRounds: 3, maxClarifyRounds: 3 }),
      createContext({
        goalSignalsSnapshot: createGoalSignalsSnapshot(),
      }),
      {
        questions: [{
          id: 'q-1',
          text: 'Cuantas horas tenes?',
          purpose: 'Dimensionar el plan',
          type: 'number',
        }],
        reasoning: 'Sigue faltando informacion.',
        informationGaps: ['constraints'],
        confidence: 0.2,
        readyToAdvance: false,
      },
    )).toBe('clarify');
  });

  it('plan always transitions to check', () => {
    expect(nextPhase('plan', createState({ phase: 'plan' }), createContext(), null)).toBe('check');
  });

  it('check transitions to schedule when feasible', () => {
    const report = FeasibilityReportSchema.parse({
      status: 'feasible',
      hoursBudget: { available: 20, required: 8, gap: 0 },
      energyAnalysis: { highEnergyNeeded: 3, highEnergyAvailable: 12 },
      conflicts: [],
      suggestions: [],
    });

    expect(nextPhase('check', createState({ phase: 'check' }), createContext(), report)).toBe('schedule');
  });

  it('check transitions to schedule with warning when tight', () => {
    const report = FeasibilityReportSchema.parse({
      status: 'tight',
      hoursBudget: { available: 12, required: 12, gap: 0 },
      energyAnalysis: { highEnergyNeeded: 4, highEnergyAvailable: 10 },
      conflicts: [],
      suggestions: [],
    });

    expect(nextPhase('check', createState({ phase: 'check' }), createContext(), report)).toBe('schedule');
  });

  it('check transitions to plan when infeasible and revisionCycles < max', () => {
    const report = FeasibilityReportSchema.parse({
      status: 'infeasible',
      hoursBudget: { available: 6, required: 12, gap: 6 },
      energyAnalysis: { highEnergyNeeded: 6, highEnergyAvailable: 4 },
      conflicts: [{
        description: 'Carga imposible.',
        severity: 'blocking',
        affectedPhases: ['phase-1'],
      }],
      suggestions: [],
    });

    expect(nextPhase(
      'check',
      createState({ phase: 'check', revisionCycles: 1, maxRevisionCycles: 2 }),
      createContext(),
      report,
    )).toBe('plan');
  });

  it('check transitions to package when infeasible and revisionCycles >= max', () => {
    const report = FeasibilityReportSchema.parse({
      status: 'infeasible',
      hoursBudget: { available: 6, required: 12, gap: 6 },
      energyAnalysis: { highEnergyNeeded: 6, highEnergyAvailable: 4 },
      conflicts: [{
        description: 'Carga imposible.',
        severity: 'blocking',
        affectedPhases: ['phase-1'],
      }],
      suggestions: [],
    });

    expect(nextPhase(
      'check',
      createState({ phase: 'check', revisionCycles: 2, maxRevisionCycles: 2 }),
      createContext(),
      report,
    )).toBe('package');
  });

  it('critique transitions to package when verdict is approve', () => {
    const report = CriticReportSchema.parse({
      overallScore: 90,
      findings: [],
      mustFix: [],
      shouldFix: [],
      verdict: 'approve',
      reasoning: 'Listo para empaquetar.',
    });

    expect(nextPhase('critique', createState({ phase: 'critique' }), createContext(), report)).toBe('package');
  });

  it('critique transitions to revise when verdict is revise and revisionCycles < max', () => {
    const report = CriticReportSchema.parse({
      overallScore: 60,
      findings: [{
        id: 'f-1',
        severity: 'critical',
        category: 'specificity',
        message: 'Faltan hitos.',
        suggestion: 'Agregar entregables.',
        affectedPhaseIds: ['phase-1'],
      }],
      mustFix: [{
        id: 'f-1',
        severity: 'critical',
        category: 'specificity',
        message: 'Faltan hitos.',
        suggestion: 'Agregar entregables.',
        affectedPhaseIds: ['phase-1'],
      }],
      shouldFix: [],
      verdict: 'revise',
      reasoning: 'Hay que revisar el plan.',
    });

    expect(nextPhase(
      'critique',
      createState({ phase: 'critique', revisionCycles: 0, maxRevisionCycles: 2 }),
      createContext(),
      report,
    )).toBe('revise');
  });

  it('critique transitions to package when verdict is revise and revisionCycles >= max', () => {
    const report = CriticReportSchema.parse({
      overallScore: 60,
      findings: [{
        id: 'f-1',
        severity: 'critical',
        category: 'specificity',
        message: 'Faltan hitos.',
        suggestion: 'Agregar entregables.',
        affectedPhaseIds: ['phase-1'],
      }],
      mustFix: [{
        id: 'f-1',
        severity: 'critical',
        category: 'specificity',
        message: 'Faltan hitos.',
        suggestion: 'Agregar entregables.',
        affectedPhaseIds: ['phase-1'],
      }],
      shouldFix: [],
      verdict: 'revise',
      reasoning: 'Hay que revisar el plan.',
    });

    expect(nextPhase(
      'critique',
      createState({ phase: 'critique', revisionCycles: 2, maxRevisionCycles: 2 }),
      createContext(),
      report,
    )).toBe('package');
  });

  it('critique transitions to clarify when verdict is rethink and clarifyRounds < max', () => {
    const report = CriticReportSchema.parse({
      overallScore: 45,
      findings: [{
        id: 'f-2',
        severity: 'warning',
        category: 'feasibility',
        message: 'Falta informacion del usuario.',
        suggestion: 'Preguntar disponibilidad real.',
        affectedPhaseIds: [],
      }],
      mustFix: [],
      shouldFix: [{
        id: 'f-2',
        severity: 'warning',
        category: 'feasibility',
        message: 'Falta informacion del usuario.',
        suggestion: 'Preguntar disponibilidad real.',
        affectedPhaseIds: [],
      }],
      verdict: 'rethink',
      reasoning: 'Hay que volver a aclarar.',
    });

    expect(nextPhase(
      'critique',
      createState({ phase: 'critique', clarifyRounds: 1, maxClarifyRounds: 3 }),
      createContext(),
      report,
    )).toBe('clarify');
  });

  it('critique transitions to package when verdict is rethink and clarifyRounds >= max', () => {
    const report = CriticReportSchema.parse({
      overallScore: 45,
      findings: [{
        id: 'f-2',
        severity: 'warning',
        category: 'feasibility',
        message: 'Falta informacion del usuario.',
        suggestion: 'Preguntar disponibilidad real.',
        affectedPhaseIds: [],
      }],
      mustFix: [],
      shouldFix: [{
        id: 'f-2',
        severity: 'warning',
        category: 'feasibility',
        message: 'Falta informacion del usuario.',
        suggestion: 'Preguntar disponibilidad real.',
        affectedPhaseIds: [],
      }],
      verdict: 'rethink',
      reasoning: 'Hay que volver a aclarar.',
    });

    expect(nextPhase(
      'critique',
      createState({ phase: 'critique', clarifyRounds: 3, maxClarifyRounds: 3 }),
      createContext(),
      report,
    )).toBe('package');
  });

  it('revise always transitions to critique', () => {
    expect(nextPhase('revise', createState({ phase: 'revise' }), createContext(), null)).toBe('critique');
  });

  it('package always transitions to done', () => {
    expect(nextPhase('package', createState({ phase: 'package' }), createContext(), null)).toBe('done');
  });

  it('forces package when iteration >= maxIterations', () => {
    expect(nextPhase(
      'interpret',
      createState({ iteration: 5, maxIterations: 5 }),
      createContext(),
      null,
    )).toBe('package');
  });

  it('forces package when tokenBudget exceeded', () => {
    expect(nextPhase(
      'plan',
      createState({
        phase: 'plan',
        tokenBudget: {
          used: 100,
          limit: 100,
        },
      }),
      createContext(),
      null,
    )).toBe('package');
  });
});

describe('requiresUserInput', () => {
  it('returns true only for clarify phase', () => {
    expect(requiresUserInput('clarify')).toBe(true);
  });

  it('returns false for all other phases', () => {
    const phases: OrchestratorPhase[] = [
      'interpret',
      'plan',
      'check',
      'schedule',
      'critique',
      'revise',
      'package',
      'done',
      'failed',
    ];

    for (const phase of phases) {
      expect(requiresUserInput(phase)).toBe(false);
    }
  });
});

describe('phaseProgressScore', () => {
  it('returns monotonically increasing scores across the phase sequence', () => {
    const phases: OrchestratorPhase[] = [
      'interpret',
      'clarify',
      'plan',
      'check',
      'schedule',
      'critique',
      'package',
      'done',
    ];

    const scores = phases.map((phase) => phaseProgressScore(phase));

    for (let index = 1; index < scores.length; index += 1) {
      expect(scores[index]).toBeGreaterThan(scores[index - 1]!);
    }
  });
});
