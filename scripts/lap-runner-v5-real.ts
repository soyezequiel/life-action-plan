import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { spawn } from 'child_process';
import { DateTime } from 'luxon';

import type { HabitState, HabitStateStore } from '../src/lib/domain/habit-state';
import { buildBrowserOpenCommand } from '../src/lib/auth/codex-browser-login';
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
const SHOWCASE_CALENDAR_WEEKS = 20;
const DEFAULT_GOAL_ID = 'goal-english-b2-v5-real';
const DEFAULT_DOMAIN_HINT = 'idiomas';
const DEFAULT_GOAL_TEXT = 'Quiero estudiar ingles para llegar a B2 en cinco meses, sostener conversaciones de 20 minutos sin pasarme al espanol, aumentar mi vocabulario activo y leer textos cortos todas las semanas.';
const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const PREVIOUS_HABIT_STATE: HabitState = {
  progressionKey: DEFAULT_DOMAIN_HINT,
  weeksActive: 10,
  level: 2,
  currentDose: {
    sessionsPerWeek: 5,
    minimumViable: {
      minutes: 15,
      description: 'Repasar vocabulario con una escucha corta'
    }
  },
  protectedFromReset: true
};

interface ShowcaseFrequency {
  activityId: string;
  title: string;
  sessionsPerWeek: number;
  minutesPerSession?: number;
}

interface ShowcasePhase {
  phaseId: string;
  title: string;
  startWeek: number;
  endWeek: number;
  startDate: string;
  endDate: string;
  goalIds: string[];
  objectives: string[];
  frequencies: ShowcaseFrequency[];
  milestoneIds?: string[];
}

interface ShowcaseWeek {
  weekIndex: number;
  startDate: string;
  endDate: string;
  scheduledEvents: Array<Record<string, unknown>>;
}

interface ShowcasePackage {
  summary_esAR: string;
  qualityScore: number;
  warnings: string[];
  habitStates: HabitState[];
  implementationIntentions: string[];
  items: Array<Record<string, unknown>>;
  tradeoffs?: Array<Record<string, unknown>>;
  timezone: string;
  plan: {
    goalIds: string[];
    timezone: string;
    createdAt: string;
    updatedAt: string;
    skeleton: {
      horizonWeeks: number;
      goalIds: string[];
      phases: ShowcasePhase[];
      milestones: Array<Record<string, unknown>>;
    };
    detail: {
      horizonWeeks: number;
      startDate: string;
      endDate: string;
      scheduledEvents: Array<Record<string, unknown>>;
      weeks: ShowcaseWeek[];
    };
    operational: Record<string, unknown>;
  };
}

interface CliOptions {
  modelId?: string;
  outputFile?: string;
  thinkingMode?: 'enabled' | 'disabled';
  inlineAdaptive?: boolean;
  openBrowser?: boolean;
  diagnostic?: boolean;
  verbose?: boolean;
  json?: boolean;
}

interface ViewerLinks {
  baseUrl: string;
  flowUrl: string;
  dashboardUrl: string;
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

    if (token === '--open-browser') {
      options.openBrowser = true;
      continue;
    }

    if (token === '--no-open-browser') {
      options.openBrowser = false;
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

function resolveBrowserAutoOpen(cliOpenBrowser?: boolean): boolean {
  if (typeof cliOpenBrowser === 'boolean') {
    return cliOpenBrowser;
  }

  const envValue = process.env.LAP_V5_REAL_OPEN_BROWSER?.trim().toLowerCase();
  if (envValue) {
    if (['1', 'true', 'yes', 'on'].includes(envValue)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(envValue)) {
      return false;
    }
  }

  return process.env.CI !== 'true' && Boolean(process.stdout.isTTY);
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

function resolveViewerLinks(): ViewerLinks {
  const port = process.env.PORT?.trim() || '3000';
  const baseUrl = `http://localhost:${port}`;

  return {
    baseUrl,
    flowUrl: `${baseUrl}/debug/flow`,
    dashboardUrl: `${baseUrl}/debug/plan-v5`
  };
}

async function canReachPage(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });

    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

function openUrlInBrowser(url: string): void {
  const browserOpenCommand = buildBrowserOpenCommand(url);
  const child = spawn(browserOpenCommand.command, browserOpenCommand.args, {
    detached: true,
    stdio: 'ignore',
  });

  child.on('error', (error) => {
    console.error(`[V5 Real] No pude abrir el navegador para ${url}: ${error.message}`);
  });
  child.unref();
}

async function canReachAnyPage(urls: string[]): Promise<boolean> {
  for (const url of urls) {
    if (await canReachPage(url)) {
      return true;
    }
  }

  return false;
}

async function maybeOpenPage(healthUrls: string[], targetUrl: string, label: string): Promise<void> {
  const reachable = await canReachAnyPage(healthUrls);
  if (!reachable) {
    console.error(`[V5 Real] No pude verificar ${label} en las URLs locales esperadas. Igual intento abrirlo.`);
  }

  openUrlInBrowser(targetUrl);
  console.error(`[V5 Real] Abriendo ${label}: ${targetUrl}`);
}

function buildDashboardLaunchUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set('openedAt', String(DateTime.now().toMillis()));
  return parsed.toString();
}

function extractActivityId(eventId: string): string {
  const match = eventId.match(/^(.*)_s\d+(?:_.+)?$/);
  return match?.[1] ?? eventId;
}

function buildShowcaseFrequencies(events: Array<Record<string, unknown>>): ShowcaseFrequency[] {
  const grouped = new Map<string, ShowcaseFrequency>();

  for (const event of events) {
    const id = typeof event.id === 'string' ? event.id : '';
    const title = typeof event.title === 'string' ? event.title : 'Actividad';
    const durationMin = typeof event.durationMin === 'number' ? event.durationMin : undefined;
    const activityId = extractActivityId(id);
    const existing = grouped.get(activityId);

    if (existing) {
      existing.sessionsPerWeek += 1;
      continue;
    }

    grouped.set(activityId, {
      activityId,
      title,
      sessionsPerWeek: 1,
      minutesPerSession: durationMin,
    });
  }

  return Array.from(grouped.values()).sort((left, right) => left.title.localeCompare(right.title));
}

function shiftShowcaseEventByWeeks(event: Record<string, unknown>, weeks: number): Record<string, unknown> {
  if (weeks === 0) {
    return event;
  }

  const startAt = typeof event.startAt === 'string' ? event.startAt : '';
  const shiftedStart = DateTime.fromISO(startAt, { zone: 'UTC' }).plus({ weeks }).toISO() ?? startAt;
  const id = typeof event.id === 'string' ? event.id : `event-${weeks + 1}`;

  return {
    ...event,
    id: `${id}-w${weeks + 1}`,
    startAt: shiftedStart,
  };
}

function buildShowcaseDetail(
  pkg: NonNullable<FlowRunnerV5['getContext'] extends () => infer C ? C extends { package?: infer P } ? P : never : never>,
  horizonWeeks: number,
): ShowcasePackage['plan']['detail'] {
  const templateWeekEvents = (
    Array.isArray(pkg.plan.operational.scheduledEvents) && pkg.plan.operational.scheduledEvents.length > 0
      ? pkg.plan.operational.scheduledEvents
      : pkg.plan.detail.weeks[0]?.scheduledEvents ?? pkg.plan.detail.scheduledEvents
  ) as Array<Record<string, unknown>>;
  const weekStart = DateTime.fromISO(DEFAULT_WEEK_START, { zone: 'UTC' }).setZone(DEFAULT_TIMEZONE).startOf('day');
  const weeks = Array.from({ length: horizonWeeks }, (_, index) => {
    const scheduledEvents = templateWeekEvents
      .map((event) => shiftShowcaseEventByWeeks(event, index))
      .sort((left, right) =>
        DateTime.fromISO(String(left.startAt ?? ''), { zone: 'UTC' }).toMillis() -
        DateTime.fromISO(String(right.startAt ?? ''), { zone: 'UTC' }).toMillis(),
      );

    return {
      weekIndex: index + 1,
      startDate: weekStart.plus({ weeks: index }).toISODate() ?? '',
      endDate: weekStart.plus({ weeks: index + 1 }).minus({ days: 1 }).toISODate() ?? '',
      scheduledEvents,
    };
  });

  return {
    horizonWeeks,
    startDate: weekStart.toISODate() ?? '',
    endDate: weekStart.plus({ weeks: horizonWeeks }).minus({ days: 1 }).toISODate() ?? '',
    scheduledEvents: weeks.flatMap((week) => week.scheduledEvents),
    weeks,
  };
}

function buildShowcaseSkeleton(
  pkg: NonNullable<FlowRunnerV5['getContext'] extends () => infer C ? C extends { package?: infer P } ? P : never : never>,
  strategy: NonNullable<FlowRunnerV5['getContext'] extends () => infer C ? C extends { strategy?: infer S } ? S : never : never> | undefined,
  frequencies: ShowcaseFrequency[],
  horizonWeeks: number,
): ShowcasePackage['plan']['skeleton'] {
  const weekStart = DateTime.fromISO(DEFAULT_WEEK_START, { zone: 'UTC' }).setZone(DEFAULT_TIMEZONE).startOf('day');
  const milestones = Array.isArray(pkg.plan.skeleton.milestones)
    ? pkg.plan.skeleton.milestones as Array<Record<string, unknown>>
    : [];
  const fallbackPhases = pkg.plan.skeleton.phases.map((phase) => ({
    name: phase.title,
    durationWeeks: Math.max(1, phase.endWeek - phase.startWeek + 1),
    focus_esAR: phase.objectives[0] ?? phase.title,
  }));
  const phasesSource = strategy?.phases?.length ? strategy.phases : fallbackPhases;
  const phases: ShowcasePhase[] = [];
  let cursorWeek = 1;

  for (let index = 0; index < phasesSource.length && cursorWeek <= horizonWeeks; index += 1) {
    const phase = phasesSource[index];
    const requestedDuration = Math.max(1, phase.durationWeeks ?? 4);
    const lastPhase = index === phasesSource.length - 1;
    const endWeek = lastPhase
      ? horizonWeeks
      : Math.min(horizonWeeks, cursorWeek + requestedDuration - 1);
    const startDate = weekStart.plus({ weeks: cursorWeek - 1 }).toISODate() ?? '';
    const endDate = weekStart.plus({ weeks: endWeek }).minus({ days: 1 }).toISODate() ?? '';
    const milestoneIds = milestones
      .filter((milestone) => {
        const dueDate = typeof milestone.dueDate === 'string' ? milestone.dueDate : '';
        const due = DateTime.fromISO(dueDate, { zone: DEFAULT_TIMEZONE });
        return due >= weekStart.plus({ weeks: cursorWeek - 1 }) && due <= weekStart.plus({ weeks: endWeek }).minus({ days: 1 });
      })
      .map((milestone) => String(milestone.id ?? ''));

    phases.push({
      phaseId: `phase-${index + 1}`,
      title: phase.name,
      startWeek: cursorWeek,
      endWeek,
      startDate,
      endDate,
      goalIds: pkg.plan.goalIds,
      objectives: [phase.focus_esAR],
      frequencies,
      milestoneIds,
    });

    cursorWeek = endWeek + 1;
  }

  if (phases.length === 0) {
    phases.push({
      phaseId: 'phase-1',
      title: DEFAULT_GOAL_TEXT,
      startWeek: 1,
      endWeek: horizonWeeks,
      startDate: weekStart.toISODate() ?? '',
      endDate: weekStart.plus({ weeks: horizonWeeks }).minus({ days: 1 }).toISODate() ?? '',
      goalIds: pkg.plan.goalIds,
      objectives: [DEFAULT_GOAL_TEXT],
      frequencies,
      milestoneIds: milestones.map((milestone) => String(milestone.id ?? '')),
    });
  }

  return {
    horizonWeeks,
    goalIds: pkg.plan.goalIds,
    phases,
    milestones,
  };
}

function buildShowcasePackage(
  pkg: NonNullable<FlowRunnerV5['getContext'] extends () => infer C ? C extends { package?: infer P } ? P : never : never>,
  strategy: NonNullable<FlowRunnerV5['getContext'] extends () => infer C ? C extends { strategy?: infer S } ? S : never : never> | undefined,
): ShowcasePackage {
  const roadmapWeeks = strategy?.phases?.reduce((total, phase) => total + Math.max(phase.durationWeeks ?? 0, 0), 0) ?? 0;
  const horizonWeeks = Math.max(SHOWCASE_CALENDAR_WEEKS, roadmapWeeks, pkg.plan.detail.weeks.length);
  const detail = buildShowcaseDetail(pkg, horizonWeeks);
  const frequencies = buildShowcaseFrequencies(detail.weeks[0]?.scheduledEvents ?? []);
  const skeleton = buildShowcaseSkeleton(pkg, strategy, frequencies, horizonWeeks);

  return {
    ...(pkg as unknown as ShowcasePackage),
    plan: {
      ...(pkg.plan as unknown as ShowcasePackage['plan']),
      skeleton,
      detail,
    },
  };
}

async function run(): Promise<void> {
  loadLocalEnv();

  const cliOptions = parseCliOptions(process.argv.slice(2));
  const inlineAdaptive = cliOptions.inlineAdaptive ?? true;
  const autoOpenBrowser = resolveBrowserAutoOpen(cliOptions.openBrowser);
  const thinkingMode = resolveThinkingMode(cliOptions.thinkingMode);
  const outputFile = resolve(process.cwd(), cliOptions.outputFile || DEFAULT_OUTPUT_FILE);
  const selection = await resolveRealRunnerSelection({
    cliModelId: cliOptions.modelId,
    thinkingMode
  });
  const modelId = selection.modelId;
  const viewerLinks = resolveViewerLinks();
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
      disponibilidad: 'Tengo unas 4 horas libres reales por dia habil repartidas entre manana temprano y despues del trabajo, mas dos bloques largos el sabado y el domingo.',
      frenos: 'Si acumulo demasiada exigencia seguida me saturo, y quiero evitar estudiar muy tarde para no cortar el descanso.',
      objetivo: 'Quiero llegar en unas 20 semanas a un nivel B2 funcional, hablar 20 minutos seguidos en ingles, leer textos cortos sin traducir todo y sostener el vocabulario activo.',
      experiencia: 'Ya sostuve unas cuantas semanas de estudio con Anki, podcasts y lectura, asi que no quiero volver a un plan de principiante absoluto.'
    },
    timezone: schedulingContext.timezone,
    availability: schedulingContext.availability,
    blocked: schedulingContext.blocked,
    weekStartDate: schedulingContext.weekStartDate,
    goalId: DEFAULT_GOAL_ID,
    domainHint: DEFAULT_DOMAIN_HINT,
    slackPolicy: {
      weeklyTimeBufferMin: 150,
      maxChurnMovesPerWeek: 3,
      frozenHorizonDays: 2
    },
    habitStateStore: createHabitStateStore(),
    previousProgressionKeys: [DEFAULT_DOMAIN_HINT],
    inlineAdaptive
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
  if (autoOpenBrowser) {
    await maybeOpenPage(
      [viewerLinks.flowUrl, viewerLinks.dashboardUrl, viewerLinks.baseUrl],
      viewerLinks.flowUrl,
      'viewer'
    );
  }

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
    const context = await runner.runFullPipeline(tracker);

    if (!context.package) {
      throw new Error('V5 real runner finished without package output.');
    }

    const outputPackage = buildShowcasePackage(context.package, context.strategy);

    runtimeRecorder.completeRun('success');
    collector.setRunCompletion('success', context.package.qualityScore);

    mkdirSync(resolve(outputFile, '..'), { recursive: true });
    writeFileSync(outputFile, JSON.stringify(outputPackage, null, 2), 'utf8');
    if (autoOpenBrowser) {
      await maybeOpenPage(
        [viewerLinks.dashboardUrl, viewerLinks.flowUrl, viewerLinks.baseUrl],
        buildDashboardLaunchUrl(viewerLinks.dashboardUrl),
        'resultados'
      );
    }

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
        summary_esAR: outputPackage.summary_esAR,
        qualityScore: outputPackage.qualityScore,
        warnings: outputPackage.warnings,
        skeletonPhases: outputPackage.plan.skeleton.phases.length,
        detailWeeks: outputPackage.plan.detail.weeks.length,
        detailEvents: outputPackage.plan.detail.scheduledEvents.length,
        calendarEndDate: outputPackage.plan.detail.endDate,
        operationalDays: Array.isArray(outputPackage.plan.operational.days) ? outputPackage.plan.operational.days.length : 0,
        habitStates: outputPackage.habitStates.length,
        outputFile
      }, null, 2));
      console.log('--- V5 REAL PIPELINE RESULT END ---\n');
    }

    console.error('[V5 Real] Vistas disponibles:');
    console.error(`[V5 Real] Flow Viewer: ${viewerLinks.flowUrl}`);
    console.error(`[V5 Real] Dashboard V5: ${viewerLinks.dashboardUrl}`);
    console.error(`[V5 Real] JSON: ${outputFile}`);
    console.error('[V5 Real] Si no ves las vistas, levanta la app con npm run dev y abre esas URLs.');
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
