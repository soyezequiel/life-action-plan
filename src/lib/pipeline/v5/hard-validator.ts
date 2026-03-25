import { DateTime } from 'luxon';
import type { TimeEventItem } from '../../domain/plan-item';
import type { HardValidateInput, HardValidateOutput, HardFinding } from './phase-io-v5';

const WEEKDAY_MAP: Record<string, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7
};

export async function executeHardValidator(input: HardValidateInput): Promise<HardValidateOutput> {
  const findings: HardFinding[] = [];
  const { schedule, originalInput } = input;
  const events = schedule.events;

  // Si no hay eventos, no hay overlaps ni fallas de duración/horario
  if (events.length === 0) {
    return checkMissingHardFrequencies(input, [], findings);
  }

  // Ordenamos cronológicamente
  const sortedEvents = [...events].sort((a, b) => 
    DateTime.fromISO(a.startAt).toMillis() - DateTime.fromISO(b.startAt).toMillis()
  );

  // a. No hay overlaps
  for (let i = 0; i < sortedEvents.length - 1; i++) {
    const current = sortedEvents[i];
    const next = sortedEvents[i + 1];

    const currentStart = DateTime.fromISO(current.startAt);
    const currentEnd = currentStart.plus({ minutes: current.durationMin });
    const nextStart = DateTime.fromISO(next.startAt);

    if (nextStart < currentEnd) {
      findings.push({
        code: 'HV-OVERLAP',
        severity: 'FAIL',
        description: `Se detectó superposición de horarios entre "${current.title}" y "${next.title}".`,
        affectedItems: [current.id, next.id]
      });
    }
  }

  // b & c. Disponibilidad y Duraciones
  for (const event of sortedEvents) {
    if (!isWithinAvailability(event, originalInput.availability)) {
      findings.push({
        code: 'HV-AVAILABILITY',
        severity: 'FAIL',
        description: `La actividad "${event.title}" está programada en un horario donde no tenés disponibilidad.`,
        affectedItems: [event.id]
      });
    }

    const linkedRequest = originalInput.activities.find(req => req.label === event.title || event.id.startsWith(req.id + '_'));
    if (linkedRequest && event.durationMin !== linkedRequest.durationMin) {
      findings.push({
        code: 'HV-DURATION',
        severity: 'FAIL',
        description: `La actividad "${event.title}" dura ${event.durationMin} minutos, pero debía durar ${linkedRequest.durationMin} minutos según lo pedido.`,
        affectedItems: [event.id]
      });
    }
  }

  return checkMissingHardFrequencies(input, sortedEvents, findings);
}

function checkMissingHardFrequencies(input: HardValidateInput, events: TimeEventItem[], findings: HardFinding[]): HardValidateOutput {
  const { originalInput } = input;
  
  // D. Frecuencias mínimas hard cumplidas
  const hardActivities = originalInput.activities.filter(a => a.constraintTier === 'hard');

  for (const req of hardActivities) {
    const placedCount = events.filter(e => e.title === req.label || e.id.startsWith(req.id + '_')).length;
    if (placedCount < req.frequencyPerWeek) {
      findings.push({
        code: 'HV-FREQUENCY',
        severity: 'FAIL',
        description: `No hay espacio para cumplir con "${req.label}". Es una actividad obligatoria y solo entran ${placedCount} de ${req.frequencyPerWeek} sesiones.`,
        affectedItems: []
      });
    }
  }

  return { findings };
}

function isWithinAvailability(event: TimeEventItem, availability: Array<{day: string; startTime: string; endTime: string}>): boolean {
  if (availability.length === 0) return false;
  
  const startDt = DateTime.fromISO(event.startAt, { zone: 'UTC' });
  const endDt = startDt.plus({ minutes: event.durationMin });
  const dayOfWeek = startDt.weekday; // 1 to 7
  
  const dayWindows = availability
    .filter(w => WEEKDAY_MAP[w.day.toLowerCase()] === dayOfWeek)
    .map(w => {
      const [sh, sm] = w.startTime.split(':').map(Number);
      const [eh, em] = w.endTime.split(':').map(Number);
      return { start: sh * 60 + sm, end: eh * 60 + em };
    })
    .sort((a, b) => a.start - b.start);

  if (dayWindows.length === 0) return false;

  const eventStart = startDt.hour * 60 + startDt.minute;
  let eventEnd = endDt.hour * 60 + endDt.minute;
  
  if (endDt.minute === 0 && endDt.hour === 0 && startDt.hour > 0) {
     eventEnd = 24 * 60; // Exactamente a medianoche
  } else if (endDt.weekday !== startDt.weekday) {
     eventEnd = 24 * 60 + (endDt.hour * 60 + endDt.minute); // Cruzó medianoche
  }

  // Merge contiguous windows
  const merged: Array<{start: number, end: number}> = [];
  let current = { ...dayWindows[0] };
  for (let i = 1; i < dayWindows.length; i++) {
    if (dayWindows[i].start <= current.end) {
      current.end = Math.max(current.end, dayWindows[i].end);
    } else {
      merged.push(current);
      current = { ...dayWindows[i] };
    }
  }
  merged.push(current);

  return merged.some(w => eventStart >= w.start && eventEnd <= w.end);
}
