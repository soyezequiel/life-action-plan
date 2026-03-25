/**
 * milp-model.ts
 *
 * Genera un string en formato CPLEX LP que `highs.solve()` acepta
 * directamente para resolver el scheduling de actividades semanales.
 *
 * ─── Modelo ──────────────────────────────────────────────────────────────────
 *
 * Variables de decisión:
 *   x_<aIdx>_<slot>  ∈ {0,1}   actividad a comienza en slot s
 *   miss_<aIdx>     ≥ 0        sesiones no colocadas (solo para soft tiers)
 *
 * Constraints hard:
 *   • No-overlap:  para cada slot t, ∑_{a,s : s ≤ t < s+dur(a)} x_a_s ≤ 1
 *   • Blocked:     no generamos variables para slots infeasibles (poda)
 *   • Frecuencia hard:  ∑_s x_a_s = freq(a)
 *
 * Soft constraints (penalización en objetivo):
 *   • Frecuencia soft: ∑_s x_a_s + miss_a = freq(a)
 *   • miss_a penalizado con peso alto (soft_strong=1000) o bajo (soft_weak=10)
 *
 * Preferencias:
 *   • preferredSlots: slots fuera de bucket → +1 en objetivo
 *   • avoidDays: slots en día "prohibido" → +5 en objetivo
 *
 * Rest days:
 *   • minRestDaysBetween=1: ∑ x_a_{slots_day_d} + ∑ x_a_{slots_day_{d+1}} ≤ 1
 *     para cada par de días consecutivos con starts factibles.
 */

import type { MilpModelParams, ActivityParams } from './constraint-builder';
import { slotToDay } from './constraint-builder';

// ─── Penalty weights ──────────────────────────────────────────────────────────

const WEIGHT_SOFT_STRONG = 1000;
const WEIGHT_SOFT_WEAK = 10;

// ─── Variable name helper ─────────────────────────────────────────────────────

function xVar(aIdx: number, slot: number): string {
  return `x_${aIdx}_${slot}`;
}

function missVar(aIdx: number): string {
  return `miss_${aIdx}`;
}

// ─── Model builder ────────────────────────────────────────────────────────────

/**
 * Build the CPLEX LP string for the given pre-processed schedule params.
 *
 * @param params  Output of `buildConstraints(input)` from constraint-builder.ts
 * @returns       A string ready to be passed to `highs.solve(lp, options)`
 */
export function buildMilpModel(params: MilpModelParams): string {
  const { activities, totalSlots } = params;

  const objTerms: string[] = [];
  const constraints: string[] = [];
  const bounds: string[] = [];
  const generals: string[] = []; // binary integer vars

  // ── 1. Per-activity: objective terms, frequency constraint, miss var ────────

  for (const act of activities) {
    const { activityIndex: aIdx, feasibleStarts, frequencyPerWeek,
             constraintTier, slotPenalties, durationSlots } = act;

    // ── 1a. Binary decision variables with slot penalties in objective ────────
    for (const s of feasibleStarts) {
      const v = xVar(aIdx, s);
      const pen = slotPenalties[s] ?? 0;
      if (pen > 0) {
        objTerms.push(`${pen} ${v}`);
      }
      generals.push(v);
      bounds.push(`0 <= ${v} <= 1`);
    }

    // ── 1b. Frequency constraint ──────────────────────────────────────────────
    if (feasibleStarts.length === 0) {
      // No feasible slots: if hard → infeasible model (intentional);
      // if soft → miss covers the full frequency target.
      if (constraintTier !== 'hard') {
        const mv = missVar(aIdx);
        const weight = constraintTier === 'soft_strong' ? WEIGHT_SOFT_STRONG : WEIGHT_SOFT_WEAK;
        objTerms.push(`${weight} ${mv}`);
        bounds.push(`0 <= ${mv} <= ${frequencyPerWeek}`);
        // 0 + miss = freq → miss = freq (trivially satisfied)
        constraints.push(`freqC_${aIdx}: ${mv} = ${frequencyPerWeek}`);
      }
      // for hard: no vars, no constraint — solver will be infeasible if freq > 0
      continue;
    }

    const sumVars = feasibleStarts.map(s => xVar(aIdx, s)).join(' + ');

    if (constraintTier === 'hard') {
      // Strict equality — never relaxed
      constraints.push(`freqC_${aIdx}: ${sumVars} = ${frequencyPerWeek}`);
    } else {
      // ∑ x + miss = freq
      const mv = missVar(aIdx);
      const weight = constraintTier === 'soft_strong' ? WEIGHT_SOFT_STRONG : WEIGHT_SOFT_WEAK;
      objTerms.push(`${weight} ${mv}`);
      bounds.push(`0 <= ${mv} <= ${frequencyPerWeek}`);
      constraints.push(`freqC_${aIdx}: ${sumVars} + ${mv} = ${frequencyPerWeek}`);
    }

    // ── 1c. Rest-day separation ───────────────────────────────────────────────
    if (act.minRestDaysBetween !== undefined && act.minRestDaysBetween > 0) {
      addRestDayConstraints(constraints, act, durationSlots);
    }
  }

  // ── 2. No-overlap constraints ─────────────────────────────────────────────
  //
  // For each slot t, collect all (activity, start) pairs that would occupy t:
  //   s ≤ t < s + dur(a)
  // Their sum must be ≤ 1.

  for (let t = 0; t < totalSlots; t++) {
    const occupying: string[] = [];
    for (const act of activities) {
      const { activityIndex: aIdx, feasibleStarts, durationSlots } = act;
      for (const s of feasibleStarts) {
        if (s <= t && t < s + durationSlots) {
          occupying.push(xVar(aIdx, s));
        }
      }
    }
    if (occupying.length >= 2) {
      constraints.push(`nooverlap_${t}: ${occupying.join(' + ')} <= 1`);
    }
  }

  // ── 3. Assemble LP string ─────────────────────────────────────────────────

  return assembleLp(objTerms, constraints, bounds, generals);
}

// ─── Rest-day constraint helper ───────────────────────────────────────────────

/**
 * For `minRestDaysBetween = R`, ensure that no two starts of the same activity
 * fall within R days of each other.
 *
 * For R = 1: for every pair of days (d, d+1) that are ≤ R apart,
 *   ∑ x_a_{slots in day d} + ∑ x_a_{slots in day d+1} ≤ 1
 *
 * We generate constraints for all pairs (d1, d2) with 0 < d2-d1 <= R.
 */
function addRestDayConstraints(
  constraints: string[],
  act: ActivityParams,
  _durationSlots: number,
): void {
  const { activityIndex: aIdx, feasibleStarts, minRestDaysBetween } = act;
  const R = minRestDaysBetween!;

  // Group feasible starts by day
  const startsByDay = new Map<number, number[]>();
  for (const s of feasibleStarts) {
    const d = slotToDay(s);
    if (!startsByDay.has(d)) startsByDay.set(d, []);
    startsByDay.get(d)!.push(s);
  }

  const days = Array.from(startsByDay.keys()).sort((a, b) => a - b);

  for (let i = 0; i < days.length; i++) {
    for (let j = i + 1; j < days.length; j++) {
      const d1 = days[i];
      const d2 = days[j];
      if (d2 - d1 > R) break; // days are sorted, no further pair qualifies

      const terms1 = (startsByDay.get(d1) ?? []).map(s => xVar(aIdx, s));
      const terms2 = (startsByDay.get(d2) ?? []).map(s => xVar(aIdx, s));
      const all = [...terms1, ...terms2];
      if (all.length >= 2) {
        constraints.push(`rest_${aIdx}_d${d1}_d${d2}: ${all.join(' + ')} <= 1`);
      }
    }
  }
}

// ─── LP string assembly ───────────────────────────────────────────────────────

function assembleLp(
  objTerms: string[],
  constraints: string[],
  bounds: string[],
  generals: string[],
): string {
  const parts: string[] = [];

  // Objective
  parts.push('Minimize');
  if (objTerms.length > 0) {
    parts.push(` obj: ${objTerms.join(' + ')}`);
  } else {
    // Feasibility-only problem (all hard, no preferences)
    parts.push(' obj: 0');
  }

  // Constraints
  parts.push('Subject To');
  if (constraints.length > 0) {
    for (const c of constraints) {
      parts.push(` ${c}`);
    }
  } else {
    // HiGHS requires at least one constraint
    parts.push(' dummy: 0 <= 1');
  }

  // Bounds
  if (bounds.length > 0) {
    parts.push('Bounds');
    for (const b of bounds) {
      parts.push(` ${b}`);
    }
  }

  // Generals (binary integer variables)
  if (generals.length > 0) {
    parts.push('Generals');
    // HiGHS LP format: list variable names, up to ~80 chars per line
    const chunks = chunkNames(generals, 10);
    for (const chunk of chunks) {
      parts.push(` ${chunk.join(' ')}`);
    }
  }

  parts.push('End');
  return parts.join('\n');
}

/** Split an array into chunks of at most `size` elements. */
function chunkNames(names: string[], size: number): string[][] {
  const result: string[][] = [];
  for (let i = 0; i < names.length; i += size) {
    result.push(names.slice(i, i + size));
  }
  return result;
}
