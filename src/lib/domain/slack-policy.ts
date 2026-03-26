import { DateTime } from 'luxon';
import { z } from 'zod';

export const SlackPolicySchema = z.object({
  weeklyTimeBufferMin: z.number().int().min(0),
  maxChurnMovesPerWeek: z.number().int().min(0),
  frozenHorizonDays: z.number().int().min(0),
}).strict();
export type SlackPolicy = z.infer<typeof SlackPolicySchema>;

export const ReplanMoveSchema = z.object({
  itemId: z.string(),
  fromStartAt: z.string(),
  toStartAt: z.string(),
  durationMin: z.number().int().positive(),
}).strict();
export type ReplanMove = z.infer<typeof ReplanMoveSchema>;

export const FrozenWindowSchema = z.object({
  startAt: z.string(),
  endAt: z.string(),
  frozenHorizonDays: z.number().int().min(0),
}).strict();
export type FrozenWindow = z.infer<typeof FrozenWindowSchema>;

export const FrozenViolationSchema = z.object({
  itemId: z.string(),
  side: z.enum(['source', 'target']),
  moveStartAt: z.string(),
  moveEndAt: z.string(),
  frozenWindowStartAt: z.string(),
  frozenWindowEndAt: z.string(),
}).strict();
export type FrozenViolation = z.infer<typeof FrozenViolationSchema>;

export const ReplanValidationResultSchema = z.object({
  ok: z.boolean(),
  proposedMoves: z.number().int().min(0),
  exceedsMaxChurn: z.boolean(),
  frozenViolations: z.array(FrozenViolationSchema),
}).strict();
export type ReplanValidationResult = z.infer<typeof ReplanValidationResultSchema>;

function parseIsoDateTime(value: string, label: string): DateTime {
  const parsed = DateTime.fromISO(value, { setZone: true });
  if (!parsed.isValid) {
    throw new Error(`${label} must be a valid ISO datetime`);
  }

  return parsed;
}

function toIsoString(value: DateTime, label: string): string {
  const iso = value.toISO();
  if (!iso) {
    throw new Error(`${label} could not be serialized as ISO datetime`);
  }

  return iso;
}

function overlapsRange(
  startAt: DateTime,
  endAt: DateTime,
  rangeStart: DateTime,
  rangeEnd: DateTime
): boolean {
  return startAt < rangeEnd && endAt > rangeStart;
}

export function buildFrozenWindow(anchorAt: string, policy: SlackPolicy): FrozenWindow {
  const parsedPolicy = SlackPolicySchema.parse(policy);
  const anchor = parseIsoDateTime(anchorAt, 'anchorAt');
  const windowStart = anchor.startOf('day');
  const windowEnd = windowStart.plus({ days: parsedPolicy.frozenHorizonDays });

  return FrozenWindowSchema.parse({
    startAt: toIsoString(windowStart, 'windowStart'),
    endAt: toIsoString(windowEnd, 'windowEnd'),
    frozenHorizonDays: parsedPolicy.frozenHorizonDays,
  });
}

export function isMoveInsideFrozenWindow(
  startAt: string,
  durationMin: number,
  frozenWindow: FrozenWindow
): boolean {
  const parsedWindow = FrozenWindowSchema.parse(frozenWindow);
  const moveStart = parseIsoDateTime(startAt, 'startAt');
  const moveEnd = moveStart.plus({ minutes: durationMin });
  const windowStart = parseIsoDateTime(parsedWindow.startAt, 'frozenWindow.startAt');
  const windowEnd = parseIsoDateTime(parsedWindow.endAt, 'frozenWindow.endAt');

  return overlapsRange(moveStart, moveEnd, windowStart, windowEnd);
}

export function findFrozenViolations(
  moves: ReplanMove[],
  policy: SlackPolicy,
  anchorAt: string
): FrozenViolation[] {
  const parsedMoves = z.array(ReplanMoveSchema).parse(moves);
  const frozenWindow = buildFrozenWindow(anchorAt, policy);

  return parsedMoves.flatMap((move) => {
    const entries = [
      { side: 'source' as const, startAt: move.fromStartAt },
      { side: 'target' as const, startAt: move.toStartAt },
    ];

    return entries.flatMap((entry) => {
      if (!isMoveInsideFrozenWindow(entry.startAt, move.durationMin, frozenWindow)) {
        return [];
      }

      const moveStart = parseIsoDateTime(entry.startAt, `${entry.side}.startAt`);
      const moveEnd = moveStart.plus({ minutes: move.durationMin });

      return FrozenViolationSchema.parse({
        itemId: move.itemId,
        side: entry.side,
        moveStartAt: toIsoString(moveStart, 'moveStart'),
        moveEndAt: toIsoString(moveEnd, 'moveEnd'),
        frozenWindowStartAt: frozenWindow.startAt,
        frozenWindowEndAt: frozenWindow.endAt,
      });
    });
  });
}

export function exceedsWeeklyChurnLimit(moves: ReplanMove[], policy: SlackPolicy): boolean {
  const parsedPolicy = SlackPolicySchema.parse(policy);
  return z.array(ReplanMoveSchema).parse(moves).length > parsedPolicy.maxChurnMovesPerWeek;
}

export function validateReplanAgainstSlackPolicy(
  moves: ReplanMove[],
  policy: SlackPolicy,
  anchorAt: string
): ReplanValidationResult {
  const frozenViolations = findFrozenViolations(moves, policy, anchorAt);
  const exceedsMaxChurn = exceedsWeeklyChurnLimit(moves, policy);

  return ReplanValidationResultSchema.parse({
    ok: frozenViolations.length === 0 && !exceedsMaxChurn,
    proposedMoves: moves.length,
    exceedsMaxChurn,
    frozenViolations,
  });
}
