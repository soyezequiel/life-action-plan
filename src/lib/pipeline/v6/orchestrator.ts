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
import { nextPhase, requiresUserInput, phaseProgressScore } from './state-machine';
import { PlanOrchestratorSnapshotSchema } from './types';
import type {
  AgentExecutionOutcome,
  ClarificationRound,
  CriticReport,
  FeasibilityReport,
  GoalInterpretation,
  OrchestratorConfig,
  OrchestratorContext,
  OrchestratorDebugEvent,
  OrchestratorDebugStatus,
  OrchestratorPhase,
  OrchestratorState,
  PlanPackage,
  ReasoningEntry,
  ScheduleExecutionResult,
  StrategicDraft,
  UserProfileV5,
  V6Agent,
  V6AgentName,
  PlanOrchestratorSnapshot,
} from './types';

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
  criticApprovalThreshold: 75,
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

const PHASE_LABELS_ES: Record<OrchestratorPhase, string> = {
  interpret: 'interpretacion',
  clarify: 'aclaracion',
  plan: 'planificacion',
  check: 'factibilidad',
  schedule: 'calendarizacion',
  critique: 'critica',
  revise: 'revision',
  package: 'empaquetado',
  done: 'cierre',
  failed: 'falla',
};

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

// ─── PlanOrchestrator ───────────────────────────────────────────────────────

export class PlanOrchestrator {
  private registry: AgentRegistryLike | null = null;
  private state: OrchestratorState;
  private context: OrchestratorContext;
  private scratchpad: Scratchpad;
  private config: OrchestratorConfig;
  private runtime: AgentRuntime;
  private lastAction = '';
  private pendingAnswers: Record<string, string> | null = null;
  private progressHistory: number[] = [];
  private agentOutcomes: AgentExecutionOutcome[] = [];
  private debugTrace: OrchestratorDebugEvent[] = [];
  private debugSequence = 0;
  private runtimeLabel: string;
  private debugListener?: (event: OrchestratorDebugEvent) => void;

  private getPlanningDomainLabel(): string | null {
    return this.context.interpretation?.suggestedDomain ?? null;
  }

  constructor(
    config: Partial<OrchestratorConfig>,
    runtime: AgentRuntime,
    runtimeLabel = 'unknown',
    debugListener?: (event: OrchestratorDebugEvent) => void,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.runtime = runtime;
    this.runtimeLabel = runtimeLabel;
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

  static restore(
    snapshot: PlanOrchestratorSnapshot,
    runtime: AgentRuntime,
    runtimeLabel = 'unknown',
    debugListener?: (event: OrchestratorDebugEvent) => void,
  ): PlanOrchestrator {
    const parsed = PlanOrchestratorSnapshotSchema.parse(snapshot);
    const orchestrator = new PlanOrchestrator(parsed.config, runtime, runtimeLabel, debugListener);

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
    orchestrator.progressHistory = [...parsed.progressHistory];
    orchestrator.agentOutcomes = (parsed.agentOutcomes ?? []).map((outcome) => ({ ...outcome }));
    orchestrator.debugTrace = (parsed.debugTrace ?? []).map((event) => structuredClone(event));
    orchestrator.debugSequence = orchestrator.debugTrace.reduce(
      (max, event) => Math.max(max, event.sequence),
      0,
    );

    return orchestrator;
  }

  // ─── Main entry point ───────────────────────────────────────────────────

  async run(goalText: string, userCtx: UserContext): Promise<OrchestratorResult> {
    this.initializeContext(goalText, userCtx);
    this.state.phase = 'interpret';
    this.registry = await loadRegistry();
    this.recordDebugEvent({
      category: 'lifecycle',
      action: 'run.started',
      summary_es: `Inicio de corrida para el objetivo "${goalText}".`,
      phase: 'interpret',
      agent: this.phaseToAgent('interpret'),
      details: {
        runtimeLabel: this.runtimeLabel,
        timezone: userCtx.timezone,
        locale: userCtx.locale,
      },
    });

    return this.executeLoop();
  }

  // ─── Resume after user provides clarification answers ───────────────────

  async resume(answers: Record<string, string>): Promise<OrchestratorResult> {
    this.registry = await loadRegistry();
    this.pendingAnswers = answers;
    const storedAnswers = this.mapAnswersToStoredAnswers(answers);
    this.context.userAnswers = { ...this.context.userAnswers, ...storedAnswers };

    const hasActualAnswers = Object.keys(answers).length > 0;

    if (hasActualAnswers) {
      const shouldSkipClarify = this.state.phase === 'clarify'
        && this.state.clarifyRounds >= this.state.maxClarifyRounds;
      this.state.phase = shouldSkipClarify ? 'plan' : 'clarify';
    } else {
      // Empty answers = user chose to skip clarification. Advance to plan phase.
      this.state.phase = 'plan';
      this.pendingAnswers = null;
    }

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
      },
    });

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
    const currentPhase = this.state.phase ?? null;
    const currentAgent = lastEvent?.agent ?? (currentPhase ? this.phaseToAgent(currentPhase) : null);
    const lifecycle = this.state.phase === 'done'
      ? 'completed'
      : this.state.phase === 'failed'
        ? 'failed'
        : requiresUserInput(this.state.phase) && !this.hasPendingAnswers() && this.context.clarificationRounds.length > 0
          ? 'paused_for_input'
          : 'running';
    const canEvaluatePublication = this.state.phase === 'done'
      || this.state.phase === 'failed'
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
    return {
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
    };
  }

  // ─── Core loop ──────────────────────────────────────────────────────────

  private async executeLoop(): Promise<OrchestratorResult> {
    while (this.state.phase !== 'done' && this.state.phase !== 'failed') {
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
        this.state.phase = 'package';
      }

      // If phase needs user input and we don't have it, pause
      if (requiresUserInput(this.state.phase) && !this.hasPendingAnswers()) {
        return this.pauseForInput();
      }

      this.recordDebugEvent({
        category: 'phase',
        action: 'phase.enter',
        summary_es: this.buildPhaseEnterSummaryEs(this.state.phase),
        phase: this.state.phase,
        agent: this.phaseToAgent(this.state.phase),
      });

      // Execute the current phase
      let result: unknown;
      const phaseStart = Date.now();
      try {
        result = await this.executePhase(this.state.phase);
      } catch (error) {
        const errorMessage = this.getErrorMessage(error);
        this.recordAgentOutcome(
          this.phaseToAgent(this.state.phase),
          this.state.phase,
          'fallback',
          Date.now() - phaseStart,
          error,
          {
            summaryEs: `La fase ${PHASE_LABELS_ES[this.state.phase]} falló con ${this.getErrorCode(error)} y el pipeline fuerza un fallback.`,
            action: 'phase.exception',
            details: {
              errorMessage,
            },
          },
        );
        this.recordEntry(this.state.phase, this.phaseToAgent(this.state.phase), {
          action: `FALLBACK in ${this.state.phase}`,
          reasoning: this.formatDiagnosticReasoning(error),
          result: 'Used fallback data - result is NOT from LLM',
        });
        this.state.phase = 'package';
        continue;
      }

      const previousClarificationRounds = this.context.clarificationRounds.map((round) => structuredClone(round));
      const previousCriticReport = this.context.criticReport ? structuredClone(this.context.criticReport) : null;

      // Record in scratchpad
      this.recordEntry(this.state.phase, this.phaseToAgent(this.state.phase), {
        action: `Executed ${this.state.phase}`,
        reasoning: this.extractReasoning(result),
        result: this.summarizeResult(result),
      });

      // Update context with result
      this.mergeResult(this.state.phase, result);
      this.recordPhaseSpecificDebug(this.state.phase, result, {
        previousClarificationRounds,
        previousCriticReport,
      });

      // Determine next phase
      const previousPhase = this.state.phase;
      this.state.phase = nextPhase(this.state.phase, this.state, this.context, result);
      this.state.iteration++;

      // Update progress score
      this.updateProgressScore(previousPhase, this.state.phase);

      // Sync scratchpad entries into state
      this.state.tokenBudget.used = this.scratchpad.totalTokens();
      this.state.scratchpad = this.scratchpad.getAll();
      this.recordPhaseTransition(previousPhase, this.state.phase, result);
    }

    return this.buildFinalResult();
  }

  // ─── Initialization ─────────────────────────────────────────────────────

  private initializeContext(goalText: string, userCtx: UserContext): void {
    this.context.goalText = goalText;
    this.context.userProfile = userCtx.profile;
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
    this.scratchpad.restore([]);
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
    if (this.pendingAnswers !== null && Object.keys(this.pendingAnswers).length > 0) {
      return true;
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
        const result = await agent.execute(input, this.runtime);
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
      profileSummary: string | null;
    }, ClarificationRound>('clarifier');

    const input = {
      interpretation: this.context.interpretation!,
      previousAnswers: this.context.userAnswers,
      profileSummary: this.context.userProfile
        ? `Horas libres L-V: ${this.context.userProfile.freeHoursWeekday}, finde: ${this.context.userProfile.freeHoursWeekend}, energia: ${this.context.userProfile.energyLevel}`
        : null,
    };

    // Consume pending answers
    this.pendingAnswers = null;
    const start = Date.now();

    if (agent) {
      try {
        const result = this.namespaceClarificationRound(await agent.execute(input, this.runtime));
        this.recordAgentOutcome('clarifier', 'clarify', 'llm', Date.now() - start);
        return result;
      } catch (error) {
        return this.handleFallback('clarify', 'clarifier', input, agent, start, error);
      }
    }

    // Fallback: ready to advance
    const missingAgentError = new Error('Agent not registered');
    this.recordAgentOutcome('clarifier', 'clarify', 'fallback', Date.now() - start, missingAgentError);
    this.recordEntry('clarify', 'clarifier', {
      action: 'FALLBACK: clarifier',
      reasoning: this.formatDiagnosticReasoning(missingAgentError),
      result: 'Using inline fallback data - NOT from LLM',
    });
    return {
      questions: [],
      reasoning: 'Clarifier unavailable, proceeding with available information.',
      informationGaps: [],
      confidence: 0.8,
      readyToAdvance: true,
    };
  }

  private async executePlan(): Promise<StrategicDraft> {
    this.lastAction = 'Generating strategic plan';
    const domainContext = await this.resolvePlanningDomainContext();
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
        domainContext,
      },
    };

    try {
      const strategyResult = await generateStrategyWithSource(
        this.runtime,
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
            ? `${strategyResult.validationSummaryEs} Se uso un fallback del planificador.`
            : 'El planificador no devolvio un borrador publicable y se uso un fallback.',
          details: {
            failedCheck: strategyResult.failedCheck ?? null,
            validationSummaryEs: strategyResult.validationSummaryEs ?? null,
            validationEvidence: strategyResult.validationEvidence ?? null,
          },
        });
        this.recordEntry('plan', 'planner', {
          action: 'FALLBACK: planner',
          reasoning: this.formatDiagnosticReasoning(fallbackError),
          result: 'Using fallback strategic draft - NOT from LLM',
        });
      } else {
        this.recordAgentOutcome('planner', 'plan', 'llm', Date.now() - start);
      }
      return strategyResult.output;
    } catch (error) {
      this.recordAgentOutcome('planner', 'plan', 'fallback', Date.now() - start, error, {
        summaryEs: 'El planificador fallo de forma inesperada y se uso un fallback estrategico.',
      });
      this.recordEntry('plan', 'planner', {
        action: 'FALLBACK: planner',
        reasoning: this.formatDiagnosticReasoning(error),
        result: 'Using fallback strategic draft - NOT from LLM',
      });
      return buildFallbackStrategy(
        strategyInput,
        this.context.domainCard ?? undefined,
      );
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
        const result = await agent.execute(input, this.runtime);
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
        const result = await agent.execute(input, this.runtime) as ScheduleExecutionResult;
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
      domainCard: DomainKnowledgeCard | null;
      previousCriticReports: CriticReport[];
    }, CriticReport>('critic');

    const profile = this.context.userProfile;
    const profileSummary = profile
      ? `Horas libres L-V: ${profile.freeHoursWeekday}, finde: ${profile.freeHoursWeekend}, energia: ${profile.energyLevel}, compromisos: ${profile.fixedCommitments.join(', ') || 'ninguno'}`
      : 'Perfil no disponible';

    const schedule = this.context.scheduleResult;
    const input = {
      goalText: this.context.goalText,
      goalType: this.context.interpretation?.goalType ?? 'FINITE_PROJECT',
      profileSummary,
      strategicDraft: (this.context.strategicDraft ?? {}) as Record<string, unknown>,
      scheduleQualityScore: schedule?.qualityScore ?? 0,
      unscheduledCount: schedule?.unscheduledCount ?? schedule?.solverOutput.unscheduled?.length ?? 0,
      scheduleTradeoffs: schedule?.tradeoffs ?? [],
      domainCard: this.context.domainCard,
      previousCriticReports: this.context.criticReport ? [this.context.criticReport] : [],
    };

    const start = Date.now();

    if (agent) {
      try {
        const result = await agent.execute(input, this.runtime);
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
        domainContext,
        previousCriticFindings: (void mustFixSummary, this.context.criticReport?.mustFix ?? []),
        previousCriticReports: this.context.criticReport ? [this.context.criticReport] : [],
      },
    };

    try {
      const strategyResult = await generateStrategyWithSource(
        this.runtime,
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
            ? `${strategyResult.validationSummaryEs} La revision siguio con fallback del planificador.`
            : 'La revision del planificador no devolvio un borrador publicable y se uso un fallback.',
          details: {
            failedCheck: strategyResult.failedCheck ?? null,
            validationSummaryEs: strategyResult.validationSummaryEs ?? null,
            validationEvidence: strategyResult.validationEvidence ?? null,
          },
        });
        this.recordEntry('revise', 'planner', {
          action: 'FALLBACK: planner',
          reasoning: this.formatDiagnosticReasoning(fallbackError),
          result: 'Using existing draft as fallback - NOT from LLM',
        });
      } else {
        this.recordAgentOutcome('planner', 'revise', 'llm', Date.now() - start);
      }
      return strategyResult.output;
    } catch (error) {
      this.recordAgentOutcome('planner', 'revise', 'fallback', Date.now() - start, error, {
        summaryEs: 'La revision del planificador fallo y se reutilizo el borrador existente.',
      });
      this.recordEntry('revise', 'planner', {
        action: 'FALLBACK: planner',
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
        }, this.runtime);
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
        const result = await agent.execute(input, this.runtime);
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
    return `[provider=${this.runtimeLabel}] Agent failed [${this.getErrorCode(error)}]: ${this.getErrorMessage(error)}`;
  }

  private buildSyntheticAgentError(code: string, message: string): Error {
    const error = new Error(message);
    error.name = code;
    return error;
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
    this.agentOutcomes.push({
      agent,
      phase,
      source,
      errorCode,
      errorMessage,
      durationMs,
    });

    this.recordDebugEvent({
      category: 'agent',
      action: debugDetails?.action ?? (source === 'fallback' ? 'agent.fallback' : 'agent.completed'),
      summary_es: debugDetails?.summaryEs ?? this.buildAgentOutcomeSummaryEs(agent, phase, source, errorCode),
      phase,
      agent,
      errorCode,
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
    this.recordEntry(phase, agentName, {
      action: `FALLBACK: ${fallbackLabel ?? agentName}`,
      reasoning: this.formatDiagnosticReasoning(error),
      result: 'Using fallback data - NOT from LLM',
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

  private isPublishablePlannerFallback(outcome: AgentExecutionOutcome): boolean {
    if (outcome.agent !== 'planner' || outcome.source !== 'fallback') {
      return false;
    }

    if (!outcome.errorMessage?.includes('Fallback strategy was used.')) {
      return false;
    }

    if (this.context.criticReport?.verdict !== 'approve') {
      return false;
    }

    return this.context.finalPackage?.publicationState === 'publishable';
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
    const goalText = `${this.context.goalText} ${this.context.interpretation?.parsedGoal ?? ''}`.toLowerCase();
    return (
      this.context.interpretation?.riskFlags.includes('HIGH_HEALTH')
      || /\b(bajar de peso|perder peso|adelgaz|obesidad|sobrepeso|kg\b|kilos?|imc|bmi|cintura|medidas|salud)\b/.test(goalText)
    );
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

  private getPublicationGate(): {
    publicationState: 'ready' | 'blocked' | 'failed';
    failureCode: 'requires_regeneration' | 'requires_supervision' | 'failed_for_quality_review' | null;
    blockingAgents: AgentExecutionOutcome[];
  } {
    const blockingAgents = this.getBlockingOutcomes();

    if (blockingAgents.length > 0) {
      return {
        publicationState: 'blocked',
        failureCode: 'requires_regeneration',
        blockingAgents,
      };
    }

    if (this.context.criticReport && this.context.criticReport.verdict !== 'approve') {
      return {
        publicationState: 'failed',
        failureCode: 'failed_for_quality_review',
        blockingAgents: [],
      };
    }

    if (this.isHighRiskHealthGoal() && !this.hasHealthSafetyFraming()) {
      return {
        publicationState: 'blocked',
        failureCode: 'requires_supervision',
        blockingAgents: [],
      };
    }

    if (!this.context.finalPackage) {
      return {
        publicationState: 'failed',
        failureCode: 'failed_for_quality_review',
        blockingAgents: [],
      };
    }

    if (this.context.finalPackage?.publicationState === 'requires_regeneration') {
      return {
        publicationState: 'blocked',
        failureCode: 'requires_regeneration',
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
    const warnings = new Set(existingWarnings);
    if (publicationState === 'blocked') {
      if (this.getBlockingOutcomes().length > 0) {
        warnings.add(
          'No se puede publicar este plan: la revision critica fallo y hace falta regenerarlo con un proveedor que responda bien.',
        );
      } else if (this.isHighRiskHealthGoal()) {
        warnings.add(
          'No se puede publicar este plan de salud sin una referencia clara a seguimiento profesional o supervision clinica.',
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
        return `Score: ${record.overallScore}, verdict: ${record.verdict}`;
      }

      // StrategicDraft
      if (Array.isArray(record.phases)) {
        return `${(record.phases as unknown[]).length} phases generated`;
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
    const fallbackOutcomes = this.getFallbackOutcomes();
    const hasFallbacks = fallbackOutcomes.length > 0;
    const publicationGate = this.getPublicationGate();
    const packagePublicationState: NonNullable<PlanPackage['publicationState']> = publicationGate.publicationState === 'ready'
      ? 'publishable'
      : publicationGate.failureCode === 'requires_regeneration'
        ? 'requires_regeneration'
        : 'failed_for_quality_review';
    const gateQualityIssues = publicationGate.failureCode === 'requires_regeneration'
      ? [{
          code: 'CRITICAL_AGENT_FAILURE',
          severity: 'blocking' as const,
          message: 'La ruta critica del pipeline fallo y hace falta regenerar el plan con agentes que respondan correctamente.',
        }]
      : publicationGate.failureCode === 'requires_supervision'
        ? [{
            code: 'HEALTH_SAFETY_SUPERVISION_MISSING',
            severity: 'blocking' as const,
            message: 'Hace falta una referencia clara a supervision profesional antes de tratar este plan de salud como aceptable.',
          }]
        : publicationGate.failureCode === 'failed_for_quality_review'
          ? [
              // Surface the critic's actual findings so the failure is diagnosable
              ...(this.context.criticReport?.mustFix ?? []).map((f) => ({
                code: `critic_${f.category}` as string,
                severity: 'blocking' as const,
                message: `[${f.severity}/${f.category}] ${f.message}${f.suggestion ? ` → ${f.suggestion}` : ''}`,
              })),
              ...(this.context.criticReport?.shouldFix ?? []).slice(0, 3).map((f) => ({
                code: `critic_${f.category}` as string,
                severity: 'warning' as const,
                message: `[${f.severity}/${f.category}] ${f.message}`,
              })),
              {
                code: 'FAILED_QUALITY_REVIEW',
                severity: 'blocking' as const,
                message: `El plan no paso la revision final de calidad (score: ${this.context.criticReport?.overallScore ?? '?'}/100, verdict: ${this.context.criticReport?.verdict ?? '?'}). ${this.context.criticReport?.reasoning ?? ''}`.trim(),
              },
            ]
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
            ...(this.context.finalPackage.qualityIssues ?? []),
            ...gateQualityIssues.filter((issue) =>
              !(this.context.finalPackage?.qualityIssues ?? []).some((existing) => existing.code === issue.code),
            ),
          ],
          agentOutcomes: [...this.agentOutcomes],
          degraded: hasFallbacks,
        }
      : null;

    const canPublish = publicationGate.publicationState === 'ready'
      && this.state.phase === 'done'
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
      package: finalPackage,
      pendingQuestions: null,
      scratchpad: this.scratchpad.getAll(),
      tokensUsed: this.scratchpad.totalTokens(),
      iterations: this.state.iteration,
      agentOutcomes: [...this.agentOutcomes],
      degraded: hasFallbacks,
      publicationState: publicationGate.publicationState,
      failureCode: publicationGate.failureCode,
      blockingAgents: publicationGate.blockingAgents,
    };
  }
}
