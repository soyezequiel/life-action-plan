import { z } from 'zod';

import { HabitStateSchema, normalizeHabitState, type HabitState } from './habit-state';

export const EquivalenceComparableSchema = z.object({
  id: z.string(),
  label: z.string(),
  equivalenceGroupId: z.string(),
  goalId: z.string().optional(),
  progressionKey: z.string().optional(),
  durationMin: z.number().positive().optional(),
  frequencyPerWeek: z.number().int().positive().optional(),
}).strict();
export type EquivalenceComparable = z.infer<typeof EquivalenceComparableSchema>;

export const EquivalenceSwapCandidateSchema = z.object({
  previousActivityId: z.string(),
  nextActivityId: z.string(),
  equivalenceGroupId: z.string(),
  preservesDuration: z.boolean(),
  preservesFrequency: z.boolean(),
  reusesHabitState: z.boolean(),
  score: z.number(),
}).strict();
export type EquivalenceSwapCandidate = z.infer<typeof EquivalenceSwapCandidateSchema>;

export const EquivalenceSwapPlanSchema = z.object({
  swaps: z.array(EquivalenceSwapCandidateSchema),
  unmatchedPreviousActivityIds: z.array(z.string()),
  unmatchedNextActivityIds: z.array(z.string()),
}).strict();
export type EquivalenceSwapPlan = z.infer<typeof EquivalenceSwapPlanSchema>;

function parseComparable(item: EquivalenceComparable): EquivalenceComparable {
  return EquivalenceComparableSchema.parse({
    id: item.id,
    label: item.label,
    equivalenceGroupId: item.equivalenceGroupId,
    goalId: item.goalId,
    progressionKey: item.progressionKey,
    durationMin: item.durationMin,
    frequencyPerWeek: item.frequencyPerWeek,
  });
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function createStandaloneEquivalenceGroupId(seed: string): string {
  const slug = slugify(seed);
  return slug.length > 0 ? `standalone-${slug}` : 'standalone-item';
}

export function canSwap(itemA: EquivalenceComparable, itemB: EquivalenceComparable): boolean {
  const parsedA = parseComparable(itemA);
  const parsedB = parseComparable(itemB);
  return parsedA.equivalenceGroupId === parsedB.equivalenceGroupId;
}

export function transferHabitStateForEquivalentSwap(
  state: HabitState,
  previousItem: EquivalenceComparable,
  nextItem: EquivalenceComparable,
): HabitState {
  const parsedState = normalizeHabitState(state);
  const parsedPreviousItem = parseComparable(previousItem);
  const parsedNextItem = parseComparable(nextItem);

  if (!canSwap(parsedPreviousItem, parsedNextItem)) {
    throw new Error('Cannot transfer habit state between non-equivalent activities');
  }

  if (
    parsedPreviousItem.progressionKey &&
    parsedState.progressionKey !== parsedPreviousItem.progressionKey
  ) {
    throw new Error('Habit state progression key does not match the source activity');
  }

  return HabitStateSchema.parse({
    ...parsedState,
    progressionKey: parsedNextItem.progressionKey ?? parsedState.progressionKey,
  });
}

function computeSwapScore(previousItem: EquivalenceComparable, nextItem: EquivalenceComparable): number {
  let score = 0;

  if (previousItem.goalId && nextItem.goalId && previousItem.goalId === nextItem.goalId) {
    score += 1_000;
  }

  if (
    previousItem.progressionKey &&
    nextItem.progressionKey &&
    previousItem.progressionKey === nextItem.progressionKey
  ) {
    score += 500;
  }

  if (previousItem.label === nextItem.label) {
    score += 50;
  }

  if (previousItem.durationMin !== undefined && nextItem.durationMin !== undefined) {
    score -= Math.abs(previousItem.durationMin - nextItem.durationMin);
  }

  if (previousItem.frequencyPerWeek !== undefined && nextItem.frequencyPerWeek !== undefined) {
    score -= Math.abs(previousItem.frequencyPerWeek - nextItem.frequencyPerWeek) * 10;
  }

  return score;
}

export function preferEquivalenceSwaps(
  previousItems: EquivalenceComparable[],
  nextItems: EquivalenceComparable[],
): EquivalenceSwapPlan {
  const parsedPreviousItems = previousItems.map((item) => parseComparable(item));
  const parsedNextItems = nextItems.map((item) => parseComparable(item));
  const candidates: EquivalenceSwapCandidate[] = [];

  for (const previousItem of parsedPreviousItems) {
    for (const nextItem of parsedNextItems) {
      if (!canSwap(previousItem, nextItem)) {
        continue;
      }

      candidates.push({
        previousActivityId: previousItem.id,
        nextActivityId: nextItem.id,
        equivalenceGroupId: previousItem.equivalenceGroupId,
        preservesDuration: previousItem.durationMin === nextItem.durationMin,
        preservesFrequency: previousItem.frequencyPerWeek === nextItem.frequencyPerWeek,
        reusesHabitState:
          previousItem.progressionKey === undefined ||
          nextItem.progressionKey === undefined ||
          previousItem.progressionKey === nextItem.progressionKey,
        score: computeSwapScore(previousItem, nextItem),
      });
    }
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    const previousOrder = left.previousActivityId.localeCompare(right.previousActivityId);
    if (previousOrder !== 0) {
      return previousOrder;
    }

    return left.nextActivityId.localeCompare(right.nextActivityId);
  });

  const usedPrevious = new Set<string>();
  const usedNext = new Set<string>();
  const swaps: EquivalenceSwapCandidate[] = [];

  for (const candidate of candidates) {
    if (usedPrevious.has(candidate.previousActivityId) || usedNext.has(candidate.nextActivityId)) {
      continue;
    }

    usedPrevious.add(candidate.previousActivityId);
    usedNext.add(candidate.nextActivityId);
    swaps.push(candidate);
  }

  return EquivalenceSwapPlanSchema.parse({
    swaps,
    unmatchedPreviousActivityIds: parsedPreviousItems
      .map((item) => item.id)
      .filter((id) => !usedPrevious.has(id)),
    unmatchedNextActivityIds: parsedNextItems
      .map((item) => item.id)
      .filter((id) => !usedNext.has(id)),
  });
}
