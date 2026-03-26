import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

import type { HabitState, HabitStateStore } from '../src/lib/domain/habit-state';
import { getProvider } from '../src/lib/providers/provider-factory';
import { createPipelineRuntimeRecorder } from '../src/lib/flow/pipeline-runtime-data';
import { FlowRunnerV5 } from '../src/lib/pipeline/v5/runner';
import type { FlowRunnerV5Tracker } from '../src/lib/pipeline/v5/runner';
import { buildSchedulingContextFromRunnerConfig } from '../src/lib/pipeline/v5/scheduling-context';
import { getCodexAuthFilePath, getCodexAuthIdentity } from '../src/lib/auth/codex-auth';
import {
  fetchCodexUsageSnapshot,
  formatCodexCreditsLine,
  formatCodexRateLimitLines,
  formatCodexUsageDeltaLines
} from '../src/lib/auth/codex-usage';
import { resolveRealRunnerSelection } from '../src/lib/runtime/real-runner-selection';
import type { AvailabilityWindow, BlockedSlot } from '../src/lib/scheduler/types';
import { traceCollector } from '../src/debug/trace-collector';
import { DiagnosticCollector } from './diagnostic-collector';
import { renderDiagnosticReport, type RenderMode } from './diagnostic-renderer';

const DEFAULT_OUTPUT_FILE = resolve(process.cwd(), 'tmp/pipeline-v5-real.json');
const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';
const DEFAULT_WEEK_START = '2026-03-30T03:00:00Z';
const DEFAULT_GOAL_TEXT = 'Quiero aprender a tocar la guitarra y sostener una practica semanal realista sin quemarme.';
const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const PREVIOUS_HABIT_STATE: HabitState = {
  progressionKey: 'guitarra',
  weeksActive: 6,
  level: 2,
  currentDose: {
    sessionsPerWeek: 4,
    minimumViable: {
      minutes: 10,
      description: 'Tocar aunque sea una rueda de acordes'
    }
  },
  protectedFromReset: true
};

interface CliOptions {
  modelId?: string;
  outputFile?: string;
  thinkingMode?: 'enabled' | 'disabled';
  inlineAdaptive?: boolean;
  diagnostic?: boolean;
  verbose?: boolean;
  json?: boolean;
}

function loadLocalEnv(): void {
  if (typeof process.loadEnvFile !== 'function') {
    return;
  }

  for (const envFile of ['.env.local', '.env']) {
    const envPath = resolve(process.cwd(), envFile);
    if (existsSync(envPath)) {
      try {
        process.loadEnvFile(envPath);
      } catch {
        // Ignore malformed env files to preserve the runner execution path.
      }
    }
  }
}

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--model' && next) {
      options.modelId = next;
      index += 1;
      continue;
    }

    if (token === '--output' && next) {
      options.outputFile = next;
      index += 1;
      continue;
    }

    if (token === '--thinking' && (next === 'enabled' || next === 'disabled')) {
      options.thinkingMode = next;
      index += 1;
      continue;
    }

    if (token === '--inline-adapt') {
      options.inlineAdaptive = true;
      continue;
    }

    if (token === '--build-only') {
      options.inlineAdaptive = false;
      continue;
    }

    if (token === '--diagnostic') {
      options.diagnostic = true;
      continue;
    }

    if (token === '--verbose') {
      options.verbose = true;
      options.diagnostic = true;
      continue;
    }

    if (token === '--json') {
      options.json = true;
      options.diagnostic = true;
    }
  }

  return options;
}

function resolveDiagnosticMode(options: CliOptions): { enabled: boolean; mode: RenderMode } {
  if (options.json) return { enabled: true, mode: 'json' };
  if (options.verbose) return { enabled: true, mode: 'verbose' };
  if (options.diagnostic) return { enabled: true, mode: 'human' };
  return { enabled: false, mode: 'human' };
}

function resolveThinkingMode(cliThinkingMode?: 'enabled' | 'disabled'): 'enabled' | 'disabled' | undefined {
  if (cliThinkingMode) {
    return cliThinkingMode;
  }

  const envValue = process.env.LAP_V5_REAL_THINKING_MODE?.trim();
  if (envValue === 'enabled' || envValue === 'disabled') {
    return envValue;
  }

  return undefined;
}

function makeAvailability(startTime = '07:00', endTime = '22:00'): AvailabilityWindow[] {
  return WEEK_DAYS.map((day) => ({ day, startTime, endTime }));
}

function makeBlocked(): BlockedSlot[] {
  return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map((day) => ({
    day,
    startTime: '09:00',
    endTime: '18:00',
    reason: 'Trabajo',
  }));
}

function createHabitStateStore(): HabitStateStore {
  let savedStates: HabitState[] = [];

  return {
    async loadByProgressionKeys(progressionKeys: string[]) {
      console.error(`[V5 Real] HabitState.loadByProgressionKeys -> ${progressionKeys.join(', ') || '(none)'}`);
      return progressionKeys.includes(PREVIOUS_HABIT_STATE.progressionKey) ? [PREVIOUS_HABIT_STATE] : [];
    },
    async save(states: HabitState[]) {
      savedStates = states;
      console.error(`[V5 Real] HabitState.save -> ${savedStates.map((state) => state.progressionKey).join(', ') || '(none)'}`);
    }
  };
}

function formatCodexAccountLabel(identity: Awaited<ReturnType<typeof getCodexAuthIdentity>>): string {
  if (!identity) {
    return 'Cuenta no identificada';
  }

  const parts = [
    identity.name,
    identity.email ? `<${identity.email}>` : null
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(' ');
  }

  return identity.accountId;
}

async function printCodexUsageSnapshot(stage: 'antes' | 'despues'): Promise<import('../src/lib/auth/codex-usage').CodexUsageSnapshot | null> {
  try {
    const snapshot = await fetchCodexUsageSnapshot();
    console.error(`[V5 Real] ${formatCodexCreditsLine(snapshot)} (${stage})`);
    for (const line of formatCodexRateLimitLines(snapshot, DEFAULT_TIMEZONE)) {
      console.error(`[V5 Real] ${line} (${stage})`);
    }
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[V5 Real] No pude leer el credito de Codex (${stage}): ${message}`);
    return null;
  }
}

function collectTraceUsage(traceId: string | null): { promptTokens: number; completionTokens: number; spans: number } {
  if (!traceId) {
    return { promptTokens: 0, completionTokens: 0, spans: 0 };
  }

  const trace = traceCollector.getSnapshot().find((snapshot) => snapshot.traceId === traceId);
  if (!trace) {
    return { promptTokens: 0, completionTokens: 0, spans: 0 };
  }

  return trace.spans.reduce((totals, span) => ({
    promptTokens: totals.promptTokens + (span.usage?.promptTokens ?? 0),
    completionTokens: totals.completionTokens + (span.usage?.completionTokens ?? 0),
    spans: totals.spans + (span.usage ? 1 : 0)
  }), { promptTokens: 0, completionTokens: 0, spans: 0 });
}

async function run(): Promise<void> {
  loadLocalEnv();

  const cliOptions = parseCliOptions(process.argv.slice(2));
  const thinkingMode = resolveThinkingMode(cliOptions.thinkingMode);
  const outputFile = resolve(process.cwd(), cliOptions.outputFile || DEFAULT_OUTPUT_FILE);
  const selection = await resolveRealRunnerSelection({
    cliModelId: cliOptions.modelId,
    thinkingMode
  });
  const modelId = selection.modelId;
  const runtime = getProvider(modelId, selection.runtimeConfig);
  const traceId = traceCollector.startTrace('cli-v5-real', modelId, {
    command: `npx tsx scripts/lap-runner-v5-real.ts ${process.argv.slice(2).join(' ')}`.trim()
  });
  const runtimeRecorder = createPipelineRuntimeRecorder({
    source: 'cli-v5',
    modelId,
    goalText: DEFAULT_GOAL_TEXT,
    outputFile
  });
  let runError: Error | null = null;
  const schedulingContext = buildSchedulingContextFromRunnerConfig({
    timezone: DEFAULT_TIMEZONE,
    weekStartDate: DEFAULT_WEEK_START,
    availability: makeAvailability(),
    blocked: makeBlocked(),
  });
  const runner = new FlowRunnerV5({
    runtime,
    text: DEFAULT_GOAL_TEXT,
    answers: {
      disponibilidad: 'Puedo practicar de lunes a viernes despues del trabajo y reservar un bloque mas largo el sabado.',
      frenos: 'Si llego cansado me cuesta empezar, y quiero evitar practicar muy tarde.',
      objetivo: 'Quiero consolidar la practica, mejorar acordes y poder tocar canciones completas.',
      experiencia: 'Ya sostuve algunas semanas de practica y no quiero volver a arrancar de cero.'
    },
    timezone: schedulingContext.timezone,
    availability: schedulingContext.availability,
    blocked: schedulingContext.blocked,
    weekStartDate: schedulingContext.weekStartDate,
    goalId: 'goal-guitar-v5-real',
    slackPolicy: {
      weeklyTimeBufferMin: 150,
      maxChurnMovesPerWeek: 3,
      frozenHorizonDays: 2
    },
    habitStateStore: createHabitStateStore(),
    inlineAdaptive: cliOptions.inlineAdaptive ?? false
  });

  const diagnosticMode = resolveDiagnosticMode(cliOptions);
  const authLabel = selection.runtimeConfig.authMode === 'codex-oauth' ? `Codex local (${getCodexAuthFilePath()})` : 'API key';
  const codexIdentity = selection.runtimeConfig.authMode === 'codex-oauth'
    ? await getCodexAuthIdentity()
    : null;
  let codexUsageBefore: import('../src/lib/auth/codex-usage').CodexUsageSnapshot | null = null;
  const collector = new DiagnosticCollector();
  collector.setRunMeta({
    modelId,
    authMode: authLabel,
    outputFile,
    startedAt: new Date().toISOString(),
    command: `npx tsx scripts/lap-runner-v5-real.ts ${process.argv.slice(2).join(' ')}`.trim(),
  });

  console.error(`[V5 Real] Modelo activo: ${modelId}`);
  console.error(`[V5 Real] Autenticacion: ${authLabel}`);
  if (codexIdentity) {
    const authSourceLabel = codexIdentity.authSource === 'lap' ? 'LAP independiente' : 'Codex compartida';
    const planLabel = codexIdentity.planType ? ` | plan=${codexIdentity.planType}` : '';
    console.error(`[V5 Real] Cuenta Codex: ${formatCodexAccountLabel(codexIdentity)}`);
    console.error(`[V5 Real] Account ID: ${codexIdentity.accountId}${planLabel}`);
    console.error(`[V5 Real] Fuente auth: ${authSourceLabel} (${codexIdentity.authFilePath})`);
    codexUsageBefore = await printCodexUsageSnapshot('antes');
  }
  console.error(`[V5 Real] Running ${modelId} -> ${outputFile}`);

  runtimeRecorder.startRun({
    source: 'cli-v5',
    modelId,
    goalText: DEFAULT_GOAL_TEXT,
    outputFile
  });

  const REPAIR_LOOP_PHASES = new Set(['hardValidate', 'softValidate', 'coveVerify', 'repair']);

  function isRepairLoopPhase(phase: string): phase is 'hardValidate' | 'softValidate' | 'coveVerify' | 'repair' {
    return REPAIR_LOOP_PHASES.has(phase);
  }

  function getRepairLoopCycle(phase: string, repairCycles: number): number {
    return phase === 'repair' ? Math.max(repairCycles, 1) : repairCycles + 1;
  }

  function summarizeRepairPhase(phase: string, output: unknown): string | null {
    const payload = output && typeof output === 'object' ? output as Record<string, unknown> : null;
    if (!payload) return null;
    if (phase === 'hardValidate') {
      return `${Array.isArray(payload.findings) ? payload.findings.length : 0} FAIL`;
    }
    if (phase === 'softValidate' || phase === 'coveVerify') {
      const findings = Array.isArray(payload.findings) ? payload.findings : [];
      const failCount = findings.filter((f) => f && typeof f === 'object' && (f as Record<string, unknown>).severity === 'FAIL').length;
      if (failCount > 0) return `${failCount} FAIL`;
      const warnCount = findings.filter((f) => f && typeof f === 'object' && (f as Record<string, unknown>).severity === 'WARN').length;
      if (warnCount > 0) return `${warnCount} WARN`;
      return `${findings.filter((f) => f && typeof f === 'object' && (f as Record<string, unknown>).severity === 'INFO').length} INFO`;
    }
    return `${Array.isArray(payload.patchesApplied) ? payload.patchesApplied.length : 0} patches`;
  }

  const tracker: FlowRunnerV5Tracker = {
    onPhaseStart: (phase, details) => {
      runtimeRecorder.markPhaseStart(phase, {
        startedAt: details?.startedAt ?? null,
        input: details?.input
      });
      if (isRepairLoopPhase(phase)) {
        const cycle = getRepairLoopCycle(phase, runtimeRecorder.getSnapshot().repairCycles);
        runtimeRecorder.markRepairCyclePhaseStart(cycle, phase, {
          startedAt: details?.startedAt ?? null
        });
      }
      console.error(`[V5 Real] -> ${phase}`);
    },
    onPhaseSuccess: (phase, _result, io) => {
      runtimeRecorder.markPhaseSuccess(phase, io);
      collector.recordPhaseSuccess(phase, io);
      if (isRepairLoopPhase(phase)) {
        const cycle = getRepairLoopCycle(phase, runtimeRecorder.getSnapshot().repairCycles);
        runtimeRecorder.markRepairCyclePhaseComplete(cycle, phase, 'success', {
          io,
          summaryLabel: summarizeRepairPhase(phase, io?.output)
        });
        if (phase === 'repair') {
          const payload = io?.output && typeof io.output === 'object' ? io.output as Record<string, unknown> : null;
          const snapshot = runtimeRecorder.getSnapshot();
          const attemptFindings = snapshot.repairAttempts.slice().reverse().find((a) => a.attempt === cycle)?.findings ?? [];
          runtimeRecorder.finalizeRepairCycle(cycle, {
            status: 'repaired',
            findings: attemptFindings,
            scoreBefore: typeof payload?.scoreBefore === 'number' ? payload.scoreBefore : null,
            scoreAfter: typeof payload?.scoreAfter === 'number' ? payload.scoreAfter : null
          });
        }
      }
      if (phase === 'classify') {
        const domainCard = runner.getContext().domainCard;
        if (domainCard) {
          runtimeRecorder.setDomainCardMeta({
            domainLabel: domainCard.domainLabel,
            method: domainCard.generationMeta.method,
            confidence: domainCard.generationMeta.confidence
          });
        }
      }
    },
    onPhaseFailure: (phase, error) => {
      runtimeRecorder.markPhaseFailure(phase, error);
      collector.recordPhaseFailure(phase, error);
      if (isRepairLoopPhase(phase)) {
        const cycle = getRepairLoopCycle(phase, runtimeRecorder.getSnapshot().repairCycles);
        runtimeRecorder.markRepairCyclePhaseComplete(cycle, phase, 'error', {
          summaryLabel: error.message
        });
      }
    },
    onPhaseSkipped: (phase) => {
      runtimeRecorder.markPhaseSkipped(phase, `Phase ${phase} skipped.`);
      collector.recordPhaseSkipped(phase);
      if (phase === 'repair') {
        const cycle = runtimeRecorder.getSnapshot().repairCycles + 1;
        runtimeRecorder.markRepairCyclePhaseComplete(cycle, 'repair', 'skipped', {
          summaryLabel: 'Sin fallas'
        });
        const ctx = runner.getContext();
        const findings = [
          ...(ctx.hardValidate?.findings ?? []).map((f) => ({ severity: f.severity, message: f.description })),
          ...(ctx.softValidate?.findings ?? []).map((f) => ({ severity: f.severity, message: f.suggestion_esAR })),
          ...(ctx.coveVerify?.findings ?? []).map((f) => ({ severity: f.severity, message: f.answer }))
        ];
        runtimeRecorder.finalizeRepairCycle(cycle, { status: 'clean', findings });
      }
      console.error(`[V5 Real] skipped: ${phase}`);
    },
    onProgress: (phase, progress) => {
      runtimeRecorder.recordProgress(phase, progress);
      const message = typeof progress.message === 'string' ? progress.message : '';
      console.error(`[V5 Real] progress ${phase}${message ? `: ${message}` : ''}`);
    },
    onRepairAttempt: (attempt, maxAttempts, findings) => {
      runtimeRecorder.recordRepairAttempt(attempt, maxAttempts, findings);
      collector.recordRepairAttempt(attempt, maxAttempts, findings);
      console.error(`[V5 Real] repair ${attempt}/${maxAttempts} with ${findings.length} findings`);
    },
    onRepairExhausted: (repairCycles, remainingFindings) => {
      runtimeRecorder.markRepairExhausted();
      collector.recordRepairExhausted(repairCycles, remainingFindings);
      runtimeRecorder.markRepairCyclePhaseComplete(repairCycles, 'repair', 'exhausted', {
        summaryLabel: 'Agotado'
      });
      runtimeRecorder.finalizeRepairCycle(repairCycles, {
        status: 'exhausted',
        findings: remainingFindings
      });
    }
  };

  try {
    const context = cliOptions.inlineAdaptive
      ? await runner.runFullPipeline(tracker)
      : await runner.runBuildPipeline(tracker);

    if (!context.package) {
      throw new Error('V5 real runner finished without package output.');
    }

    runtimeRecorder.completeRun('success');
    collector.setRunCompletion('success', context.package.qualityScore);

    mkdirSync(resolve(outputFile, '..'), { recursive: true });
    writeFileSync(outputFile, JSON.stringify(context.package, null, 2), 'utf8');

    if (diagnosticMode.enabled) {
      const report = collector.getReport();
      const rendered = renderDiagnosticReport(report, diagnosticMode.mode);
      if (rendered.stderr) console.error(rendered.stderr);
      console.log(rendered.stdout);

      const hasUnresolvedFails = report.findings.some((f) => f.severity === 'FAIL');
      if (hasUnresolvedFails && (report.run.qualityScore ?? 1) < 0.5) {
        process.exitCode = 2;
      }
    } else {
      console.log('\n--- V5 REAL PIPELINE RESULT START ---');
      console.log(JSON.stringify({
        modelId,
        summary_esAR: context.package.summary_esAR,
        qualityScore: context.package.qualityScore,
        warnings: context.package.warnings,
        skeletonPhases: context.package.plan.skeleton.phases.length,
        detailWeeks: context.package.plan.detail.weeks.length,
        operationalDays: context.package.plan.operational.days.length,
        habitStates: context.package.habitStates.length,
        outputFile
      }, null, 2));
      console.log('--- V5 REAL PIPELINE RESULT END ---\n');
    }
  } catch (error) {
    runError = error instanceof Error ? error : new Error(String(error));
    runtimeRecorder.completeRun('error', {
      message: error instanceof Error ? error.message : String(error)
    });
    collector.setRunCompletion('error');

    if (diagnosticMode.enabled) {
      const report = collector.getReport();
      const rendered = renderDiagnosticReport(report, diagnosticMode.mode);
      if (rendered.stderr) console.error(rendered.stderr);
      console.log(rendered.stdout);
    }

    throw error;
  } finally {
    const traceUsage = collectTraceUsage(traceId);
    if (traceUsage.spans > 0) {
      runtimeRecorder.setRunMetadata({
        tokensUsed: {
          input: traceUsage.promptTokens,
          output: traceUsage.completionTokens
        }
      });
      console.error(
        `[V5 Real] Tokens consumidos: entrada=${traceUsage.promptTokens} | salida=${traceUsage.completionTokens} | llamadas=${traceUsage.spans}`
      );
    }

    if (codexIdentity) {
      const codexUsageAfter = await printCodexUsageSnapshot('despues');
      for (const deltaLine of formatCodexUsageDeltaLines(codexUsageBefore, codexUsageAfter)) {
        console.error(`[V5 Real] ${deltaLine}`);
      }
    }

    if (traceId) {
      if (runError) {
        traceCollector.failTrace(traceId, runError);
      } else {
        traceCollector.completeTrace(traceId);
      }
    }
  }
}

run().catch((error) => {
  console.error('[V5 Real] Runtime error:', error);
  process.exit(1);
});
