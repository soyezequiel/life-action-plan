import { DateTime } from 'luxon';

import type { PhaseIO } from '../phase-io';
import { generateDomainCard } from '../../domain/domain-knowledge/generator';
import type { AgentRuntime } from '../../runtime/types';
import { getCardsByGoalType, getKnowledgeCard, type DomainKnowledgeCard } from '../../domain/domain-knowledge/bank';
import type { HabitState, HabitStateStore } from '../../domain/habit-state';
import type { SlackPolicy } from '../../domain/slack-policy';
import type {
  BlockedSlot,
  SchedulerInput,
  SchedulingPreference,
  AvailabilityWindow,
  SchedulerOutput,
} from '../../scheduler/types';
import { solveSchedule } from '../../scheduler/solver';
import { classifyGoalWithRuntime } from './classify';
import { executeCoVeVerifier } from './cove-verifier';
import { generateAdaptiveResponse } from './adaptive';
import { executeHardValidator } from './hard-validator';
import { evaluateOperationalAcceptance } from './operational-acceptance';
import { packagePlan } from './packager';
import { buildProfile } from './profile';
import { executeRepairManager } from './repair-manager';
import { generateRequirements } from './requirements';
import { executeSoftValidator } from './soft-validator';
import { generateStrategy } from './strategy';
import { buildTemplate } from './template-builder';
import type {
  AdaptInput,
  AdaptOutput,
  AdaptiveActivityLog,
  ClassifyInput,
  ClassifyOutput,
  CoVeVerifyInput,
  CoVeVerifyOutput,
  HardValidateInput,
  HardValidateOutput,
  PackageInput,
  PackageOutput,
  PhaseIORegistryV5,
  ProfileInput,
  ProfileOutput,
  RepairInput,
  RepairOutput,
  RequirementsInput,
  RequirementsOutput,
  ScheduleInput,
  ScheduleOutput,
  SoftValidateInput,
  SoftValidateOutput,
  StrategyInput,
  StrategyOutput,
  TemplateInput,
  TemplateOutput,
} from './phase-io-v5';

export type PipelinePhaseV5 =
  | 'classify'
  | 'requirements'
  | 'profile'
  | 'strategy'
  | 'template'
  | 'schedule'
  | 'hardValidate'
  | 'softValidate'
  | 'coveVerify'
  | 'repair'
  | 'package'
  | 'adapt';

export interface FlowRunnerV5Config {
  runtime: AgentRuntime;
  text: string;
  answers: Record<string, string>;
  timezone: string;
  availability: AvailabilityWindow[];
  blocked?: BlockedSlot[];
  preferences?: SchedulingPreference[];
  weekStartDate?: string;
  goalId?: string;
  domainHint?: string;
  userFeedback?: string;
  activityLogs?: AdaptiveActivityLog[];
  adaptiveAnchorAt?: string;
  slackPolicy?: SlackPolicy;
  habitStateStore?: HabitStateStore;
  previousProgressionKeys?: string[];
  initialHabitStates?: HabitState[];
  inlineAdaptive?: boolean;
}

export interface FlowRunnerV5Tracker {
  onPhaseStart?: (
    phase: PipelinePhaseV5,
    details?: { input?: unknown; startedAt?: string | null }
  ) => void;
  onPhaseSuccess?: (phase: PipelinePhaseV5, result: unknown, io?: PhaseIO) => void;
  onPhaseFailure?: (phase: PipelinePhaseV5, error: Error) => void;
  onPhaseSkipped?: (phase: PipelinePhaseV5) => void;
  onProgress?: (phase: PipelinePhaseV5, progress: Record<string, unknown>) => void;
  onRepairAttempt?: (attempt: number, maxAttempts: number, findings: Array<{ severity: string; message: string }>) => void;
  onRepairExhausted?: (
    repairCycles: number,
    remainingFindings: Array<{ severity: string; message: string }>
  ) => void;
}

export interface FlowRunnerV5Context {
  config: FlowRunnerV5Config;
  phaseIO: PhaseIORegistryV5;
  classification?: ClassifyOutput;
  requirements?: RequirementsOutput;
  profile?: ProfileOutput;
  strategy?: StrategyOutput;
  template?: TemplateOutput;
  scheduleInput?: SchedulerInput;
  schedule?: SchedulerOutput;
  hardValidate?: HardValidateOutput;
  softValidate?: SoftValidateOutput;
  coveVerify?: CoVeVerifyOutput;
  repair?: RepairOutput;
  package?: PackageOutput;
  adapt?: AdaptOutput;
  habitStates?: HabitState[];
  habitProgressionKeys?: string[];
  domainCard?: DomainKnowledgeCard;
  repairCycles: number;
}

const DEFAULT_WEEK_START = '2026-03-30T00:00:00Z';
const MAX_REPAIR_CYCLES = 3;
const PHASE_PROCESSING: Record<PipelinePhaseV5, string> = {
  classify: 'Clasifica el objetivo y detecta senales para decidir el tipo de plan.',
  requirements: 'Genera preguntas concretas para completar el contexto minimo del objetivo.',
  profile: 'Convierte respuestas abiertas en un perfil operativo con disponibilidad y restricciones.',
  strategy: 'Arma el roadmap estrategico con etapas e hitos usando el perfil y el tipo de objetivo.',
  template: 'Baja la estrategia a actividades pedibles por el scheduler de manera deterministica.',
  schedule: 'Resuelve el calendario semanal con el scheduler MILP.',
  hardValidate: 'Verifica reglas duras del calendario contra disponibilidad, duracion y frecuencia.',
  softValidate: 'Evalua calidad practica del plan: fatiga, cambios de foco y descanso.',
  coveVerify: 'Hace chequeos de verificacion sobre el calendario y devuelve hallazgos explicitos.',
  repair: 'Aplica reparaciones sobre el calendario si hay fallas o advertencias relevantes.',
  package: 'Empaqueta el resultado final en items del plan, resumen y advertencias honestas.',
  adapt: 'Evalua adherencia, pronostica riesgo y emite el payload operativo para relanzar la semana.',
};

function hasFailingFindings(
  hard: HardValidateOutput | undefined,
  cove: CoVeVerifyOutput | undefined,
): boolean {
  return (hard?.findings.length ?? 0) > 0 || (cove?.findings.some((finding) => finding.severity === 'FAIL') ?? false);
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const STOP_WORDS = new Set([
  'quiero', 'quisiera', 'necesito', 'tengo', 'poder', 'como',
  'para', 'por', 'con', 'sin', 'una', 'uno', 'unos', 'unas',
  'los', 'las', 'del', 'que', 'mas', 'muy', 'pero', 'este',
  'esta', 'esto', 'eso', 'esa', 'ese', 'ser', 'estar', 'hacer',
  'aprender', 'lograr', 'mejorar', 'empezar', 'comenzar',
]);

function inferDomainLabel(text: string): string {
  const words = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .slice(0, 3);

  return words.join('-');
}

function supportsHabitState(classification: ClassifyOutput | undefined): boolean {
  if (!classification) {
    return false;
  }

  if (classification.extractedSignals.isRecurring || classification.extractedSignals.requiresSkillProgression) {
    return true;
  }

  return classification.goalType === 'QUANT_TARGET_TRACKING' || classification.goalType === 'IDENTITY_EXPLORATION';
}

function toRepairTrackerFindings(
  hard: HardValidateOutput,
  soft: SoftValidateOutput,
  cove: CoVeVerifyOutput,
): Array<{ severity: string; message: string }> {
  return [
    ...hard.findings.map((finding) => ({ severity: finding.severity, message: finding.description })),
    ...soft.findings.map((finding) => ({ severity: finding.severity, message: finding.suggestion_esAR })),
    ...cove.findings.map((finding) => ({ severity: finding.severity, message: finding.answer })),
  ];
}

async function resolveDomainCard(config: FlowRunnerV5Config, classification: ClassifyOutput): Promise<DomainKnowledgeCard | undefined> {
  if (config.domainHint) {
    const hinted = await getKnowledgeCard(config.domainHint);
    if (hinted) {
      return hinted;
    }
  }

  const normalized = config.text.toLowerCase();
  if (/\bguitarra\b/.test(normalized)) {
    return getKnowledgeCard('guitarra');
  }
  if (/\b(ingl[eé]s|idioma|idiomas|franc[eé]s|portugu[eé]s)\b/.test(normalized)) {
    return getKnowledgeCard('idiomas');
  }
  if (/\b(correr|running|maraton|5k|10k)\b/.test(normalized)) {
    return getKnowledgeCard('running');
  }

  const domainLabel = config.domainHint ?? inferDomainLabel(config.text);
  if (domainLabel) {
    try {
      return await generateDomainCard(config.runtime, {
        goalText: config.text,
        classification,
        domainLabel,
      });
    } catch {
      // Degrade to generic compatible cards when dynamic generation fails.
    }
  }

  const compatibleCards = await getCardsByGoalType(classification.goalType);
  return compatibleCards[0];
}

export class FlowRunnerV5 {
  private readonly context: FlowRunnerV5Context;

  constructor(config: FlowRunnerV5Config, initialState: Partial<FlowRunnerV5Context> = {}) {
    this.context = {
      config,
      phaseIO: {},
      repairCycles: 0,
      ...initialState,
    };
  }

  getContext(): FlowRunnerV5Context {
    return this.context;
  }

  async runFullPipeline(tracker: FlowRunnerV5Tracker = {}): Promise<FlowRunnerV5Context> {
    await this.runBuildPipeline(tracker);

    if (this.context.config.inlineAdaptive ?? true) {
      await this.executePhase('adapt', tracker);
    } else {
      tracker.onPhaseSkipped?.('adapt');
    }

    return this.context;
  }

  async runBuildPipeline(tracker: FlowRunnerV5Tracker = {}): Promise<FlowRunnerV5Context> {
    await this.executePhase('classify', tracker);
    await this.executePhase('requirements', tracker);
    await this.executePhase('profile', tracker);
    await this.executePhase('strategy', tracker);
    await this.executePhase('template', tracker);
    await this.executePhase('schedule', tracker);
    await this.executePhase('hardValidate', tracker);
    await this.executePhase('softValidate', tracker);
    await this.executePhase('coveVerify', tracker);

    let repaired = false;
    for (let cycle = 1; hasFailingFindings(this.context.hardValidate, this.context.coveVerify) && cycle <= MAX_REPAIR_CYCLES; cycle += 1) {
      this.context.repairCycles = cycle;
      const findings = toRepairTrackerFindings(
        this.context.hardValidate ?? { findings: [] },
        this.context.softValidate ?? { findings: [] },
        this.context.coveVerify ?? { findings: [] },
      );

      tracker.onRepairAttempt?.(cycle, MAX_REPAIR_CYCLES, findings);
      await this.executePhase('repair', tracker);

      if (this.context.repair?.status === 'escalated') {
        tracker.onRepairExhausted?.(cycle, this.context.repair.remainingFindings);
        break;
      }

      repaired = true;
      await this.executePhase('hardValidate', tracker);
      await this.executePhase('softValidate', tracker);
      await this.executePhase('coveVerify', tracker);
    }

    if (!repaired && !hasFailingFindings(this.context.hardValidate, this.context.coveVerify)) {
      tracker.onPhaseSkipped?.('repair');
    }

    const acceptance = evaluateOperationalAcceptance({
      hardValidate: this.context.hardValidate,
      coveVerify: this.context.coveVerify,
      repair: this.context.repair,
    });

    if (!acceptance.accepted) {
      tracker.onRepairExhausted?.(this.context.repairCycles, acceptance.remainingFindings);
      throw new Error(`${acceptance.reason}:${acceptance.remainingFindings.map((finding) => finding.message).join(' | ')}`);
    }

    await this.executePhase('package', tracker);
    return this.context;
  }

  async executePhase(phase: PipelinePhaseV5, tracker: FlowRunnerV5Tracker = {}): Promise<unknown> {
    try {
      switch (phase) {
        case 'classify':
          return await this.runClassifyPhase(tracker);
        case 'requirements':
          return await this.runRequirementsPhase(tracker);
        case 'profile':
          return await this.runProfilePhase(tracker);
        case 'strategy':
          return await this.runStrategyPhase(tracker);
        case 'template':
          return await this.runTemplatePhase(tracker);
        case 'schedule':
          return await this.runSchedulePhase(tracker);
        case 'hardValidate':
          return await this.runHardValidatePhase(tracker);
        case 'softValidate':
          return await this.runSoftValidatePhase(tracker);
        case 'coveVerify':
          return await this.runCoVePhase(tracker);
        case 'repair':
          return await this.runRepairPhase(tracker);
        case 'package':
          return await this.runPackagePhase(tracker);
        case 'adapt':
          return await this.runAdaptPhase(tracker);
        default:
          throw new Error(`UNSUPPORTED_V5_PHASE:${String(phase)}`);
      }
    } catch (error) {
      const finalError = error instanceof Error ? error : new Error(String(error));
      tracker.onPhaseFailure?.(phase, finalError);
      throw finalError;
    }
  }

  private weekStartDate(): string {
    return this.context.config.weekStartDate ?? DEFAULT_WEEK_START;
  }

  private resolveHabitProgressionKeys(): string[] {
    if ((this.context.config.previousProgressionKeys?.length ?? 0) > 0) {
      return Array.from(new Set(this.context.config.previousProgressionKeys));
    }

    if (!supportsHabitState(this.context.classification)) {
      return [];
    }

    const fallback = slugify(
      this.context.domainCard?.domainLabel ??
      this.context.config.domainHint ??
      this.context.config.goalId ??
      this.context.config.text,
    );

    return fallback ? [fallback] : [];
  }

  private async hydrateHabitStates(): Promise<void> {
    if ((this.context.habitStates?.length ?? 0) > 0) {
      return;
    }

    const providedStates = this.context.config.initialHabitStates;
    if ((providedStates?.length ?? 0) > 0) {
      this.context.habitStates = providedStates;
      return;
    }

    const progressionKeys = this.context.habitProgressionKeys ?? [];
    if (!this.context.config.habitStateStore || progressionKeys.length === 0) {
      this.context.habitStates = [];
      return;
    }

    this.context.habitStates = await this.context.config.habitStateStore.loadByProgressionKeys(progressionKeys);
  }

  private trackProgress(
    tracker: FlowRunnerV5Tracker,
    phase: PipelinePhaseV5,
    message: string,
    extra: Record<string, unknown> = {},
  ): void {
    tracker.onProgress?.(phase, { message, ...extra });
  }

  private announcePhaseStart<I>(
    tracker: FlowRunnerV5Tracker,
    phase: PipelinePhaseV5,
    input: I,
    startedAt: string,
  ): void {
    tracker.onPhaseStart?.(phase, {
      input,
      startedAt,
    });
  }

  private commitPhaseIO<I, O>(
    phase: keyof PhaseIORegistryV5,
    input: I,
    output: O,
    startedAt: string,
    tracker: FlowRunnerV5Tracker,
  ): O {
    const finishedAt = DateTime.utc().toISO() ?? startedAt;
    const io: PhaseIO<I, O> = {
      input,
      output,
      processing: PHASE_PROCESSING[phase as PipelinePhaseV5] ?? 'Fase v5.',
      startedAt,
      finishedAt,
      durationMs: Math.max(0, DateTime.fromISO(finishedAt).toMillis() - DateTime.fromISO(startedAt).toMillis()),
    };
    const phaseRegistry = this.context.phaseIO as Record<string, PhaseIO>;
    phaseRegistry[String(phase)] = io;
    tracker.onPhaseSuccess?.(phase as PipelinePhaseV5, output, io);
    return output;
  }

  private async runClassifyPhase(tracker: FlowRunnerV5Tracker): Promise<ClassifyOutput> {
    const startedAt = DateTime.utc().toISO() ?? '';
    const input: ClassifyInput = { text: this.context.config.text };
    this.announcePhaseStart(tracker, 'classify', input, startedAt);
    const output = await classifyGoalWithRuntime(this.context.config.runtime, input.text);
    this.context.classification = output;
    this.context.domainCard = await resolveDomainCard(this.context.config, output);
    this.context.habitProgressionKeys = this.resolveHabitProgressionKeys();
    await this.hydrateHabitStates();
    return this.commitPhaseIO('classify', input, output, startedAt, tracker);
  }

  private async runRequirementsPhase(tracker: FlowRunnerV5Tracker): Promise<RequirementsOutput> {
    if (!this.context.classification) {
      throw new Error('V5_REQUIREMENTS_NEEDS_CLASSIFICATION');
    }
    const startedAt = DateTime.utc().toISO() ?? '';
    const input: RequirementsInput = { classification: this.context.classification };
    this.announcePhaseStart(tracker, 'requirements', input, startedAt);
    this.trackProgress(tracker, 'requirements', 'Generando preguntas base.');
    const output = await generateRequirements(this.context.config.runtime, this.context.classification);
    this.context.requirements = output;
    return this.commitPhaseIO('requirements', input, output, startedAt, tracker);
  }

  private async runProfilePhase(tracker: FlowRunnerV5Tracker): Promise<ProfileOutput> {
    const startedAt = DateTime.utc().toISO() ?? '';
    const input: ProfileInput = { answers: this.context.config.answers };
    this.announcePhaseStart(tracker, 'profile', input, startedAt);
    this.trackProgress(tracker, 'profile', 'Convirtiendo respuestas en perfil operativo.');
    const output = await buildProfile(this.context.config.runtime, input.answers);
    this.context.profile = output;
    return this.commitPhaseIO('profile', input, output, startedAt, tracker);
  }

  private async runStrategyPhase(tracker: FlowRunnerV5Tracker): Promise<StrategyOutput> {
    if (!this.context.profile || !this.context.classification) {
      throw new Error('V5_STRATEGY_NEEDS_PROFILE_AND_CLASSIFICATION');
    }
    const startedAt = DateTime.utc().toISO() ?? '';
    const input: StrategyInput = {
      profile: this.context.profile,
      classification: this.context.classification,
      habitStates: this.context.habitStates ?? [],
    };
    this.announcePhaseStart(tracker, 'strategy', input, startedAt);
    this.trackProgress(tracker, 'strategy', 'Armando roadmap estrategico.');
    const output = await generateStrategy(this.context.config.runtime, input, this.context.domainCard);
    this.context.strategy = output;
    return this.commitPhaseIO('strategy', input, output, startedAt, tracker);
  }

  private async runTemplatePhase(tracker: FlowRunnerV5Tracker): Promise<TemplateOutput> {
    if (!this.context.strategy || !this.context.classification || !this.context.profile) {
      throw new Error('V5_TEMPLATE_NEEDS_STRATEGY_PROFILE_CLASSIFICATION');
    }
    const startedAt = DateTime.utc().toISO() ?? '';
    const input: TemplateInput = { roadmap: this.context.strategy };
    this.announcePhaseStart(tracker, 'template', input, startedAt);
    const output = buildTemplate(input, this.context.classification, this.context.profile, this.context.domainCard);
    output.activities = output.activities.map((activity, index) => ({
      ...activity,
      goalId: this.context.config.goalId ?? activity.goalId ?? `goal-v5-${index + 1}`,
    }));
    this.context.template = output;
    return this.commitPhaseIO('template', input, output, startedAt, tracker);
  }

  private async runSchedulePhase(tracker: FlowRunnerV5Tracker): Promise<ScheduleOutput> {
    if (!this.context.template) {
      throw new Error('V5_SCHEDULE_NEEDS_TEMPLATE');
    }
    const startedAt = DateTime.utc().toISO() ?? '';
    const input: ScheduleInput = { activities: this.context.template.activities };
    this.announcePhaseStart(tracker, 'schedule', input, startedAt);
    const schedulerInput: SchedulerInput = {
      activities: input.activities,
      availability: this.context.config.availability,
      blocked: this.context.config.blocked ?? [],
      preferences: this.context.config.preferences ?? [],
      timezone: this.context.config.timezone,
      weekStartDate: this.weekStartDate(),
    };
    this.context.scheduleInput = schedulerInput;
    this.trackProgress(tracker, 'schedule', 'Resolviendo agenda semanal.');
    const output = await solveSchedule(schedulerInput);
    this.context.schedule = output;
    return this.commitPhaseIO('schedule', input, output, startedAt, tracker);
  }

  private async runHardValidatePhase(tracker: FlowRunnerV5Tracker): Promise<HardValidateOutput> {
    if (!this.context.schedule || !this.context.scheduleInput || !this.context.profile) {
      throw new Error('V5_HARD_VALIDATE_NEEDS_SCHEDULE_INPUT_PROFILE');
    }
    const startedAt = DateTime.utc().toISO() ?? '';
    const input: HardValidateInput = {
      schedule: this.context.schedule,
      originalInput: this.context.scheduleInput,
      profile: this.context.profile,
      timezone: this.context.config.timezone,
    };
    this.announcePhaseStart(tracker, 'hardValidate', input, startedAt);
    const output = await executeHardValidator(input);
    this.context.hardValidate = output;
    return this.commitPhaseIO('hardValidate', input, output, startedAt, tracker);
  }

  private async runSoftValidatePhase(tracker: FlowRunnerV5Tracker): Promise<SoftValidateOutput> {
    if (!this.context.schedule || !this.context.profile) {
      throw new Error('V5_SOFT_VALIDATE_NEEDS_SCHEDULE_AND_PROFILE');
    }
    const startedAt = DateTime.utc().toISO() ?? '';
    const input: SoftValidateInput = {
      schedule: this.context.schedule,
      profile: this.context.profile,
      timezone: this.context.config.timezone,
    };
    this.announcePhaseStart(tracker, 'softValidate', input, startedAt);
    const output = await executeSoftValidator(input);
    this.context.softValidate = output;
    return this.commitPhaseIO('softValidate', input, output, startedAt, tracker);
  }

  private async runCoVePhase(tracker: FlowRunnerV5Tracker): Promise<CoVeVerifyOutput> {
    if (!this.context.schedule || !this.context.profile) {
      throw new Error('V5_COVE_NEEDS_SCHEDULE_AND_PROFILE');
    }
    const startedAt = DateTime.utc().toISO() ?? '';
    const input: CoVeVerifyInput = {
      schedule: this.context.schedule,
      timezone: this.context.config.timezone,
      profile: this.context.profile,
    };
    this.announcePhaseStart(tracker, 'coveVerify', input, startedAt);
    this.trackProgress(tracker, 'coveVerify', 'Verificando consistencia del calendario.');
    const output = await executeCoVeVerifier(this.context.config.runtime, input);
    this.context.coveVerify = output;
    return this.commitPhaseIO('coveVerify', input, output, startedAt, tracker);
  }

  private async runRepairPhase(tracker: FlowRunnerV5Tracker): Promise<RepairOutput> {
    if (!this.context.schedule || !this.context.scheduleInput || !this.context.profile) {
      throw new Error('V5_REPAIR_NEEDS_SCHEDULE_INPUT_PROFILE');
    }
    const startedAt = DateTime.utc().toISO() ?? '';
    const input: RepairInput = {
      schedule: this.context.schedule,
      hardFindings: this.context.hardValidate?.findings ?? [],
      softFindings: this.context.softValidate?.findings ?? [],
      coveFindings: this.context.coveVerify?.findings ?? [],
      originalInput: this.context.scheduleInput,
      profile: this.context.profile,
    };
    this.announcePhaseStart(tracker, 'repair', input, startedAt);
    this.trackProgress(tracker, 'repair', 'Aplicando reparaciones sobre el calendario.', {
      cycle: this.context.repairCycles,
    });
    const output = await executeRepairManager(this.context.config.runtime, input);
    this.context.repair = output;
    this.context.schedule = output.finalSchedule;
    return this.commitPhaseIO('repair', input, output, startedAt, tracker);
  }

  private async runPackagePhase(tracker: FlowRunnerV5Tracker): Promise<PackageOutput> {
    if (!this.context.schedule) {
      throw new Error('V5_PACKAGE_NEEDS_SCHEDULE');
    }
    const startedAt = DateTime.utc().toISO() ?? '';
    const input: PackageInput = {
      finalSchedule: this.context.schedule,
      classification: this.context.classification,
      roadmap: this.context.strategy,
      goalText: this.context.config.text,
      goalId: this.context.config.goalId,
      weekStartDate: this.weekStartDate(),
      profile: this.context.profile,
      currentHabitStates: this.context.habitStates,
      habitProgressionKeys: this.context.habitProgressionKeys,
      slackPolicy: this.context.config.slackPolicy,
      hardFindings: this.context.hardValidate?.findings ?? [],
      softFindings: this.context.softValidate?.findings ?? [],
      coveFindings: this.context.coveVerify?.findings ?? [],
      repairSummary: this.context.repair
        ? {
            status: this.context.repair.status,
            patchesApplied: this.context.repair.patchesApplied,
            iterations: this.context.repair.iterations,
            scoreAfter: this.context.repair.scoreAfter,
          }
        : undefined,
      timezone: this.context.config.timezone,
    };
    this.announcePhaseStart(tracker, 'package', input, startedAt);
    const output = packagePlan(input);
    if (this.context.config.habitStateStore && output.habitStates.length > 0) {
      await this.context.config.habitStateStore.save(output.habitStates);
    }
    this.context.package = output;
    this.context.habitStates = output.habitStates;
    return this.commitPhaseIO('package', input, output, startedAt, tracker);
  }

  private async runAdaptPhase(tracker: FlowRunnerV5Tracker): Promise<AdaptOutput> {
    if (!this.context.package) {
      throw new Error('V5_ADAPT_NEEDS_PACKAGE');
    }
    const startedAt = DateTime.utc().toISO() ?? '';
    const input: AdaptInput = {
      package: this.context.package,
      activityLogs: this.context.config.activityLogs ?? [],
      anchorAt: this.context.config.adaptiveAnchorAt ?? startedAt,
      userFeedback: this.context.config.userFeedback,
    };
    this.announcePhaseStart(tracker, 'adapt', input, startedAt);
    this.trackProgress(tracker, 'adapt', 'Evaluando riesgo y modo de adaptacion de la semana.');
    const output = await generateAdaptiveResponse(input);
    this.context.adapt = output;
    return this.commitPhaseIO('adapt', input, output, startedAt, tracker);
  }
}
