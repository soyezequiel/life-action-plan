import { z } from 'zod';

export const MinimumViableDoseSchema = z.object({
  minutes: z.number().int().positive(),
  description: z.string(),
}).strict();
export type MinimumViableDose = z.infer<typeof MinimumViableDoseSchema>;

export const HabitDoseSchema = z.object({
  sessionsPerWeek: z.number().int().min(0),
  minimumViable: MinimumViableDoseSchema,
}).strict();
export type HabitDose = z.infer<typeof HabitDoseSchema>;

export const HabitStateSchema = z.object({
  progressionKey: z.string(),
  weeksActive: z.number().int().min(0),
  level: z.number().int().min(0),
  currentDose: HabitDoseSchema,
  protectedFromReset: z.boolean(),
}).strict();
export type HabitState = z.infer<typeof HabitStateSchema>;

export const HabitStateReplanInputSchema = z.object({
  previousHabitStates: z.array(HabitStateSchema),
}).strict();
export type HabitStateReplanInput = z.infer<typeof HabitStateReplanInputSchema>;

export interface HabitStateStore {
  loadByProgressionKeys(progressionKeys: string[]): Promise<HabitState[]>;
  save(states: HabitState[]): Promise<void>;
}

export function isHabitProtectedFromReset(state: HabitState): boolean {
  const parsedState = HabitStateSchema.parse(state);
  return parsedState.protectedFromReset || parsedState.weeksActive >= 2;
}

export function normalizeHabitState(state: HabitState): HabitState {
  const parsedState = HabitStateSchema.parse(state);

  return HabitStateSchema.parse({
    ...parsedState,
    protectedFromReset: isHabitProtectedFromReset(parsedState),
  });
}

export function mergeHabitStateForReplan(
  nextState: HabitState,
  previousState?: HabitState | null
): HabitState {
  const parsedNextState = normalizeHabitState(nextState);

  if (!previousState) {
    return parsedNextState;
  }

  const parsedPreviousState = normalizeHabitState(previousState);
  if (parsedPreviousState.progressionKey !== parsedNextState.progressionKey) {
    throw new Error('Cannot merge habit states with different progression keys');
  }

  return HabitStateSchema.parse({
    ...parsedNextState,
    weeksActive: Math.max(parsedPreviousState.weeksActive, parsedNextState.weeksActive),
    level: Math.max(parsedPreviousState.level, parsedNextState.level),
    protectedFromReset:
      parsedPreviousState.protectedFromReset ||
      parsedNextState.protectedFromReset ||
      Math.max(parsedPreviousState.weeksActive, parsedNextState.weeksActive) >= 2,
  });
}
