import { DateTime } from 'luxon';

import type { TimeEventItem } from '../../domain/plan-item';
import type { AvailabilityWindow, BlockedSlot } from '../../scheduler/types';
import { getLocalDateKey, parseTimeToMinutes } from './scheduling-context';
import type { HardFinding, HardValidateInput, HardValidateOutput } from './phase-io-v5';

const WEEKDAY_MAP: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

interface MinuteWindow {
  start: number;
  end: number;
}

function toUtcMillis(isoUtc: string): number {
  return DateTime.fromISO(isoUtc, { zone: 'utc' }).toMillis();
}

function sortChronologically(events: TimeEventItem[]): TimeEventItem[] {
  return [...events].sort((left, right) => toUtcMillis(left.startAt) - toUtcMillis(right.startAt));
}

function getDayWindows(
  windows: Array<AvailabilityWindow | BlockedSlot>,
  weekday: number,
): MinuteWindow[] {
  return windows
    .filter((window) => WEEKDAY_MAP[window.day.toLowerCase()] === weekday)
    .map((window) => ({
      start: parseTimeToMinutes(window.startTime, 0),
      end: parseTimeToMinutes(window.endTime, 24 * 60),
    }))
    .sort((left, right) => left.start - right.start);
}

function isWithinAnyWindow(startMin: number, endMin: number, windows: MinuteWindow[]): boolean {
  return windows.some((window) => startMin >= window.start && endMin <= window.end);
}

function overlapsAnyWindow(startMin: number, endMin: number, windows: MinuteWindow[]): boolean {
  return windows.some((window) => startMin < window.end && endMin > window.start);
}

function describeWorkReason(reason: string): boolean {
  return /\b(work|trabajo)\b/i.test(reason);
}

function checkMissingHardFrequencies(
  input: HardValidateInput,
  events: TimeEventItem[],
  findings: HardFinding[],
): HardValidateOutput {
  const hardActivities = input.originalInput.activities.filter((activity) => activity.constraintTier === 'hard');

  for (const request of hardActivities) {
    const placedCount = events.filter(
      (event) => event.title === request.label || event.id.startsWith(`${request.id}_`),
    ).length;
    if (placedCount < request.frequencyPerWeek) {
      findings.push({
        code: 'HV-FREQUENCY',
        severity: 'FAIL',
        description: `No hay espacio para cumplir con "${request.label}". Es una actividad obligatoria y solo entran ${placedCount} de ${request.frequencyPerWeek} sesiones.`,
        affectedItems: [],
      });
    }
  }

  return { findings };
}

export async function executeHardValidator(input: HardValidateInput): Promise<HardValidateOutput> {
  const findings: HardFinding[] = [];
  const events = sortChronologically(input.schedule.events);

  if (events.length === 0) {
    return checkMissingHardFrequencies(input, [], findings);
  }

  for (let index = 0; index < events.length - 1; index += 1) {
    const current = events[index];
    const next = events[index + 1];
    const currentStart = DateTime.fromISO(current.startAt, { zone: 'utc' });
    const currentEnd = currentStart.plus({ minutes: current.durationMin });
    const nextStart = DateTime.fromISO(next.startAt, { zone: 'utc' });

    if (nextStart < currentEnd) {
      findings.push({
        code: 'HV-OVERLAP',
        severity: 'FAIL',
        description: `Se detectó superposición de horarios entre "${current.title}" y "${next.title}".`,
        affectedItems: [current.id, next.id],
      });
    }
  }

  const eventsByLocalDate = new Map<string, TimeEventItem[]>();

  for (const event of events) {
    const localStart = DateTime.fromISO(event.startAt, { zone: 'utc' }).setZone(input.timezone);
    const localEnd = localStart.plus({ minutes: event.durationMin });
    const weekday = localStart.weekday;
    const localDate = getLocalDateKey(event.startAt, input.timezone);
    const eventStartMin = localStart.hour * 60 + localStart.minute;
    const eventEndMin = eventStartMin + event.durationMin;
    const availabilityWindows = getDayWindows(input.originalInput.availability, weekday);
    const blockedSlots = input.originalInput.blocked.filter(
      (slot) => WEEKDAY_MAP[slot.day.toLowerCase()] === weekday,
    );

    const dayBucket = eventsByLocalDate.get(localDate) ?? [];
    dayBucket.push(event);
    eventsByLocalDate.set(localDate, dayBucket);

    if (!isWithinAnyWindow(eventStartMin, eventEndMin, availabilityWindows)) {
      findings.push({
        code: 'HV-OUTSIDE_AWAKE_HOURS',
        severity: 'FAIL',
        description: `La actividad "${event.title}" quedó fuera de la ventana operativa local (${localStart.toFormat('ccc HH:mm')} - ${localEnd.toFormat('HH:mm')}).`,
        affectedItems: [event.id],
      });
    }

    for (const slot of blockedSlots) {
      const blockedWindows = getDayWindows([slot], weekday);
      if (!overlapsAnyWindow(eventStartMin, eventEndMin, blockedWindows)) {
        continue;
      }

      findings.push({
        code: describeWorkReason(slot.reason) ? 'HV-OVERLAPS_WORK' : 'HV-OVERLAPS_BLOCKED',
        severity: 'FAIL',
        description: describeWorkReason(slot.reason)
          ? `La actividad "${event.title}" invade el bloque laboral declarado.`
          : `La actividad "${event.title}" cae sobre un bloque ocupado: ${slot.reason}.`,
        affectedItems: [event.id],
      });
      break;
    }

    const linkedRequest = input.originalInput.activities.find(
      (request) => request.label === event.title || event.id.startsWith(`${request.id}_`),
    );
    if (linkedRequest && event.durationMin !== linkedRequest.durationMin) {
      findings.push({
        code: 'HV-DURATION',
        severity: 'FAIL',
        description: `La actividad "${event.title}" dura ${event.durationMin} minutos, pero debía durar ${linkedRequest.durationMin} minutos según lo pedido.`,
        affectedItems: [event.id],
      });
    }
  }

  for (const [localDate, dayEvents] of eventsByLocalDate.entries()) {
    const totalMinutes = dayEvents.reduce((sum, event) => sum + event.durationMin, 0);
    const weekday = DateTime.fromISO(`${localDate}T12:00:00`, { zone: input.timezone }).weekday;
    const capacityMin = weekday >= 6
      ? input.profile.freeHoursWeekend * 60
      : input.profile.freeHoursWeekday * 60;

    if (totalMinutes > capacityMin) {
      findings.push({
        code: 'HV-DAY-OVER-CAPACITY',
        severity: 'FAIL',
        description: `El día ${localDate} quedó con ${totalMinutes} minutos agendados y supera la capacidad declarada de ${capacityMin} minutos.`,
        affectedItems: dayEvents.map((event) => event.id),
      });
    }
  }

  return checkMissingHardFrequencies(input, events, findings);
}
