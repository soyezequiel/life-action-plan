import type { PhaseIO } from '../src/lib/pipeline/phase-io';
import type {
  ClassifyOutput,
  ProfileOutput,
  StrategyOutput,
  TemplateOutput,
  ScheduleOutput,
  HardValidateOutput,
  SoftValidateOutput,
  CoVeVerifyOutput,
  RepairOutput,
  PackageOutput,
  AdaptOutput,
  RepairAttemptRecord,
} from '../src/lib/pipeline/shared/phase-io';
import type { PipelinePhaseV5 } from '../src/lib/flow/pipeline-runtime-data';
import { normalizeAllFindings, type NormalizedFinding } from './diagnostic-findings';

// ─── Report interfaces ──────────────────────────────────────────────────────

export interface RunSummary {
  startedAt: string;
  finishedAt: string | null;
  durationMs: number;
  modelId: string;
  authMode: string;
  outputFile: string;
  status: 'success' | 'error';
  qualityScore: number | null;
  command: string;
}

export interface PhaseRow {
  phase: string;
  status: 'ok' | 'warn' | 'fail' | 'skipped';
  durationMs: number | null;
  keyMetric: string;
}

export interface SchedulerDiag {
  fillRate: number | null;
  solverStatus: string | null;
  solverTimeMs: number | null;
  eventsPlaced: number;
  eventsRequested: number;
  unscheduled: Array<{ activityId: string; reason: string }>;
}

export interface RepairCycleDiag {
  cycle: number;
  findingsBefore: number;
  scoreBefore: number | null;
  scoreAfter: number | null;
  patchesApplied: number;
  status: string;
}

export interface RepairDiag {
  cycles: number;
  status: string;
  timeline: RepairCycleDiag[];
  attempts: RepairAttemptRecord[];
}

export interface QualityDiag {
  qualityScore: number | null;
  warningsCount: number;
  itemsCount: number;
  warnings: string[];
}

export interface ClassificationDiag {
  goalType: string | null;
  confidence: number | null;
  risk: string | null;
}

export interface ProfileDiag {
  freeHoursWeekday: number | null;
  freeHoursWeekend: number | null;
  energyLevel: string | null;
  constraintsCount: number;
}

export interface ModelDiag {
  modelId: string;
  authMode: string;
}

export interface DiagnosticReport {
  run: RunSummary;
  phases: PhaseRow[];
  findings: NormalizedFinding[];
  scheduler: SchedulerDiag;
  repair: RepairDiag;
  quality: QualityDiag;
  classification: ClassificationDiag;
  profile: ProfileDiag;
  model: ModelDiag;
  firstFailingPhase: string | null;
  suggestedInspectionOrder: string[];
}

// ─── Phase metric extraction ────────────────────────────────────────────────

function classifyKeyMetric(output: ClassifyOutput): string {
  return `${output.goalType} (conf: ${output.confidence.toFixed(2)}, risk: ${output.risk})`;
}

function requirementsKeyMetric(output: { questions: string[] }): string {
  return `${output.questions.length} questions`;
}

function profileKeyMetric(output: ProfileOutput): string {
  return `${output.freeHoursWeekday}h wd / ${output.freeHoursWeekend}h we / ${output.energyLevel}`;
}

function strategyKeyMetric(output: StrategyOutput): string {
  return `${output.phases.length} phases, ${output.milestones.length} milestones`;
}

function templateKeyMetric(output: TemplateOutput): string {
  return `${output.activities.length} activities`;
}

function scheduleKeyMetric(output: ScheduleOutput): string {
  const m = output.metrics;
  return `fill: ${m.fillRate.toFixed(2)} ${m.solverStatus} (${m.solverTimeMs}ms) ${output.events.length} events`;
}

function hardValidateKeyMetric(output: HardValidateOutput): string {
  return output.findings.length === 0 ? '0 findings' : `${output.findings.length} FAIL`;
}

function softValidateKeyMetric(output: SoftValidateOutput): string {
  const warn = output.findings.filter((f) => f.severity === 'WARN').length;
  const info = output.findings.filter((f) => f.severity === 'INFO').length;
  return `${warn} WARN, ${info} INFO`;
}

function coveVerifyKeyMetric(output: CoVeVerifyOutput): string {
  const fail = output.findings.filter((f) => f.severity === 'FAIL').length;
  const warn = output.findings.filter((f) => f.severity === 'WARN').length;
  return `${fail} FAIL, ${warn} WARN`;
}

function repairKeyMetric(output: RepairOutput): string {
  return `${output.status} ${output.patchesApplied.length} patches (${output.scoreBefore.toFixed(2)} -> ${output.scoreAfter.toFixed(2)})`;
}

function packageKeyMetric(output: PackageOutput): string {
  return `quality: ${output.qualityScore.toFixed(2)}, ${output.items.length} items, ${output.warnings.length} warnings`;
}

function adaptKeyMetric(output: AdaptOutput): string {
  return `${output.mode} risk: ${output.overallRisk}`;
}

type MetricExtractor = (output: unknown) => string;

const METRIC_EXTRACTORS: Partial<Record<PipelinePhaseV5, MetricExtractor>> = {
  classify: (o) => classifyKeyMetric(o as ClassifyOutput),
  requirements: (o) => requirementsKeyMetric(o as { questions: string[] }),
  profile: (o) => profileKeyMetric(o as ProfileOutput),
  strategy: (o) => strategyKeyMetric(o as StrategyOutput),
  template: (o) => templateKeyMetric(o as TemplateOutput),
  schedule: (o) => scheduleKeyMetric(o as ScheduleOutput),
  hardValidate: (o) => hardValidateKeyMetric(o as HardValidateOutput),
  softValidate: (o) => softValidateKeyMetric(o as SoftValidateOutput),
  coveVerify: (o) => coveVerifyKeyMetric(o as CoVeVerifyOutput),
  repair: (o) => repairKeyMetric(o as RepairOutput),
  package: (o) => packageKeyMetric(o as PackageOutput),
  adapt: (o) => adaptKeyMetric(o as AdaptOutput),
};

// ─── Collector ──────────────────────────────────────────────────────────────

interface PhaseRecord {
  phase: PipelinePhaseV5;
  status: 'ok' | 'warn' | 'fail' | 'skipped';
  durationMs: number | null;
  keyMetric: string;
  output: unknown;
}

export class DiagnosticCollector {
  private startedAt = '';
  private finishedAt: string | null = null;
  private modelId = '';
  private authMode = '';
  private outputFile = '';
  private command = '';
  private status: 'success' | 'error' = 'success';
  private qualityScore: number | null = null;

  private phaseRecords: PhaseRecord[] = [];
  private repairAttempts: RepairAttemptRecord[] = [];
  private repairCycles: RepairCycleDiag[] = [];
  private repairCycleCount = 0;
  private repairStatus = 'none';

  private classificationOutput: ClassifyOutput | null = null;
  private profileOutput: ProfileOutput | null = null;
  private scheduleOutput: ScheduleOutput | null = null;
  private templateOutput: TemplateOutput | null = null;
  private hardOutput: HardValidateOutput | null = null;
  private softOutput: SoftValidateOutput | null = null;
  private coveOutput: CoVeVerifyOutput | null = null;
  private repairOutput: RepairOutput | null = null;
  private packageOutput: PackageOutput | null = null;
  private adaptOutput: AdaptOutput | null = null;

  setRunMeta(meta: {
    modelId: string;
    authMode: string;
    outputFile: string;
    startedAt: string;
    command: string;
  }): void {
    this.modelId = meta.modelId;
    this.authMode = meta.authMode;
    this.outputFile = meta.outputFile;
    this.startedAt = meta.startedAt;
    this.command = meta.command;
  }

  setRunCompletion(status: 'success' | 'error', qualityScore?: number): void {
    this.status = status;
    this.finishedAt = new Date().toISOString();
    this.qualityScore = qualityScore ?? null;
  }

  recordPhaseSuccess(phase: PipelinePhaseV5, io: PhaseIO | undefined): void {
    const output = io?.output;
    let keyMetric = '-';
    const extractor = METRIC_EXTRACTORS[phase];
    if (extractor && output) {
      try {
        keyMetric = extractor(output);
      } catch {
        keyMetric = '(extraction error)';
      }
    }

    const hasWarnings = phase === 'softValidate' || phase === 'coveVerify';
    let status: PhaseRecord['status'] = 'ok';
    if (hasWarnings && output && typeof output === 'object') {
      const findings = (output as Record<string, unknown>).findings;
      if (Array.isArray(findings)) {
        const hasFail = findings.some((f) => f && typeof f === 'object' && (f as Record<string, unknown>).severity === 'FAIL');
        const hasWarn = findings.some((f) => f && typeof f === 'object' && (f as Record<string, unknown>).severity === 'WARN');
        if (hasFail) status = 'fail';
        else if (hasWarn) status = 'warn';
      }
    }
    if (phase === 'hardValidate' && output && typeof output === 'object') {
      const findings = (output as Record<string, unknown>).findings;
      if (Array.isArray(findings) && findings.length > 0) status = 'fail';
    }

    this.phaseRecords.push({ phase, status, durationMs: io?.durationMs ?? null, keyMetric, output });
    this.storePhaseOutput(phase, output);
  }

  recordPhaseFailure(phase: PipelinePhaseV5, error: Error): void {
    this.phaseRecords.push({
      phase,
      status: 'fail',
      durationMs: null,
      keyMetric: error.message.slice(0, 80),
      output: null,
    });
  }

  recordPhaseSkipped(phase: PipelinePhaseV5): void {
    this.phaseRecords.push({
      phase,
      status: 'skipped',
      durationMs: null,
      keyMetric: '-',
      output: null,
    });
    if (phase === 'repair') {
      this.repairStatus = 'clean';
    }
  }

  recordRepairAttempt(cycle: number, _max: number, findings: Array<{ severity: string; message: string }>): void {
    this.repairCycleCount = cycle;
    this.repairCycles.push({
      cycle,
      findingsBefore: findings.length,
      scoreBefore: null,
      scoreAfter: null,
      patchesApplied: 0,
      status: 'pending',
    });
  }

  recordRepairExhausted(_cycles: number, _remaining: Array<{ severity: string; message: string }>): void {
    this.repairStatus = 'exhausted';
    const last = this.repairCycles[this.repairCycles.length - 1];
    if (last) last.status = 'exhausted';
  }

  getReport(): DiagnosticReport {
    this.enrichRepairTimeline();

    const durationMs = this.finishedAt
      ? new Date(this.finishedAt).getTime() - new Date(this.startedAt).getTime()
      : 0;

    const run: RunSummary = {
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      durationMs,
      modelId: this.modelId,
      authMode: this.authMode,
      outputFile: this.outputFile,
      status: this.status,
      qualityScore: this.qualityScore,
      command: this.command,
    };

    const phases: PhaseRow[] = this.phaseRecords.map((r) => ({
      phase: r.phase,
      status: r.status,
      durationMs: r.durationMs,
      keyMetric: r.keyMetric,
    }));

    const findings = normalizeAllFindings(
      this.hardOutput?.findings ?? [],
      this.softOutput?.findings ?? [],
      this.coveOutput?.findings ?? [],
      this.repairOutput?.attempts ?? [],
    );

    const scheduler: SchedulerDiag = {
      fillRate: this.scheduleOutput?.metrics.fillRate ?? null,
      solverStatus: this.scheduleOutput?.metrics.solverStatus ?? null,
      solverTimeMs: this.scheduleOutput?.metrics.solverTimeMs ?? null,
      eventsPlaced: this.scheduleOutput?.events.length ?? 0,
      eventsRequested: this.templateOutput?.activities.reduce((sum, a) => sum + a.frequencyPerWeek, 0) ?? 0,
      unscheduled: this.scheduleOutput?.unscheduled.map((u) => ({
        activityId: u.activityId,
        reason: u.reason,
      })) ?? [],
    };

    const repair: RepairDiag = {
      cycles: this.repairCycleCount,
      status: this.repairStatus,
      timeline: this.repairCycles,
      attempts: this.repairOutput?.attempts ?? [],
    };

    const quality: QualityDiag = {
      qualityScore: this.qualityScore ?? this.packageOutput?.qualityScore ?? null,
      warningsCount: this.packageOutput?.warnings.length ?? 0,
      itemsCount: this.packageOutput?.items.length ?? 0,
      warnings: this.packageOutput?.warnings ?? [],
    };

    const classification: ClassificationDiag = {
      goalType: this.classificationOutput?.goalType ?? null,
      confidence: this.classificationOutput?.confidence ?? null,
      risk: this.classificationOutput?.risk ?? null,
    };

    const profile: ProfileDiag = {
      freeHoursWeekday: this.profileOutput?.freeHoursWeekday ?? null,
      freeHoursWeekend: this.profileOutput?.freeHoursWeekend ?? null,
      energyLevel: this.profileOutput?.energyLevel ?? null,
      constraintsCount: this.profileOutput?.scheduleConstraints.length ?? 0,
    };

    const model: ModelDiag = {
      modelId: this.modelId,
      authMode: this.authMode,
    };

    const failPhase = this.phaseRecords.find((r) => r.status === 'fail');

    const fileSet = new Set<string>();
    for (const f of findings) {
      for (const file of f.relatedFiles) fileSet.add(file);
    }

    return {
      run,
      phases,
      findings,
      scheduler,
      repair,
      quality,
      classification,
      profile,
      model,
      firstFailingPhase: failPhase?.phase ?? null,
      suggestedInspectionOrder: [...fileSet],
    };
  }

  private storePhaseOutput(phase: PipelinePhaseV5, output: unknown): void {
    switch (phase) {
      case 'classify':
        this.classificationOutput = output as ClassifyOutput;
        break;
      case 'profile':
        this.profileOutput = output as ProfileOutput;
        break;
      case 'template':
        this.templateOutput = output as TemplateOutput;
        break;
      case 'schedule':
        this.scheduleOutput = output as ScheduleOutput;
        break;
      case 'hardValidate':
        this.hardOutput = output as HardValidateOutput;
        break;
      case 'softValidate':
        this.softOutput = output as SoftValidateOutput;
        break;
      case 'coveVerify':
        this.coveOutput = output as CoVeVerifyOutput;
        break;
      case 'repair':
        this.repairOutput = output as RepairOutput;
        this.repairStatus = (output as RepairOutput).status;
        break;
      case 'package':
        this.packageOutput = output as PackageOutput;
        this.qualityScore = (output as PackageOutput).qualityScore;
        break;
      case 'adapt':
        this.adaptOutput = output as AdaptOutput;
        break;
    }
  }

  private enrichRepairTimeline(): void {
    if (!this.repairOutput) return;
    for (const cycle of this.repairCycles) {
      cycle.scoreBefore = this.repairOutput.scoreBefore;
      cycle.scoreAfter = this.repairOutput.scoreAfter;
      cycle.patchesApplied = this.repairOutput.patchesApplied.length;
      if (cycle.status === 'pending') {
        cycle.status = this.repairOutput.status;
      }
    }
  }
}
