import { DateTime } from 'luxon';

import { traceCollector } from '../../debug/trace-collector';
import type { Perfil } from '../../shared/schemas/perfil';
import type {
  PlanSimulationProgress,
  PlanSimulationSnapshot,
  ProgressRow,
  SimulationFinding,
  SimulationMode,
  SimulationStatus
} from '../../shared/types/lap-api';

type ProgressHandler = (progress: Omit<PlanSimulationProgress, 'planId'>) => Promise<void> | void;

interface SimulationInput {
  profile: Perfil;
  rows: ProgressRow[];
  timezone: string;
  locale: string;
  mode: SimulationMode;
}

interface ScheduledProgressItem {
  id: string;
  date: string;
  weekday: number;
  startHour: number;
  endHour: number;
  duration: number;
  description: string;
}

function nowIso(): string {
  return DateTime.utc().toISO() ?? '2026-03-21T00:00:00.000Z';
}

function parseTimeToMinutes(value: string | null | undefined, fallbackMinutes: number): number {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return fallbackMinutes;
  }

  const hours = Number.parseInt(match[1] ?? '0', 10);
  const minutes = Number.parseInt(match[2] ?? '0', 10);
  return (hours * 60) + minutes;
}

function parseScheduledItem(row: ProgressRow, timezone: string): ScheduledProgressItem | null {
  if (!row.notas) {
    return null;
  }

  try {
    const parsed = JSON.parse(row.notas) as { hora?: string; duracion?: number };
    if (!parsed.hora || typeof parsed.duracion !== 'number') {
      return null;
    }

    const start = DateTime.fromISO(`${row.fecha}T${parsed.hora}`, { zone: timezone });
    if (!start.isValid) {
      return null;
    }

    return {
      id: row.id,
      date: row.fecha,
      weekday: start.weekday,
      startHour: start.hour * 60 + start.minute,
      endHour: (start.hour * 60 + start.minute) + parsed.duracion,
      duration: parsed.duracion,
      description: row.descripcion
    };
  } catch {
    return null;
  }
}

function buildSummary(findings: SimulationFinding[]): PlanSimulationSnapshot['summary'] {
  const pass = findings.filter((finding) => finding.status === 'PASS').length;
  const warn = findings.filter((finding) => finding.status === 'WARN').length;
  const fail = findings.filter((finding) => finding.status === 'FAIL').length;
  const missing = findings.filter((finding) => finding.status === 'MISSING').length;

  let overallStatus: SimulationStatus = 'PASS';
  if (fail > 0) {
    overallStatus = 'FAIL';
  } else if (missing > 0) {
    overallStatus = 'MISSING';
  } else if (warn > 0) {
    overallStatus = 'WARN';
  }

  return { overallStatus, pass, warn, fail, missing };
}

function computeQualityScore(summary: PlanSimulationSnapshot['summary']): number {
  return Math.max(
    0,
    100 - (summary.fail * 25) - (summary.warn * 10) - (summary.missing * 15)
  );
}

function selectInteractiveFindings(findings: SimulationFinding[]): SimulationFinding[] {
  const grouped = new Map<string, SimulationFinding>();

  for (const finding of findings) {
    const groupKey = finding.code === 'outside_awake_hours' || finding.code === 'missing_schedule'
      ? 'schedule'
      : finding.code === 'overlaps_work'
        ? 'work'
        : 'load';

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, finding);
    }
  }

  return Array.from(grouped.values());
}

function evaluateSimulation(input: SimulationInput): PlanSimulationSnapshot {
  const participant = input.profile.participantes[0];
  const wakeMinutes = parseTimeToMinutes(participant?.rutinaDiaria?.porDefecto?.despertar, 7 * 60);
  const sleepMinutes = parseTimeToMinutes(participant?.rutinaDiaria?.porDefecto?.dormir, 23 * 60);
  const workStartMinutes = parseTimeToMinutes(participant?.rutinaDiaria?.porDefecto?.trabajoInicio, 9 * 60);
  const workEndMinutes = parseTimeToMinutes(participant?.rutinaDiaria?.porDefecto?.trabajoFin, 18 * 60);
  const weekdayCapacity = (participant?.calendario?.horasLibresEstimadas?.diasLaborales ?? 2) * 60;
  const weekendCapacity = (participant?.calendario?.horasLibresEstimadas?.diasDescanso ?? 4) * 60;
  const parsedItems = input.rows.map((row) => parseScheduledItem(row, input.timezone));
  const findings: SimulationFinding[] = [];

  if (input.rows.length === 0) {
    findings.push({ status: 'MISSING', code: 'no_plan_items' });
    const summary = buildSummary(findings);

    return {
      ranAt: nowIso(),
      mode: input.mode,
      periodLabel: 'Semana actual',
      findings,
      summary,
      qualityScore: computeQualityScore(summary)
    };
  }

  if (parsedItems.some((item) => item === null)) {
    findings.push({ status: 'MISSING', code: 'missing_schedule' });
  }

  const scheduledItems = parsedItems.filter((item): item is ScheduledProgressItem => Boolean(item));
  const itemsByDate = new Map<string, ScheduledProgressItem[]>();

  for (const item of scheduledItems) {
    const bucket = itemsByDate.get(item.date) ?? [];
    bucket.push(item);
    itemsByDate.set(item.date, bucket);

    if (item.startHour < wakeMinutes || item.endHour > sleepMinutes) {
      findings.push({
        status: 'FAIL',
        code: 'outside_awake_hours',
        params: { date: item.date, description: item.description }
      });
    }

    const isWeekday = item.weekday >= 1 && item.weekday <= 5;
    if (isWeekday && item.startHour < workEndMinutes && item.endHour > workStartMinutes) {
      findings.push({
        status: 'FAIL',
        code: 'overlaps_work',
        params: { date: item.date, description: item.description }
      });
    }
  }

  for (const [, items] of itemsByDate) {
    const sortedItems = [...items].sort((left, right) => left.startHour - right.startHour);
    const totalMinutes = sortedItems.reduce((sum, item) => sum + item.duration, 0);
    const capacity = sortedItems[0].weekday >= 6 ? weekendCapacity : weekdayCapacity;

    for (let index = 1; index < sortedItems.length; index += 1) {
      const previous = sortedItems[index - 1];
      const current = sortedItems[index];

      if (current.startHour < previous.endHour) {
        findings.push({
          status: 'FAIL',
          code: 'day_over_capacity',
          params: { date: current.date, reason: 'overlap' }
        });
        break;
      }
    }

    if (totalMinutes > capacity) {
      findings.push({
        status: 'FAIL',
        code: 'day_over_capacity',
        params: { date: sortedItems[0].date, totalMinutes, capacity }
      });
    } else if (capacity > 0 && totalMinutes >= Math.round(capacity * 0.85)) {
      findings.push({
        status: 'WARN',
        code: 'day_high_load',
        params: { date: sortedItems[0].date, totalMinutes, capacity }
      });
    }

    if (sortedItems.length > 3) {
      findings.push({
        status: totalMinutes > capacity ? 'FAIL' : 'WARN',
        code: 'too_many_activities',
        params: { date: sortedItems[0].date, count: sortedItems.length }
      });
    }
  }

  if (!findings.some((finding) => finding.code === 'outside_awake_hours' || finding.code === 'missing_schedule')) {
    findings.push({ status: 'PASS', code: 'schedule_ok' });
  }

  if (!findings.some((finding) => finding.code === 'overlaps_work')) {
    findings.push({ status: 'PASS', code: 'work_balance_ok' });
  }

  if (!findings.some((finding) => finding.code === 'day_over_capacity' || finding.code === 'too_many_activities')) {
    findings.push({ status: 'PASS', code: 'capacity_ok' });
  }

  if (!findings.some((finding) => finding.code === 'missing_schedule')) {
    findings.push({ status: 'PASS', code: 'metadata_ok' });
  }

  const selectedFindings = input.mode === 'interactive'
    ? selectInteractiveFindings(findings)
    : findings;
  const summary = buildSummary(findings);

  return {
    ranAt: nowIso(),
    mode: input.mode,
    periodLabel: 'Semana actual',
    findings: selectedFindings,
    summary,
    qualityScore: computeQualityScore(summary)
  };
}

async function emitProgress(
  onProgress: ProgressHandler | undefined,
  progress: Omit<PlanSimulationProgress, 'planId'>
): Promise<void> {
  await onProgress?.(progress);
}

export async function simulatePlanViabilityWithProgress(
  profile: Perfil,
  rows: ProgressRow[],
  options: {
    timezone: string;
    locale: string;
    mode?: SimulationMode;
    onProgress?: ProgressHandler;
  }
): Promise<PlanSimulationSnapshot> {
  const mode = options.mode ?? 'interactive';

  await emitProgress(options.onProgress, { mode, stage: 'schedule', current: 1, total: 6 });
  await emitProgress(options.onProgress, { mode, stage: 'work', current: 2, total: 6 });
  await emitProgress(options.onProgress, { mode, stage: 'load', current: 3, total: 6 });
  await emitProgress(options.onProgress, { mode, stage: 'load', current: 4, total: 6 });
  await emitProgress(options.onProgress, { mode, stage: 'load', current: 5, total: 6 });

  const simulation = evaluateSimulation({
    profile,
    rows,
    timezone: options.timezone,
    locale: options.locale,
    mode
  });

  await emitProgress(options.onProgress, { mode, stage: 'summary', current: 6, total: 6 });
  return simulation;
}

export async function executePlanSimulationWorkflow(
  profile: Perfil,
  rows: ProgressRow[],
  options: {
    planId: string;
    timezone: string;
    locale: string;
    mode: SimulationMode;
    executionMode: string;
    resourceOwner: string;
    onProgress?: (progress: Omit<PlanSimulationProgress, 'planId'>) => Promise<void> | void;
  }
): Promise<PlanSimulationSnapshot> {
  const { planId, timezone, locale, mode, executionMode, resourceOwner, onProgress } = options;
  const traceId = traceCollector.startTrace('plan-simulator', 'lap:plan-simulator', {
    planId,
    mode,
    executionMode,
    resourceOwner
  });

  try {
    const simulation = await simulatePlanViabilityWithProgress(profile, rows, {
      timezone,
      locale,
      mode,
      onProgress
    });

    traceCollector.completeTrace(traceId);
    return simulation;
  } catch (error) {
    traceCollector.failTrace(traceId, error);
    throw error;
  }
}
