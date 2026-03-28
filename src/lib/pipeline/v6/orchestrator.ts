import type { AgentRuntime } from '../../runtime/types';
import type { DomainKnowledgeCard } from '../../domain/domain-knowledge/bank';
import { getKnowledgeCard } from '../../domain/domain-knowledge/bank';
import { generateStrategy } from '../v5/strategy';
import type { GoalClassification } from '../../domain/goal-taxonomy';
import type { StrategyInput } from '../v5/phase-io-v5';
import { Scratchpad } from './scratchpad';
import { nextPhase, requiresUserInput, phaseProgressScore } from './state-machine';
import type {
  ClarificationRound,
  CriticReport,
  FeasibilityReport,
  GoalInterpretation,
  OrchestratorConfig,
  OrchestratorContext,
  OrchestratorPhase,
  OrchestratorState,
  PlanPackage,
  ReasoningEntry,
  SchedulerOutput,
  StrategicDraft,
  UserProfileV5,
  V6Agent,
  V6AgentName,
} from './types';

// ─── Public interfaces ──────────────────────────────────────────────────────

export interface UserContext {
  profile: UserProfileV5 | null;
  timezone: string;
  locale: string;
}

export interface OrchestratorResult {
  status: 'completed' | 'needs_input' | 'failed';
  package: PlanPackage | null;
  pendingQuestions: ClarificationRound | null;
  scratchpad: ReasoningEntry[];
  tokensUsed: number;
  iterations: number;
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
}

// ─── Dynamic agent registry loader ──────────────────────────────────────────

async function loadRegistry(): Promise<AgentRegistryLike | null> {
  try {
    // Dynamic import to handle missing registry during parallel development.
    // Uses string concatenation to prevent static analysis from failing on missing module.
    const registryPath = './agent-registry';
    const mod = await (import(/* webpackIgnore: true */ registryPath) as Promise<Record<string, unknown>>);
    if (typeof mod.createDefaultRegistry === 'function') {
      return (mod.createDefaultRegistry as () => AgentRegistryLike)();
    }
    return null;
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
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ─── Classification builder ─────────────────────────────────────────────────

function buildClassification(interpretation: GoalInterpretation | null): GoalClassification {
  return {
    goalType: interpretation?.goalType ?? 'FINITE_PROJECT',
    confidence: interpretation?.confidence ?? 0.5,
    risk: interpretation?.riskFlags[0] ?? 'LOW',
    extractedSignals: {
      isRecurring: false,
      hasDeliverable: false,
      hasNumericTarget: false,
      requiresSkillProgression: false,
      dependsOnThirdParties: false,
      isOpenEnded: false,
      isRelational: false,
    },
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

  constructor(config: Partial<OrchestratorConfig>, runtime: AgentRuntime) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.runtime = runtime;
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
    };
  }

  // ─── Main entry point ───────────────────────────────────────────────────

  async run(goalText: string, userCtx: UserContext): Promise<OrchestratorResult> {
    this.initializeContext(goalText, userCtx);
    this.state.phase = 'interpret';
    this.registry = await loadRegistry();

    return this.executeLoop();
  }

  // ─── Resume after user provides clarification answers ───────────────────

  async resume(answers: Record<string, string>): Promise<OrchestratorResult> {
    this.pendingAnswers = answers;
    this.context.userAnswers = { ...this.context.userAnswers, ...answers };

    // Re-enter the loop at clarify phase
    if (this.state.phase !== 'clarify') {
      this.state.phase = 'clarify';
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

  // ─── Core loop ──────────────────────────────────────────────────────────

  private async executeLoop(): Promise<OrchestratorResult> {
    while (this.state.phase !== 'done' && this.state.phase !== 'failed') {
      // Safety valve: force finish
      if (this.shouldForceFinish()) {
        this.state.phase = 'package';
      }

      // If phase needs user input and we don't have it, pause
      if (requiresUserInput(this.state.phase) && !this.hasPendingAnswers()) {
        return this.pauseForInput();
      }

      // Execute the current phase
      let result: unknown;
      try {
        result = await this.executePhase(this.state.phase);
      } catch (error) {
        // Agent-level errors are caught inside executePhase via fallback.
        // If we still get here, record and force to package.
        this.recordEntry(this.state.phase, this.phaseToAgent(this.state.phase), {
          action: `Error in ${this.state.phase}`,
          reasoning: error instanceof Error ? error.message : 'Unknown error',
          result: 'Phase failed, moving to package',
        });
        this.state.phase = 'package';
        continue;
      }

      // Record in scratchpad
      this.recordEntry(this.state.phase, this.phaseToAgent(this.state.phase), {
        action: `Executed ${this.state.phase}`,
        reasoning: this.extractReasoning(result),
        result: this.summarizeResult(result),
      });

      // Update context with result
      this.mergeResult(this.state.phase, result);

      // Determine next phase
      const previousPhase = this.state.phase;
      this.state.phase = nextPhase(this.state.phase, this.state, this.context, result);
      this.state.iteration++;

      // Update progress score
      this.updateProgressScore(previousPhase, this.state.phase);

      // Sync scratchpad entries into state
      this.state.tokenBudget.used = this.scratchpad.totalTokens();
      this.state.scratchpad = this.scratchpad.getAll();
    }

    return this.buildFinalResult();
  }

  // ─── Initialization ─────────────────────────────────────────────────────

  private initializeContext(goalText: string, userCtx: UserContext): void {
    this.context.goalText = goalText;
    this.context.userProfile = userCtx.profile;
    this.state.iteration = 0;
    this.state.clarifyRounds = 0;
    this.state.revisionCycles = 0;
    this.state.progressScore = 0;
    this.progressHistory = [];
  }

  // ─── Safety valves ──────────────────────────────────────────────────────

  private shouldForceFinish(): boolean {
    // Max iterations
    if (this.state.iteration >= this.state.maxIterations) {
      return true;
    }

    // Token budget
    if (this.state.tokenBudget.used >= this.state.tokenBudget.limit) {
      return true;
    }

    // Stalled progress: no increase in 2 consecutive iterations
    if (this.progressHistory.length >= MAX_STALLED_ITERATIONS) {
      const recent = this.progressHistory.slice(-MAX_STALLED_ITERATIONS);
      const allSame = recent.every((score) => score <= recent[0]);
      if (allSame && this.state.phase !== 'package' && this.state.phase !== 'done') {
        return true;
      }
    }

    return false;
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

  private pauseForInput(): OrchestratorResult {
    const lastClarification = this.context.clarificationRounds.length > 0
      ? this.context.clarificationRounds[this.context.clarificationRounds.length - 1]
      : null;

    return {
      status: 'needs_input',
      package: null,
      pendingQuestions: lastClarification,
      scratchpad: this.scratchpad.getAll(),
      tokensUsed: this.scratchpad.totalTokens(),
      iterations: this.state.iteration,
    };
  }

  // ─── Phase execution ────────────────────────────────────────────────────

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
    const agent = await this.getAgent<{ goalText: string }, GoalInterpretation>('goal-interpreter');
    const input = { goalText: this.context.goalText };

    if (agent) {
      try {
        return await agent.execute(input, this.runtime);
      } catch {
        return agent.fallback(input);
      }
    }

    // Minimal fallback if agent not available
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

    if (agent) {
      try {
        return await agent.execute(input, this.runtime);
      } catch {
        return agent.fallback(input);
      }
    }

    // Fallback: ready to advance
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

    // Resolve domain card if available
    if (!this.context.domainCard && this.context.interpretation?.suggestedDomain) {
      try {
        const card = await getKnowledgeCard(this.context.interpretation.suggestedDomain);
        if (card) {
          this.context.domainCard = card;
        }
      } catch {
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
      classification: buildClassification(this.context.interpretation),
    };

    try {
      return await generateStrategy(
        this.runtime,
        strategyInput,
        this.context.domainCard ?? undefined,
      );
    } catch {
      // Deterministic fallback
      return {
        phases: [
          { name: 'Fundamentos', durationWeeks: 4, focus_esAR: 'Construir las bases del objetivo' },
          { name: 'Desarrollo', durationWeeks: 4, focus_esAR: 'Avanzar hacia el objetivo principal' },
        ],
        milestones: ['Completar fase de fundamentos'],
      };
    }
  }

  private async executeCheck(): Promise<FeasibilityReport> {
    this.lastAction = 'Checking feasibility';

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

    if (agent) {
      try {
        return await agent.execute(input, this.runtime);
      } catch {
        return agent.fallback(input);
      }
    }

    // Fallback — optimistic
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

  private async executeSchedule(): Promise<SchedulerOutput | null> {
    this.lastAction = 'Scheduling activities';

    // The scheduler agent may not exist yet during parallel development
    const agent = await this.getAgent<unknown, SchedulerOutput>('scheduler');

    if (agent) {
      const input = {
        strategicDraft: this.context.strategicDraft,
        availability: this.context.userProfile,
        domainCard: this.context.domainCard,
      };
      try {
        return await agent.execute(input, this.runtime);
      } catch {
        return agent.fallback(input);
      }
    }

    // Scheduler not available — return null, downstream handles gracefully
    return null;
  }

  private async executeCritique(): Promise<CriticReport> {
    this.lastAction = 'Critiquing plan';

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
      scheduleQualityScore: schedule?.metrics?.fillRate ?? 0,
      unscheduledCount: schedule?.unscheduled?.length ?? 0,
      scheduleTradeoffs: schedule?.tradeoffs?.map((t) => t.question_esAR) ?? [],
      domainCard: this.context.domainCard,
      previousCriticReports: this.context.criticReport ? [this.context.criticReport] : [],
    };

    if (agent) {
      try {
        return await agent.execute(input, this.runtime);
      } catch {
        return agent.fallback(input);
      }
    }

    // Fallback — approve with reduced confidence
    return {
      overallScore: 60,
      findings: [],
      mustFix: [],
      shouldFix: [],
      verdict: 'approve',
      reasoning: 'Critic unavailable, proceeding with reduced confidence.',
    };
  }

  private async executeRevise(): Promise<StrategicDraft> {
    this.lastAction = 'Revising plan based on critic feedback';
    this.state.revisionCycles++;

    // Record critic findings in revision history
    if (this.context.criticReport) {
      this.context.revisionHistory.push({
        findings: this.context.criticReport.mustFix,
        appliedFixes: [],
      });
    }

    // Reuse v5 generateStrategy with critic findings as additional context
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
      goalText: `${this.context.goalText}\n\n[REVISION REQUIRED]\nCritic findings to address:\n${mustFixSummary}`,
      profile,
      classification: buildClassification(this.context.interpretation),
    };

    try {
      return await generateStrategy(
        this.runtime,
        strategyInput,
        this.context.domainCard ?? undefined,
      );
    } catch {
      // Return existing draft as-is if revision fails
      return this.context.strategicDraft ?? {
        phases: [{ name: 'Plan general', durationWeeks: 8, focus_esAR: 'Objetivo principal' }],
        milestones: ['Completar plan'],
      };
    }
  }

  private async executePackage(): Promise<PlanPackage | null> {
    this.lastAction = 'Packaging final plan';

    const agent = await this.getAgent<unknown, PlanPackage>('packager');

    if (agent) {
      const input = {
        context: this.context,
        scratchpadSummary: this.scratchpad.summarize(),
      };
      try {
        return await agent.execute(input, this.runtime);
      } catch {
        return agent.fallback(input);
      }
    }

    // Packager not available — return null
    return null;
  }

  // ─── Agent resolution ───────────────────────────────────────────────────

  private async getAgent<TInput, TOutput>(name: V6AgentName): Promise<V6Agent<TInput, TOutput> | null> {
    // Try registry first
    if (this.registry) {
      const agent = this.registry.get<TInput, TOutput>(name);
      if (agent) {
        return agent;
      }
    }

    // Fall back to direct import
    const directAgent = await loadAgentDirect(name);
    return directAgent as V6Agent<TInput, TOutput> | null;
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
          this.context.scheduleResult = result as SchedulerOutput;
        }
        break;
      case 'critique':
        this.context.criticReport = result as CriticReport;
        break;
      case 'package':
        if (result !== null) {
          this.context.finalPackage = result as PlanPackage;
        }
        break;
    }
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
    return {
      status: this.state.phase === 'done' ? 'completed' : 'failed',
      package: this.context.finalPackage,
      pendingQuestions: null,
      scratchpad: this.scratchpad.getAll(),
      tokensUsed: this.scratchpad.totalTokens(),
      iterations: this.state.iteration,
    };
  }
}
