import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildSchedulingContextFromProfile,
  isStartDateInPast,
  resolvePlanningStartAt,
  resolveWeekStartDate,
} from '../src/lib/pipeline/shared/scheduling-context';

describe('scheduling-context', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves today in the local timezone and rounds to the next 30 minute slot', () => {
    vi.setSystemTime(new Date('2026-04-02T13:10:00.000Z'));

    const planningStartAt = resolvePlanningStartAt('America/Argentina/Buenos_Aires');
    const weekStartDate = resolveWeekStartDate('America/Argentina/Buenos_Aires', planningStartAt);

    expect(planningStartAt).toBe('2026-04-02T13:30:00.000Z');
    expect(weekStartDate).toBe('2026-03-30T03:00:00.000Z');
  });

  it('respects an explicit future start date', () => {
    vi.setSystemTime(new Date('2026-04-02T13:10:00.000Z'));

    const planningStartAt = resolvePlanningStartAt('America/Argentina/Buenos_Aires', '2026-04-10');
    const weekStartDate = resolveWeekStartDate('America/Argentina/Buenos_Aires', planningStartAt);

    expect(planningStartAt).toBe('2026-04-10T03:00:00.000Z');
    expect(weekStartDate).toBe('2026-04-06T03:00:00.000Z');
  });

  it('detects a startDate in the past of the local timezone', () => {
    vi.setSystemTime(new Date('2026-04-02T13:10:00.000Z'));

    expect(isStartDateInPast('America/Argentina/Buenos_Aires', '2026-04-01')).toBe(true);
    expect(isStartDateInPast('America/Argentina/Buenos_Aires', '2026-04-02')).toBe(false);
  });

  it('builds planningStartAt and weekStartDate from the profile timezone', () => {
    vi.setSystemTime(new Date('2026-04-02T13:10:00.000Z'));

    const schedulingContext = buildSchedulingContextFromProfile({
      participantes: [{
        datosPersonales: {
          ubicacion: {
            zonaHoraria: 'America/Argentina/Buenos_Aires',
          },
        },
        rutinaDiaria: {
          porDefecto: {
            despertar: '08:00',
            dormir: '22:30',
            trabajoInicio: '09:00',
            trabajoFin: '18:00',
          },
        },
        calendario: {
          eventosInamovibles: [],
        },
      }],
    } as any, {
      startDate: '2026-04-10',
    });

    expect(schedulingContext.timezone).toBe('America/Argentina/Buenos_Aires');
    expect(schedulingContext.planningStartAt).toBe('2026-04-10T03:00:00.000Z');
    expect(schedulingContext.weekStartDate).toBe('2026-04-06T03:00:00.000Z');
    expect(schedulingContext.availability[0]).toEqual({
      day: 'monday',
      startTime: '08:00',
      endTime: '22:30',
    });
  });
});
