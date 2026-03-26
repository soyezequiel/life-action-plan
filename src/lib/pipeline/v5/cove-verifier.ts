import { DateTime } from 'luxon';
import { z } from 'zod';

import type { TimeEventItem } from '../../domain/plan-item';
import type { AgentRuntime } from '../../runtime/types';
import type { CoVeFinding, CoVeVerifyInput, CoVeVerifyOutput } from './phase-io-v5';

interface DayLoad {
  date: string;
  sessions: number;
  minutes: number;
}

interface CoVeFacts {
  totalEvents: number;
  activeDates: string[];
  restDays: number;
  overlaps: number;
  busiestDays: DayLoad[];
  maxSessionsPerDay: number;
  concentrated: boolean;
}

interface RawCoVeFinding {
  code?: string;
  question: string;
  answer: string;
  severity: 'FAIL' | 'WARN' | 'INFO';
}

const OPERATIONAL_WINDOW_DAYS = 7;

const rawCoVeFindingSchema = z.object({
  code: z.string().trim().min(1).optional(),
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  severity: z.enum(['FAIL', 'WARN', 'INFO']),
}).strict();

const rawCoVeResponseSchema = z.object({
  findings: z.array(rawCoVeFindingSchema).min(1).max(4),
}).strict();

function stripFormatting(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

function extractFirstJsonObject(content: string): string {
  const cleaned = stripFormatting(content);
  const firstBrace = cleaned.indexOf('{');

  if (firstBrace < 0) {
    return cleaned;
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = firstBrace; index < cleaned.length; index += 1) {
    const char = cleaned[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return cleaned.slice(firstBrace, index + 1);
      }
    }
  }

  return cleaned.slice(firstBrace);
}

function toLocalDate(startAt: string, timezone: string): string | null {
  return DateTime.fromISO(startAt, { zone: 'utc' }).setZone(timezone).toISODate();
}

function countOverlaps(events: TimeEventItem[]): number {
  let overlaps = 0;

  for (let index = 0; index < events.length; index += 1) {
    const currentStart = DateTime.fromISO(events[index].startAt, { zone: 'utc' });
    const currentEnd = currentStart.plus({ minutes: events[index].durationMin });

    for (let compareIndex = index + 1; compareIndex < events.length; compareIndex += 1) {
      const compareStart = DateTime.fromISO(events[compareIndex].startAt, { zone: 'utc' });
      const compareEnd = compareStart.plus({ minutes: events[compareIndex].durationMin });
      if (currentStart < compareEnd && currentEnd > compareStart) {
        overlaps += 1;
      }
    }
  }

  return overlaps;
}

export function buildCoVeFacts(input: CoVeVerifyInput): CoVeFacts {
  const loadsByDate = new Map<string, DayLoad>();

  for (const event of input.schedule.events) {
    const localDate = toLocalDate(event.startAt, input.timezone);
    if (!localDate) {
      continue;
    }

    const existing = loadsByDate.get(localDate);
    if (existing) {
      existing.sessions += 1;
      existing.minutes += event.durationMin;
      continue;
    }

    loadsByDate.set(localDate, {
      date: localDate,
      sessions: 1,
      minutes: event.durationMin,
    });
  }

  const busiestDays = [...loadsByDate.values()].sort((left, right) => {
    if (right.sessions !== left.sessions) {
      return right.sessions - left.sessions;
    }
    return right.minutes - left.minutes;
  });
  const maxSessionsPerDay = busiestDays[0]?.sessions ?? 0;
  const topTwoSessions = (busiestDays[0]?.sessions ?? 0) + (busiestDays[1]?.sessions ?? 0);
  const concentrated = maxSessionsPerDay >= 4
    || (input.schedule.events.length >= 6 && topTwoSessions / Math.max(input.schedule.events.length, 1) >= 0.6)
    || (loadsByDate.size > 0 && loadsByDate.size <= Math.ceil(input.schedule.events.length / 2));

  return {
    totalEvents: input.schedule.events.length,
    activeDates: [...loadsByDate.keys()].sort(),
    restDays: Math.max(0, OPERATIONAL_WINDOW_DAYS - loadsByDate.size),
    overlaps: countOverlaps(input.schedule.events),
    busiestDays,
    maxSessionsPerDay,
    concentrated,
  };
}

function deterministicRestFinding(facts: CoVeFacts): CoVeFinding {
  if (facts.totalEvents === 0) {
    return {
      code: 'COVE-REST',
      question: '¿Hay al menos un día de descanso completo en la semana operativa?',
      answer: 'No hay eventos programados todavía, así que la semana completa quedó libre.',
      severity: 'INFO',
      groundedByFacts: true,
      supportingFacts: ['totalEvents=0', 'restDays=7'],
    };
  }

  if (facts.restDays === 0) {
    return {
      code: 'COVE-REST',
      question: '¿Hay al menos un día de descanso completo en la semana operativa?',
      answer: 'No, la agenda ocupa los 7 días de la semana operativa y no deja un día libre completo.',
      severity: 'FAIL',
      groundedByFacts: true,
      supportingFacts: [`restDays=${facts.restDays}`, `activeDates=${facts.activeDates.join(',')}`],
    };
  }

  return {
    code: 'COVE-REST',
    question: '¿Hay al menos un día de descanso completo en la semana operativa?',
    answer: `Sí, quedan ${facts.restDays} día(s) completo(s) sin sesiones en la ventana operativa semanal.`,
    severity: 'INFO',
    groundedByFacts: true,
    supportingFacts: [`restDays=${facts.restDays}`, `activeDates=${facts.activeDates.join(',')}`],
  };
}

function deterministicDistributionFinding(facts: CoVeFacts): CoVeFinding {
  if (facts.totalEvents === 0) {
    return {
      code: 'COVE-DISTRIBUTION',
      question: '¿Las sesiones están razonablemente distribuidas a lo largo de la semana?',
      answer: 'Todavía no hay sesiones para evaluar la distribución.',
      severity: 'INFO',
      groundedByFacts: true,
      supportingFacts: ['totalEvents=0'],
    };
  }

  if (!facts.concentrated) {
    return {
      code: 'COVE-DISTRIBUTION',
      question: '¿Las sesiones están razonablemente distribuidas a lo largo de la semana?',
      answer: 'Sí, la carga semanal quedó repartida sin picos fuertes en un mismo día.',
      severity: 'INFO',
      groundedByFacts: true,
      supportingFacts: [`maxSessionsPerDay=${facts.maxSessionsPerDay}`],
    };
  }

  const busiest = facts.busiestDays
    .slice(0, 2)
    .map((day) => `${day.date} (${day.sessions} sesiones)`)
    .join(', ');

  return {
    code: 'COVE-DISTRIBUTION',
    question: '¿Las sesiones están razonablemente distribuidas a lo largo de la semana?',
    answer: `No del todo, hay concentración de sesiones en ${busiest}.`,
    severity: 'WARN',
    groundedByFacts: true,
    supportingFacts: [`maxSessionsPerDay=${facts.maxSessionsPerDay}`, `busiestDays=${busiest}`],
  };
}

function deterministicOverlapFinding(facts: CoVeFacts): CoVeFinding {
  if (facts.totalEvents === 0) {
    return {
      code: 'COVE-OVERLAP',
      question: '¿Existen solapamientos reales entre eventos del calendario?',
      answer: 'No hay eventos programados, así que no puede haber solapamientos.',
      severity: 'INFO',
      groundedByFacts: true,
      supportingFacts: ['totalEvents=0', 'overlaps=0'],
    };
  }

  if (facts.overlaps > 0) {
    return {
      code: 'COVE-OVERLAP',
      question: '¿Existen solapamientos reales entre eventos del calendario?',
      answer: `Sí, se detectaron ${facts.overlaps} solapamiento(s) reales entre eventos.`,
      severity: 'FAIL',
      groundedByFacts: true,
      supportingFacts: [`overlaps=${facts.overlaps}`],
    };
  }

  return {
    code: 'COVE-OVERLAP',
    question: '¿Existen solapamientos reales entre eventos del calendario?',
    answer: 'No, no se detectaron solapamientos reales entre los eventos programados.',
    severity: 'INFO',
    groundedByFacts: true,
    supportingFacts: ['overlaps=0'],
  };
}

function inferCode(raw: RawCoVeFinding): CoVeFinding['code'] {
  const text = `${raw.code ?? ''} ${raw.question} ${raw.answer}`.toLowerCase();
  if (/rest|descanso|dia libre/.test(text)) {
    return 'COVE-REST';
  }
  if (/overlap|solap/.test(text)) {
    return 'COVE-OVERLAP';
  }
  if (/distrib|concentr|carga|repart/.test(text)) {
    return 'COVE-DISTRIBUTION';
  }
  return 'COVE-OTHER';
}

function applyGrounding(raw: RawCoVeFinding, facts: CoVeFacts): CoVeFinding {
  const code = inferCode(raw);
  let severity = raw.severity;
  let groundedByFacts = true;
  let supportingFacts: string[] = [];

  if (code === 'COVE-REST') {
    supportingFacts = [`restDays=${facts.restDays}`, `activeDates=${facts.activeDates.join(',') || 'none'}`];
    if (severity === 'FAIL' && facts.restDays > 0) {
      severity = 'WARN';
      groundedByFacts = false;
    }
  } else if (code === 'COVE-OVERLAP') {
    supportingFacts = [`overlaps=${facts.overlaps}`];
    if (severity === 'FAIL' && facts.overlaps === 0) {
      severity = 'WARN';
      groundedByFacts = false;
    }
  } else if (code === 'COVE-DISTRIBUTION') {
    supportingFacts = [
      `maxSessionsPerDay=${facts.maxSessionsPerDay}`,
      `concentrated=${facts.concentrated}`,
    ];
    if (severity === 'FAIL') {
      severity = 'WARN';
      groundedByFacts = facts.concentrated;
    }
  } else {
    supportingFacts = [
      `restDays=${facts.restDays}`,
      `overlaps=${facts.overlaps}`,
      `maxSessionsPerDay=${facts.maxSessionsPerDay}`,
    ];
    if (severity === 'FAIL') {
      severity = 'WARN';
      groundedByFacts = false;
    }
  }

  return {
    code,
    question: raw.question,
    answer: raw.answer,
    severity,
    groundedByFacts,
    supportingFacts,
  };
}

function buildDeterministicFindings(facts: CoVeFacts): CoVeFinding[] {
  return [
    deterministicRestFinding(facts),
    deterministicDistributionFinding(facts),
    deterministicOverlapFinding(facts),
  ];
}

async function readLlmFindings(runtime: AgentRuntime, input: CoVeVerifyInput, facts: CoVeFacts): Promise<RawCoVeFinding[] | null> {
  const response = await runtime.chat([{
    role: 'user',
    content: `
Eres la fase Chain-of-Verification de un pipeline de planes ejecutables.
Solo puedes razonar usando estos facts operativos ya calculados.

Timezone: ${input.timezone}
Profile: weekdayFreeHours=${input.profile.freeHoursWeekday}, weekendFreeHours=${input.profile.freeHoursWeekend}, energy=${input.profile.energyLevel}
Facts:
- totalEvents=${facts.totalEvents}
- activeDates=${facts.activeDates.join(',') || 'none'}
- restDays=${facts.restDays}
- overlaps=${facts.overlaps}
- maxSessionsPerDay=${facts.maxSessionsPerDay}
- concentrated=${facts.concentrated}
- busiestDays=${facts.busiestDays.map((day) => `${day.date}:${day.sessions}x${day.minutes}m`).join(',') || 'none'}

Devuelve SOLO JSON estricto con 2 a 4 findings:
{
  "findings": [
    {
      "code": "COVE-REST|COVE-DISTRIBUTION|COVE-OVERLAP|COVE-OTHER",
      "question": "pregunta corta",
      "answer": "respuesta corta",
      "severity": "FAIL|WARN|INFO"
    }
  ]
}

No inventes hechos fuera de este snapshot.
`.trim(),
  }]);

  const raw = extractFirstJsonObject(response.content);
  const parsed = rawCoVeResponseSchema.parse(JSON.parse(raw));
  return parsed.findings;
}

function normalizeFindings(rawFindings: RawCoVeFinding[] | null, facts: CoVeFacts): CoVeFinding[] {
  if (!rawFindings || rawFindings.length === 0) {
    return buildDeterministicFindings(facts);
  }

  const normalized = rawFindings.map((finding) => applyGrounding(finding, facts));
  const findingsByCode = new Map(normalized.map((finding) => [finding.code, finding]));

  for (const fallback of buildDeterministicFindings(facts)) {
    if (!findingsByCode.has(fallback.code)) {
      findingsByCode.set(fallback.code, fallback);
    }
  }

  return [
    findingsByCode.get('COVE-REST'),
    findingsByCode.get('COVE-DISTRIBUTION'),
    findingsByCode.get('COVE-OVERLAP'),
    ...[...findingsByCode.values()].filter((finding) => !['COVE-REST', 'COVE-DISTRIBUTION', 'COVE-OVERLAP'].includes(finding.code)),
  ].filter((finding): finding is CoVeFinding => Boolean(finding)).slice(0, 4);
}

export async function executeCoVeVerifier(
  runtime: AgentRuntime,
  input: CoVeVerifyInput,
): Promise<CoVeVerifyOutput> {
  const facts = buildCoVeFacts(input);

  try {
    const rawFindings = await readLlmFindings(runtime, input, facts);
    return {
      findings: normalizeFindings(rawFindings, facts),
    };
  } catch {
    return {
      findings: buildDeterministicFindings(facts),
    };
  }
}
