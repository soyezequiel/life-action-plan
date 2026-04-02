/**
 * solver.ts
 *
 * Resuelve el modelo MILP generado por `buildMilpModel` usando `highs-js`
 * y traduce la solución numérica a un `SchedulerOutput` con `TimeEventItem[]`.
 *
 * Decisiones de diseño:
 *  - Time limit: 3 s (HiGHS `time_limit` option).
 *  - Si el solver termina sin optimalidad (INFEASIBLE, TIME_LIMIT, etc.)
 *    pero tiene alguna solución incumbente, la devuelve con status "feasible".
 *  - Las fechas ISO se calculan a partir de `weekStartDate` + offset de slots.
 *  - IDs de eventos: `${activityId}_s${slot}` para ser deterministas.
 */

import { createRequire } from 'node:module';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { resolve } from 'path';

import { buildConstraints, SLOT_DURATION_MIN, SLOTS_PER_DAY } from './constraint-builder';
import { buildMilpModel } from './milp-model';
import { generateTradeoffs } from './explainer';
import type { SchedulerInput, SchedulerOutput } from './types';
import type { TimeEventItem } from '../domain/plan-item';

const HIGHS_WASM_FILENAME = 'highs.wasm';
const require = createRequire(import.meta.url);

type HighsSolveResult = {
  Status: string
  Columns?: Record<string, { Primal?: number }>
};

type HighsInstance = {
  solve: (lpModel: string, options: Record<string, unknown>) => HighsSolveResult
};

type HighsFactory = (options?: {
  locateFile?: (file: string) => string
}) => Promise<HighsInstance>;

function loadHighsFactory(): HighsFactory {
  const highsModule = require('highs') as HighsFactory | { default?: HighsFactory };
  const highsFactory = typeof highsModule === 'function'
    ? highsModule
    : highsModule.default;

  if (!highsFactory) {
    throw new Error('No se pudo cargar highs en runtime.');
  }

  return highsFactory;
}

export function resolveHighsWasmPath(cwd = process.cwd()): string {
  const nodeModulesCandidate = resolve(cwd, 'node_modules', 'highs', 'build', HIGHS_WASM_FILENAME);
  return existsSync(nodeModulesCandidate) ? nodeModulesCandidate : HIGHS_WASM_FILENAME;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a weekly schedule with MILP.
 *
 * @param input  Business-level scheduling request.
 * @returns      Events placed, unscheduled activities, tradeoffs and metrics.
 */
export async function solveSchedule(
  input: SchedulerInput,
): Promise<SchedulerOutput> {
  const startMs = Date.now();

  // 1. Build intermediate params + LP model string
  const params = buildConstraints(input);
  const lpModel = buildMilpModel(params);

  // 2. Invoke HiGHS solver with a 3-second wall-clock limit
  const highs = loadHighsFactory();
  const solver = await highs({
    locateFile: (file: string) => (
      file === HIGHS_WASM_FILENAME
        ? resolveHighsWasmPath()
        : file
    ),
  });
  const result = solver.solve(lpModel, {
    time_limit: 3,          // seconds
    presolve: 'on',
    solver: 'simplex',      // fall back to simplex inside B&B
    mip_max_nodes: 100_000, // safety cap
  });

  const solverStatus = result.Status;
  const solverTimeMs = Date.now() - startMs;

  // 3. Collect winning slot indices from the solution
  //    HiGHS returns column values keyed by variable name.
  const colValues: Record<string, number> = {};
  if ('Columns' in result) {
    for (const [name, col] of Object.entries(
      result.Columns as Record<string, { Primal: number }>,
    )) {
      colValues[name] = col.Primal ?? 0;
    }
  }

  // 4. Determine effective status string
  //    Acceptable statuses: "Optimal" → "optimal" | anything with a solution → "feasible"
  let effectiveStatus: 'optimal' | 'feasible' | 'infeasible';
  if (solverStatus === 'Optimal') {
    effectiveStatus = 'optimal';
  } else if (Object.keys(colValues).length > 0) {
    effectiveStatus = 'feasible';
  } else {
    effectiveStatus = 'infeasible';
  }

  // 5. Decode solution into TimeEventItem[]
  const events: TimeEventItem[] = [];
  const scheduledSessionCounts: Record<string, number> = {};

  const weekStart = DateTime.fromISO(params.weekStartDate, { zone: 'UTC' });

  for (const act of params.activities) {
    let sessionsPlaced = 0;
    for (const slot of act.feasibleStarts) {
      const varName = `x_${act.activityIndex}_${slot}`;
      const val = colValues[varName] ?? 0;

      // Binary values may have tiny floating-point noise → round
      if (Math.round(val) !== 1) continue;
      sessionsPlaced++;

      const dayOffset = Math.floor(slot / SLOTS_PER_DAY);
      const slotInDay = slot % SLOTS_PER_DAY;
      const startAt = weekStart
        .plus({ days: dayOffset, minutes: slotInDay * SLOT_DURATION_MIN })
        .toISO()!;

      const now = DateTime.utc().toISO()!;
      const event: TimeEventItem = {
        id: `${act.id}_s${slot}_${randomUUID().slice(0, 8)}`,
        kind: 'time_event',
        title: act.label,
        status: 'active',
        goalIds: [act.goalId],
        startAt,
        durationMin: act.requestedDurationMin,
        rigidity: act.constraintTier === 'hard' ? 'hard' : 'soft',
        createdAt: now,
        updatedAt: now,
      };
      events.push(event);
    }
    scheduledSessionCounts[act.id] = sessionsPlaced;
  }

  // 6. Build unscheduled list (activities with fewer sessions than requested)
  //    The explainer module builds the human-readable reasons; here we provide
  //    a (bare-minimum) placeholder that the caller can enrich.
  const unscheduled = params.activities
    .filter(a => (scheduledSessionCounts[a.id] ?? 0) < a.frequencyPerWeek)
    .map(a => ({
      activityId: a.id,
      reason: `scheduled ${scheduledSessionCounts[a.id] ?? 0} of ${a.frequencyPerWeek} sessions`,
      suggestion_esAR: buildBasicSuggestion(
        a.label,
        a.frequencyPerWeek,
        scheduledSessionCounts[a.id] ?? 0,
      ),
    }));

  // 7. Calculate fill rate
  const totalRequested = params.activities.reduce(
    (acc, a) => acc + a.frequencyPerWeek,
    0,
  );
  const totalPlaced = Object.values(scheduledSessionCounts).reduce(
    (acc, n) => acc + n,
    0,
  );
  const fillRate = totalRequested === 0 ? 1 : totalPlaced / totalRequested;

  return {
    events,
    unscheduled,
    tradeoffs: unscheduled.length > 0 ? generateTradeoffs(input, { events, unscheduled, metrics: {
      fillRate,
      solverTimeMs,
      solverStatus: effectiveStatus,
    } }) : [],
    metrics: {
      fillRate,
      solverTimeMs,
      solverStatus: effectiveStatus,
    },
  };
}

// ─── Internals ────────────────────────────────────────────────────────────────

/**
 * Genera una sugerencia básica abuela-proof cuando una actividad no entró
 * en el horario.  La sugerencia detallada la construye `explainer.ts`.
 */
function buildBasicSuggestion(
  label: string,
  requested: number,
  placed: number,
): string {
  if (placed === 0) {
    return `No había lugar para ${label} en tu semana. ¿Querés ajustar tu disponibilidad?`;
  }
  return (
    `Solo entraron ${placed} de ${requested} sesiones de ${label}. ` +
    `¿Te sirve con ${placed}?`
  );
}
