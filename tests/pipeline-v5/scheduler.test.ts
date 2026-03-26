import { describe, it, expect } from 'vitest';
import { solveSchedule } from '../../src/lib/scheduler/solver';
import { explainUnscheduled, generateTradeoffs } from '../../src/lib/scheduler/explainer';
import type { SchedulerInput } from '../../src/lib/scheduler/types';
import type { TimeEventItem } from '../../src/lib/domain/plan-item';
import { DateTime } from 'luxon';

/**
 * Verifica recursivamente que no haya overlaps en los eventos generados
 */
function expectNoOverlaps(events: TimeEventItem[]) {
  // Ordenar cronológicamente
  const sorted = [...events].sort((a, b) => 
    new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    const currentStart = new Date(current.startAt).getTime();
    const currentEnd = currentStart + current.durationMin * 60000;
    const nextStart = new Date(next.startAt).getTime();

    if (nextStart < currentEnd) {
      throw new Error(`Overlap detected entre ${current.title} (fin: ${new Date(currentEnd).toISOString()}) y ${next.title} (inicio: ${new Date(nextStart).toISOString()})`);
    }
  }
}

describe('Scheduler MILP - Suite Exhaustiva', () => {

  it('1. Caso simple: 2 actividades, horario amplio libre -> todo entra sin conflictos', async () => {
    const input: SchedulerInput = {
      weekStartDate: '2026-03-30T00:00:00Z',
      availability: [
        { day: 'monday', startTime: '08:00', endTime: '20:00' },
        { day: 'wednesday', startTime: '08:00', endTime: '20:00' },
        { day: 'friday', startTime: '08:00', endTime: '20:00' },
      ],
      blocked: [],
      preferences: [],
      activities: [
        { id: 'run-1', label: 'Correr', equivalenceGroupId: 'cardio-outdoor-base', durationMin: 60, frequencyPerWeek: 3, goalId: 'g1', constraintTier: 'hard' },
        { id: 'guitar-1', label: 'Guitarra', equivalenceGroupId: 'guitar-technique', durationMin: 30, frequencyPerWeek: 5, goalId: 'g2', constraintTier: 'hard' }
      ]
    };

    const output = await solveSchedule(input);
    expectNoOverlaps(output.events);
    expect(output.events.length).toBe(8); // 3 + 5
    expect(output.unscheduled.length).toBe(0);
  });

  it('2. Overlap: 3 actividades quieren lunes a las 09:00 -> solver coloca sin overlap', async () => {
    const input: SchedulerInput = {
      weekStartDate: '2026-03-30T00:00:00Z',
      availability: [
        { day: 'monday', startTime: '09:00', endTime: '12:00' } // 3 block de 1 hora
      ],
      blocked: [],
      preferences: [],
      activities: [
        { id: 'a1', label: 'A1', equivalenceGroupId: 'group-a1', durationMin: 60, frequencyPerWeek: 1, goalId: 'g1', constraintTier: 'hard', preferredSlots: ['morning'] },
        { id: 'a2', label: 'A2', equivalenceGroupId: 'group-a2', durationMin: 60, frequencyPerWeek: 1, goalId: 'g2', constraintTier: 'hard', preferredSlots: ['morning'] },
        { id: 'a3', label: 'A3', equivalenceGroupId: 'group-a3', durationMin: 60, frequencyPerWeek: 1, goalId: 'g3', constraintTier: 'hard', preferredSlots: ['morning'] }
      ]
    };

    const output = await solveSchedule(input);
    expectNoOverlaps(output.events);
    expect(output.events.length).toBe(3);
    // Cada uno debe empezar en horas distintas para cubrir 9 a 12
    const startTimes = output.events.map(e => DateTime.fromISO(e.startAt, { zone: 'UTC' }).toFormat('HH:mm')).sort();
    expect(startTimes).toEqual(['09:00', '10:00', '11:00']);
  });

  it('3. Soft strong: gym pedido 4x/sem pero solo hay espacio para 3 -> se programa 3', async () => {
    const input: SchedulerInput = {
      weekStartDate: '2026-03-30T00:00:00Z',
      availability: [
        { day: 'tuesday', startTime: '18:00', endTime: '21:00' } // 3 bloques de 1 hora
      ],
      blocked: [],
      preferences: [],
      activities: [
        { id: 'gym', label: 'Gym', equivalenceGroupId: 'gym-indoors', durationMin: 60, frequencyPerWeek: 4, goalId: 'g1', constraintTier: 'soft_strong' }
      ]
    };

    const output = await solveSchedule(input);
    expectNoOverlaps(output.events);
    expect(output.events.length).toBe(3);
    expect(output.unscheduled.length).toBe(1);
    expect(output.metrics.fillRate).toBe(0.75); // 3/4
  });

  it('4. Soft weak: prefiere un día pero penalización no evita que se agende', async () => {
    // Si evitamos miércoles pero el miércoles es el ÚNICO lugar disponible,
    // al ser soft_weak igual prefiere programarlo (penalmente es mejor programar que dejar unscheduled).
    const input: SchedulerInput = {
      weekStartDate: '2026-03-30T00:00:00Z',
      availability: [
        { day: 'wednesday', startTime: '18:00', endTime: '20:00' }
      ],
      blocked: [],
      preferences: [],
      activities: [
        { id: 'cook', label: 'Cocinar', equivalenceGroupId: 'home-cooking', durationMin: 120, frequencyPerWeek: 1, goalId: 'g1', constraintTier: 'soft_weak', avoidDays: ['wednesday'] }
      ]
    };

    const output = await solveSchedule(input);
    expectNoOverlaps(output.events);
    expect(output.events.length).toBe(1); // Se agendó pese al penalty
    expect(output.unscheduled.length).toBe(0);

    const eventDay = DateTime.fromISO(output.events[0].startAt, { zone: 'UTC' }).weekday;
    expect(eventDay).toBe(3); // 3 es Wednesday en Luxon
  });

  it('5. Agenda llena: blocked slots cubren casi todo -> unscheduled con explicación en español', async () => {
    const input: SchedulerInput = {
      weekStartDate: '2026-03-30T00:00:00Z',
      availability: [
        { day: 'thursday', startTime: '09:00', endTime: '10:00' }
      ],
      blocked: [
        { day: 'thursday', startTime: '09:00', endTime: '10:00', reason: 'Médico' }
      ],
      preferences: [],
      activities: [
        { id: 'leer', label: 'Leyendo', equivalenceGroupId: 'reading-focus', durationMin: 60, frequencyPerWeek: 1, goalId: 'g1', constraintTier: 'soft_strong' }
      ]
    };

    const output = await solveSchedule(input);
    expectNoOverlaps(output.events);
    expect(output.events.length).toBe(0);
    expect(output.unscheduled.length).toBe(1);

    const explainerRes = explainUnscheduled(input, output);
    expect(explainerRes.length).toBe(1);
    expect(explainerRes[0].suggestion_esAR).toContain('espacio libre');
    expect(explainerRes[0].suggestion_esAR).toContain('Leyendo');
  });

  it('6. Trade-offs: 2 actividades compiten por mismo bloque -> tradeoff generado', async () => {
    const input: SchedulerInput = {
      weekStartDate: '2026-03-30T00:00:00Z',
      availability: [
        { day: 'saturday', startTime: '10:00', endTime: '11:00' } // 1 block de 1 hr
      ],
      blocked: [],
      preferences: [],
      activities: [
        { id: 'actA', label: 'Deporte A', equivalenceGroupId: 'sport-a', durationMin: 60, frequencyPerWeek: 1, goalId: 'g1', constraintTier: 'soft_strong' },
        { id: 'actB', label: 'Deporte B', equivalenceGroupId: 'sport-b', durationMin: 60, frequencyPerWeek: 1, goalId: 'g2', constraintTier: 'soft_strong' },
      ]
    };

    const output = await solveSchedule(input);
    expectNoOverlaps(output.events);
    expect(output.events.length).toBe(1); // Solo entra uno
    expect(output.unscheduled.length).toBe(1); // El otro queda fuera

    const tradeoffs = generateTradeoffs(input, output);
    expect(tradeoffs.length).toBeGreaterThan(0);
    const t = tradeoffs[0];
    expect(t.planA.description_esAR.length).toBeGreaterThan(10);
    expect(t.planB.description_esAR.length).toBeGreaterThan(10);
    expect(t.question_esAR.includes('compiten')).toBe(true);
  });

  it('7. Rest days: running con minRestDaysBetween=1 -> no hay corrida días seguidos', async () => {
    const input: SchedulerInput = {
      weekStartDate: '2026-03-30T00:00:00Z',
      availability: [
        { day: 'monday', startTime: '20:00', endTime: '21:00' },
        { day: 'tuesday', startTime: '20:00', endTime: '21:00' },
        { day: 'wednesday', startTime: '20:00', endTime: '21:00' },
      ],
      blocked: [],
      preferences: [],
      activities: [
        { id: 'run', label: 'Running', equivalenceGroupId: 'cardio-outdoor-base', durationMin: 60, frequencyPerWeek: 2, goalId: 'g1', constraintTier: 'hard', minRestDaysBetween: 1 }
      ]
    };

    const output = await solveSchedule(input);
    expectNoOverlaps(output.events);
    expect(output.events.length).toBe(2);

    const days = output.events.map(e => DateTime.fromISO(e.startAt, { zone: 'UTC' }).weekday).sort((a,b)=>a-b);
    // Debe seleccionar lunes (1) y miércoles (3) porque martes no puede estar pegado
    expect(days).toEqual([1, 3]);
  });

  it('8. Performance: 7 actividades x 3-5 sesiones -> resuelve rápido', async () => {
    // 7 actividades, en total ~25-30 horas estimadas
    const activities = Array.from({ length: 7 }).map((_, i) => ({
      id: `act-${i}`,
      label: `Actividad ${i}`,
      equivalenceGroupId: `group-${i}`,
      durationMin: 60,
      frequencyPerWeek: 3 + (i % 3), // oscila 3, 4, 5
      goalId: `g${i}`,
      constraintTier: 'soft_strong' as const
    }));

    const input: SchedulerInput = {
      weekStartDate: '2026-03-30T00:00:00Z',
      availability: [
        { day: 'monday', startTime: '08:00', endTime: '22:00' },
        { day: 'tuesday', startTime: '08:00', endTime: '22:00' },
        { day: 'wednesday', startTime: '08:00', endTime: '22:00' },
        { day: 'thursday', startTime: '08:00', endTime: '22:00' },
        { day: 'friday', startTime: '08:00', endTime: '22:00' },
        { day: 'saturday', startTime: '08:00', endTime: '22:00' },
        { day: 'sunday', startTime: '08:00', endTime: '22:00' },
      ], // 98 horas a la semana libres -> hay lugar para todo
      blocked: [],
      preferences: [],
      activities
    };

    const start = Date.now();
    const output = await solveSchedule(input);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(3000); // Exigido
    expectNoOverlaps(output.events);
    expect(output.metrics.fillRate).toBe(1); // Debe entrar todo
    expect(output.unscheduled.length).toBe(0);
  }, 10000);

  it('9. Edge case vacío: 0 actividades -> output vacío sin error', async () => {
    const input: SchedulerInput = {
      weekStartDate: '2026-03-30T00:00:00Z',
      availability: [
        { day: 'monday', startTime: '08:00', endTime: '12:00' }
      ],
      blocked: [],
      preferences: [],
      activities: []
    };
    
    const output = await solveSchedule(input);
    expect(output.events).toHaveLength(0);
    expect(output.unscheduled).toHaveLength(0);
    expect(output.metrics.fillRate).toBe(1);
  });

  it('10. Edge case sin disponibilidad: todo bloqueado -> todas a unscheduled', async () => {
    const input: SchedulerInput = {
      weekStartDate: '2026-03-30T00:00:00Z',
      availability: [],
      blocked: [],
      preferences: [],
      activities: [
        { id: 'act1', label: 'Act 1', equivalenceGroupId: 'group-act1', durationMin: 60, frequencyPerWeek: 3, goalId: 'g1', constraintTier: 'soft_strong' }
      ]
    };

    const output = await solveSchedule(input);
    expect(output.events).toHaveLength(0);
    expect(output.unscheduled).toHaveLength(1);
    expect(output.unscheduled[0].activityId).toBe('act1');

    const explainerRes = explainUnscheduled(input, output);
    expect(explainerRes[0].suggestion_esAR).toContain('No hay espacio');
  });

});
