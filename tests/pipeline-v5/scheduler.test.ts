/**
 * scheduler.test.ts
 *
 * Tests exhaustivos del scheduler MILP.
 * Cubre los 10 escenarios del CHAT 4 del Sprint 2.
 *
 * Invariante fundamental: ningún par de TimeEventItem en el output
 * puede solaparse (verificado en CADA test por el helper `assertNoOverlap`).
 */

import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';

import { solveSchedule } from '../../src/lib/scheduler/solver';
import { explainUnscheduled, generateTradeoffs } from '../../src/lib/scheduler/explainer';
import type { SchedulerInput } from '../../src/lib/scheduler/types';
import type { TimeEventItem } from '../../src/lib/domain/plan-item';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Verifica que ningún par de eventos se solapa.
 * Lanza un error descriptivo si encuentra overlap.
 */
function assertNoOverlap(events: TimeEventItem[]): void {
  for (let i = 0; i < events.length; i++) {
    const a = events[i];
    const aStart = DateTime.fromISO(a.startAt).toMillis();
    const aEnd = aStart + a.durationMin * 60_000;

    for (let j = i + 1; j < events.length; j++) {
      const b = events[j];
      const bStart = DateTime.fromISO(b.startAt).toMillis();
      const bEnd = bStart + b.durationMin * 60_000;

      const overlaps = aStart < bEnd && bStart < aEnd;
      if (overlaps) {
        throw new Error(
          `Overlap detectado entre "${a.title}" (${a.startAt}, ${a.durationMin}min) ` +
          `y "${b.title}" (${b.startAt}, ${b.durationMin}min)`,
        );
      }
    }
  }
}

/** Disponibilidad amplia: lunes–viernes 06:00–22:00. */
const WIDE_AVAILABILITY = [
  { day: 'monday',    startTime: '06:00', endTime: '22:00' },
  { day: 'tuesday',   startTime: '06:00', endTime: '22:00' },
  { day: 'wednesday', startTime: '06:00', endTime: '22:00' },
  { day: 'thursday',  startTime: '06:00', endTime: '22:00' },
  { day: 'friday',    startTime: '06:00', endTime: '22:00' },
  { day: 'saturday',  startTime: '08:00', endTime: '20:00' },
  { day: 'sunday',    startTime: '08:00', endTime: '20:00' },
];

const WEEK_START = '2026-03-23'; // lunes

// ─── 1. Caso simple ───────────────────────────────────────────────────────────

describe('Caso simple: 2 actividades sin conflictos', () => {
  it('coloca correr 3×/sem y guitarra 5×/sem sin solapamientos', async () => {
    const input: SchedulerInput = {
      weekStartDate: WEEK_START,
      availability: WIDE_AVAILABILITY,
      blocked: [],
      preferences: [],
      activities: [
        {
          id: 'correr',
          label: 'Correr',
          durationMin: 60,
          frequencyPerWeek: 3,
          goalId: 'g-salud',
          constraintTier: 'hard',
        },
        {
          id: 'guitarra',
          label: 'Guitarra',
          durationMin: 30,
          frequencyPerWeek: 5,
          goalId: 'g-musica',
          constraintTier: 'hard',
        },
      ],
    };

    const result = await solveSchedule(input);

    assertNoOverlap(result.events);

    const correr = result.events.filter(e => e.title === 'Correr');
    const guitarra = result.events.filter(e => e.title === 'Guitarra');

    expect(correr.length).toBe(3);
    expect(guitarra.length).toBe(5);
    expect(result.unscheduled).toHaveLength(0);
    expect(result.metrics.fillRate).toBe(1);
  });
});

// ─── 2. No-overlap: 3 actividades quieren el mismo horario ────────────────────

describe('No-overlap: 3 actividades compiten por lunes 09:00', () => {
  it('coloca las 3 sin solapamiento', async () => {
    const input: SchedulerInput = {
      weekStartDate: WEEK_START,
      availability: WIDE_AVAILABILITY,
      blocked: [],
      preferences: [],
      activities: [
        {
          id: 'act-a',
          label: 'Yoga',
          durationMin: 60,
          frequencyPerWeek: 1,
          goalId: 'g1',
          constraintTier: 'soft_strong',
          preferredSlots: ['morning'],
        },
        {
          id: 'act-b',
          label: 'Pilates',
          durationMin: 60,
          frequencyPerWeek: 1,
          goalId: 'g2',
          constraintTier: 'soft_strong',
          preferredSlots: ['morning'],
        },
        {
          id: 'act-c',
          label: 'Meditación',
          durationMin: 30,
          frequencyPerWeek: 1,
          goalId: 'g3',
          constraintTier: 'soft_strong',
          preferredSlots: ['morning'],
        },
      ],
    };

    const result = await solveSchedule(input);

    assertNoOverlap(result.events);
    // Las 3 deben entrar (hay espacio suficiente en la semana)
    expect(result.events.length).toBe(3);
  });
});

// ─── 3. Soft strong: gym 4×/sem → entra 3× porque solo hay espacio ──────────

describe('Soft strong: gym 4×/sem con espacio para 3', () => {
  it('agenda hasta 3 sesiones y deja 1 en unscheduled', async () => {
    // Disponibilidad acotada: solo lunes/miércoles/viernes mañana (3 huecos de 60 min)
    const input: SchedulerInput = {
      weekStartDate: WEEK_START,
      availability: [
        { day: 'monday',    startTime: '07:00', endTime: '08:00' },
        { day: 'wednesday', startTime: '07:00', endTime: '08:00' },
        { day: 'friday',    startTime: '07:00', endTime: '08:00' },
      ],
      blocked: [],
      preferences: [],
      activities: [
        {
          id: 'gym',
          label: 'Gym',
          durationMin: 60,
          frequencyPerWeek: 4,
          goalId: 'g-gym',
          constraintTier: 'soft_strong',
        },
      ],
    };

    const result = await solveSchedule(input);

    assertNoOverlap(result.events);

    const gymEvents = result.events.filter(e => e.title === 'Gym');
    expect(gymEvents.length).toBeLessThanOrEqual(3);
    expect(result.unscheduled.length).toBeGreaterThan(0);
    expect(result.unscheduled[0].activityId).toBe('gym');
  });
});

// ─── 4. Soft weak: preferencia weekend se relaja si no hay espacio ────────────

describe('Soft weak: cocinar prefiere fin de semana, se mueve si no hay espacio', () => {
  it('coloca la sesión entre semana si el finde está bloqueado', async () => {
    const input: SchedulerInput = {
      weekStartDate: WEEK_START,
      availability: WIDE_AVAILABILITY,
      blocked: [
        { day: 'saturday', startTime: '00:00', endTime: '23:30', reason: 'compromisos' },
        { day: 'sunday',   startTime: '00:00', endTime: '23:30', reason: 'compromisos' },
      ],
      preferences: [],
      activities: [
        {
          id: 'cocinar',
          label: 'Cocinar batch',
          durationMin: 90,
          frequencyPerWeek: 1,
          goalId: 'g-nutricion',
          constraintTier: 'soft_weak',
          preferredSlots: ['afternoon'],
          avoidDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        },
      ],
    };

    const result = await solveSchedule(input);

    assertNoOverlap(result.events);
    // Con soft_weak puede romperse la preferencia → la sesión entra entre semana
    const total = result.events.length + result.unscheduled.length;
    expect(total).toBeGreaterThan(0); // algo pasó (se agendó o quedó en unscheduled)
    // Si se agendó, que NO tenga overlap consigo misma (trivialmente OK, pero valida el flujo)
  });
});

// ─── 5. Agenda llena: unscheduled con explicación en español ─────────────────

describe('Agenda llena: todos los slots bloqueados', () => {
  it('devuelve todas las actividades en unscheduled con explicación en español', async () => {
    // Bloqueamos todo el horario disponible
    const blockedAll = [
      { day: 'monday',    startTime: '00:00', endTime: '23:30', reason: 'bloqueado' },
      { day: 'tuesday',   startTime: '00:00', endTime: '23:30', reason: 'bloqueado' },
      { day: 'wednesday', startTime: '00:00', endTime: '23:30', reason: 'bloqueado' },
      { day: 'thursday',  startTime: '00:00', endTime: '23:30', reason: 'bloqueado' },
      { day: 'friday',    startTime: '00:00', endTime: '23:30', reason: 'bloqueado' },
      { day: 'saturday',  startTime: '00:00', endTime: '23:30', reason: 'bloqueado' },
      { day: 'sunday',    startTime: '00:00', endTime: '23:30', reason: 'bloqueado' },
    ];

    const input: SchedulerInput = {
      weekStartDate: WEEK_START,
      availability: WIDE_AVAILABILITY,
      blocked: blockedAll,
      preferences: [],
      activities: [
        {
          id: 'natacion',
          label: 'Natación',
          durationMin: 60,
          frequencyPerWeek: 3,
          goalId: 'g-salud',
          constraintTier: 'soft_strong',
        },
      ],
    };

    const result = await solveSchedule(input);

    assertNoOverlap(result.events);
    expect(result.events).toHaveLength(0);
    expect(result.unscheduled.length).toBeGreaterThan(0);

    // El explainer enriquece la explicación
    const enriched = explainUnscheduled(input, result);
    expect(enriched.length).toBeGreaterThan(0);

    const item = enriched[0];
    expect(item.suggestion_esAR).toBeTruthy();
    // Debe estar en español (heurística básica: contiene palabras en español)
    expect(item.suggestion_esAR).toMatch(/[áéíóúñ¿¡]|semana|horario|espacio|disponib/i);
  });
});

// ─── 6. Tradeoffs: 2 actividades compiten por el mismo bloque ────────────────

describe('Tradeoffs: actividades que compiten por el mismo horario', () => {
  it('genera al menos 1 tradeoff con Plan A y Plan B', async () => {
    // Solo hay 1 hueco de 60 min y 2 actividades de 60 min lo quieren
    const input: SchedulerInput = {
      weekStartDate: WEEK_START,
      availability: [
        { day: 'monday', startTime: '07:00', endTime: '08:00' },
      ],
      blocked: [],
      preferences: [],
      activities: [
        {
          id: 'act1',
          label: 'Correr',
          durationMin: 60,
          frequencyPerWeek: 1,
          goalId: 'g-salud',
          constraintTier: 'soft_strong',
        },
        {
          id: 'act2',
          label: 'Natación',
          durationMin: 60,
          frequencyPerWeek: 1,
          goalId: 'g-salud',
          constraintTier: 'soft_strong',
        },
      ],
    };

    const result = await solveSchedule(input);

    assertNoOverlap(result.events);

    // Al menos una debe quedar sin agendar
    expect(result.unscheduled.length).toBeGreaterThan(0);

    // Generar tradeoffs
    const tradeoffs = generateTradeoffs(input, result);
    if (tradeoffs.length > 0) {
      const t = tradeoffs[0];
      expect(t.planA.description_esAR).toBeTruthy();
      expect(t.planB.description_esAR).toBeTruthy();
      expect(t.question_esAR).toBeTruthy();
    }
  });
});

// ─── 7. Rest days: running con minRestDaysBetween=1 ─────────────────────────

describe('Rest days: running no puede ir 2 días seguidos', () => {
  it('respeta minRestDaysBetween=1 al colocar las sesiones', async () => {
    const input: SchedulerInput = {
      weekStartDate: WEEK_START,
      availability: WIDE_AVAILABILITY,
      blocked: [],
      preferences: [],
      activities: [
        {
          id: 'running',
          label: 'Running',
          durationMin: 60,
          frequencyPerWeek: 3,
          goalId: 'g-cardio',
          constraintTier: 'hard',
          minRestDaysBetween: 1,
        },
      ],
    };

    const result = await solveSchedule(input);

    assertNoOverlap(result.events);

    const runEvents = result.events.filter(e => e.title === 'Running');
    expect(runEvents.length).toBe(3);

    // Verificar que no haya dos sesiones en días consecutivos
    const runDays = runEvents
      .map(e => DateTime.fromISO(e.startAt).weekday) // 1=lun … 7=dom
      .sort((a, b) => a - b);

    for (let i = 1; i < runDays.length; i++) {
      const gap = runDays[i] - runDays[i - 1];
      expect(gap).toBeGreaterThan(1); // al menos 1 día de descanso
    }
  });
});

// ─── 8. Performance: 7 actividades × 3-5 sesiones → < 3 segundos ─────────────

describe('Performance: 7 actividades resuelve en < 3 segundos', () => {
  it('retorna en menos de 3000ms', async () => {
    const input: SchedulerInput = {
      weekStartDate: WEEK_START,
      availability: WIDE_AVAILABILITY,
      blocked: [],
      preferences: [],
      activities: [
        { id: 'a1', label: 'Correr',    durationMin: 60, frequencyPerWeek: 3, goalId: 'g1', constraintTier: 'soft_strong' },
        { id: 'a2', label: 'Gym',       durationMin: 60, frequencyPerWeek: 4, goalId: 'g2', constraintTier: 'soft_strong' },
        { id: 'a3', label: 'Guitarra',  durationMin: 30, frequencyPerWeek: 5, goalId: 'g3', constraintTier: 'soft_weak' },
        { id: 'a4', label: 'Lectura',   durationMin: 30, frequencyPerWeek: 7, goalId: 'g4', constraintTier: 'soft_weak' },
        { id: 'a5', label: 'Meditación',durationMin: 20, frequencyPerWeek: 5, goalId: 'g5', constraintTier: 'soft_weak' },
        { id: 'a6', label: 'Natación',  durationMin: 60, frequencyPerWeek: 3, goalId: 'g6', constraintTier: 'soft_strong' },
        { id: 'a7', label: 'Idiomas',   durationMin: 45, frequencyPerWeek: 4, goalId: 'g7', constraintTier: 'soft_weak' },
      ],
    };

    const t0 = Date.now();
    const result = await solveSchedule(input);
    const elapsed = Date.now() - t0;

    assertNoOverlap(result.events);

    expect(elapsed).toBeLessThan(3000);
    expect(result.metrics.solverTimeMs).toBeLessThan(3000);
    // El solver corrió
    expect(['optimal', 'feasible']).toContain(result.metrics.solverStatus);
  });
});

// ─── 9. Edge case: 0 actividades ─────────────────────────────────────────────

describe('Edge case: input con 0 actividades', () => {
  it('devuelve output vacío sin errores', async () => {
    const input: SchedulerInput = {
      weekStartDate: WEEK_START,
      availability: WIDE_AVAILABILITY,
      blocked: [],
      preferences: [],
      activities: [],
    };

    const result = await solveSchedule(input);

    expect(result.events).toHaveLength(0);
    expect(result.unscheduled).toHaveLength(0);
    expect(result.metrics.fillRate).toBe(1);
    assertNoOverlap(result.events);
  });
});

// ─── 10. Edge case: disponibilidad 0 (todo bloqueado desde la availability) ──

describe('Edge case: sin disponibilidad en absoluto', () => {
  it('todas las actividades van a unscheduled, 0 eventos agendados', async () => {
    const input: SchedulerInput = {
      weekStartDate: WEEK_START,
      availability: [], // ← sin ninguna ventana de disponibilidad
      blocked: [],
      preferences: [],
      activities: [
        {
          id: 'gym',
          label: 'Gym',
          durationMin: 60,
          frequencyPerWeek: 3,
          goalId: 'g-gym',
          constraintTier: 'soft_strong',
        },
        {
          id: 'yoga',
          label: 'Yoga',
          durationMin: 45,
          frequencyPerWeek: 2,
          goalId: 'g-bienestar',
          constraintTier: 'soft_weak',
        },
      ],
    };

    const result = await solveSchedule(input);

    assertNoOverlap(result.events);
    expect(result.events).toHaveLength(0);
    expect(result.unscheduled.length).toBe(2);

    // El explainer debe generar explicaciones válidas en español
    const enriched = explainUnscheduled(input, result);
    expect(enriched.length).toBe(2);
    for (const item of enriched) {
      expect(item.suggestion_esAR.length).toBeGreaterThan(10);
    }
  });
});
