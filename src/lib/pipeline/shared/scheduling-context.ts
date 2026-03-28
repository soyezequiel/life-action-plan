import { DateTime } from 'luxon';

import type { Perfil } from '../../../shared/schemas/perfil';
import type { AvailabilityWindow, BlockedSlot } from '../../scheduler/types';

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';
const DEFAULT_WAKE_TIME = '07:00';
const DEFAULT_SLEEP_TIME = '22:00';
const WORKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
const WEEK_DAYS = [...WORKDAY_NAMES, 'saturday', 'sunday'] as const;
const DAY_ALIASES: Record<string, typeof WEEK_DAYS[number]> = {
  monday: 'monday',
  lunes: 'monday',
  tuesday: 'tuesday',
  martes: 'tuesday',
  wednesday: 'wednesday',
  miercoles: 'wednesday',
  miércoles: 'wednesday',
  thursday: 'thursday',
  jueves: 'thursday',
  friday: 'friday',
  viernes: 'friday',
  saturday: 'saturday',
  sabado: 'saturday',
  sábado: 'saturday',
  sunday: 'sunday',
  domingo: 'sunday',
};

export interface SchedulingContext {
  timezone: string;
  weekStartDate: string;
  availability: AvailabilityWindow[];
  blocked: BlockedSlot[];
}

function normalizeTimezone(timezone: string | null | undefined): string {
  return timezone?.trim() || DEFAULT_TIMEZONE;
}

export function parseTimeToMinutes(value: string | null | undefined, fallbackMinutes: number): number {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return fallbackMinutes;
  }

  const hours = Number.parseInt(match[1] ?? '0', 10);
  const minutes = Number.parseInt(match[2] ?? '0', 10);
  return (hours * 60) + minutes;
}

export function formatMinutesAsTime(minutes: number): string {
  const bounded = Math.max(0, Math.min(minutes, 24 * 60));
  const hours = Math.floor(bounded / 60);
  const remainingMinutes = bounded % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
}

function normalizeDayName(day: string | null | undefined): typeof WEEK_DAYS[number] | null {
  if (!day) {
    return null;
  }

  return DAY_ALIASES[day.trim().toLowerCase()] ?? null;
}

function buildAvailabilityWindows(
  wakeTime: string | null | undefined,
  sleepTime: string | null | undefined,
): AvailabilityWindow[] {
  const startTime = wakeTime?.trim() || DEFAULT_WAKE_TIME;
  const endTime = sleepTime?.trim() || DEFAULT_SLEEP_TIME;

  return WEEK_DAYS.map((day) => ({
    day,
    startTime,
    endTime,
  }));
}

function buildWorkBlockedSlots(
  workStart: string | null | undefined,
  workEnd: string | null | undefined,
): BlockedSlot[] {
  if (!workStart?.trim() || !workEnd?.trim()) {
    return [];
  }

  return WORKDAY_NAMES.map((day) => ({
    day,
    startTime: workStart,
    endTime: workEnd,
    reason: 'Trabajo',
  }));
}

function parseRecurringHorario(horario: string | null | undefined, reason: string): BlockedSlot[] {
  if (!horario?.trim()) {
    return [];
  }

  const normalized = horario
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const match = normalized.match(
    /\b(monday|lunes|tuesday|martes|wednesday|miercoles|thursday|jueves|friday|viernes|saturday|sabado|sunday|domingo)\b.*?(\d{1,2}:\d{2})\s*[-a]\s*(\d{1,2}:\d{2})/,
  );

  if (!match) {
    return [];
  }

  const day = normalizeDayName(match[1]);
  if (!day) {
    return [];
  }

  return [{
    day,
    startTime: match[2] ?? DEFAULT_WAKE_TIME,
    endTime: match[3] ?? DEFAULT_SLEEP_TIME,
    reason,
  }];
}

function dedupeBlockedSlots(blocked: BlockedSlot[]): BlockedSlot[] {
  const seen = new Set<string>();
  return blocked.filter((slot) => {
    const key = `${slot.day}|${slot.startTime}|${slot.endTime}|${slot.reason}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function resolveWeekStartDate(timezone: string, anchorAt?: string): string {
  const base = anchorAt
    ? DateTime.fromISO(anchorAt, { zone: timezone })
    : DateTime.now().setZone(timezone);
  const candidate = (base.isValid ? base : DateTime.now().setZone(timezone))
    .startOf('week')
    .setZone('utc');
  return candidate.toISO() ?? DateTime.utc().startOf('week').toISO() ?? '';
}

export function getLocalDateKey(isoUtc: string, timezone: string): string {
  return DateTime.fromISO(isoUtc, { zone: 'utc' }).setZone(timezone).toISODate() ?? '';
}

export function buildSchedulingContextFromRunnerConfig(config: {
  timezone: string;
  weekStartDate?: string;
  availability: AvailabilityWindow[];
  blocked?: BlockedSlot[];
}): SchedulingContext {
  const timezone = normalizeTimezone(config.timezone);

  return {
    timezone,
    weekStartDate: config.weekStartDate ?? resolveWeekStartDate(timezone),
    availability: config.availability,
    blocked: dedupeBlockedSlots(config.blocked ?? []),
  };
}

export function buildSchedulingContextFromProfile(
  profile: Perfil,
  config: {
    weekStartDate?: string;
    blocked?: BlockedSlot[];
    availability?: AvailabilityWindow[];
  } = {},
): SchedulingContext {
  const participant = profile.participantes[0];
  const routine = participant?.rutinaDiaria?.porDefecto;
  const timezone = normalizeTimezone(participant?.datosPersonales?.ubicacion?.zonaHoraria);
  const availability = config.availability ?? buildAvailabilityWindows(routine?.despertar, routine?.dormir);
  const blocked = dedupeBlockedSlots([
    ...buildWorkBlockedSlots(routine?.trabajoInicio, routine?.trabajoFin),
    ...(participant?.calendario?.eventosInamovibles ?? []).flatMap((event) =>
      parseRecurringHorario(event.horario, event.nombre),
    ),
    ...((config.blocked ?? [])),
  ]);

  return {
    timezone,
    weekStartDate: config.weekStartDate ?? resolveWeekStartDate(timezone),
    availability,
    blocked,
  };
}
