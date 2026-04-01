import { DateTime } from 'luxon';

import type { AgentRuntime } from '../../runtime/types';
import type { DomainKnowledgeCard } from '../../domain/domain-knowledge/bank';
import { getKnowledgeCard } from '../../domain/domain-knowledge/bank';
import { buildFallbackStrategy, generateStrategyWithSource } from '../shared/strategy';
import type { GoalClassification } from '../../domain/goal-taxonomy';
import { classifyGoal } from '../shared/classify';
import type { StrategyInput } from '../shared/phase-io';
import type { AvailabilityWindow, BlockedSlot } from '../../scheduler/types';
import { Scratchpad } from './scratchpad';
import { buildRevisionContext } from './prompts/critic-reasoning';
import { phaseProgressScore } from './state-machine';
import {
  GoalSignalsSnapshotSchema,
  PlanOrchestratorSnapshotAnySchema,
  PlanOrchestratorSnapshotSchema,
  PlanOrchestratorSnapshotV2Schema,
  normalizeGoalSignalKey,
} from './types';
import { PHASE_LABELS_ES } from '@lib/pipeline/v6/types';
import {
  type AgentExecutionOutcome,
  type GoalSignalKey,
  type ClarificationQuestion,
  type ClarificationRound,
  type CriticReport,
  type FeasibilityReport,
  type GoalInterpretation,
  type GoalSignalsSnapshot,
  type OrchestratorConfig,
  type OrchestratorContext,
  type OrchestratorDebugEvent,
  type OrchestratorDebugStatus,
  type OrchestratorPhase,
  type OrchestratorState,
  type PlanPackage,
  type ReasoningEntry,
  type ScheduleExecutionResult,
  type StrategicDraft,
  type UserProfileV5,
  type V6Agent,
  type V6AgentName,
  type V6MachineStateValue,
  type PlanOrchestratorSnapshot,
  type PlanOrchestratorSnapshotV2,
} from './types';
import { createV6GenerationActor } from './xstate/machine';
import { buildMachineRuntimeSnapshot, getMachineStateFromPhase } from './xstate/services';
import { getPublicPhaseFromMachineState, inferLegacyMachineState, parseMachineSnapshot, serializeMachineSnapshot } from './xstate/snapshot';
import type { V6MachineEvent } from './xstate/events';
import { extractQuotaFromError, formatQuotaMessage } from '../../runtime/quota-parser';
import { type QuotaInfo } from '../../runtime/quota-parser';

// ─── Public interfaces ──────────────────────────────────────────────────────

export interface UserContext {
  profile: UserProfileV5 | null;
  timezone: string;
  locale: string;
  availability?: AvailabilityWindow[];
  blocked?: BlockedSlot[];
}

export interface OrchestratorResult {
  status: 'completed' | 'needs_input' | 'failed';
  package: PlanPackage | null;
  pendingQuestions: ClarificationRound | null;
  scratchpad: ReasoningEntry[];
  tokensUsed: number;
  iterations: number;
  agentOutcomes: AgentExecutionOutcome[];
  degraded: boolean;
  publicationState?: 'ready' | 'blocked' | 'failed';
  failureCode?: 'requires_regeneration' | 'requires_supervision' | 'failed_for_quality_review' | null;
  blockingAgents?: AgentExecutionOutcome[];
  customMessage?: string;
}

export interface OrchestratorProgress {
  phase: OrchestratorPhase;
  iteration: number;
  maxIterations: number;
  progressScore: number;
  lastAction: string;
}

// ─── Default config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxIterations: 20,
  maxClarifyRounds: 3,
  maxRevisionCycles: 2,
  tokenBudgetLimit: 100_000,
  criticApprovalThreshold: 21,
  enableDomainExpert: true,
};

// ─── Stall detection ────────────────────────────────────────────────────────

const MAX_STALLED_ITERATIONS = 2;

// ─── Agent registry interface (minimal — handles missing registry gracefully) ─

interface AgentRegistryLike {
  get<TInput, TOutput>(name: V6AgentName): V6Agent<TInput, TOutput> | undefined;
  has(name: V6AgentName): boolean;
}

type ForceFinishReason = 'max_iterations' | 'token_budget' | 'stalled_progress';

interface AgentOutcomeDebugDetails {
  summaryEs?: string;
  action?: string;
  details?: Record<string, unknown> | null;
}

const AGENT_LABELS_ES: Record<V6AgentName, string> = {
  'goal-interpreter': 'interprete',
  clarifier: 'clarificador',
  planner: 'planificador',
  'feasibility-checker': 'verificador de factibilidad',
  scheduler: 'scheduler',
  critic: 'critico',
  'domain-expert': 'experto de dominio',
  packager: 'empaquetador',
};

const HEALTH_SAFETY_TERMS = /\b(medico|médico|profesional|supervision|supervisión|seguimiento(?:\s+clinico|\s+clínico)?|consulta|nutricion|nutrición|nutricionista|especialista|acompanamiento|acompañamiento)\b/;
const NEGATED_HEALTH_SAFETY_TERMS = [
  /\b(no|sin|ningun|ninguna|falta(?:n)?|carece(?:n)?|omite|omitir|evita(?:r)?|rechaza(?:r)?)\b.{0,60}\b(medico|médico|profesional|supervision|supervisión|seguimiento(?:\s+clinico|\s+clínico)?|consulta|nutricion|nutrición|nutricionista|especialista|acompanamiento|acompañamiento)\b/,
  /\b(medico|médico|profesional|supervision|supervisión|seguimiento(?:\s+clinico|\s+clínico)?|consulta|nutricion|nutrición|nutricionista|especialista|acompanamiento|acompañamiento)\b.{0,30}\b(no|sin|ausente|inexistente)\b/,
  /\bno\s+(?:tengo|hay|cuento|contamos|dispongo|dispone|quiero\s+basar)\b.{0,80}\b(medico|médico|profesional|supervision|supervisión|seguimiento(?:\s+clinico|\s+clínico)?|consulta|nutricion|nutrición|nutricionista|especialista|acompanamiento|acompañamiento)\b/,
];

// ─── Dynamic agent registry loader ──────────────────────────────────────────

async function loadRegistry(): Promise<AgentRegistryLike | null> {
  try {
    const { createDefaultRegistry } = await import('./agent-registry');
    return createDefaultRegistry();
  } catch {
    return null;
  }
}

// ─── Inline agent imports (fallback when registry is unavailable) ───────────

async function loadAgentDirect(name: V6AgentName): Promise<V6Agent<unknown, unknown> | null> {
  try {
    switch (name) {
      case 'goal-interpreter': {
        const mod = await import('./agents/goal-interpreter');
        return mod.goalInterpreterAgent as V6Agent<unknown, unknown>;
      }
      case 'clarifier': {
        const mod = await import('./agents/clarifier-agent');
        return mod.clarifierAgent as V6Agent<unknown, unknown>;
      }
      case 'feasibility-checker': {
        const mod = await import('./agents/feasibility-checker');
        return mod.feasibilityCheckerAgent as V6Agent<unknown, unknown>;
      }
      case 'critic': {
        const mod = await import('./agents/critic-agent');
        return mod.criticAgent as V6Agent<unknown, unknown>;
      }
      case 'scheduler': {
        const mod = await import('./agents/scheduler-agent');
        return mod.schedulerAgent as V6Agent<unknown, unknown>;
      }
      case 'packager': {
        const mod = await import('./agents/packager-agent');
        return mod.packagerAgent as V6Agent<unknown, unknown>;
      }
      case 'domain-expert': {
        const mod = await import('./agents/domain-expert');
        return mod.domainExpertAgent as V6Agent<unknown, unknown>;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ─── Classification builder ─────────────────────────────────────────────────

function buildClassification(interpretation: GoalInterpretation | null, goalText: string): GoalClassification {
  const heuristic = classifyGoal(goalText);
  return {
    goalType: interpretation?.goalType ?? heuristic.goalType,
    confidence: interpretation?.confidence ?? heuristic.confidence,
    risk: interpretation?.riskFlags[0] ?? heuristic.risk,
    extractedSignals: heuristic.extractedSignals,
  };
}

interface GenericGoalSignalAnchors {
  metric: string | null;
  timeframe: string | null;
  anchorTokens: string[];
}

const UNIVERSAL_CRITICAL_SIGNAL_ORDER: GoalSignalKey[] = [
  'metric',
  'success_criteria',
  'timeframe',
  'current_baseline',
  'constraints',
  'safety_context',
];

function hasMeaningfulText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

const GOAL_SIGNAL_STOPWORDS = new Set([
  'actual',
  'actuales',
  'actualmente',
  'alguna',
  'alguno',
  'algun',
  'ano',
  'anos',
  'aprovechar',
  'aproximadamente',
  'cada',
  'como',
  'con',
  'cuenta',
  'de',
  'del',
  'digamos',
  'el',
  'en',
  'es',
  'esta',
  'este',
  'flujo',
  'fuente',
  'fuentes',
  'generar',
  'habilidad',
  'habilidades',
  'hacer',
  'ingreso',
  'ingresos',
  'herramienta',
  'herramientas',
  'inconsistente',
  'inconsistentes',
  'total',
  'la',
  'las',
  'lograr',
  'los',
  'me',
  'mes',
  'meses',
  'meta',
  'mi',
  'mis',
  'no',
  'obtener',
  'objetivo',
  'para',
  'pero',
  'plata',
  'por',
  'prefiere',
  'prefieres',
  'preferir',
  'priorizar',
  'puede',
  'puedes',
  'que',
  'quiero',
  'recurso',
  'recursos',
  'se',
  'semana',
  'semanas',
  'ser',
  'soy',
  'su',
  'tengo',
  'tener',
  'tipo',
  'tu',
  'un',
  'una',
  'usd',
  'y',
  'ya',
]);

const GOAL_SIGNAL_TECH_TOKENS = new Set([
  'aws',
  'backend',
  'css',
  'frontend',
  'gcp',
  'github',
  'html',
  'java',
  'javascript',
  'linkedin',
  'nextjs',
  'node',
  'nodejs',
  'php',
  'portfolio',
  'portafolio',
  'python',
  'react',
  'remote',
  'remoto',
  'sql',
  'typescript',
]);

function normalizeGoalSignalText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function canonicalizeGoalSignalToken(token: string): string {
  const normalized = normalizeGoalSignalText(token);

  switch (normalized) {
    case '3k':
      return '3000';
    case 'ar$':
    case 'ars':
    case 'peso':
    case 'pesos':
      return 'pesos';
    case 'dolar':
    case 'dolares':
    case 'us':
    case 'us$':
      return 'usd';
    case 'pizzas':
      return 'pizza';
    case 'pastas':
      return 'pasta';
    case 'clientes':
      return 'cliente';
    case 'entrevistas':
      return 'entrevista';
    case 'nodejs':
      return 'node';
    case 'reactjs':
      return 'react';
    default:
      return normalized;
  }
}

function tokenizeGoalSignalText(value: string): string[] {
  return uniqueNonEmpty(
    normalizeGoalSignalText(value).match(/[a-z0-9.+#-]+/g) ?? [],
  )
    .map((token) => canonicalizeGoalSignalToken(token))
    .filter((token) => token.length >= 2)
    .filter((token) => !GOAL_SIGNAL_STOPWORDS.has(token));
}

function extractMatchedFragment(values: string[], pattern: RegExp): string | null {
  for (const value of values) {
    const match = value.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

function collectBestMatchedGoalSignalValue(values: string[], patterns: RegExp[]): string | null {
  let bestMatch: { fragment: string; surroundingNoise: number; valueLength: number; index: number } | null = null;

  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (!match) {
        continue;
      }

      const fragment = match[0];
      const candidate = {
        fragment,
        surroundingNoise: Math.max(0, value.length - fragment.length),
        valueLength: value.length,
        index,
      };

      if (
        !bestMatch
        || candidate.surroundingNoise < bestMatch.surroundingNoise
        || (
          candidate.surroundingNoise === bestMatch.surroundingNoise
          && candidate.valueLength < bestMatch.valueLength
        )
        || (
          candidate.surroundingNoise === bestMatch.surroundingNoise
          && candidate.valueLength === bestMatch.valueLength
          && candidate.index < bestMatch.index
        )
      ) {
        bestMatch = candidate;
      }
    }
  }

  return bestMatch?.fragment ?? null;
}

function extractGoalSignalAnchors(goalText: string, answers: Record<string, string>): GenericGoalSignalAnchors {
  const answerValues = uniqueNonEmpty(Object.values(answers));
  const metric = extractMatchedFragment(
    [goalText],
    /\b\d+(?:[.,]\d+)?k?\s*(?:usd|us\$|dolar(?:es)?|ars|ar\$|peso(?:s)?|kg|kilos?|lb|lbs|cm|m|%|por ciento|paginas?|libros?|veces?|clientes?|entrevistas?)\b/i,
  ) ?? collectBestMatchedGoalSignalValue(answerValues, [
    /\b\d+(?:[.,]\d+)?k?\s*(?:usd|us\$|dolar(?:es)?|ars|ar\$|peso(?:s)?|kg|kilos?|lb|lbs|cm|m|%|por ciento|paginas?|libros?|veces?|clientes?|entrevistas?)\b/i,
  ]);
  const timeframe = extractMatchedFragment(
    [goalText],
    /\b\d+\s*(?:a[ñn]o|a[ñn]os|ano|anos|mes|meses|semana|semanas|year|years|month|months|week|weeks)\b/i,
  ) ?? collectBestMatchedGoalSignalValue(answerValues, [
    /\b\d+\s*(?:a[ñn]o|a[ñn]os|ano|anos|mes|meses|semana|semanas|year|years|month|months|week|weeks)\b/i,
  ]);
  const metricTokens = new Set(metric ? tokenizeGoalSignalText(metric) : []);
  const timeframeTokens = new Set(timeframe ? tokenizeGoalSignalText(timeframe) : []);
  const goalTokens = new Set(tokenizeGoalSignalText(goalText));
  const tokenScores = new Map<string, number>();

  for (const answerValue of answerValues) {
    const tokens = tokenizeGoalSignalText(answerValue);
    const isShortAnswer = tokens.length > 0 && tokens.length <= 4;

    for (const token of tokens) {
      if (metricTokens.has(token) || timeframeTokens.has(token) || /^\d+(?:\.\d+)?$/.test(token)) {
        continue;
      }

      let score = isShortAnswer ? 3 : 1;
      if (goalTokens.has(token)) score += 2;
      if (GOAL_SIGNAL_TECH_TOKENS.has(token)) score += 3;
      if (token.length >= 6) score += 2;
      else if (token.length >= 4) score += 1;

      tokenScores.set(token, (tokenScores.get(token) ?? 0) + score);
    }
  }

  const rankedTokens = [...tokenScores.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length || left[0].localeCompare(right[0]))
    .map(([token]) => token);
  const fallbackGoalTokens = [...goalTokens].filter((token) =>
    !metricTokens.has(token)
    && !timeframeTokens.has(token)
    && !/^\d+(?:\.\d+)?$/.test(token),
  );

  return {
    metric,
    timeframe,
    anchorTokens: uniqueNonEmpty(rankedTokens.length > 0 ? rankedTokens : fallbackGoalTokens).slice(0, 6),
  };
}

function includesAnyPattern(values: string[], pattern: RegExp): boolean {
  return values.some((value) => pattern.test(value));
}

// ─── PlanOrchestrator ───────────────────────────────────────────────────────

export class PlanOrchestrator {
  private registry: AgentRegistryLike | null = null;
  private machine = createV6GenerationActor({
    restoredStateValue: 'interpret',
    runtime: {
      iteration: 0,
      maxIterations: DEFAULT_CONFIG.maxIterations,
      clarifyRounds: 0,
      maxClarifyRounds: DEFAULT_CONFIG.maxClarifyRounds,
      revisionCycles: 0,
      maxRevisionCycles: DEFAULT_CONFIG.maxRevisionCycles,
      tokenBudgetUsed: 0,
      tokenBudgetLimit: DEFAULT_CONFIG.tokenBudgetLimit,
      progressScore: 0,
      goalSignalsSnapshot: null,
      pendingQuestionCount: 0,
      lastClarifyReadyToAdvance: null,
      lastFeasibilityStatus: null,
      lastCritiqueVerdict: null,
      publicationState: null,
    },
  });
  private state: OrchestratorState;
  private context: OrchestratorContext;
  private scratchpad: Scratchpad;
  private config: OrchestratorConfig;
  private brainRuntime: AgentRuntime;
  private fastRuntime: AgentRuntime;
  private lastAction = '';
  private pendingAnswers: Record<string, string> | null = null;
  private clarificationSkipRequested = false;
  private progressHistory: number[] = [];
  private agentOutcomes: AgentExecutionOutcome[] = [];
  private debugTrace: OrchestratorDebugEvent[] = [];
  private debugSequence = 0;
  private brainRuntimeLabel: string;
  private debugListener?: (event: OrchestratorDebugEvent) => void;

  private getPlanningDomainLabel(): string | null {
    return this.context.interpretation?.suggestedDomain ?? null;
  }

  constructor(
    config: Partial<OrchestratorConfig>,
    brainRuntime: AgentRuntime,
    fastRuntime?: AgentRuntime,
    runtimeLabel = 'unknown',
    debugListener?: (event: OrchestratorDebugEvent) => void,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.brainRuntime = brainRuntime;
    this.fastRuntime = fastRuntime ?? brainRuntime;
    this.brainRuntimeLabel = runtimeLabel;
    this.debugListener = debugListener;
    this.scratchpad = new Scratchpad();

    this.state = {
      phase: 'interpret' as OrchestratorPhase,
      iteration: 0,
      maxIterations: this.config.maxIterations,
      clarifyRounds: 0,
      maxClarifyRounds: this.config.maxClarifyRounds,
      revisionCycles: 0,
      maxRevisionCycles: this.config.maxRevisionCycles,
      tokenBudget: { used: 0, limit: this.config.tokenBudgetLimit },
      progressScore: 0,
      scratchpad: [],
    };

    this.context = {
      goalText: '',
      interpretation: null,
      clarificationRounds: [],
      userAnswers: {},
      goalSignalsSnapshot: GoalSignalsSnapshotSchema.parse({
        parsedGoal: null,
        goalType: null,
        riskFlags: [],
        suggestedDomain: null,
        metric: null,
        timeframe: null,
        anchorTokens: [],
        informationGaps: [],
        clarifyConfidence: null,
        readyToAdvance: null,
        normalizedUserAnswers: [],
        missingCriticalSignals: [],
        hasSufficientSignalsForPlanning: false,
        clarificationMode: 'needs_input',
        degraded: false,
        fallbackCount: 0,
        phase: this.state.phase,
        clarifyRounds: this.state.clarifyRounds,
      }),
      userProfile: null,
      domainCard: null,
      strategicDraft: null,
      feasibilityReport: null,
      scheduleResult: null,
      criticReport: null,
      revisionHistory: [],
      finalPackage: null,
      availability: [],
      blocked: [],
    };
  }

  private rebuildMachine(
    restoredStateValue: V6MachineStateValue,
    publicationState: 'ready' | 'blocked' | 'failed' | null = null,
  ): void {
    this.machine.stop();
    this.machine = createV6GenerationActor({
      restoredStateValue,
      runtime: buildMachineRuntimeSnapshot({
        state: this.state,
        context: this.context,
        publicationState,
      }),
    });
    this.syncPublicPhaseFromMachine();
  }

  private getMachineStateValue(): V6MachineStateValue {
    return this.machine.getSnapshot().value as V6MachineStateValue;
  }

  private syncPublicPhaseFromMachine(): void {
    this.state.phase = getPublicPhaseFromMachineState(this.getMachineStateValue(), this.state.phase);
  }

  private buildMachineRuntime(publicationState: 'ready' | 'blocked' | 'failed' | null = null) {
    return buildMachineRuntimeSnapshot({
      state: this.state,
      context: this.context,
      publicationState,
    });
  }

  private sendMachine(event: V6MachineEvent): void {
    this.machine.send(event);
    this.syncPublicPhaseFromMachine();
  }

  private completeCurrentPhase(phase: OrchestratorPhase, publicationState: 'ready' | 'blocked' | 'failed' | null = null): void {
    const runtime = this.buildMachineRuntime(publicationState);
    switch (phase) {
      case 'interpret':
        this.sendMachine({ type: 'INTERPRET_COMPLETED', runtime });
        return;
      case 'clarify':
        this.sendMachine({ type: 'CLARIFY_COMPLETED', runtime });
        return;
      case 'plan':
        this.sendMachine({ type: 'PLAN_COMPLETED', runtime });
        return;
      case 'check':
        this.sendMachine({ type: 'CHECK_COMPLETED', runtime });
        return;
      case 'schedule':
        this.sendMachine({ type: 'SCHEDULE_COMPLETED', runtime });
        return;
      case 'critique':
        this.sendMachine({ type: 'CRITIQUE_COMPLETED', runtime });
        return;
      case 'revise':
        this.sendMachine({ type: 'REVISE_COMPLETED', runtime });
        return;
      case 'package':
        this.sendMachine({ type: 'PACKAGE_COMPLETED', runtime });
        return;
      default:
        return;
    }
  }

  static restore(
    snapshot: PlanOrchestratorSnapshot,
    brainRuntime: AgentRuntime,
    fastRuntime?: AgentRuntime,
    runtimeLabel = 'unknown',
    debugListener?: (event: OrchestratorDebugEvent) => void,
  ): PlanOrchestrator {
    const parsed = PlanOrchestratorSnapshotAnySchema.parse(snapshot);
    const orchestrator = new PlanOrchestrator(parsed.config, brainRuntime, fastRuntime, runtimeLabel, debugListener);

    orchestrator.state = {
      ...parsed.state,
      tokenBudget: { ...parsed.state.tokenBudget },
      scratchpad: parsed.state.scratchpad.map((entry) => ({ ...entry })),
    };
    orchestrator.context = {
      ...parsed.context,
      interpretation: parsed.context.interpretation ? { ...parsed.context.interpretation } : null,
      clarificationRounds: parsed.context.clarificationRounds.map((round) => ({
        ...round,
        questions: round.questions.map((question) => ({ ...question })),
        informationGaps: [...round.informationGaps],
      })),
      userAnswers: { ...parsed.context.userAnswers },
      goalSignalsSnapshot: parsed.context.goalSignalsSnapshot
        ? structuredClone(parsed.context.goalSignalsSnapshot)
        : undefined,
      userProfile: parsed.context.userProfile
        ? {
          ...parsed.context.userProfile,
          fixedCommitments: [...parsed.context.userProfile.fixedCommitments],
          scheduleConstraints: [...parsed.context.userProfile.scheduleConstraints],
        }
        : null,
      domainCard: parsed.context.domainCard ? structuredClone(parsed.context.domainCard) : null,
      strategicDraft: parsed.context.strategicDraft ? structuredClone(parsed.context.strategicDraft) : null,
      feasibilityReport: parsed.context.feasibilityReport ? structuredClone(parsed.context.feasibilityReport) : null,
      scheduleResult: parsed.context.scheduleResult ? structuredClone(parsed.context.scheduleResult) : null,
      criticReport: parsed.context.criticReport ? structuredClone(parsed.context.criticReport) : null,
      revisionHistory: parsed.context.revisionHistory.map((entry) => structuredClone(entry)),
      finalPackage: parsed.context.finalPackage ? structuredClone(parsed.context.finalPackage) : null,
      availability: (parsed.context.availability ?? []).map((entry) => ({ ...entry })),
      blocked: (parsed.context.blocked ?? []).map((entry) => ({ ...entry })),
    };
    orchestrator.scratchpad.restore(parsed.scratchpad);
    orchestrator.lastAction = parsed.lastAction;
    orchestrator.pendingAnswers = parsed.pendingAnswers ? { ...parsed.pendingAnswers } : null;
    orchestrator.clarificationSkipRequested = parsed.context.goalSignalsSnapshot?.clarificationMode === 'degraded_skip';
    orchestrator.progressHistory = [...parsed.progressHistory];
    orchestrator.agentOutcomes = (parsed.agentOutcomes ?? []).map((outcome) => ({ ...outcome }));
    orchestrator.debugTrace = (parsed.debugTrace ?? []).map((event) => structuredClone(event));
    orchestrator.debugSequence = orchestrator.debugTrace.reduce(
      (max, event) => Math.max(max, event.sequence),
      0,
    );
    orchestrator.syncGoalSignalsSnapshot();
    const restoredMachineState = 'schemaVersion' in parsed
      ? parseMachineSnapshot(parsed.machine).state
      : inferLegacyMachineState({
        phase: orchestrator.state.phase,
        clarifyRounds: orchestrator.state.clarifyRounds,
        pendingAnswers: orchestrator.pendingAnswers,
      });
    const publicationState = restoredMachineState === 'blocked'
      ? 'blocked'
      : restoredMachineState === 'done'
        ? 'ready'
        : null;
    orchestrator.rebuildMachine(restoredMachineState, publicationState);

    return orchestrator;
  }

  // ─── Main entry point ───────────────────────────────────────────────────

  async run(goalText: string, userCtx: UserContext): Promise<OrchestratorResult> {
    this.initializeContext(goalText, userCtx);
    this.state.phase = 'interpret';
    this.rebuildMachine('interpret');
    this.registry = await loadRegistry();
    this.recordDebugEvent({
      category: 'lifecycle',
      action: 'run.started',
      summary_es: `Inicio de corrida para el objetivo "${goalText}".`,
      phase: 'interpret',
      agent: this.phaseToAgent('interpret'),
      details: {
        runtimeLabel: this.brainRuntimeLabel,
        timezone: userCtx.timezone,
        locale: userCtx.locale,
      },
    });

    return this.executeLoop();
  }

  // ─── Resume after user provides clarification answers ───────────────────

  async resume(answers: Record<string, string>): Promise<OrchestratorResult> {
    this.registry = await loadRegistry();
    const storedAnswers = this.mapAnswersToStoredAnswers(answers);
    this.context.userAnswers = { ...this.context.userAnswers, ...storedAnswers };

    const hasActualAnswers = Object.values(answers).some((answer) => answer.trim().length > 0);
    this.pendingAnswers = hasActualAnswers ? answers : null;
    this.clarificationSkipRequested = !hasActualAnswers;

    const goalSignalsSnapshot = this.syncGoalSignalsSnapshot();

    this.recordDebugEvent({
      category: 'lifecycle',
      action: 'session.resumed',
      summary_es: hasActualAnswers
        ? `Se retomó la sesión con ${Object.keys(answers).length} respuesta(s) nuevas.`
        : 'Se retomó la sesión sin respuestas nuevas; el pipeline sigue con el contexto actual.',
      phase: this.state.phase,
      agent: this.phaseToAgent(this.state.phase),
      details: {
        answersCount: Object.keys(answers).length,
        answeredQuestionIds: Object.keys(answers),
        storedAnswerKeys: Object.keys(storedAnswers),
        goalSignalsSnapshot,
      },
    });

    if (hasActualAnswers) {
      this.sendMachine({
        type: 'ANSWERS_SUBMITTED',
        runtime: this.buildMachineRuntime(),
      });
    } else {
      this.sendMachine({
        type: 'INPUT_SKIPPED',
        runtime: this.buildMachineRuntime(),
      });
    }

    return this.executeLoop();
  }

  // ─── Progress for SSE polling ───────────────────────────────────────────

  getProgress(): OrchestratorProgress {
    return {
      phase: this.state.phase,
      iteration: this.state.iteration,
      maxIterations: this.state.maxIterations,
      progressScore: this.state.progressScore,
      lastAction: this.lastAction,
    };
  }

  getDebugTrace(): OrchestratorDebugEvent[] {
    return this.debugTrace.map((event) => structuredClone(event));
  }

  getDebugStatus(): OrchestratorDebugStatus {
    const fallbackCount = this.getFallbackOutcomes().length;
    const lastEvent = this.debugTrace.at(-1) ?? null;
    const machineState = this.getMachineStateValue();
    const currentPhase = this.state.phase ?? null;
    const currentAgent = lastEvent?.agent ?? (currentPhase ? this.phaseToAgent(currentPhase) : null);
    const lifecycle = machineState === 'done'
      ? 'completed'
      : machineState === 'failed' || machineState === 'blocked'
        ? 'failed'
        : machineState === 'paused_for_input'
          ? 'paused_for_input'
          : 'running';
    const canEvaluatePublication = machineState === 'done'
      || machineState === 'failed'
      || machineState === 'blocked'
      || this.context.finalPackage !== null;
    const publicationGate = canEvaluatePublication ? this.getPublicationGate() : null;

    return {
      lifecycle,
      currentPhase,
      currentAgent,
      currentAction: lastEvent?.action ?? `phase.${currentPhase ?? 'idle'}`,
      currentSummary_es: lastEvent?.summary_es ?? (currentPhase ? `Pipeline en ${PHASE_LABELS_ES[currentPhase]}.` : 'Pipeline inactivo.'),
      iteration: this.state.iteration,
      revisionCycles: this.state.revisionCycles,
      clarifyRounds: this.state.clarifyRounds,
      progressScore: this.state.progressScore,
      degraded: fallbackCount > 0,
      fallbackCount,
      publicationState: publicationGate?.publicationState ?? null,
      failureCode: publicationGate?.failureCode ?? null,
      lastEventSequence: lastEvent?.sequence ?? 0,
      lastEventTimestamp: lastEvent?.timestamp ?? null,
      lastEventSummary_es: lastEvent?.summary_es ?? null,
    };
  }

  getSnapshot(): PlanOrchestratorSnapshot {
    const goalSignalsSnapshot = this.syncGoalSignalsSnapshot();

    return {
      schemaVersion: 2,
      config: { ...this.config },
      state: {
        ...this.state,
        tokenBudget: { ...this.state.tokenBudget },
        scratchpad: this.state.scratchpad.map((entry) => ({ ...entry })),
      },
      context: {
        ...this.context,
        interpretation: this.context.interpretation ? { ...this.context.interpretation } : null,
        clarificationRounds: this.context.clarificationRounds.map((round) => ({
          ...round,
          questions: round.questions.map((question) => ({ ...question })),
          informationGaps: [...round.informationGaps],
        })),
        userAnswers: { ...this.context.userAnswers },
        goalSignalsSnapshot: structuredClone(goalSignalsSnapshot),
        userProfile: this.context.userProfile
          ? {
            ...this.context.userProfile,
            fixedCommitments: [...this.context.userProfile.fixedCommitments],
            scheduleConstraints: [...this.context.userProfile.scheduleConstraints],
          }
          : null,
        domainCard: this.context.domainCard ? structuredClone(this.context.domainCard) : null,
        strategicDraft: this.context.strategicDraft ? structuredClone(this.context.strategicDraft) : null,
        feasibilityReport: this.context.feasibilityReport ? structuredClone(this.context.feasibilityReport) : null,
        scheduleResult: this.context.scheduleResult ? structuredClone(this.context.scheduleResult) : null,
        criticReport: this.context.criticReport ? structuredClone(this.context.criticReport) : null,
        revisionHistory: this.context.revisionHistory.map((entry) => structuredClone(entry)),
        finalPackage: this.context.finalPackage ? structuredClone(this.context.finalPackage) : null,
        availability: (this.context.availability ?? []).map((entry) => ({ ...entry })),
        blocked: (this.context.blocked ?? []).map((entry) => ({ ...entry })),
      },
      scratchpad: this.scratchpad.getAll(),
      lastAction: this.lastAction,
      pendingAnswers: this.pendingAnswers ? { ...this.pendingAnswers } : null,
      progressHistory: [...this.progressHistory],
      agentOutcomes: this.agentOutcomes.map((outcome) => ({ ...outcome })),
      debugTrace: this.debugTrace.map((event) => structuredClone(event)),
      machine: serializeMachineSnapshot(this.machine),
    } as PlanOrchestratorSnapshotV2;
  }

  // ─── Core loop ──────────────────────────────────────────────────────────

  private async executeLoop(): Promise<OrchestratorResult> {
    while (!['done', 'blocked', 'failed'].includes(this.getMachineStateValue())) {
      // Safety valve: force finish
      const forceFinishReason = this.getForceFinishReason();
      if (forceFinishReason) {
        this.recordDebugEvent({
          category: 'lifecycle',
          action: 'safety.force_finish',
          summary_es: this.buildForceFinishSummaryEs(forceFinishReason),
          phase: this.state.phase,
          agent: this.phaseToAgent(this.state.phase),
          details: {
            reason: forceFinishReason,
            iteration: this.state.iteration,
            progressHistory: [...this.progressHistory],
            tokenBudgetUsed: this.state.tokenBudget.used,
            tokenBudgetLimit: this.state.tokenBudget.limit,
          },
        });
        this.sendMachine({
          type: 'FORCE_PACKAGE',
          runtime: this.buildMachineRuntime(),
        });
      }

      if (this.getMachineStateValue() === 'paused_for_input') {
        this.syncPublicPhaseFromMachine();
        return this.pauseForInput();
      }

      const activePhase = this.state.phase;

      this.recordDebugEvent({
        category: 'phase',
        action: 'phase.enter',
        summary_es: this.buildPhaseEnterSummaryEs(activePhase),
        phase: activePhase,
        agent: this.phaseToAgent(activePhase),
      });

      // Execute the current phase
      let result: unknown;
      const phaseStart = Date.now();
      try {
        result = await this.executePhase(activePhase);
      } catch (error) {
        const errorMessage = this.getErrorMessage(error);
        this.recordAgentOutcome(
          this.phaseToAgent(activePhase),
          activePhase,
          'fallback',
          Date.now() - phaseStart,
          error,
          {
            summaryEs: `La fase ${PHASE_LABELS_ES[this.state.phase]} falló con ${this.getErrorCode(error)} y el proceso se detiene.`,
            action: 'phase.exception',
            details: {
              errorMessage,
            },
          },
        );
        this.recordEntry(activePhase, this.phaseToAgent(activePhase), {
          action: `FAILURE in ${activePhase}`,
          reasoning: this.formatDiagnosticReasoning(error),
          result: errorMessage,
        });
        this.haltPipeline('system_exception', errorMessage, this.phaseToAgent(activePhase));
        this.sendMachine({
          type: 'FAIL',
          runtime: this.buildMachineRuntime('failed'),
        });
        continue;
      }

      const previousClarificationRounds = this.context.clarificationRounds.map((round) => structuredClone(round));
      const previousCriticReport = this.context.criticReport ? structuredClone(this.context.criticReport) : null;

      // Record in scratchpad
      this.recordEntry(activePhase, this.phaseToAgent(activePhase), {
        action: `Executed ${activePhase}`,
        reasoning: this.extractReasoning(result),
        result: this.summarizeResult(result),
      });

      // Update context with result
      this.mergeResult(activePhase, result);
      this.syncGoalSignalsSnapshot();
      this.recordPhaseSpecificDebug(activePhase, result, {
        previousClarificationRounds,
        previousCriticReport,
      });

      // Safety Gate: disabled — plans are always generated regardless of health risk flags.


      // Determine next phase
      const previousPhase = activePhase;
      this.state.iteration++;

      // Sync scratchpad entries into state
      this.state.tokenBudget.used = this.scratchpad.totalTokens();
      this.state.scratchpad = this.scratchpad.getAll();
      this.syncGoalSignalsSnapshot();
      this.completeCurrentPhase(
        activePhase,
        activePhase === 'package' ? this.getPublicationGate().publicationState : null,
      );
      this.updateProgressScore(previousPhase, this.state.phase);
      this.recordPhaseTransition(previousPhase, this.state.phase, result);
    }

    return this.buildFinalResult();
  }

  // ─── Initialization ─────────────────────────────────────────────────────

  private initializeContext(goalText: string, userCtx: UserContext): void {
    this.context.goalText = goalText;
    this.context.interpretation = null;
    this.context.clarificationRounds = [];
    this.context.userAnswers = {};
    this.context.goalSignalsSnapshot = undefined;
    this.context.userProfile = userCtx.profile;
    this.context.domainCard = null;
    this.context.strategicDraft = null;
    this.context.feasibilityReport = null;
    this.context.scheduleResult = null;
    this.context.criticReport = null;
    this.context.revisionHistory = [];
    this.context.finalPackage = null;
    this.context.availability = userCtx.availability ?? this.buildDefaultAvailability();
    this.context.blocked = userCtx.blocked ?? [];
    this.state.iteration = 0;
    this.state.clarifyRounds = 0;
    this.state.revisionCycles = 0;
    this.state.progressScore = 0;
    this.progressHistory = [];
    this.agentOutcomes = [];
    this.debugTrace = [];
    this.debugSequence = 0;
    this.lastAction = '';
    this.pendingAnswers = null;
    this.clarificationSkipRequested = false;
    this.scratchpad.restore([]);
    this.syncGoalSignalsSnapshot();
  }

  private buildDefaultAvailability(): AvailabilityWindow[] {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    return days.map((day) => ({ day, startTime: '07:00', endTime: '22:00' }));
  }

  // ─── Safety valves ──────────────────────────────────────────────────────

  private getForceFinishReason(): ForceFinishReason | null {
    // Max iterations
    if (this.state.iteration >= this.state.maxIterations) {
      return 'max_iterations';
    }

    // Token budget
    if (this.state.tokenBudget.used >= this.state.tokenBudget.limit) {
      return 'token_budget';
    }

    // Stalled progress: no increase in 3+ consecutive iterations.
    // Exempt phases that legitimately loop without increasing the public
    // progress score: clarify waits for user input, and critique/revise can
    // bounce while the critic verifies whether the latest revision fixed the
    // issues. Those loops are already bounded elsewhere.
    const STALL_WINDOW = Math.max(MAX_STALLED_ITERATIONS, 3);
    if (
      this.progressHistory.length >= STALL_WINDOW
      && this.state.phase !== 'package'
      && this.state.phase !== 'done'
      && this.state.phase !== 'clarify'
      && this.state.phase !== 'critique'
      && this.state.phase !== 'revise'
    ) {
      const recent = this.progressHistory.slice(-STALL_WINDOW);
      const allSame = recent.every((score) => score <= recent[0]);
      if (allSame) {
        return 'stalled_progress';
      }
    }

    return null;
  }

  // ─── User input management ──────────────────────────────────────────────

  private hasPendingAnswers(): boolean {
    if (this.pendingAnswers !== null) {
      return Object.values(this.pendingAnswers).some((answer) => answer.trim().length > 0);
    }

    // First clarify round always executes to generate questions
    if (this.state.clarifyRounds === 0) {
      return true;
    }

    return false;
  }

  private mapAnswersToStoredAnswers(answers: Record<string, string>): Record<string, string> {
    const storedAnswers: Record<string, string> = {};
    const latestRound = this.context.clarificationRounds.at(-1) ?? null;
    const questionLabels = new Map(
      (latestRound?.questions ?? []).map((question) => [question.id, question.text.trim()] as const),
    );

    for (const [questionId, answer] of Object.entries(answers)) {
      const trimmedAnswer = answer.trim();
      if (!trimmedAnswer) {
        continue;
      }

      const questionLabel = questionLabels.get(questionId) ?? questionId;
      storedAnswers[questionLabel] = trimmedAnswer;
    }

    return storedAnswers;
  }

  private namespaceClarificationRound(round: ClarificationRound): ClarificationRound {
    if (round.questions.length === 0) {
      return round;
    }

    const roundPrefix = `clarify-r${this.state.clarifyRounds}-`;
    return {
      ...round,
      questions: round.questions.map((question, index) => ({
        ...question,
        id: question.id.startsWith(roundPrefix)
          ? question.id
          : `${roundPrefix}${question.id || `q${index + 1}`}`,
      })),
    };
  }

  private syncGoalSignalsSnapshot(): GoalSignalsSnapshot {
    const fallbackCount = this.getFallbackOutcomes().length;
    const snapshot = GoalSignalsSnapshotSchema.parse({
      ...this.buildGoalSignalsSnapshot(),
      degraded: fallbackCount > 0,
      fallbackCount,
      phase: this.state.phase,
      clarifyRounds: this.state.clarifyRounds,
    });

    this.context.goalSignalsSnapshot = snapshot;
    return snapshot;
  }

  private buildGoalSignalsSnapshot(): Omit<
    GoalSignalsSnapshot,
    'degraded' | 'fallbackCount' | 'phase' | 'clarifyRounds'
  > {
    const latestClarification = this.context.clarificationRounds.at(-1) ?? null;
    const normalizedUserAnswers = this.buildNormalizedUserAnswers();
    const anchors = extractGoalSignalAnchors(this.context.goalText, this.context.userAnswers);
    const missingCriticalSignals = this.buildMissingCriticalSignals(anchors, normalizedUserAnswers);
    const hasSufficientSignalsForPlanning = missingCriticalSignals.length === 0;
    const clarificationMode = hasSufficientSignalsForPlanning
      ? 'sufficient'
      : this.clarificationSkipRequested
        ? 'degraded_skip'
        : 'needs_input';

    return {
      parsedGoal: this.context.interpretation?.parsedGoal ?? null,
      goalType: this.context.interpretation?.goalType ?? null,
      riskFlags: this.context.interpretation?.riskFlags ?? [],
      suggestedDomain: this.context.interpretation?.suggestedDomain ?? null,
      metric: anchors.metric,
      timeframe: anchors.timeframe,
      anchorTokens: anchors.anchorTokens,
      informationGaps: missingCriticalSignals.length > 0
        ? missingCriticalSignals
        : latestClarification?.informationGaps
        ?? this.context.interpretation?.ambiguities
        ?? [],
      clarifyConfidence: latestClarification?.confidence ?? null,
      readyToAdvance: latestClarification?.readyToAdvance ?? null,
      normalizedUserAnswers,
      missingCriticalSignals,
      hasSufficientSignalsForPlanning,
      clarificationMode,
    };
  }

  private buildMissingCriticalSignals(
    anchors: GenericGoalSignalAnchors,
    normalizedUserAnswers: GoalSignalsSnapshot['normalizedUserAnswers'],
  ): GoalSignalKey[] {
    const normalizedGoalText = normalizeGoalSignalText(this.context.goalText);
    const normalizedParsedGoal = normalizeGoalSignalText(this.context.interpretation?.parsedGoal ?? '');
    const normalizedAnswerTexts = normalizedUserAnswers
      .map((entry) => normalizeGoalSignalText(entry.answer))
      .filter((value) => value.length > 0);
    const requiredSignals = new Set(this.getRequiredCriticalSignals(anchors));
    const answeredSignals = new Set(
      normalizedUserAnswers
        .map((entry) => entry.signalKey)
        .filter((signalKey): signalKey is GoalSignalKey => signalKey !== null),
    );
    const hasBaselineEvidence = answeredSignals.has('current_baseline')
      || includesAnyPattern(normalizedAnswerTexts, /\b(actual|actualmente|hoy|ahora|partida|punto de partida|nivel|experiencia|principiante|intermedio|avanzado|sin ingresos|ninguno|ninguna|cero|0)\b/)
      || /\b(actual|actualmente|hoy|ahora|principiante|intermedio|avanzado)\b/.test(normalizedGoalText);
    const hasConstraintEvidence = answeredSignals.has('constraints')
      || this.context.userProfile !== null
      || (this.context.blocked?.length ?? 0) > 0
      || includesAnyPattern(normalizedAnswerTexts, /\b(hora|horas|tiempo|agenda|disponibilidad|limite|limitado|restriccion|restricciones|energia|presupuesto|trabajo|familia|fin de semana|finde)\b/);
    const hasSuccessCriteriaEvidence = answeredSignals.has('success_criteria')
      || hasMeaningfulText(anchors.metric)
      || normalizedParsedGoal.length >= 8;
    const hasSafetyEvidence = !this.requiresSafetyContext()
      || answeredSignals.has('safety_context')
      || includesAnyPattern(
        [normalizedGoalText, normalizedParsedGoal, ...normalizedAnswerTexts],
        /\b(supervision|supervision profesional|medico|medica|profesional|contraindic|lesion|riesgo|abogado|legal|deuda|medicacion|terapia|diagnostico)\b/,
      );
    const hasSignal: Record<GoalSignalKey, boolean> = {
      metric: answeredSignals.has('metric') || hasMeaningfulText(anchors.metric),
      timeframe: answeredSignals.has('timeframe') || hasMeaningfulText(anchors.timeframe),
      current_baseline: hasBaselineEvidence,
      success_criteria: hasSuccessCriteriaEvidence,
      constraints: hasConstraintEvidence,
      modality: answeredSignals.has('modality'),
      resources: answeredSignals.has('resources'),
      safety_context: hasSafetyEvidence,
    };

    return UNIVERSAL_CRITICAL_SIGNAL_ORDER.filter((signalKey) =>
      requiredSignals.has(signalKey) && !hasSignal[signalKey],
    );
  }

  private getRequiredCriticalSignals(anchors: GenericGoalSignalAnchors): GoalSignalKey[] {
    return [
      this.context.interpretation?.goalType === 'QUANT_TARGET_TRACKING' || hasMeaningfulText(anchors.metric)
        ? 'metric'
        : 'success_criteria',
      'timeframe',
      'current_baseline',
      'constraints',
    ];
  }

  private requiresSafetyContext(): boolean {
    return (this.context.interpretation?.riskFlags ?? []).some((riskFlag) => riskFlag.startsWith('HIGH_'));
  }

  private buildNormalizedUserAnswers(): GoalSignalsSnapshot['normalizedUserAnswers'] {
    const questionTextById = new Map<string, string>();
    const questionSignalById = new Map<string, GoalSignalKey | null>();
    const questionIdByNormalizedText = new Map<string, string>();

    for (const round of this.context.clarificationRounds) {
      for (const [index, question] of round.questions.entries()) {
        const trimmedQuestion = question.text.trim();
        const signalKey = normalizeGoalSignalKey(round.informationGaps[index] ?? null);
        questionTextById.set(question.id, trimmedQuestion);
        questionSignalById.set(question.id, signalKey);
        questionIdByNormalizedText.set(this.normalizeDebugText(trimmedQuestion), question.id);
      }
    }

    const normalizedAnswers = Object.entries(this.context.userAnswers)
      .filter(([, answer]) => typeof answer === 'string' && answer.trim().length > 0)
      .map(([key, answer]) => {
        const questionId = questionTextById.has(key)
          ? key
          : questionIdByNormalizedText.get(this.normalizeDebugText(key)) ?? null;
        const question = questionId ? (questionTextById.get(questionId) ?? key) : key;
        const signalKey = questionId
          ? (questionSignalById.get(questionId) ?? null)
          : normalizeGoalSignalKey(key);

        return {
          key,
          questionId,
          signalKey,
          question,
          answer: answer.trim(),
        };
      });

    const dedupedAnswers: GoalSignalsSnapshot['normalizedUserAnswers'] = [];
    const seenSignals = new Set<GoalSignalKey>();

    for (let index = normalizedAnswers.length - 1; index >= 0; index -= 1) {
      const entry = normalizedAnswers[index]!;
      if (entry.signalKey && seenSignals.has(entry.signalKey)) {
        continue;
      }

      if (entry.signalKey) {
        seenSignals.add(entry.signalKey);
      }

      dedupedAnswers.unshift(entry);
    }

    return dedupedAnswers;
  }

  private pauseForInput(): OrchestratorResult {
    const lastClarification = this.context.clarificationRounds.length > 0
      ? this.context.clarificationRounds[this.context.clarificationRounds.length - 1]
      : null;
    const hasFallbacks = this.agentOutcomes.some((outcome) => outcome.source === 'fallback');

    this.recordDebugEvent({
      category: 'lifecycle',
      action: 'session.paused',
      summary_es: lastClarification
        ? `El pipeline quedó pausado esperando ${lastClarification.questions.length} respuesta(s) de aclaración.`
        : 'El pipeline quedó pausado esperando información adicional.',
      phase: 'clarify',
      agent: 'clarifier',
      details: {
        questionCount: lastClarification?.questions.length ?? 0,
        questions: lastClarification?.questions ?? [],
        informationGaps: lastClarification?.informationGaps ?? [],
        goalSignalsSnapshot: this.syncGoalSignalsSnapshot(),
      },
    });

    return {
      status: 'needs_input',
      package: null,
      pendingQuestions: lastClarification,
      scratchpad: this.scratchpad.getAll(),
      tokensUsed: this.scratchpad.totalTokens(),
      iterations: this.state.iteration,
      agentOutcomes: [...this.agentOutcomes],
      degraded: hasFallbacks,
    };
  }

  // ─── Phase execution ────────────────────────────────────────────────────

  private buildPhaseEnterSummaryEs(phase: OrchestratorPhase): string {
    switch (phase) {
      case 'interpret':
        return 'Arranca la interpretacion del objetivo.';
      case 'clarify':
        return this.pendingAnswers && Object.keys(this.pendingAnswers).length > 0
          ? 'Se estan procesando las respuestas de aclaracion.'
          : 'Se estan preparando preguntas de aclaracion.';
      case 'plan':
        return 'Se esta armando el plan estrategico.';
      case 'check':
        return 'Se esta chequeando la factibilidad del plan.';
      case 'schedule':
        return 'Se esta resolviendo el calendario de actividades.';
      case 'critique':
        return 'Se esta ejecutando la revision critica del plan.';
      case 'revise':
        return 'Se esta corrigiendo el plan a partir de la critica.';
      case 'package':
        return 'Se esta empaquetando el resultado final.';
      case 'done':
        return 'El pipeline llego al cierre.';
      case 'failed':
        return 'El pipeline entro en estado de falla.';
      default:
        return 'El pipeline cambio de fase.';
    }
  }

  private buildForceFinishSummaryEs(reason: ForceFinishReason): string {
    switch (reason) {
      case 'max_iterations':
        return 'Se alcanzo el limite de iteraciones y se fuerza el empaquetado.';
      case 'token_budget':
        return 'Se alcanzo el presupuesto de tokens y se fuerza el empaquetado.';
      case 'stalled_progress':
        return 'El progreso quedo estancado y se fuerza el empaquetado.';
      default:
        return 'Se activo un corte de seguridad y se fuerza el empaquetado.';
    }
  }

  private buildTransitionSummaryEs(
    previousPhase: OrchestratorPhase,
    next: OrchestratorPhase,
    result: unknown,
  ): string {
    if (previousPhase === 'clarify' && next === 'plan') {
      if (
        this.context.goalSignalsSnapshot?.clarificationMode === 'degraded_skip'
        && !this.context.goalSignalsSnapshot.hasSufficientSignalsForPlanning
      ) {
        return 'La aclaracion cierra en modo degradado: el usuario eligio seguir aunque faltan senales criticas.';
      }

      return 'La aclaracion alcanzo contexto suficiente y el pipeline avanza a planificacion.';
    }

    if (previousPhase === 'clarify' && next === 'clarify') {
      const questionCount = (result as ClarificationRound | null)?.questions?.length ?? 0;
      return `Todavia faltan respuestas; se mantiene la aclaracion con ${questionCount} pregunta(s) pendientes.`;
    }

    if (previousPhase === 'critique' && next === 'revise') {
      const report = result as CriticReport | null;
      return `El critico pidio otra vuelta (score ${report?.overallScore ?? '?'}/100, must-fix ${report?.mustFix.length ?? 0}).`;
    }

    if (previousPhase === 'revise' && next === 'critique') {
      return 'La revision volvio a critica para validar la nueva version del plan.';
    }

    if (previousPhase === 'package' && next === 'done') {
      return 'El paquete final quedo listo para resolver la publicacion.';
    }

    return `El pipeline avanzo de ${PHASE_LABELS_ES[previousPhase]} a ${PHASE_LABELS_ES[next]}.`;
  }

  private recordPhaseSpecificDebug(
    phase: OrchestratorPhase,
    result: unknown,
    previous: {
      previousClarificationRounds: ClarificationRound[];
      previousCriticReport: CriticReport | null;
    },
  ): void {
    if (phase === 'interpret') {
      const interpretation = result as GoalInterpretation;
      this.recordDebugEvent({
        category: 'phase',
        action: 'interpret.summary',
        summary_es: `Objetivo interpretado como ${interpretation.goalType} con confianza ${Math.round(interpretation.confidence * 100)}%.`,
        phase,
        agent: 'goal-interpreter',
        details: {
          partialKind: 'interpretation',
          normalizedGoal: interpretation.parsedGoal,
          goalType: interpretation.goalType,
          suggestedDomain: interpretation.suggestedDomain,
          confidence: interpretation.confidence,
          ambiguities: interpretation.ambiguities.slice(0, 4),
          assumptions: interpretation.implicitAssumptions.slice(0, 4),
          riskFlags: interpretation.riskFlags.slice(0, 4),
          goalSignalsSnapshot: this.syncGoalSignalsSnapshot(),
        },
      });
      return;
    }

    if (phase === 'clarify') {
      const clarification = result as ClarificationRound;
      const knownAnswers = this.buildKnownAnswersSummary();
      const duplicateQuestions = this.findDuplicateQuestions(
        previous.previousClarificationRounds,
        clarification,
      );
      this.recordDebugEvent({
        category: 'phase',
        action: 'clarify.summary',
        summary_es: clarification.readyToAdvance
          ? 'La aclaracion ya tiene contexto suficiente para avanzar.'
          : `La aclaracion deja ${clarification.questions.length} pregunta(s) pendiente(s).`,
        phase,
        agent: 'clarifier',
        details: {
          partialKind: 'clarification',
          readyToAdvance: clarification.readyToAdvance,
          confidence: clarification.confidence,
          questions: clarification.questions,
          informationGaps: clarification.informationGaps,
          knownAnswers,
          duplicateQuestions,
          reasoning: clarification.reasoning,
          goalSignalsSnapshot: this.syncGoalSignalsSnapshot(),
        },
      });
      return;
    }

    if (phase === 'plan' || phase === 'revise') {
      const draft = result as StrategicDraft;
      const latestPlannerEvent = this.findLatestAgentDebugEvent('planner', phase);
      const plannerFallback = this.findLatestOutcomeForAgent('planner', phase)?.source === 'fallback';
      this.recordDebugEvent({
        category: 'phase',
        action: phase === 'plan' ? 'plan.summary' : 'revise.summary',
        summary_es: phase === 'plan'
          ? `Roadmap generado con ${draft.phases.length} fase(s) y ${draft.milestones.length} hito(s).`
          : `Revision lista con ${draft.phases.length} fase(s) y ${draft.milestones.length} hito(s).`,
        phase,
        agent: 'planner',
        details: {
          partialKind: 'roadmap',
          horizonWeeks: draft.totalSpanWeeks ?? draft.phases.reduce((sum, item) => sum + Math.max(1, item.durationWeeks ?? 0), 0),
          phaseCount: draft.phases.length,
          phases: draft.phases.slice(0, 6).map((item, index) => ({
            index: index + 1,
            title: item.name,
            focus: item.focus_esAR,
            durationWeeks: item.durationWeeks ?? null,
          })),
          milestones: draft.milestones.slice(0, 6),
          fallbackUsed: plannerFallback,
          failedCheck: latestPlannerEvent?.details?.failedCheck ?? null,
          validationSummaryEs: latestPlannerEvent?.details?.validationSummaryEs ?? null,
          validationEvidence: latestPlannerEvent?.details?.validationEvidence ?? null,
          fallbackPublishability: plannerFallback ? 'pendiente_de_critica' : 'sin_fallback',
        },
      });
      return;
    }

    if (phase === 'check') {
      const report = result as FeasibilityReport;
      this.recordDebugEvent({
        category: 'phase',
        action: 'check.summary',
        summary_es: `Factibilidad ${report.status}: ${report.hoursBudget.available}h disponibles vs ${report.hoursBudget.required}h requeridas.`,
        phase,
        agent: 'feasibility-checker',
        details: {
          partialKind: 'feasibility',
          status: report.status,
          availableHours: report.hoursBudget.available,
          requiredHours: report.hoursBudget.required,
          gap: report.hoursBudget.gap,
          conflicts: report.conflicts.slice(0, 4).map((item) => ({
            severity: item.severity,
            description: item.description,
          })),
          adjustments: report.suggestions.slice(0, 4).map((item) => ({
            type: item.type,
            description: item.description,
            impact: item.impact,
          })),
        },
      });
      return;
    }

    if (phase === 'schedule') {
      const schedule = result as ScheduleExecutionResult | null;
      if (schedule === null) {
        this.recordDebugEvent({
          category: 'phase',
          action: 'schedule.summary',
          summary_es: 'La calendarizacion no devolvio un resultado util.',
          phase,
          agent: 'scheduler',
          details: {
            partialKind: 'schedule',
            solverStatus: null,
            fillRate: null,
            solverTimeMs: null,
            unscheduledCount: null,
            tradeoffs: [],
          },
        });
        return;
      }

      this.recordDebugEvent({
        category: 'phase',
        action: 'schedule.summary',
        summary_es: `Calendarizacion ${schedule.solverOutput.metrics?.solverStatus ?? 'sin solver'} con fill rate ${Math.round((schedule.solverOutput.metrics?.fillRate ?? 0) * 100)}%.`,
        phase,
        agent: 'scheduler',
        details: {
          partialKind: 'schedule',
          fillRate: schedule.solverOutput.metrics?.fillRate ?? null,
          solverStatus: schedule.solverOutput.metrics?.solverStatus ?? null,
          solverTimeMs: schedule.solverOutput.metrics?.solverTimeMs ?? null,
          unscheduledCount: schedule.unscheduledCount,
          tradeoffs: schedule.tradeoffs.slice(0, 4),
        },
      });
      return;
    }

    if (phase === 'critique') {
      const report = result as CriticReport;
      const scoreDelta = previous.previousCriticReport
        ? report.overallScore - previous.previousCriticReport.overallScore
        : null;
      const comparison = scoreDelta === null
        ? 'sin_base'
        : scoreDelta >= 10
          ? 'mejor'
          : scoreDelta <= -10
            ? 'peor'
            : 'similar';
      this.recordDebugEvent({
        category: 'critic',
        action: 'critic.report',
        summary_es: `El critico cerro la vuelta con verdict ${report.verdict} y score ${report.overallScore}/100.`,
        phase,
        agent: 'critic',
        details: {
          partialKind: 'critic_round',
          verdict: report.verdict,
          overallScore: report.overallScore,
          mustFix: report.mustFix,
          shouldFix: report.shouldFix.slice(0, 5),
          reasoning: report.reasoning,
          scoreDelta,
          comparison,
        },
      });
      return;
    }

    if (phase === 'package') {
      const pkg = result as PlanPackage | null;
      this.recordDebugEvent({
        category: 'phase',
        action: 'package.summary',
        summary_es: pkg
          ? `Empaquetado listo con score base ${pkg.qualityScore}/100 y ${pkg.warnings.length} advertencia(s).`
          : 'El empaquetado termino sin paquete final.',
        phase,
        agent: 'packager',
        details: {
          partialKind: 'package',
          packageReady: pkg !== null,
          qualityScore: pkg?.qualityScore ?? null,
          summary: pkg?.summary_esAR ?? null,
          warnings: pkg?.warnings.slice(0, 4) ?? [],
          qualityIssues: pkg?.qualityIssues?.slice(0, 4) ?? [],
          requestDomain: pkg?.requestDomain ?? null,
          packageDomain: pkg?.packageDomain ?? null,
        },
      });
    }
  }

  private buildKnownAnswersSummary(): Array<{ id: string; question: string; answer: string }> {
    const answers = Object.entries(this.context.userAnswers)
      .filter(([, answer]) => typeof answer === 'string' && answer.trim().length > 0);

    if (answers.length === 0) {
      return [];
    }

    const questionLabels = new Map<string, string>();
    for (const round of this.context.clarificationRounds) {
      for (const question of round.questions) {
        questionLabels.set(question.id, question.text.trim());
      }
    }

    return answers.slice(0, 6).map(([id, answer]) => ({
      id,
      question: questionLabels.get(id) ?? id,
      answer: answer.trim(),
    }));
  }

  private findDuplicateQuestions(
    previousRounds: ClarificationRound[],
    currentRound: ClarificationRound,
  ): Array<{ text: string; previousText: string }> {
    const priorQuestions = previousRounds.flatMap((round) => round.questions.map((question) => question.text));
    const normalizedPrior = priorQuestions.map((text) => ({
      original: text,
      normalized: this.normalizeDebugText(text),
    }));

    return currentRound.questions
      .map((question) => {
        const normalized = this.normalizeDebugText(question.text);
        const duplicate = normalizedPrior.find((item) => item.normalized === normalized);
        if (!duplicate) {
          return null;
        }

        return {
          text: question.text,
          previousText: duplicate.original,
        };
      })
      .filter((item): item is { text: string; previousText: string } => item !== null);
  }

  private normalizeDebugText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[¿?¡!.,:;()"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private findLatestAgentDebugEvent(
    agent: V6AgentName,
    phase: OrchestratorPhase,
  ): OrchestratorDebugEvent | null {
    for (let index = this.debugTrace.length - 1; index >= 0; index -= 1) {
      const event = this.debugTrace[index];
      if (event.agent === agent && event.phase === phase) {
        return event;
      }
    }

    return null;
  }

  private findLatestOutcomeForAgent(
    agent: V6AgentName,
    phase: OrchestratorPhase,
  ): AgentExecutionOutcome | null {
    for (let index = this.agentOutcomes.length - 1; index >= 0; index -= 1) {
      const outcome = this.agentOutcomes[index];
      if (outcome.agent === agent && outcome.phase === phase) {
        return outcome;
      }
    }

    return null;
  }

  private getFallbackLedger(): Array<{ agent: V6AgentName; phase: OrchestratorPhase; count: number; latestErrorCode: string | null; latestErrorMessage: string | null }> {
    const ledger = new Map<string, { agent: V6AgentName; phase: OrchestratorPhase; count: number; latestErrorCode: string | null; latestErrorMessage: string | null }>();

    for (const outcome of this.agentOutcomes) {
      if (outcome.source !== 'fallback') {
        continue;
      }

      const key = `${outcome.agent}:${outcome.phase}`;
      const current = ledger.get(key) ?? {
        agent: outcome.agent,
        phase: outcome.phase,
        count: 0,
        latestErrorCode: null,
        latestErrorMessage: null,
      };
      current.count += 1;
      current.latestErrorCode = outcome.errorCode;
      current.latestErrorMessage = outcome.errorMessage;
      ledger.set(key, current);
    }

    return Array.from(ledger.values()).sort((left, right) => right.count - left.count);
  }

  private recordPhaseTransition(
    previousPhase: OrchestratorPhase,
    next: OrchestratorPhase,
    result: unknown,
  ): void {
    this.recordDebugEvent({
      category: 'phase',
      action: 'phase.transition',
      summary_es: this.buildTransitionSummaryEs(previousPhase, next, result),
      phase: next,
      agent: next === 'done' || next === 'failed' ? null : this.phaseToAgent(next),
      details: {
        fromPhase: previousPhase,
        toPhase: next,
      },
    });
  }

  private async executePhase(phase: OrchestratorPhase): Promise<unknown> {
    switch (phase) {
      case 'interpret':
        return this.executeInterpret();
      case 'clarify':
        return this.executeClarify();
      case 'plan':
        return this.executePlan();
      case 'check':
        return this.executeCheck();
      case 'schedule':
        return this.executeSchedule();
      case 'critique':
        return this.executeCritique();
      case 'revise':
        return this.executeRevise();
      case 'package':
        return this.executePackage();
      default:
        return null;
    }
  }

  private async executeInterpret(): Promise<GoalInterpretation> {
    this.lastAction = 'Interpreting goal';
    this.recordDebugEvent({
      category: 'agent',
      action: 'agent.start',
      summary_es: 'El interprete empezo a desambiguar el objetivo.',
      phase: 'interpret',
      agent: 'goal-interpreter',
    });
    const agent = await this.getAgent<{ goalText: string }, GoalInterpretation>('goal-interpreter');
    const input = { goalText: this.context.goalText };
    const start = Date.now();

    if (agent) {
      try {
        const result = await agent.execute(input, this.fastRuntime);
        this.recordAgentOutcome('goal-interpreter', 'interpret', 'llm', Date.now() - start);
        return result;
      } catch (error) {
        return this.handleFallback('interpret', 'goal-interpreter', input, agent, start, error);
      }
    }

    // Minimal fallback if agent not available
    const missingAgentError = new Error('Agent not registered');
    this.recordAgentOutcome('goal-interpreter', 'interpret', 'fallback', Date.now() - start, missingAgentError);
    this.recordEntry('interpret', 'goal-interpreter', {
      action: 'FALLBACK: goal-interpreter',
      reasoning: this.formatDiagnosticReasoning(missingAgentError),
      result: 'Using inline fallback data - NOT from LLM',
    });
    return {
      parsedGoal: this.context.goalText,
      goalType: 'FINITE_PROJECT',
      confidence: 0.5,
      implicitAssumptions: [],
      ambiguities: [],
      riskFlags: ['LOW'],
      suggestedDomain: null,
    };
  }

  private buildDeterministicClarifierFallback(input: {
    goalSignalsSnapshot: GoalSignalsSnapshot;
  }): ClarificationRound {
    const templates: Record<GoalSignalKey, Omit<ClarificationQuestion, 'id'>> = {
      metric: {
        text: 'Que numero o resultado medible queres alcanzar?',
        purpose: 'Definir una meta observable para el plan',
        type: 'text',
      },
      timeframe: {
        text: 'En que plazo queres ver un primer resultado claro?',
        purpose: 'Ajustar el horizonte del plan',
        type: 'text',
      },
      current_baseline: {
        text: 'Cual es tu punto de partida hoy respecto de este objetivo?',
        purpose: 'Ubicar el nivel inicial real',
        type: 'text',
      },
      success_criteria: {
        text: 'Como vas a reconocer que este plan salio bien?',
        purpose: 'Alinear el criterio de exito',
        type: 'text',
      },
      constraints: {
        text: 'Que limites reales de tiempo, energia o agenda tenemos que respetar?',
        purpose: 'Evitar un plan imposible de sostener',
        type: 'text',
      },
      modality: {
        text: 'Que modalidad preferis para avanzar con este objetivo?',
        purpose: 'Elegir un formato de ejecucion realista',
        type: 'text',
      },
      resources: {
        text: 'Con que recursos concretos contas hoy para avanzar?',
        purpose: 'Ajustar el plan a los recursos reales disponibles',
        type: 'text',
      },
      safety_context: {
        text: 'Hay limites, riesgos o supervision profesional que debamos respetar antes de avanzar?',
        purpose: 'Cuidar el contexto de seguridad del plan',
        type: 'text',
      },
    };
    const missingSignals = input.goalSignalsSnapshot.missingCriticalSignals.slice(0, 3);

    if (missingSignals.length === 0) {
      return {
        questions: [],
        reasoning: 'No quedan senales criticas pendientes para planificar en modo best-effort.',
        informationGaps: [],
        confidence: 0.75,
        readyToAdvance: true,
      };
    }

    return {
      questions: missingSignals.map((signalKey, index) => ({
        id: `q${index + 1}`,
        ...templates[signalKey],
      })),
      reasoning: 'Faltan senales criticas universales antes de planificar con contexto suficiente.',
      informationGaps: missingSignals,
      confidence: 0.35,
      readyToAdvance: false,
    };
  }

  private async executeClarify(): Promise<ClarificationRound> {
    this.lastAction = 'Clarifying goal';
    this.state.clarifyRounds++;
    this.recordDebugEvent({
      category: 'agent',
      action: 'agent.start',
      summary_es: 'El clarificador esta evaluando si faltan datos antes de avanzar.',
      phase: 'clarify',
      agent: 'clarifier',
    });

    const agent = await this.getAgent<{
      interpretation: GoalInterpretation;
      previousAnswers: Record<string, string>;
      goalSignalsSnapshot: GoalSignalsSnapshot;
      profileSummary: string | null;
      skipClarification: boolean;
    }, ClarificationRound>('clarifier');

    const input = {
      interpretation: this.context.interpretation!,
      previousAnswers: this.context.userAnswers,
      goalSignalsSnapshot: this.syncGoalSignalsSnapshot(),
      profileSummary: this.context.userProfile
        ? `Horas libres L-V: ${this.context.userProfile.freeHoursWeekday}, finde: ${this.context.userProfile.freeHoursWeekend}, energia: ${this.context.userProfile.energyLevel}`
        : null,
      skipClarification: this.clarificationSkipRequested,
    };

    // Consume pending answers
    this.pendingAnswers = null;
    const start = Date.now();

    if (agent) {
      try {
        const result = this.namespaceClarificationRound(await agent.execute(input, this.brainRuntime));
        this.recordAgentOutcome('clarifier', 'clarify', 'llm', Date.now() - start);
        return result;
      } catch (error) {
        return this.namespaceClarificationRound(
          this.handleFallback('clarify', 'clarifier', input, agent, start, error),
        );
      }
    }

    // Fallback: keep the control plane conservative and let state-machine decide
    // whether a degraded skip can still proceed best-effort.
    const missingAgentError = new Error('Agent not registered');
    this.recordAgentOutcome('clarifier', 'clarify', 'fallback', Date.now() - start, missingAgentError);
    this.recordEntry('clarify', 'clarifier', {
      action: 'FALLBACK: clarifier',
      reasoning: this.formatDiagnosticReasoning(missingAgentError),
      result: 'Using inline fallback data - NOT from LLM',
    });
    return this.namespaceClarificationRound(this.buildDeterministicClarifierFallback(input));
  }

  private async executePlan(): Promise<StrategicDraft> {
    this.lastAction = 'Generating strategic plan';
    const domainContext = await this.resolvePlanningDomainContext();
    const goalSignalsSnapshot = this.syncGoalSignalsSnapshot();
    const start = Date.now();
    this.recordDebugEvent({
      category: 'agent',
      action: 'agent.start',
      summary_es: 'El planificador empezo a generar el roadmap estrategico.',
      phase: 'plan',
      agent: 'planner',
    });

    const planningDomainLabel = this.getPlanningDomainLabel();

    // Resolve domain card if available
    if (!this.context.domainCard && planningDomainLabel) {
      try {
        const card = await getKnowledgeCard(planningDomainLabel);
        if (card) {
          this.context.domainCard = card;
        }
      } catch (error) {
        void error;
        // Domain card lookup failed — proceed without it
      }
    }

    // Reuse v5 generateStrategy
    const profile = this.context.userProfile ?? {
      freeHoursWeekday: 2,
      freeHoursWeekend: 4,
      energyLevel: 'medium' as const,
      fixedCommitments: [],
      scheduleConstraints: [],
    };

    const strategyInput: StrategyInput = {
      goalText: this.context.goalText,
      profile,
      classification: buildClassification(this.context.interpretation, this.context.goalText),
      planningContext: {
        interpretation: this.context.interpretation
          ? {
            parsedGoal: this.context.interpretation.parsedGoal,
            implicitAssumptions: this.context.interpretation.implicitAssumptions,
          }
          : undefined,
        clarificationAnswers: this.context.userAnswers,
        goalSignalsSnapshot,
        domainContext,
      },
    };

    try {
      const strategyResult = await generateStrategyWithSource(
        this.brainRuntime,
        strategyInput,
        this.context.domainCard ?? undefined,
      );
      if (strategyResult.source === 'fallback') {
        const fallbackError = this.buildSyntheticAgentError(
          strategyResult.fallbackCode ?? 'PLANNER_FALLBACK',
          strategyResult.fallbackMessage ?? 'Planner fallback was used because the strategy generator did not return a publishable result.',
        );
        this.recordAgentOutcome('planner', 'plan', 'fallback', Date.now() - start, fallbackError, {
          summaryEs: strategyResult.validationSummaryEs
            ? `${strategyResult.validationSummaryEs} El proceso se detiene por falla en la validación.`
            : 'El planificador no devolvió un borrador publicable y el proceso se detiene.',
          details: {
            failedCheck: strategyResult.failedCheck ?? null,
            validationSummaryEs: strategyResult.validationSummaryEs ?? null,
            validationEvidence: strategyResult.validationEvidence ?? null,
          },
        });
        this.recordEntry('plan', 'planner', {
          action: 'FAILURE: planner validation',
          reasoning: this.formatDiagnosticReasoning(fallbackError),
          result: 'Pipeline halted due to planner validation failure.',
        });
        throw fallbackError;
      } else {
        this.recordAgentOutcome('planner', 'plan', 'llm', Date.now() - start);
      }
      return strategyResult.output;
    } catch (error) {
      if (this.isSyntheticAgentError(error)) {
        throw error; // Re-throw our validation failure
      }
      this.recordAgentOutcome('planner', 'plan', 'fallback', Date.now() - start, error, {
        summaryEs: 'El planificador falló de forma inesperada y el proceso se detiene.',
      });
      this.recordEntry('plan', 'planner', {
        action: 'FAILURE: planner exception',
        reasoning: this.formatDiagnosticReasoning(error),
        result: 'Pipeline halted due to unexpected planner exception.',
      });
      throw error;
    }
  }

  private async executeCheck(): Promise<FeasibilityReport> {
    this.lastAction = 'Checking feasibility';
    this.recordDebugEvent({
      category: 'agent',
      action: 'agent.start',
      summary_es: 'El verificador de factibilidad esta chequeando horas, energia y restricciones.',
      phase: 'check',
      agent: 'feasibility-checker',
    });

    const agent = await this.getAgent<{
      strategicDraft: StrategicDraft;
      freeHoursWeekday: number;
      freeHoursWeekend: number;
      energyPattern: string;
      fixedCommitments: string[];
      scheduleConstraints: string[];
    }, FeasibilityReport>('feasibility-checker');

    const profile = this.context.userProfile ?? {
      freeHoursWeekday: 2,
      freeHoursWeekend: 4,
      energyLevel: 'medium' as const,
      fixedCommitments: [] as string[],
      scheduleConstraints: [] as string[],
    };

    const input = {
      strategicDraft: this.context.strategicDraft!,
      freeHoursWeekday: profile.freeHoursWeekday,
      freeHoursWeekend: profile.freeHoursWeekend,
      energyPattern: profile.energyLevel,
      fixedCommitments: profile.fixedCommitments,
      scheduleConstraints: profile.scheduleConstraints,
    };

    const start = Date.now();

    if (agent) {
      try {
        const result = await agent.execute(input, this.fastRuntime);
        this.recordAgentOutcome('feasibility-checker', 'check', 'llm', Date.now() - start);
        return result;
      } catch (error) {
        return this.handleFallback('check', 'feasibility-checker', input, agent, start, error);
      }
    }

    // Fallback — optimistic
    const missingAgentError = new Error('Agent not registered');
    this.recordAgentOutcome('feasibility-checker', 'check', 'fallback', Date.now() - start, missingAgentError);
    this.recordEntry('check', 'feasibility-checker', {
      action: 'FALLBACK: feasibility-checker',
      reasoning: this.formatDiagnosticReasoning(missingAgentError),
      result: 'Using inline fallback data - NOT from LLM',
    });
    return {
      status: 'feasible',
      hoursBudget: {
        available: (profile.freeHoursWeekday * 5) + (profile.freeHoursWeekend * 2),
        required: 0,
        gap: 0,
      },
      energyAnalysis: { highEnergyNeeded: 0, highEnergyAvailable: 15 },
      conflicts: [],
      suggestions: [],
    };
  }

  private async executeSchedule(): Promise<ScheduleExecutionResult | null> {
    this.lastAction = 'Scheduling activities';
    this.recordDebugEvent({
      category: 'agent',
      action: 'agent.start',
      summary_es: 'El scheduler esta distribuyendo actividades en el calendario.',
      phase: 'schedule',
      agent: 'scheduler',
    });

    const agent = await this.getAgent<unknown, unknown>('scheduler');
    const profile = this.context.userProfile ?? {
      freeHoursWeekday: 2,
      freeHoursWeekend: 4,
      energyLevel: 'medium' as const,
      fixedCommitments: [] as string[],
      scheduleConstraints: [] as string[],
    };

    const input = {
      strategicDraft: this.context.strategicDraft!,
      userProfile: profile,
      availability: this.context.availability ?? this.buildDefaultAvailability(),
      blocked: this.context.blocked ?? [],
      domainCard: this.context.domainCard,
    };
    const start = Date.now();

    if (agent) {
      try {
        const result = await agent.execute(input, this.fastRuntime) as ScheduleExecutionResult;
        this.recordAgentOutcome('scheduler', 'schedule', 'deterministic', Date.now() - start);
        return result;
      } catch (error) {
        const fallbackResult = this.handleFallback('schedule', 'scheduler', input, agent, start, error) as ScheduleExecutionResult;
        return fallbackResult;
      }
    }

    // Scheduler not available — return null, downstream handles gracefully
    const missingAgentError = new Error('Agent not registered');
    this.recordAgentOutcome('scheduler', 'schedule', 'fallback', Date.now() - start, missingAgentError);
    this.recordEntry('schedule', 'scheduler', {
      action: 'FALLBACK: scheduler',
      reasoning: this.formatDiagnosticReasoning(missingAgentError),
      result: 'Using inline fallback data - NOT from LLM',
    });
    return null;
  }

  private async executeCritique(): Promise<CriticReport> {
    this.lastAction = 'Critiquing plan';
    this.recordDebugEvent({
      category: 'agent',
      action: 'agent.start',
      summary_es: 'El critico esta revisando calidad, factibilidad y especificidad del plan.',
      phase: 'critique',
      agent: 'critic',
    });

    const agent = await this.getAgent<{
      goalText: string;
      goalType: string;
      profileSummary: string;
      strategicDraft: Record<string, unknown>;
      scheduleQualityScore: number;
      unscheduledCount: number;
      scheduleTradeoffs: string[];
      goalSignalsSnapshot: GoalSignalsSnapshot;
      domainCard: DomainKnowledgeCard | null;
      previousCriticReports: CriticReport[];
    }, CriticReport>('critic');

    const profile = this.context.userProfile;
    const profileSummary = profile
      ? `Horas libres L-V: ${profile.freeHoursWeekday}, finde: ${profile.freeHoursWeekend}, energia: ${profile.energyLevel}, compromisos: ${profile.fixedCommitments.join(', ') || 'ninguno'}`
      : 'Perfil no disponible';
    const goalSignalsSnapshot = this.syncGoalSignalsSnapshot();

    const schedule = this.context.scheduleResult;
    const input = {
      goalText: this.context.goalText,
      goalType: this.context.interpretation?.goalType ?? 'FINITE_PROJECT',
      profileSummary,
      strategicDraft: (this.context.strategicDraft ?? {}) as Record<string, unknown>,
      scheduleQualityScore: schedule?.qualityScore ?? 0,
      unscheduledCount: schedule?.unscheduledCount ?? schedule?.solverOutput.unscheduled?.length ?? 0,
      scheduleTradeoffs: schedule?.tradeoffs ?? [],
      goalSignalsSnapshot,
      domainCard: this.context.domainCard,
      previousCriticReports: this.context.criticReport ? [this.context.criticReport] : [],
    };

    const start = Date.now();

    if (agent) {
      try {
        const result = await agent.execute(input, this.brainRuntime);
        this.recordAgentOutcome('critic', 'critique', 'llm', Date.now() - start);
        return result;
      } catch (error) {
        return this.handleFallback('critique', 'critic', input, agent, start, error);
      }
    }

    // Fallback — never approve; degrade explicitly.
    const missingAgentError = new Error('Agent not registered');
    this.recordAgentOutcome('critic', 'critique', 'fallback', Date.now() - start, missingAgentError);
    this.recordEntry('critique', 'critic', {
      action: 'FALLBACK: critic',
      reasoning: this.formatDiagnosticReasoning(missingAgentError),
      result: 'Using inline fallback data - NOT from LLM',
    });
    return this.buildCriticFallbackReport(this.context.goalText);
  }

  private async executeRevise(): Promise<StrategicDraft> {
    this.lastAction = 'Revising plan based on critic feedback';
    this.state.revisionCycles++;
    const start = Date.now();
    this.recordDebugEvent({
      category: 'agent',
      action: 'agent.start',
      summary_es: 'El planificador empezo una nueva vuelta de revision.',
      phase: 'revise',
      agent: 'planner',
    });

    // Record critic findings in revision history
    if (this.context.criticReport) {
      this.context.revisionHistory.push({
        findings: this.context.criticReport.mustFix,
        appliedFixes: [],
      });
    }

    const domainContext = await this.resolvePlanningDomainContext();
    const goalSignalsSnapshot = this.syncGoalSignalsSnapshot();

    const profile = this.context.userProfile ?? {
      freeHoursWeekday: 2,
      freeHoursWeekend: 4,
      energyLevel: 'medium' as const,
      fixedCommitments: [],
      scheduleConstraints: [],
    };

    const mustFixSummary = this.context.criticReport?.mustFix
      .map((f) => `[${f.category}] ${f.message}${f.suggestion ? ` → ${f.suggestion}` : ''}`)
      .join('\n') ?? '';

    const strategyInput: StrategyInput = {
      goalText: this.context.goalText,
      profile,
      classification: buildClassification(this.context.interpretation, this.context.goalText),
      planningContext: {
        interpretation: this.context.interpretation
          ? {
            parsedGoal: this.context.interpretation.parsedGoal,
            implicitAssumptions: this.context.interpretation.implicitAssumptions,
          }
          : undefined,
        clarificationAnswers: this.context.userAnswers,
        goalSignalsSnapshot,
        domainContext,
        previousCriticFindings: (void mustFixSummary, this.context.criticReport?.mustFix ?? []),
        previousCriticReports: this.context.criticReport ? [this.context.criticReport] : [],
      },
    };

    try {
      const strategyResult = await generateStrategyWithSource(
        this.brainRuntime,
        strategyInput,
        this.context.domainCard ?? undefined,
      );
      if (strategyResult.source === 'fallback') {
        const fallbackError = this.buildSyntheticAgentError(
          strategyResult.fallbackCode ?? 'PLANNER_FALLBACK',
          strategyResult.fallbackMessage ?? 'Planner fallback was used during revision because the strategy generator did not return a publishable result.',
        );
        this.recordAgentOutcome('planner', 'revise', 'fallback', Date.now() - start, fallbackError, {
          summaryEs: strategyResult.validationSummaryEs
            ? `${strategyResult.validationSummaryEs} La revisión falló y el proceso se detiene.`
            : 'La revisión del planificador no devolvió un borrador publicable y el proceso se detiene.',
          details: {
            failedCheck: strategyResult.failedCheck ?? null,
            validationSummaryEs: strategyResult.validationSummaryEs ?? null,
            validationEvidence: strategyResult.validationEvidence ?? null,
          },
        });
        this.recordEntry('revise', 'planner', {
          action: 'FAILURE: planner revision',
          reasoning: this.formatDiagnosticReasoning(fallbackError),
          result: 'Pipeline halted due to planner revision failure.',
        });
        throw fallbackError;
      } else {
        this.recordAgentOutcome('planner', 'revise', 'llm', Date.now() - start);
      }
      return strategyResult.output;
    } catch (error) {
      if (this.isSyntheticAgentError(error)) {
        throw error;
      }
      this.recordAgentOutcome('planner', 'revise', 'fallback', Date.now() - start, error, {
        summaryEs: 'La revisión del planificador falló inesperadamente y el proceso se detiene.',
      });
      this.recordEntry('revise', 'planner', {
        action: 'FAILURE: planner exception',
        reasoning: this.formatDiagnosticReasoning(error),
        result: 'Using existing draft as fallback - NOT from LLM',
      });
      // Return existing draft as-is if revision fails.
      return this.context.strategicDraft ?? buildFallbackStrategy(
        strategyInput,
        this.context.domainCard ?? undefined,
      );
    }
  }

  private async resolvePlanningDomainContext(): Promise<
    NonNullable<NonNullable<StrategyInput['planningContext']>['domainContext']>
    | null
  > {
    const planningDomainLabel = this.getPlanningDomainLabel();

    if (!planningDomainLabel) {
      return this.context.domainCard ? { card: this.context.domainCard } : null;
    }

    if (!this.config.enableDomainExpert) {
      if (!this.context.domainCard) {
        try {
          const card = await getKnowledgeCard(planningDomainLabel);
          if (card) {
            this.context.domainCard = card;
          }
        } catch {
          // Proceed without domain context when lookup fails.
        }
      }

      return this.context.domainCard ? { card: this.context.domainCard } : null;
    }

    const agent = await this.getAgent<{
      domainLabel: string;
      goalType: GoalInterpretation['goalType'];
      specificQuestion: string | null;
    }, {
      card: DomainKnowledgeCard | null;
      specificAdvice: string | null;
      warnings: string[];
    }>('domain-expert');

    const specificQuestion = this.context.criticReport
      ? `El critico marco estos riesgos:\n${buildRevisionContext([this.context.criticReport])}\nQue consideraciones de dominio deberia respetar la nueva estrategia para corregirlos?`
      : 'Que consideraciones de dominio deberia respetar un roadmap estrategico realista para este objetivo?';
    const start = Date.now();
    const phase = this.state.phase === 'revise' ? 'revise' : 'plan';
    const fallbackInput = {
      domainLabel: planningDomainLabel,
      goalType: this.context.interpretation?.goalType ?? 'FINITE_PROJECT',
      specificQuestion: null,
    };

    if (agent) {
      this.recordDebugEvent({
        category: 'agent',
        action: 'agent.start',
        summary_es: this.state.phase === 'revise'
          ? 'El experto de dominio esta buscando criterios para corregir la nueva vuelta.'
          : 'El experto de dominio esta aportando contexto antes de planificar.',
        phase,
        agent: 'domain-expert',
      });
      try {
        const result = await agent.execute({
          domainLabel: planningDomainLabel,
          goalType: this.context.interpretation?.goalType ?? 'FINITE_PROJECT',
          specificQuestion,
        },
          this.brainRuntime);
        this.recordAgentOutcome('domain-expert', phase, 'llm', Date.now() - start);

        if (result.card) {
          this.context.domainCard = result.card;
        }

        return {
          card: result.card ?? this.context.domainCard,
          specificAdvice: result.specificAdvice,
          warnings: result.warnings,
        };
      } catch (error) {
        const fallback = this.handleFallback(phase, 'domain-expert', fallbackInput, agent, start, error, 'domain-expert');

        if (fallback.card) {
          this.context.domainCard = fallback.card;
        }

        return {
          card: fallback.card ?? this.context.domainCard,
          specificAdvice: null,
          warnings: fallback.warnings,
        };
      }
    }

    const missingAgentError = new Error('Agent not registered');
    this.recordAgentOutcome('domain-expert', phase, 'fallback', Date.now() - start, missingAgentError);
    this.recordEntry(phase, 'domain-expert', {
      action: 'FALLBACK: domain-expert',
      reasoning: this.formatDiagnosticReasoning(missingAgentError),
      result: 'Using inline domain fallback - NOT from LLM',
    });

    if (!this.context.domainCard) {
      try {
        const card = await getKnowledgeCard(planningDomainLabel);
        if (card) {
          this.context.domainCard = card;
        }
      } catch {
        // Proceed without domain context when lookup fails.
      }
    }

    return this.context.domainCard ? { card: this.context.domainCard } : null;
  }

  private async executePackage(): Promise<PlanPackage | null> {
    this.lastAction = 'Packaging final plan';
    this.recordDebugEvent({
      category: 'agent',
      action: 'agent.start',
      summary_es: 'El empaquetador esta armando el resultado final publicable.',
      phase: 'package',
      agent: 'packager',
    });

    const agent = await this.getAgent<{ context: OrchestratorContext; scratchpad: ReasoningEntry[] }, PlanPackage>('packager');
    const start = Date.now();

    if (agent) {
      const input = {
        context: this.context,
        scratchpad: this.scratchpad.getAll(),
      };
      try {
        const result = await agent.execute(input, this.fastRuntime);
        this.recordAgentOutcome('packager', 'package', 'deterministic', Date.now() - start);
        return result;
      } catch (error) {
        return this.handleFallback('package', 'packager', input, agent, start, error);
      }
    }

    // Packager not available — return null
    return null;
  }

  // ─── Agent resolution ───────────────────────────────────────────────────

  private async getAgent<TInput, TOutput>(name: V6AgentName): Promise<V6Agent<TInput, TOutput> | null> {
    // Try registry first (use .has() to avoid throw from .get())
    if (this.registry && this.registry.has(name)) {
      try {
        const agent = this.registry.get<TInput, TOutput>(name);
        if (agent) return agent;
      } catch {
        // Registry get failed, fall through to direct import
      }
    }

    // Fall back to direct import
    const directAgent = await loadAgentDirect(name);
    return directAgent as V6Agent<TInput, TOutput> | null;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private getErrorCode(error: unknown): string {
    const message = this.getErrorMessage(error).toLowerCase();

    if (
      message.includes('unauthorized')
      || message.includes('forbidden')
      || message.includes('access denied')
      || message.includes('authentication')
      || message.includes('api key')
      || message.includes('401')
      || message.includes('403')
    ) {
      return 'UNAUTHORIZED';
    }

    if (message.includes('not registered')) {
      return 'AGENT_NOT_REGISTERED';
    }

    return error instanceof Error ? error.constructor.name : 'UNKNOWN';
  }

  private formatDiagnosticReasoning(error: unknown): string {
    const quota = extractQuotaFromError(error);
    const quotaSuffix = quota ? ` ${formatQuotaMessage(quota)}` : '';
    return `[provider=${this.brainRuntimeLabel}] Agent failed [${this.getErrorCode(error)}]: ${this.getErrorMessage(error)}${quotaSuffix}`;
  }

  private buildSyntheticAgentError(code: string, message: string): Error {
    const error = new Error(message);
    error.name = code;
    return error;
  }

  private isSyntheticAgentError(error: unknown): boolean {
    return error instanceof Error && (error.name.startsWith('PLANNER_') || error.name.startsWith('REVISION_') || error.name.includes('VALIDATION'));
  }

  private haltPipeline(
    failureCode: 'requires_regeneration' | 'requires_supervision' | 'failed_for_quality_review' | 'system_exception',
    internalMessage: string,
    agent?: V6AgentName,
  ): void {
    this.state.terminalState = {
      phase: this.state.phase,
      agent,
      failureCode,
      internalMessage,
    };
    this.state.phase = 'failed';
  }

  private createTimestamp(): string {
    const timestamp = DateTime.utc().toISO();

    if (!timestamp) {
      throw new Error('No se pudo generar un timestamp de debug.');
    }

    return timestamp;
  }

  private recordDebugEvent(input: {
    category: OrchestratorDebugEvent['category'];
    action: string;
    summary_es: string;
    phase?: OrchestratorPhase | null;
    agent?: V6AgentName | null;
    publicationState?: 'ready' | 'blocked' | 'failed' | null;
    failureCode?: string | null;
    errorCode?: string | null;
    quota?: QuotaInfo | null;
    details?: Record<string, unknown> | null;
  }): void {
    const event: OrchestratorDebugEvent = {
      sequence: this.debugSequence + 1,
      timestamp: this.createTimestamp(),
      category: input.category,
      action: input.action,
      summary_es: input.summary_es,
      phase: input.phase ?? this.state.phase ?? null,
      agent: input.agent ?? null,
      iteration: this.state.iteration,
      revisionCycle: this.state.revisionCycles,
      clarifyRound: this.state.clarifyRounds,
      progressScore: this.state.progressScore,
      degraded: this.getFallbackOutcomes().length > 0,
      fallbackCount: this.getFallbackOutcomes().length,
      publicationState: input.publicationState ?? null,
      failureCode: input.failureCode ?? null,
      errorCode: input.errorCode ?? null,
      quota: (input.quota as any) ?? null,
      details: input.details ?? null,
    };

    this.debugSequence = event.sequence;
    this.debugTrace.push(event);
    this.debugListener?.(structuredClone(event));
  }

  private buildAgentOutcomeSummaryEs(
    agent: V6AgentName,
    phase: OrchestratorPhase,
    source: AgentExecutionOutcome['source'],
    errorCode: string | null,
  ): string {
    if (source === 'fallback') {
      return `El ${AGENT_LABELS_ES[agent]} uso fallback en ${PHASE_LABELS_ES[phase]}${errorCode ? ` (${errorCode})` : ''}.`;
    }

    if (source === 'deterministic') {
      return `El ${AGENT_LABELS_ES[agent]} cerro ${PHASE_LABELS_ES[phase]} por via deterministica.`;
    }

    return `El ${AGENT_LABELS_ES[agent]} completo ${PHASE_LABELS_ES[phase]} con respuesta del modelo.`;
  }

  private recordAgentOutcome(
    agent: V6AgentName,
    phase: OrchestratorPhase,
    source: AgentExecutionOutcome['source'],
    durationMs: number,
    error: unknown = null,
    debugDetails?: AgentOutcomeDebugDetails,
  ): void {
    const errorCode = error ? this.getErrorCode(error) : null;
    const errorMessage = error ? this.getErrorMessage(error) : null;
    const quota = extractQuotaFromError(error);

    this.agentOutcomes.push({
      agent,
      phase,
      source,
      errorCode,
      errorMessage,
      durationMs,
      quota: (quota as any) ?? null,
    });

    this.recordDebugEvent({
      category: 'agent',
      action: debugDetails?.action ?? (source === 'fallback' ? 'agent.fallback' : 'agent.completed'),
      summary_es: debugDetails?.summaryEs ?? this.buildAgentOutcomeSummaryEs(agent, phase, source, errorCode),
      phase,
      agent,
      errorCode,
      quota,
      details: {
        source,
        durationMs,
        errorCode,
        errorMessage,
        ...(debugDetails?.details ?? {}),
      },
    });
  }

  private handleFallback<TInput, TOutput>(
    phase: OrchestratorPhase,
    agentName: V6AgentName,
    input: TInput,
    agent: Pick<V6Agent<TInput, TOutput>, 'fallback'>,
    start: number,
    error: unknown,
    fallbackLabel?: string,
  ): TOutput {
    this.recordAgentOutcome(agentName, phase, 'fallback', Date.now() - start, error);
    const blockingFallbackAgents = new Set<V6AgentName>(['critic']);

    if (blockingFallbackAgents.has(agentName)) {
      this.recordEntry(phase, agentName, {
        action: `FAILURE: ${fallbackLabel ?? agentName}`,
        reasoning: this.formatDiagnosticReasoning(error),
        result: 'Pipeline halted due to agent failure.',
      });
      throw error;
    }

    this.recordEntry(phase, agentName, {
      action: `FALLBACK: ${fallbackLabel ?? agentName}`,
      reasoning: this.formatDiagnosticReasoning(error),
      result: 'Using inline fallback data - NOT from LLM',
    });
    return agent.fallback(input);
  }

  private buildCriticFallbackReport(goalText: string): CriticReport {
    const finding = {
      id: 'f-fallback',
      severity: 'critical' as const,
      category: 'feasibility' as const,
      message: `Critic unavailable while reviewing "${goalText}". The plan cannot be approved without a real quality review.`,
      suggestion: 'Re-run the critic with a working provider before treating the plan as ready.',
      affectedPhaseIds: [],
    };

    return {
      overallScore: 35,
      findings: [finding],
      mustFix: [finding],
      shouldFix: [],
      verdict: 'revise',
      reasoning: `Critic unavailable while reviewing "${goalText}". Returning a degraded report, so the plan is not approved.`,
    };
  }

  private getFallbackOutcomes(): AgentExecutionOutcome[] {
    return this.agentOutcomes.filter((outcome) => outcome.source === 'fallback');
  }

  private isFinanceSavingsGoal(): boolean {
    const goalText = `${this.context.goalText} ${this.context.interpretation?.parsedGoal ?? ''}`;
    return /\b(?:ahorr|finanz|presupuest|gasto|transferenc|deposit)\w*\b/i.test(goalText);
  }

  private isPlannerBestEffortFallback(outcome: AgentExecutionOutcome): boolean {
    const errorMessage = outcome.errorMessage?.toLowerCase() ?? '';
    return errorMessage.includes('fallback strategy was used.')
      || errorMessage.includes('intake.anchor_coverage')
      || errorMessage.includes('tardo demasiado')
      || errorMessage.includes('timeout')
      || errorMessage.includes('timed out');
  }

  private isPublishablePlannerFallback(outcome: AgentExecutionOutcome): boolean {
    if (outcome.agent !== 'planner' || outcome.source !== 'fallback') {
      return false;
    }

    const normalizedErrorMessage = outcome.errorMessage?.toLowerCase() ?? '';
    const fallbackIsHealthSupervisionWarning = this.isHighRiskHealthGoal()
      && normalizedErrorMessage.includes('health.supervision');

    if (fallbackIsHealthSupervisionWarning) {
      return true;
    }

    const fallbackWasValidationDriven = outcome.errorMessage?.includes('Fallback strategy was used.') ?? false;
    const fallbackIsFinanceBestEffort = this.isFinanceSavingsGoal()
      && this.context.goalSignalsSnapshot?.hasSufficientSignalsForPlanning === true
      && (this.context.goalSignalsSnapshot?.missingCriticalSignals?.length ?? 0) === 0
      && this.isPlannerBestEffortFallback(outcome);

    if (!fallbackWasValidationDriven && !fallbackIsFinanceBestEffort) {
      return false;
    }

    if (this.context.criticReport?.verdict !== 'approve') {
      return false;
    }

    if (!this.context.finalPackage) {
      return false;
    }

    if (fallbackIsFinanceBestEffort) {
      return this.context.finalPackage.publicationState !== 'requires_supervision'
        && this.context.finalPackage.publicationState !== 'failed_for_quality_review';
    }

    return this.context.finalPackage.publicationState === 'publishable';
  }

  private getBlockingOutcomes(): AgentExecutionOutcome[] {
    const criticalAgents = new Set<V6AgentName>(['clarifier', 'planner', 'critic']);
    return this.agentOutcomes.filter(
      (outcome) => outcome.source === 'fallback'
        && criticalAgents.has(outcome.agent)
        && !this.isPublishablePlannerFallback(outcome),
    );
  }

  private isHighRiskHealthGoal(): boolean {
    const interpretationRisk = (this.context.interpretation?.riskFlags ?? []).includes('HIGH_HEALTH');
    const goalText = `${this.context.goalText} ${this.context.interpretation?.parsedGoal ?? ''}`.toLowerCase();
    const heuristicRisk = /\b(bajar|perder|reducir)\b.*\b(peso|kilos|kg|grasa|imc|bmi)\b/.test(goalText)
      || /\b(obesidad|sobrepeso|diabet|hiperten|corazon|cardiac|cronica|enf\.|enfermedad)\b/.test(goalText);

    return interpretationRisk || heuristicRisk;
  }

  private hasHealthSafetyFraming(): boolean {
    const packageText = [
      this.context.finalPackage?.summary_esAR,
      ...(this.context.finalPackage?.warnings ?? []),
      ...(this.context.finalPackage?.implementationIntentions ?? []),
      this.context.criticReport?.reasoning,
      this.context.strategicDraft?.phases.map((phase) => `${phase.name} ${phase.focus_esAR}`) ?? [],
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .toLowerCase();

    return /\b(medico|médico|profesional|supervision|supervisión|seguimiento clinico|seguimiento clínico|consulta)\b/.test(packageText);
  }

  private hasEffectiveHealthSafetyCoverage(): boolean {
    const contextText = [
      this.context.goalText,
      this.context.interpretation?.parsedGoal,
      ...(this.context.interpretation?.implicitAssumptions ?? []),
      ...Object.values(this.context.userAnswers),
      this.context.finalPackage?.summary_esAR,
      ...(this.context.finalPackage?.warnings ?? []),
      ...(this.context.finalPackage?.implementationIntentions ?? []),
      this.context.criticReport?.reasoning,
      ...(this.context.strategicDraft?.phases.map((phase) => `${phase.name} ${phase.focus_esAR}`) ?? []),
      ...(this.context.strategicDraft?.milestones ?? []),
    ]
      .flat()
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .toLowerCase();

    if (!contextText.trim()) {
      return false;
    }

    if (!HEALTH_SAFETY_TERMS.test(contextText)) {
      return false;
    }

    return !NEGATED_HEALTH_SAFETY_TERMS.some((pattern) => pattern.test(contextText));
  }

  private hasHealthSupervisionFailureSignal(): boolean {
    if (this.context.finalPackage?.publicationState === 'requires_supervision') {
      return true;
    }

    if ((this.context.finalPackage?.qualityIssues ?? []).some((issue) =>
      issue.code === 'health_safety_gap' || issue.code === 'HEALTH_SAFETY_SUPERVISION_MISSING')) {
      return true;
    }

    return this.agentOutcomes.some((outcome) =>
      outcome.agent === 'planner'
      && outcome.source === 'fallback'
      && ((outcome.errorMessage?.toLowerCase().includes('health.supervision')) ?? false));
  }

  private isHealthSupervisionWarningActive(): boolean {
    if (!this.isHighRiskHealthGoal()) {
      return false;
    }

    return this.hasHealthSupervisionFailureSignal()
      || !this.hasEffectiveHealthSafetyCoverage();
  }

  private buildHealthSupervisionWarningMessage(phase: OrchestratorPhase = this.state.phase): string {
    const phaseLabel = PHASE_LABELS_ES[phase] || phase;
    return `[Etapa: ${phaseLabel}] Este plan toca un objetivo de salud sensible. Usalo como guia inicial y con seguimiento profesional o supervision clinica antes de empujar cambios fuertes.`;
  }

  private isLegacyHealthSupervisionWarning(value: string): boolean {
    const normalized = value.toLowerCase();
    return normalized.includes('meta de salud de alto riesgo')
      && (normalized.includes('supervisi') || normalized.includes('seguimiento med'));
  }

  private getSafetyVerificationGate(): {
    publicationState: 'ready' | 'blocked' | 'failed';
    failureCode: 'requires_regeneration' | 'requires_supervision' | 'failed_for_quality_review' | null;
    blockingAgents: AgentExecutionOutcome[];
    customMessage?: string;
  } {
    if (!this.isHighRiskHealthGoal()) {
      return {
        publicationState: 'ready',
        failureCode: null,
        blockingAgents: [],
      };
    }

    if (!this.isHealthSupervisionWarningActive()) {
      return {
        publicationState: 'ready',
        failureCode: null,
        blockingAgents: [],
      };
    }

    return {
      publicationState: 'ready',
      failureCode: null,
      blockingAgents: [],
    };
  }

  private getPublicationGate(): {
    publicationState: 'ready' | 'blocked' | 'failed';
    failureCode: 'requires_regeneration' | 'requires_supervision' | 'failed_for_quality_review' | null;
    blockingAgents: AgentExecutionOutcome[];
    customMessage?: string;
  } {
    if (this.state.terminalState) {
      const ts = this.state.terminalState;
      const phaseLabel = PHASE_LABELS_ES[ts.phase] || ts.phase;
      
      let customMessage = undefined;
      if (ts.failureCode === 'requires_supervision') {
         customMessage = `[Etapa: ${phaseLabel}] No se puede publicar este plan porque es un objetivo de salud de alto riesgo y falta una referencia clara a supervisión profesional.`;
      } else if (ts.failureCode === 'system_exception') {
         customMessage = `[Etapa: ${phaseLabel}] El sistema falló de forma inesperada: ${ts.internalMessage}`;
      }

      return {
        publicationState: ts.failureCode === 'requires_supervision' ? 'blocked' : 'failed',
        failureCode: ts.failureCode === 'system_exception' ? 'requires_regeneration' : ts.failureCode,
        blockingAgents: [],
        customMessage,
      };
    }

    const safetyGate = this.getSafetyVerificationGate();
    if (safetyGate.publicationState === 'blocked') {
      return safetyGate;
    }

    const blockingAgents = this.getBlockingOutcomes();
    const hasPublishablePlannerFallback = this.getFallbackOutcomes().some((outcome) =>
      this.isPublishablePlannerFallback(outcome),
    );

    if (blockingAgents.length > 0) {
      return {
        publicationState: 'blocked',
        failureCode: 'requires_regeneration',
        blockingAgents,
      };
    }

    if (this.context.criticReport && this.context.criticReport.verdict !== 'approve') {
      const revisionsExhausted = this.state.revisionCycles >= this.state.maxRevisionCycles;

      // Once revision cycles are exhausted the pipeline cannot improve further.
      // Publish whatever was produced; quality issues are surfaced as warnings.
      if (!revisionsExhausted) {
        return {
          publicationState: 'failed',
          failureCode: 'failed_for_quality_review',
          blockingAgents: [],
        };
      }
    }

    if (!this.context.finalPackage) {
      return {
        publicationState: 'failed',
        failureCode: 'requires_regeneration',
        blockingAgents: [],
      };
    }

    if (this.context.finalPackage?.publicationState === 'requires_regeneration') {
      if (hasPublishablePlannerFallback && this.context.criticReport?.verdict === 'approve') {
        return {
          publicationState: 'ready',
          failureCode: null,
          blockingAgents: [],
        };
      }

      return {
        publicationState: 'blocked',
        failureCode: 'requires_regeneration',
        blockingAgents: [],
      };
    }

    if (this.context.finalPackage?.publicationState === 'requires_supervision') {
      return {
        publicationState: 'ready',
        failureCode: null,
        blockingAgents: [],
      };
    }

    if (this.context.finalPackage?.publicationState === 'failed_for_quality_review') {
      return {
        publicationState: 'failed',
        failureCode: 'failed_for_quality_review',
        blockingAgents: [],
      };
    }

    return {
      publicationState: 'ready',
      failureCode: null,
      blockingAgents: [],
    };
  }

  private finalizePackageQualityScore(baseScore: number, publicationState: 'ready' | 'blocked' | 'failed'): number {
    const fallbackAgents = new Set(this.getFallbackOutcomes().map((outcome) => outcome.agent));
    if (fallbackAgents.size === 0) {
      return baseScore;
    }

    if (publicationState === 'blocked') {
      return Math.min(baseScore, 20);
    }

    return Math.min(baseScore, 60);
  }

  private buildDegradedWarnings(
    existingWarnings: string[],
    publicationState: 'ready' | 'blocked' | 'failed',
  ): string[] {
    const healthSupervisionWarningActive = this.isHealthSupervisionWarningActive();
    const warnings = new Set(
      healthSupervisionWarningActive
        ? existingWarnings.filter((warning) => !this.isLegacyHealthSupervisionWarning(warning))
        : existingWarnings,
    );
    if (healthSupervisionWarningActive) {
      warnings.add(this.buildHealthSupervisionWarningMessage());
    }

    if (publicationState === 'blocked') {
      if (this.getBlockingOutcomes().length > 0) {
        warnings.add(
          'No se puede publicar este plan: la revision critica fallo y hace falta regenerarlo con un proveedor que responda bien.',
        );
      } else {
        warnings.add(
          'No se puede publicar este plan hasta que pase la revision final.',
        );
      }
    } else if (this.getFallbackOutcomes().length > 0) {
      warnings.add(
        'Este plan se genero parcialmente con datos de respaldo y requiere revision antes de tomarlo como valido.',
      );
    }

    return Array.from(warnings);
  }

  // ─── Phase-to-agent mapping ─────────────────────────────────────────────

  private phaseToAgent(phase: OrchestratorPhase): V6AgentName {
    const mapping: Record<OrchestratorPhase, V6AgentName> = {
      interpret: 'goal-interpreter',
      clarify: 'clarifier',
      plan: 'planner',
      check: 'feasibility-checker',
      schedule: 'scheduler',
      critique: 'critic',
      revise: 'planner',
      package: 'packager',
      done: 'packager',
      failed: 'packager',
    };
    return mapping[phase];
  }

  // ─── Result merging ─────────────────────────────────────────────────────

  private mergeResult(phase: OrchestratorPhase, result: unknown): void {
    switch (phase) {
      case 'interpret':
        this.context.interpretation = result as GoalInterpretation;
        break;
      case 'clarify': {
        const clarification = result as ClarificationRound;
        this.context.clarificationRounds.push(clarification);
        break;
      }
      case 'plan':
      case 'revise':
        this.context.strategicDraft = result as StrategicDraft;
        break;
      case 'check':
        this.context.feasibilityReport = result as FeasibilityReport;
        break;
      case 'schedule':
        if (result !== null) {
          this.context.scheduleResult = result as ScheduleExecutionResult;
        }
        break;
      case 'critique':
        this.context.criticReport = result as CriticReport;
        break;
      case 'package':
        if (result !== null) {
          this.context.finalPackage = this.withLatestReasoningTrace(result as PlanPackage);
        }
        break;
    }
  }

  private withLatestReasoningTrace(planPackage: PlanPackage): PlanPackage {
    return {
      ...planPackage,
      reasoningTrace: this.scratchpad.getAll(),
    };
  }

  // ─── Progress tracking ──────────────────────────────────────────────────

  private updateProgressScore(_previousPhase: OrchestratorPhase, currentPhase: OrchestratorPhase): void {
    const newScore = phaseProgressScore(currentPhase);

    // Only increase, never decrease
    if (newScore > this.state.progressScore) {
      this.state.progressScore = newScore;
    }

    this.progressHistory.push(this.state.progressScore);
  }

  // ─── Scratchpad helpers ─────────────────────────────────────────────────

  private recordEntry(
    phase: OrchestratorPhase,
    agent: V6AgentName,
    details: { action: string; reasoning: string; result: string },
  ): void {
    this.scratchpad.add({
      phase,
      agent,
      iteration: Math.max(1, this.state.iteration + 1),
      action: details.action,
      reasoning: details.reasoning,
      result: details.result,
      tokensUsed: this.estimateTokens(details.result),
    });
  }

  private extractReasoning(result: unknown): string {
    if (result === null || result === undefined) {
      return 'No result';
    }

    if (typeof result === 'object') {
      const record = result as Record<string, unknown>;

      if (typeof record.reasoning === 'string') {
        return record.reasoning;
      }

      if (typeof record.verdict === 'string') {
        return `Verdict: ${record.verdict}`;
      }

      if (typeof record.status === 'string') {
        return `Status: ${record.status}`;
      }
    }

    return 'Phase completed';
  }

  private summarizeResult(result: unknown): string {
    if (result === null || result === undefined) {
      return 'No output';
    }

    if (typeof result === 'object') {
      const record = result as Record<string, unknown>;

      // GoalInterpretation
      if (typeof record.parsedGoal === 'string') {
        return `Goal: ${record.parsedGoal}, confidence: ${record.confidence}`;
      }

      // ClarificationRound
      if (typeof record.readyToAdvance === 'boolean') {
        const round = record as unknown as ClarificationRound;
        return round.readyToAdvance
          ? `Ready to advance (confidence: ${round.confidence})`
          : `${round.questions.length} questions pending (confidence: ${round.confidence})`;
      }

      // FeasibilityReport
      if (typeof record.status === 'string' && 'hoursBudget' in record) {
        return `Feasibility: ${record.status}`;
      }

      // CriticReport
      if (typeof record.verdict === 'string' && typeof record.overallScore === 'number') {
        const report = record as unknown as CriticReport;
        return `Score: ${report.overallScore}, verdict: ${report.verdict}`;
      }

      // StrategicDraft
      if (typeof record.phases === 'object' && Array.isArray((record as any).phases)) {
        return `${((record as any).phases).length} phases generated`;
      }
    }

    return 'Phase completed';
  }

  private estimateTokens(result: unknown): number {
    if (result === null || result === undefined) {
      return 0;
    }

    const json = typeof result === 'string' ? result : JSON.stringify(result);
    // Rough estimate: ~4 chars per token
    return Math.ceil(json.length / 4);
  }

  // ─── Final result building ──────────────────────────────────────────────

  private buildFinalResult(): OrchestratorResult {
    const machineState = this.getMachineStateValue();
    const fallbackOutcomes = this.getFallbackOutcomes();
    const hasFallbacks = fallbackOutcomes.length > 0;
    const publicationGate = this.getPublicationGate();
    const revisionsExhausted = this.state.revisionCycles >= this.state.maxRevisionCycles;
    const criticScore = this.context.criticReport?.overallScore ?? null;
    const criticHasCriticalFindings = (this.context.criticReport?.mustFix ?? []).some(
      (finding) => finding.severity === 'critical',
    );
    const packagePublicationState: NonNullable<PlanPackage['publicationState']> = publicationGate.publicationState === 'ready'
      ? 'publishable'
      : publicationGate.failureCode === 'requires_regeneration'
        ? 'requires_regeneration'
        : publicationGate.failureCode === 'requires_supervision'
          ? 'requires_supervision'
          : 'failed_for_quality_review';
    const currentPhase = (this.context as any).safetyBlockPhase || this.state.phase;
    const phaseLabel = PHASE_LABELS_ES[currentPhase] || currentPhase;
    const stagePrefix = `[Etapa: ${phaseLabel}]`;
    const healthSupervisionWarningActive = this.isHealthSupervisionWarningActive();
    const healthSupervisionWarningMessage = healthSupervisionWarningActive
      ? this.buildHealthSupervisionWarningMessage(currentPhase)
      : null;

    const gateQualityIssues = publicationGate.failureCode === 'requires_regeneration'
      ? [{
        code: 'CRITICAL_AGENT_FAILURE',
        severity: 'blocking' as const,
        message: `${stagePrefix} La ruta crítica del pipeline falló y hace falta regenerar el plan con agentes que respondan correctamente.`,
      }]
      : publicationGate.failureCode === 'requires_supervision'
        ? [{
          code: 'HEALTH_SAFETY_SUPERVISION_MISSING',
          severity: 'blocking' as const,
          message: (publicationGate as any).customMessage || `${stagePrefix} Hace falta una referencia clara a supervisión profesional antes de tratar este plan de salud como aceptable.`,
        }]
        : publicationGate.failureCode === 'failed_for_quality_review'
          ? [
            // Surface the critic's actual findings so the failure is diagnosable
            ...(this.context.criticReport?.mustFix ?? []).map((f) => ({
              code: `critic_${f.category}` as string,
              severity: 'blocking' as const,
              message: `${stagePrefix} [${f.severity}/${f.category}] ${f.message}${f.suggestion ? ` → ${f.suggestion}` : ''}`,
            })),
            ...(this.context.criticReport?.shouldFix ?? []).slice(0, 3).map((f) => ({
              code: `critic_${f.category}` as string,
              severity: 'warning' as const,
              message: `${stagePrefix} [${f.severity}/${f.category}] ${f.message}`,
            })),
            {
              code: 'FAILED_QUALITY_REVIEW',
              severity: 'blocking' as const,
              message: `${stagePrefix} El plan no pasó la revisión final de calidad (score: ${this.context.criticReport?.overallScore ?? '?'}/100, verdict: ${this.context.criticReport?.verdict ?? '?'}). ${this.context.criticReport?.reasoning ?? ''}`.trim(),
            },
          ]
          : [];
    const healthSupervisionQualityIssues = healthSupervisionWarningMessage
      ? [{
        code: 'HEALTH_SAFETY_SUPERVISION_MISSING',
        severity: 'warning' as const,
        message: healthSupervisionWarningMessage,
      }]
      : [];
    const normalizedFinalPackageQualityIssues = (this.context.finalPackage?.qualityIssues ?? []).filter((issue) =>
      !healthSupervisionWarningActive
      || (issue.code !== 'health_safety_gap' && issue.code !== 'HEALTH_SAFETY_SUPERVISION_MISSING'));
    const bestEffortPublication = publicationGate.publicationState === 'ready'
      && this.context.criticReport
      && this.context.criticReport.verdict !== 'approve'
      && revisionsExhausted
      && (this.context.criticReport.overallScore ?? 0) >= 60
      && (this.context.criticReport.overallScore ?? 0) < this.config.criticApprovalThreshold
      && !criticHasCriticalFindings;
    const bestEffortQualityIssues = bestEffortPublication
      ? [{
        code: 'BEST_EFFORT_PUBLICATION',
        severity: 'warning' as const,
        message: `[Crítica] Plan publicado en modo best-effort (score: ${criticScore ?? '?'}/100, ciclos de revisión agotados).`,
      }]
      : [];
    const finalPackage = this.context.finalPackage
      ? {
        ...this.withLatestReasoningTrace(this.context.finalPackage),
        qualityScore: this.finalizePackageQualityScore(
          this.context.finalPackage.qualityScore,
          publicationGate.publicationState,
        ),
        warnings: this.buildDegradedWarnings(
          this.context.finalPackage.warnings,
          publicationGate.publicationState,
        ),
        publicationState: packagePublicationState,
        qualityIssues: [
          ...normalizedFinalPackageQualityIssues,
          ...gateQualityIssues.filter((issue) =>
            !normalizedFinalPackageQualityIssues.some((existing) => existing.code === issue.code),
          ),
          ...healthSupervisionQualityIssues.filter((issue) =>
            !normalizedFinalPackageQualityIssues.some((existing) => existing.code === issue.code),
          ),
          ...bestEffortQualityIssues.filter((issue) =>
            !normalizedFinalPackageQualityIssues.some((existing) => existing.code === issue.code),
          ),
        ],
        agentOutcomes: [...this.agentOutcomes],
        degraded: hasFallbacks,
      }
      : publicationGate.failureCode === 'requires_supervision'
        ? {
          plan: { skeleton: { phases: [], milestones: [] } },
          items: [],
          habitStates: [],
          slackPolicy: {
            weeklyTimeBufferMin: 0,
            maxChurnMovesPerWeek: 0,
            frozenHorizonDays: 0,
          },
          timezone: 'UTC',
          summary_esAR: 'Bloqueo de seguridad preventivo.',
          qualityScore: 0,
          implementationIntentions: [],
          warnings: [],
          publicationState: 'requires_supervision',
          qualityIssues: gateQualityIssues.length > 0 ? gateQualityIssues : [
            {
              code: 'HEALTH_SAFETY_SUPERVISION_MISSING',
              severity: 'blocking',
              message: (publicationGate as any).customMessage || '[Seguridad] Se requiere supervisión profesional para este plan de salud.',
            },
          ],
          degraded: hasFallbacks,
        }
        : null;

    const canPublish = publicationGate.publicationState === 'ready'
      && (machineState === 'done' || this.state.phase === 'done')
      && finalPackage !== null;

    this.recordDebugEvent({
      category: 'publication',
      action: 'publication.evaluated',
      summary_es: publicationGate.publicationState === 'ready'
        ? hasFallbacks
          ? 'La publicacion quedo permitida, aunque el run termino degradado por fallbacks.'
          : 'La publicacion quedo habilitada.'
        : publicationGate.publicationState === 'blocked'
          ? 'La publicacion quedo bloqueada y el plan no puede salir tal como esta.'
          : 'La publicacion fallo en la revision final.',
      phase: this.state.phase,
      agent: publicationGate.blockingAgents[0]?.agent ?? (this.context.criticReport ? 'critic' : 'packager'),
      publicationState: publicationGate.publicationState,
      failureCode: publicationGate.failureCode,
      details: {
        partialKind: 'publication',
        canPublish,
        degraded: hasFallbacks,
        blockingAgents: publicationGate.blockingAgents,
        fallbackLedger: this.getFallbackLedger(),
        qualityIssues: finalPackage?.qualityIssues ?? [],
        criticVerdict: this.context.criticReport?.verdict ?? null,
        criticScore: this.context.criticReport?.overallScore ?? null,
        warnings: finalPackage?.warnings ?? [],
        exactBlockers: publicationGate.blockingAgents.map((item) => ({
          agent: item.agent,
          phase: item.phase,
          errorCode: item.errorCode,
          errorMessage: item.errorMessage,
        })),
        misalignedGoal: (finalPackage?.qualityIssues ?? []).some((issue) => issue.code === 'goal_mismatch'),
      },
    });

    return {
      status: canPublish ? 'completed' : 'failed',
      package: finalPackage as unknown as PlanPackage,
      pendingQuestions: null,
      scratchpad: this.scratchpad.getAll(),
      tokensUsed: this.scratchpad.totalTokens(),
      iterations: this.state.iteration,
      agentOutcomes: [...this.agentOutcomes],
      degraded: hasFallbacks,
      publicationState: publicationGate.publicationState,
      failureCode: publicationGate.failureCode,
      blockingAgents: publicationGate.blockingAgents,
      customMessage: publicationGate.customMessage,
    };
  }
}
