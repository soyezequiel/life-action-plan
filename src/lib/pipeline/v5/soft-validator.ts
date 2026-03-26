import { DateTime } from 'luxon';
import type { SoftValidateInput, SoftValidateOutput, SoftFinding } from './phase-io-v5';
import type { TimeEventItem } from '../../domain/plan-item';

export async function executeSoftValidator(input: SoftValidateInput): Promise<SoftValidateOutput> {
  const findings: SoftFinding[] = [];
  const { schedule } = input;
  const events = schedule.events;

  if (events.length === 0) {
    return { findings };
  }

  // Agrupar eventos por día calendario (YYYY-MM-DD local a la base, o usando UTC del startAt)
  const eventsByDay: Record<string, TimeEventItem[]> = {};
  for (const ev of events) {
    const dayKey = DateTime.fromISO(ev.startAt, { zone: 'UTC' }).setZone(input.timezone).toFormat('yyyy-MM-dd');
    if (!eventsByDay[dayKey]) eventsByDay[dayKey] = [];
    eventsByDay[dayKey].push(ev);
  }

  // a. Context switches excesivos y b. Deep work en baja energía
  for (const [day, dayEvents] of Object.entries(eventsByDay)) {
    dayEvents.sort((a, b) =>
      DateTime.fromISO(a.startAt, { zone: 'UTC' }).toMillis() -
      DateTime.fromISO(b.startAt, { zone: 'UTC' }).toMillis(),
    );

    // a. A -> B -> A pattern (Context switches)
    if (dayEvents.length >= 3) {
      for (let i = 0; i < dayEvents.length - 2; i++) {
        const titleA = dayEvents[i].title;
        const titleB = dayEvents[i + 1].title;
        const titleC = dayEvents[i + 2].title;

        if (titleA === titleC && titleA !== titleB) {
          findings.push({
            code: 'SV-CONTEXT-SWITCH',
            severity: 'WARN',
            suggestion_esAR: `El día ${day} tenés muchos cambios de foco (ej: ${titleA} -> ${titleB} -> ${titleC}). Concentrá las actividades parecidas para gastar menos energía mental.`
          });
          // Para no spammar el mismo día
          break;
        }
      }
    }

    // b. Deep work (>= 60 min) tarde en la noche (empieza o termina después de las 21:00)
    for (const ev of dayEvents) {
      if (ev.durationMin >= 60) {
        const localStart = DateTime.fromISO(ev.startAt, { zone: 'UTC' }).setZone(input.timezone);
        const startHour = localStart.hour;
        const endHour = localStart.plus({ minutes: ev.durationMin }).hour;
        // Si la actividad cruza las 21:00 hs (asumiendo que 21, 22, 23 es baja energía para trabajo puro)
        if (startHour >= 21 || endHour >= 22 || (endHour >= 0 && endHour < 5)) {
          findings.push({
            code: 'SV-LATE-DEEPWORK',
            severity: 'WARN',
            suggestion_esAR: `Tratá de no dejar actividades largas ("${ev.title}") para después de las 21hs. Tu cerebro ya está cansado y rinde menos.`
          });
        }
      }
    }
  }

  // c. Días sin descanso (7/7 días con actividades agendadas)
  const uniqueDays = Object.keys(eventsByDay).length;
  if (uniqueDays >= 7) {
    findings.push({
      code: 'SV-NO-REST',
      severity: 'WARN',
      suggestion_esAR: 'Tenés los 7 días de la semana con actividades agendadas. Asegurá al menos un día de descanso total para no quemarte (burnout).'
    });
  }

  // d. Ramp-up demasiado agresivo (muchas horas totales)
  const totalDurationMin = events.reduce((acc, ev) => acc + ev.durationMin, 0);
  if (totalDurationMin >= 15 * 60) { // más de 15 horas de actividades extracurriculares
    findings.push({
      code: 'SV-RAMP-UP',
      severity: 'INFO',
      suggestion_esAR: `Cargaste más de 15 horas semanales de hábitos. Si estás recién empezando, es mejor ir de a poco. ¿No preferís bajar un cambio ahora y subir en un mes?`
    });
  }

  // e. Monotonía (misma actividad todos los días)
  const countsByTitle: Record<string, number> = {};
  for (const ev of events) {
    countsByTitle[ev.title] = (countsByTitle[ev.title] || 0) + 1;
  }

  for (const [title, count] of Object.entries(countsByTitle)) {
    // Si aparece 7 o más veces (todos los días de la semana) sin descansos
    if (count >= 7) {
      findings.push({
        code: 'SV-MONOTONY',
        severity: 'INFO',
        suggestion_esAR: `Tenés agendado "${title}" casi todos los días. Acordate que la constancia es buena, pero variar un poco hace que no te aburras tan rápido.`
      });
    }
  }

  return { findings };
}
