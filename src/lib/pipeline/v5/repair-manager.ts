import { DateTime } from 'luxon';

import { executeCoVeVerifier } from './cove-verifier';
import { executeHardValidator } from './hard-validator';
import { executeSoftValidator } from './soft-validator';
import type { AgentRuntime } from '../../runtime/types';
import type {
  CoVeFinding,
  HardFinding,
  RepairAttemptRecord,
  RepairInput,
  RepairOutput,
  RepairPatchCandidate,
  SoftFinding,
} from './phase-io-v5';
import type { ActivityRequest, SchedulerOutput } from '../../scheduler/types';
import { buildConstraints, SLOT_DURATION_MIN } from '../../scheduler/constraint-builder';
import type { TimeEventItem } from '../../domain/plan-item';

type PatchCandidate = RepairPatchCandidate;

interface ValidationSnapshot {
  hard: HardFinding[];
  soft: SoftFinding[];
  cove: CoVeFinding[];
}

function computeScore(snapshot: ValidationSnapshot): number {
  let score = 100;
  score -= snapshot.hard.filter((finding) => finding.severity === 'FAIL').length * 20;
  score -= snapshot.soft.filter((finding) => finding.severity === 'WARN').length * 5;
  score -= snapshot.cove.filter((finding) => finding.severity === 'FAIL').length * 20;
  score -= snapshot.cove.filter((finding) => finding.severity === 'WARN').length * 5;
  return Math.max(0, score);
}

function cloneSchedule(schedule: SchedulerOutput): SchedulerOutput {
  return JSON.parse(JSON.stringify(schedule)) as SchedulerOutput;
}

function toRemainingFindings(snapshot: ValidationSnapshot): Array<{ severity: string; message: string }> {
  return [
    ...snapshot.hard.map((finding) => ({ severity: finding.severity, message: finding.description })),
    ...snapshot.soft.map((finding) => ({ severity: finding.severity, message: finding.suggestion_esAR })),
    ...snapshot.cove.map((finding) => ({ severity: finding.severity, message: finding.answer })),
  ];
}

function findRequestForEvent(input: RepairInput, event: TimeEventItem): ActivityRequest | undefined {
  return input.originalInput.activities.find(
    (request) => request.label === event.title || event.id.startsWith(`${request.id}_`),
  );
}

function applyCandidate(schedule: SchedulerOutput, candidate: PatchCandidate): boolean {
  switch (candidate.type) {
    case 'MOVE': {
      const event = schedule.events.find((item) => item.id === candidate.targetId);
      if (!event || !candidate.newStartAt) {
        return false;
      }
      event.startAt = candidate.newStartAt;
      return true;
    }
    case 'SWAP': {
      const first = schedule.events.find((item) => item.id === candidate.targetId);
      const second = schedule.events.find((item) => item.id === candidate.extraId);
      if (!first || !second) {
        return false;
      }
      const originalStart = first.startAt;
      first.startAt = second.startAt;
      second.startAt = originalStart;
      return true;
    }
    case 'RESIZE': {
      const event = schedule.events.find((item) => item.id === candidate.targetId);
      if (!event || typeof candidate.newDurationMin !== 'number') {
        return false;
      }
      event.durationMin = candidate.newDurationMin;
      return true;
    }
    case 'DROP': {
      const before = schedule.events.length;
      schedule.events = schedule.events.filter((item) => item.id !== candidate.targetId);
      return schedule.events.length < before;
    }
    default:
      return false;
  }
}

function eventOverlaps(event: TimeEventItem, other: TimeEventItem): boolean {
  const start = DateTime.fromISO(event.startAt, { zone: 'utc' });
  const end = start.plus({ minutes: event.durationMin });
  const otherStart = DateTime.fromISO(other.startAt, { zone: 'utc' });
  const otherEnd = otherStart.plus({ minutes: other.durationMin });
  return start < otherEnd && end > otherStart;
}

function chooseFeasibleMove(
  input: RepairInput,
  event: TimeEventItem,
  options: { avoidLocalDate?: string; preferDifferentDay?: boolean } = {},
): string | null {
  const request = findRequestForEvent(input, event);
  if (!request) {
    return null;
  }

  const params = buildConstraints(input.originalInput);
  const activity = params.activities.find((item) => item.id === request.id);
  if (!activity) {
    return null;
  }

  const currentLocalDate = DateTime.fromISO(event.startAt, { zone: 'utc' })
    .setZone(input.originalInput.timezone)
    .toISODate();
  const currentStart = DateTime.fromISO(event.startAt, { zone: 'utc' }).toMillis();
  const otherEvents = input.schedule.events.filter((item) => item.id !== event.id);

  const rankedStarts = [...activity.feasibleStarts].sort((left, right) => {
    const leftMs = DateTime.fromISO(params.weekStartDate, { zone: 'utc' })
      .plus({ minutes: left * SLOT_DURATION_MIN })
      .toMillis();
    const rightMs = DateTime.fromISO(params.weekStartDate, { zone: 'utc' })
      .plus({ minutes: right * SLOT_DURATION_MIN })
      .toMillis();
    return Math.abs(leftMs - currentStart) - Math.abs(rightMs - currentStart);
  });

  for (const slot of rankedStarts) {
    const startAt = DateTime.fromISO(params.weekStartDate, { zone: 'utc' })
      .plus({ minutes: slot * SLOT_DURATION_MIN })
      .toISO();
    if (!startAt || startAt === event.startAt) {
      continue;
    }

    const localDate = DateTime.fromISO(startAt, { zone: 'utc' })
      .setZone(input.originalInput.timezone)
      .toISODate();
    if (options.avoidLocalDate && localDate === options.avoidLocalDate) {
      continue;
    }
    if (options.preferDifferentDay && localDate === currentLocalDate) {
      continue;
    }

    const candidateEvent = { ...event, startAt };
    if (otherEvents.some((other) => eventOverlaps(candidateEvent, other))) {
      continue;
    }

    return startAt;
  }

  return null;
}

function pickMostLoadedDay(schedule: SchedulerOutput, timezone: string): string | null {
  const totals = new Map<string, { minutes: number; sessions: number }>();
  for (const event of schedule.events) {
    const localDate = DateTime.fromISO(event.startAt, { zone: 'utc' }).setZone(timezone).toISODate();
    if (!localDate) {
      continue;
    }
    const current = totals.get(localDate) ?? { minutes: 0, sessions: 0 };
    current.minutes += event.durationMin;
    current.sessions += 1;
    totals.set(localDate, current);
  }

  const sorted = [...totals.entries()].sort((left, right) => {
    if (right[1].minutes !== left[1].minutes) {
      return right[1].minutes - left[1].minutes;
    }
    return right[1].sessions - left[1].sessions;
  });
  return sorted[0]?.[0] ?? null;
}

function pickMoveTargetFromOverloadedDay(input: RepairInput): TimeEventItem | null {
  const localDate = pickMostLoadedDay(input.schedule, input.originalInput.timezone);
  if (!localDate) {
    return null;
  }

  const candidates = input.schedule.events
    .filter((event) =>
      DateTime.fromISO(event.startAt, { zone: 'utc' }).setZone(input.originalInput.timezone).toISODate() === localDate,
    )
    .sort((left, right) => right.durationMin - left.durationMin);

  return candidates[0] ?? null;
}

function pickMoveTargetToCreateRestDay(input: RepairInput): TimeEventItem | null {
  const grouped = new Map<string, TimeEventItem[]>();

  for (const event of input.schedule.events) {
    const localDate = DateTime.fromISO(event.startAt, { zone: 'utc' }).setZone(input.originalInput.timezone).toISODate();
    if (!localDate) {
      continue;
    }
    const bucket = grouped.get(localDate) ?? [];
    bucket.push(event);
    grouped.set(localDate, bucket);
  }

  const sortedDays = [...grouped.entries()].sort((left, right) => {
    if (left[1].length !== right[1].length) {
      return left[1].length - right[1].length;
    }

    const leftMinutes = left[1].reduce((total, event) => total + event.durationMin, 0);
    const rightMinutes = right[1].reduce((total, event) => total + event.durationMin, 0);
    return leftMinutes - rightMinutes;
  });

  const targetDay = sortedDays.find(([, events]) => events.length === 1) ?? sortedDays[0];
  if (!targetDay) {
    return null;
  }

  return [...targetDay[1]].sort((left, right) => right.durationMin - left.durationMin)[0] ?? null;
}

function candidateKey(candidate: PatchCandidate): string {
  return [
    candidate.type,
    candidate.targetId,
    candidate.extraId ?? '',
    candidate.newStartAt ?? '',
    String(candidate.newDurationMin ?? ''),
  ].join('|');
}

function pushCandidate(candidates: PatchCandidate[], candidate: PatchCandidate | null): void {
  if (!candidate) {
    return;
  }

  if (candidates.some((existing) => candidateKey(existing) === candidateKey(candidate))) {
    return;
  }

  candidates.push(candidate);
}

function buildDeterministicCandidates(input: RepairInput): PatchCandidate[] {
  const candidates: PatchCandidate[] = [];

  const durationFinding = input.hardFindings.find((finding) => finding.code === 'HV-DURATION');
  if (durationFinding?.affectedItems[0]) {
    const event = input.schedule.events.find((item) => item.id === durationFinding.affectedItems[0]);
    const request = event ? findRequestForEvent(input, event) : undefined;
    if (event && request && event.durationMin !== request.durationMin) {
      pushCandidate(candidates, {
        type: 'RESIZE',
        targetId: event.id,
        newDurationMin: request.durationMin,
      });
    }
  }

  const moveFindings = input.hardFindings.filter((finding) =>
    ['HV-OVERLAP', 'HV-AVAILABILITY', 'HV-OUTSIDE_AWAKE_HOURS', 'HV-OVERLAPS_WORK', 'HV-OVERLAPS_BLOCKED'].includes(finding.code),
  );
  for (const moveFinding of moveFindings) {
    const targetId = moveFinding.code === 'HV-OVERLAP'
      ? moveFinding.affectedItems.at(-1)
      : moveFinding.affectedItems[0];
    const event = targetId ? input.schedule.events.find((item) => item.id === targetId) : undefined;
    const newStartAt = event ? chooseFeasibleMove(input, event) : null;
    if (event && newStartAt) {
      pushCandidate(candidates, {
        type: 'MOVE',
        targetId: event.id,
        newStartAt,
      });
    }
  }

  const overloadedDayFinding = input.hardFindings.find((finding) => finding.code === 'HV-DAY-OVER-CAPACITY');
  if (overloadedDayFinding) {
    const event = pickMoveTargetFromOverloadedDay(input);
    if (event) {
      const localDate = DateTime.fromISO(event.startAt, { zone: 'utc' }).setZone(input.originalInput.timezone).toISODate() ?? undefined;
      const newStartAt = chooseFeasibleMove(input, event, { avoidLocalDate: localDate, preferDifferentDay: true });
      pushCandidate(candidates, newStartAt
        ? {
            type: 'MOVE',
            targetId: event.id,
            newStartAt,
          }
        : {
            type: 'DROP',
            targetId: event.id,
          });
    }
  }

  const needsRest = input.softFindings.some((finding) => finding.code === 'SV-NO-REST')
    || input.coveFindings.some((finding) => finding.code === 'COVE-REST' && finding.severity === 'FAIL');
  const distributionStress = input.coveFindings.some((finding) => finding.code === 'COVE-DISTRIBUTION' && finding.severity === 'WARN');

  if (needsRest || distributionStress) {
    const event = needsRest
      ? pickMoveTargetToCreateRestDay(input) ?? pickMoveTargetFromOverloadedDay(input)
      : pickMoveTargetFromOverloadedDay(input);
    if (event) {
      const localDate = DateTime.fromISO(event.startAt, { zone: 'utc' }).setZone(input.originalInput.timezone).toISODate() ?? undefined;
      const newStartAt = chooseFeasibleMove(input, event, { avoidLocalDate: localDate, preferDifferentDay: true });
      pushCandidate(candidates, newStartAt
        ? {
            type: 'MOVE',
            targetId: event.id,
            newStartAt,
          }
        : {
            type: 'DROP',
            targetId: event.id,
          });
    }
  }

  return candidates;
}

async function selectCandidateWithLlm(
  runtime: AgentRuntime,
  input: RepairInput,
  candidates: PatchCandidate[],
): Promise<PatchCandidate | null> {
  if (candidates.length === 0) {
    return null;
  }

  const issues = [
    ...input.hardFindings.map((finding) => `HARD FAIL: ${finding.description}`),
    ...input.softFindings.map((finding) => `SOFT WARN: ${finding.suggestion_esAR}`),
    ...input.coveFindings.map((finding) => `COVE ${finding.severity}: ${finding.answer}`),
  ];
  const candidateList = candidates
    .map((candidate, index) => {
      const payload = {
        index,
        type: candidate.type,
        targetId: candidate.targetId,
        extraId: candidate.extraId ?? null,
        newStartAt: candidate.newStartAt ?? null,
        newDurationMin: candidate.newDurationMin ?? null,
      };
      return JSON.stringify(payload);
    })
    .join('\n');

  const response = await runtime.chat([{
    role: 'user',
    content: `
Eres el Repair Manager de un plan operativo.
Problemas detectados:
${issues.join('\n') || 'Sin issues.'}

Solo puedes elegir UNO de estos candidatos cerrados o devolver null:
${candidateList}

Devuelve SOLO JSON estricto:
{"selectedIndex":0}
o
{"selectedIndex":null}
`.trim(),
  }]);

  const raw = response.content
    .trim()
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim();
  const parsed = JSON.parse(raw) as { selectedIndex?: number | null };
  if (typeof parsed.selectedIndex !== 'number' || Number.isNaN(parsed.selectedIndex)) {
    return null;
  }
  return candidates[parsed.selectedIndex] ?? null;
}

async function validateSchedule(
  runtime: AgentRuntime,
  input: RepairInput,
  schedule: SchedulerOutput,
): Promise<ValidationSnapshot> {
  const hard = await executeHardValidator({
    schedule,
    originalInput: input.originalInput,
    profile: input.profile,
    timezone: input.originalInput.timezone,
  });
  const soft = await executeSoftValidator({
    schedule,
    profile: input.profile,
    timezone: input.originalInput.timezone,
  });
  const cove = await executeCoVeVerifier(runtime, {
    schedule,
    timezone: input.originalInput.timezone,
    profile: input.profile,
  });

  return {
    hard: hard.findings,
    soft: soft.findings,
    cove: cove.findings,
  };
}

async function evaluateCandidate(
  runtime: AgentRuntime,
  input: RepairInput,
  candidate: PatchCandidate,
  baselineScore: number,
  source: RepairAttemptRecord['source'],
): Promise<{ attempt: RepairAttemptRecord; improved: boolean; finalSchedule: SchedulerOutput; scoreAfter: number }> {
  const candidateSchedule = cloneSchedule(input.schedule);
  const applied = applyCandidate(candidateSchedule, candidate);
  const snapshot = applied
    ? await validateSchedule(runtime, input, candidateSchedule)
    : {
        hard: [...input.hardFindings],
        soft: [...input.softFindings],
        cove: [...input.coveFindings],
      };
  const scoreAfter = computeScore(snapshot);
  const improved = applied && scoreAfter > baselineScore;
  const attempt: RepairAttemptRecord = {
    candidate,
    source,
    baselineScore,
    candidateScore: scoreAfter,
    decision: improved ? 'committed' : 'reverted',
    remainingFindings: toRemainingFindings(snapshot),
  };

  return {
    attempt,
    improved,
    finalSchedule: improved ? candidateSchedule : cloneSchedule(input.schedule),
    scoreAfter,
  };
}

function buildOutput(params: {
  status: RepairOutput['status'];
  scoreBefore: number;
  scoreAfter: number;
  finalSchedule: SchedulerOutput;
  attempts: RepairAttemptRecord[];
  remainingFindings: Array<{ severity: string; message: string }>;
  patchesApplied?: RepairOutput['patchesApplied'];
  attemptedPatch?: RepairOutput['attemptedPatch'];
}): RepairOutput {
  return {
    status: params.status,
    patchesApplied: params.patchesApplied ?? [],
    iterations: params.attempts.length,
    scoreBefore: params.scoreBefore,
    scoreAfter: params.scoreAfter,
    finalSchedule: params.finalSchedule,
    remainingFindings: params.remainingFindings,
    attempts: params.attempts,
    attemptedPatch: params.attemptedPatch,
  };
}

export async function executeRepairManager(
  runtime: AgentRuntime,
  input: RepairInput,
): Promise<RepairOutput> {
  const baseline: ValidationSnapshot = {
    hard: [...input.hardFindings],
    soft: [...input.softFindings],
    cove: [...input.coveFindings],
  };
  const scoreBefore = computeScore(baseline);
  const baselineRemainingFindings = toRemainingFindings(baseline);

  if (baselineRemainingFindings.length === 0) {
    return buildOutput({
      status: 'no_change',
      scoreBefore,
      scoreAfter: scoreBefore,
      finalSchedule: cloneSchedule(input.schedule),
      remainingFindings: [],
      attempts: [],
    });
  }

  const attempts: RepairAttemptRecord[] = [];
  const candidates = buildDeterministicCandidates(input);
  const deterministicCandidate = candidates[0] ?? null;

  if (deterministicCandidate) {
    const evaluated = await evaluateCandidate(runtime, input, deterministicCandidate, scoreBefore, 'deterministic');
    attempts.push(evaluated.attempt);
    if (evaluated.improved) {
      return buildOutput({
        status: 'fixed',
        scoreBefore,
        scoreAfter: evaluated.scoreAfter,
        finalSchedule: evaluated.finalSchedule,
        remainingFindings: evaluated.attempt.remainingFindings,
        attempts,
        patchesApplied: [{ type: deterministicCandidate.type, targetId: deterministicCandidate.targetId }],
        attemptedPatch: { type: deterministicCandidate.type, targetId: deterministicCandidate.targetId },
      });
    }
  }

  try {
    const llmCandidate = await selectCandidateWithLlm(
      runtime,
      input,
      deterministicCandidate ? candidates.filter((candidate) => candidateKey(candidate) !== candidateKey(deterministicCandidate)) : candidates,
    );

    if (llmCandidate) {
      const evaluated = await evaluateCandidate(runtime, input, llmCandidate, scoreBefore, 'llm-ranked');
      attempts.push(evaluated.attempt);
      if (evaluated.improved) {
        return buildOutput({
          status: 'fixed',
          scoreBefore,
          scoreAfter: evaluated.scoreAfter,
          finalSchedule: evaluated.finalSchedule,
          remainingFindings: evaluated.attempt.remainingFindings,
          attempts,
          patchesApplied: [{ type: llmCandidate.type, targetId: llmCandidate.targetId }],
          attemptedPatch: { type: llmCandidate.type, targetId: llmCandidate.targetId },
        });
      }
    }
  } catch {
    // Fall through to explicit escalation.
  }

  attempts.push({
    candidate: null,
    source: 'llm-ranked',
    baselineScore: scoreBefore,
    candidateScore: scoreBefore,
    decision: 'escalated',
    remainingFindings: baselineRemainingFindings,
  });

  return buildOutput({
    status: 'escalated',
    scoreBefore,
    scoreAfter: scoreBefore,
    finalSchedule: cloneSchedule(input.schedule),
    remainingFindings: baselineRemainingFindings,
    attempts,
    attemptedPatch: deterministicCandidate
      ? { type: deterministicCandidate.type, targetId: deterministicCandidate.targetId }
      : undefined,
  });
}
