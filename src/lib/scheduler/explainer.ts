/**
 * explainer.ts
 *
 * Genera explicaciones humanas (español argentino, abuela-proof) para:
 *   1. Actividades que no pudieron ser agendadas.
 *   2. Tradeoffs donde el usuario debe elegir entre opciones.
 *
 * Reglas de estilo:
 *  - Sin jerga técnica ("MILP", "constraint", "slot", "infeasible", etc.).
 *  - Tuteo informal ("¿Te sirve?", "¿Podés?").
 *  - Oraciones cortas y directas.
 *  - Siempre terminan con una pregunta o propuesta concreta.
 */

import type { SchedulerInput, SchedulerOutput, UnscheduledItem, Tradeoff } from './types';
import type { ActivityParams } from './constraint-builder';
import {
  buildConstraints,
  slotToDay,
  slotInDay,
  getTimeOfDayBucket,
} from './constraint-builder';

// ─── Time-of-day labels in Spanish ───────────────────────────────────────────

const BUCKET_ES: Record<string, string> = {
  morning: 'la mañana',
  afternoon: 'la tarde',
  evening: 'el atardecer',
  night: 'la noche',
};

const DAY_ES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Para cada actividad que NO entró (o entró parcialmente), construye un
 * `UnscheduledItem` con una explicación en español argentino y una sugerencia
 * concreta.
 *
 * @param input        El `SchedulerInput` original.
 * @param solverResult El `SchedulerOutput` devuelto por `solveSchedule`.
 */
export function explainUnscheduled(
  input: SchedulerInput,
  solverResult: SchedulerOutput,
): UnscheduledItem[] {
  const params = buildConstraints(input);
  const actMap = new Map<string, ActivityParams>(params.activities.map(a => [a.id, a]));

  return solverResult.unscheduled.map(item => {
    const act = actMap.get(item.activityId);
    if (!act) {
      return {
        activityId: item.activityId,
        reason: 'Actividad no encontrada en el input',
        suggestion_esAR: 'Revisá que la actividad esté bien configurada.',
      };
    }

    const placed = solverResult.events.filter(e =>
      e.title === act.label && e.goalIds.includes(act.goalId),
    ).length;

    const reason = buildReason(act, placed);
    const suggestion = buildSuggestion(act, input, placed);

    return {
      activityId: act.id,
      reason,
      suggestion_esAR: suggestion,
    };
  });
}

/**
 * Genera tradeoffs cuando dos o más actividades compiten por el mismo bloque
 * de tiempo, ofreciendo al usuario un Plan A vs Plan B.
 *
 * @param input        El `SchedulerInput` original.
 * @param solverResult El `SchedulerOutput` devuelto por `solveSchedule`.
 */
export function generateTradeoffs(
  input: SchedulerInput,
  solverResult: SchedulerOutput,
): Tradeoff[] {
  if (solverResult.unscheduled.length === 0) return [];

  const params = buildConstraints(input);
  const actMap = new Map<string, ActivityParams>(params.activities.map(a => [a.id, a]));

  // Detectar actividades no agendadas que tienen slots factibles
  // (= el problema era competencia, no falta absoluta de tiempo)
  const unscheduledWithSlots = solverResult.unscheduled
    .map(u => actMap.get(u.activityId))
    .filter((a): a is ActivityParams => a !== undefined && a.feasibleStarts.length > 0);

  if (unscheduledWithSlots.length === 0) return [];

  const tradeoffs: Tradeoff[] = [];

  // Para cada par de actividades que compiten por los mismos slots → tradeoff
  for (let i = 0; i < unscheduledWithSlots.length; i++) {
    const act = unscheduledWithSlots[i];

    // Encontrar qué actividades YA agendadas ocupan slots que esta necesitaría
    const competitors = findCompetitors(act, params.activities, solverResult);

    for (const comp of competitors) {
      if (tradeoffs.length >= 5) break; // máximo 5 tradeoffs por run

      const actBucket = preferredBucketLabel(act);
      const compBucket = preferredBucketLabel(comp);

      tradeoffs.push({
        planA: {
          description_esAR:
            `Mantener ${comp.label} en ${compBucket} y mover ` +
            `${act.label} a otro horario disponible.`,
        },
        planB: {
          description_esAR:
            `Ponerle prioridad a ${act.label} en ${actBucket} y ` +
            `buscarle otro hueco a ${comp.label}.`,
        },
        question_esAR:
          `${act.label} y ${comp.label} compiten por el mismo rato. ` +
          `¿Cuál preferís que quede primero?`,
      });
    }
  }

  // Tradeoffs de frecuencia: si se puede bajar la frecuencia para que entre
  for (const act of unscheduledWithSlots) {
    if (tradeoffs.length >= 5) break;
    const placed = solverResult.events.filter(e =>
      e.title === act.label && e.goalIds.includes(act.goalId),
    ).length;

    if (placed > 0 && placed < act.frequencyPerWeek) {
      tradeoffs.push({
        planA: {
          description_esAR:
            `Hacer ${act.label} ${placed} ${placed === 1 ? 'vez' : 'veces'} por semana ` +
            `(lo que el horario permite ahora mismo).`,
        },
        planB: {
          description_esAR:
            `Hacer ${act.label} las ${act.frequencyPerWeek} veces que querías, ` +
            `pero ajustando alguna otra actividad para liberar espacio.`,
        },
        question_esAR:
          `Para ${act.label} solo hay lugar para ` +
          `${placed} de ${act.frequencyPerWeek} sesiones. ` +
          `¿Arrancás con ${placed} o preferís reorganizar todo?`,
      });
    }
  }

  return tradeoffs;
}

// ─── Internals ────────────────────────────────────────────────────────────────

/** Construye la razón técnica (interna, no mostrada al usuario). */
function buildReason(act: ActivityParams, placed: number): string {
  if (act.feasibleStarts.length === 0) {
    return `No hay ningún hueco disponible de ${act.requestedDurationMin} min en la semana`;
  }
  if (placed === 0) {
    return `Todos los slots factibles están ocupados por otras actividades`;
  }
  return `Solo se pudieron colocar ${placed} de ${act.frequencyPerWeek} sesiones`;
}

/** Construye la sugerencia abuela-proof en español argentino. */
function buildSuggestion(
  act: ActivityParams,
  input: SchedulerInput,
  placed: number,
): string {
  const label = act.label;
  const freq = act.frequencyPerWeek;
  const durMin = act.requestedDurationMin;

  // Caso 1: sin slots factibles en absoluto → no hay disponibilidad
  if (act.feasibleStarts.length === 0) {
    return (
      `No hay espacio libre de ${durMin} minutos en tu semana para ${label}. ` +
      `¿Podés liberar algún rato en tu disponibilidad?`
    );
  }

  // Caso 2: frecuencia 0 colocada
  if (placed === 0) {
    const preferredDays = getMostCommonDaysInSlots(act.feasibleStarts);
    const dayLabel = preferredDays.length > 0
      ? `el ${preferredDays.join(' o el ')}`
      : 'algún día';

    return (
      `No pudo entrar ${label} esta semana porque todos sus horarios posibles ` +
      `están ocupados. ¿Te sirve intentarlo ${dayLabel} si liberás algo?`
    );
  }

  // Caso 3: parcialmente colocada
  if (placed < freq) {
    const missing = freq - placed;
    const bucket = preferredBucketLabel(act);
    return (
      `No hay espacio para las ${freq} sesiones de ${label}. ` +
      `Entraron ${placed}. ` +
      `Para agregar ${missing} más, necesitarías tiempo libre ${bucket}. ` +
      `¿Te sirve hacerlo ${placed} ${placed === 1 ? 'vez' : 'veces'} esta semana?`
    );
  }

  return `${label} quedó agendada correctamente.`;
}

/** Devuelve el label de bucket preferido de la actividad, o genérico. */
function preferredBucketLabel(act: ActivityParams): string {
  if (!act.feasibleStarts.length) return 'en algún momento del día';

  // Si la actividad tiene slots preferidos, tomamos el bucket más frecuente
  const counts: Record<string, number> = {};
  for (const s of act.feasibleStarts) {
    const b = getTimeOfDayBucket(slotInDay(s));
    counts[b] = (counts[b] ?? 0) + 1;
  }
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  return dominant ? `a ${BUCKET_ES[dominant] ?? dominant}` : 'en algún momento del día';
}

/** Devuelve los nombres de los días (en español) donde la actividad tiene más slots. */
function getMostCommonDaysInSlots(feasibleStarts: number[]): string[] {
  const dayCounts: Record<number, number> = {};
  for (const s of feasibleStarts) {
    const d = slotToDay(s);
    dayCounts[d] = (dayCounts[d] ?? 0) + 1;
  }
  return Object.entries(dayCounts)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 2)
    .map(([d]) => DAY_ES[Number(d)] ?? `día ${d}`);
}

/**
 * Para una actividad no agendada, encuentra las actividades ya colocadas
 * que compiten por sus slots factibles.
 */
function findCompetitors(
  act: ActivityParams,
  allActivities: ActivityParams[],
  solverResult: SchedulerOutput,
): ActivityParams[] {
  const competitorIds = new Set<string>();

  // Slots que la actividad no agendada hubiera querido
  const wantedSlots = new Set(act.feasibleStarts);

  for (const event of solverResult.events) {
    // Obtener los slots que ocupa este evento a partir de su título/goalId
    const placed = allActivities.find(
      a => a.label === event.title && event.goalIds.includes(a.goalId),
    );
    if (!placed || placed.id === act.id) continue;

    // Ver si alguno de sus slots factibles coincide con los nuestros
    for (const s of placed.feasibleStarts) {
      if (wantedSlots.has(s)) {
        competitorIds.add(placed.id);
        break;
      }
    }
  }

  return allActivities.filter(a => competitorIds.has(a.id));
}
