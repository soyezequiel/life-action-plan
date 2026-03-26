/**
 * constraint-builder.ts
 *
 * Traduce un SchedulerInput (tipos de negocio) al formato intermedio
 * MilpModelParams que el generador MILP (milp-model.ts) consume para
 * producir un string CPLEX LP.
 *
 * Discretización temporal:
 *   - 1 slot = 30 minutos
 *   - 48 slots/día, 336 slots/semana
 *   - Slot 0 = lunes 00:00, Slot 47 = lunes 23:30
 *   - Slot 48 = martes 00:00, etc.
 */

import type { SchedulerInput } from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

export const SLOT_DURATION_MIN = 30;
export const SLOTS_PER_DAY = 48;
export const DAYS_PER_WEEK = 7;
export const TOTAL_SLOTS = SLOTS_PER_DAY * DAYS_PER_WEEK; // 336

// ─── Day / time helpers ──────────────────────────────────────────────────────

const DAY_INDEX: Record<string, number> = {
  monday: 0,    tuesday: 1,   wednesday: 2, thursday: 3,
  friday: 4,    saturday: 5,  sunday: 6,
  // Spanish variants
  lunes: 0,     martes: 1,    miércoles: 2, miercoles: 2,
  jueves: 3,    viernes: 4,   sábado: 5,    sabado: 5,
  domingo: 6,
};

/** Map a day name (en/es, case-insensitive) to index 0-6 (monday=0). */
export function dayNameToIndex(day: string): number {
  const idx = DAY_INDEX[day.toLowerCase().trim()];
  if (idx === undefined) {
    throw new Error(`Unknown day name: "${day}"`);
  }
  return idx;
}

/**
 * Convert "HH:MM" to a slot-within-day index (0-47).
 * Minutes are floored to the containing 30-min slot.
 */
export function timeToSlotInDay(time: string): number {
  const parts = time.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  return h * 2 + (m >= 30 ? 1 : 0);
}

/** Return the day index (0=monday..6=sunday) for a weekly slot. */
export function slotToDay(slot: number): number {
  return Math.floor(slot / SLOTS_PER_DAY);
}

/** Return the slot-within-day (0-47) for a weekly slot. */
export function slotInDay(slot: number): number {
  return slot % SLOTS_PER_DAY;
}

/**
 * Classify a slot-within-day into a human-readable time bucket.
 *
 * | Bucket      | Range         | Slots     |
 * |-------------|---------------|-----------|
 * | morning     | 06:00 – 11:59 | 12 – 23   |
 * | afternoon   | 12:00 – 16:59 | 24 – 33   |
 * | evening     | 17:00 – 20:59 | 34 – 41   |
 * | night       | 21:00 – 05:59 | 42-47,0-11|
 */
export function getTimeOfDayBucket(sInDay: number): string {
  if (sInDay >= 12 && sInDay < 24) return 'morning';
  if (sInDay >= 24 && sInDay < 34) return 'afternoon';
  if (sInDay >= 34 && sInDay < 42) return 'evening';
  return 'night';
}

// ─── Intermediate types (consumed by milp-model.ts) ──────────────────────────

/** Pre-processed data for a single activity, ready for MILP modelling. */
export interface ActivityParams {
  /** Original activity id. */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Index used for variable naming (x_<idx>_<slot>). */
  activityIndex: number;
  /** Duration expressed in 30-min slots. */
  durationSlots: number;
  /** Original requested duration preserved for serialization and validation. */
  requestedDurationMin: number;
  /** Target sessions per week. */
  frequencyPerWeek: number;
  /** Constraint tier controls how misses are penalised. */
  constraintTier: 'hard' | 'soft_strong' | 'soft_weak';
  /** Weekly slot indices where this activity can legally start. */
  feasibleStarts: number[];
  /** Extra penalty per feasible start slot (for preferences / avoids). */
  slotPenalties: Record<number, number>;
  /** Minimum rest days between sessions (undefined = no constraint). */
  minRestDaysBetween?: number;
  /** Parent goal id. */
  goalId: string;
}

/** Everything the MILP model builder needs. */
export interface MilpModelParams {
  activities: ActivityParams[];
  totalSlots: number;
  weekStartDate: string;
}

// ─── Main builder ────────────────────────────────────────────────────────────

/**
 * Transform a business-level `SchedulerInput` into the numeric
 * `MilpModelParams` that `buildMilpModel` uses to generate the LP string.
 *
 * Steps:
 * 1. Build a global 336-slot availability bitmap from AvailabilityWindow[].
 * 2. Punch out BlockedSlot[] (mark as unavailable).
 * 3. For each activity, compute feasible start slots and per-slot penalties.
 */
export function buildConstraints(input: SchedulerInput): MilpModelParams {
  // ── 1. Global availability bitmap ────────────────────────────────────────

  const available = new Array<boolean>(TOTAL_SLOTS).fill(false);

  for (const win of input.availability) {
    const dayIdx = dayNameToIndex(win.day);
    const base = dayIdx * SLOTS_PER_DAY;
    const start = base + timeToSlotInDay(win.startTime);
    const end = base + timeToSlotInDay(win.endTime);
    // half-open range [start, end)
    for (let s = start; s < end && s < TOTAL_SLOTS; s++) {
      available[s] = true;
    }
  }

  // ── 2. Punch blocked slots ───────────────────────────────────────────────

  for (const blk of input.blocked) {
    const dayIdx = dayNameToIndex(blk.day);
    const base = dayIdx * SLOTS_PER_DAY;
    const start = base + timeToSlotInDay(blk.startTime);
    const end = base + timeToSlotInDay(blk.endTime);
    for (let s = start; s < end && s < TOTAL_SLOTS; s++) {
      available[s] = false;
    }
  }

  // ── 3. Per-activity feasible starts & penalties ──────────────────────────

  const activities: ActivityParams[] = input.activities.map((act, idx) => {
    const durSlots = Math.ceil(act.durationMin / SLOT_DURATION_MIN);

    // Find every slot s where s..s+dur-1 are ALL available AND within the
    // same day (activities must not span midnight).
    const feasibleStarts: number[] = [];
    for (let s = 0; s <= TOTAL_SLOTS - durSlots; s++) {
      // Same-day check
      if (slotToDay(s) !== slotToDay(s + durSlots - 1)) continue;

      let ok = true;
      for (let d = 0; d < durSlots; d++) {
        if (!available[s + d]) { ok = false; break; }
      }
      if (ok) feasibleStarts.push(s);
    }

    // Compute per-slot penalties based on preferences
    const penalties: Record<number, number> = {};

    for (const s of feasibleStarts) {
      let pen = 0;

      // Preferred time-of-day bucket (+1 per non-preferred start)
      if (act.preferredSlots && act.preferredSlots.length > 0) {
        const bucket = getTimeOfDayBucket(slotInDay(s));
        if (!act.preferredSlots.includes(bucket)) {
          pen += 1;
        }
      }

      // Avoid specific days (+5 per avoided-day start)
      if (act.avoidDays && act.avoidDays.length > 0) {
        const sDay = slotToDay(s);
        for (const avDay of act.avoidDays) {
          if (dayNameToIndex(avDay) === sDay) {
            pen += 5;
            break;
          }
        }
      }

      if (pen > 0) penalties[s] = pen;
    }

    return {
      id: act.id,
      label: act.label,
      activityIndex: idx,
      durationSlots: durSlots,
      requestedDurationMin: act.durationMin,
      frequencyPerWeek: act.frequencyPerWeek,
      constraintTier: act.constraintTier,
      feasibleStarts,
      slotPenalties: penalties,
      minRestDaysBetween: act.minRestDaysBetween,
      goalId: act.goalId,
    };
  });

  return {
    activities,
    totalSlots: TOTAL_SLOTS,
    weekStartDate: input.weekStartDate,
  };
}
