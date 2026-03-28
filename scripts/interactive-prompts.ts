import { createInterface, type Interface } from 'node:readline/promises';
import { stderr, stdin } from 'node:process';

import { IANAZone } from 'luxon';

import type { HabitState } from '../src/lib/domain/habit-state';
import type { SlackPolicy } from '../src/lib/domain/slack-policy';

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';
const DEFAULT_WAKE_TIME = '07:00';
const DEFAULT_SLEEP_TIME = '22:00';
const DEFAULT_WORK_START = '09:00';
const DEFAULT_WORK_END = '18:00';
const DEFAULT_DOMAIN_CHOICE = '1';
const DEFAULT_HABIT_WEEKS = 10;
const DEFAULT_HABIT_LEVEL = 2;
const DEFAULT_HABIT_SESSIONS = 5;
const DEFAULT_HABIT_MINUTES = 15;
const DEFAULT_MINIMUM_VIABLE_DESCRIPTION = 'Sesion minima para sostener el habito';
const DEFAULT_SLACK_POLICY: SlackPolicy = {
  weeklyTimeBufferMin: 150,
  maxChurnMovesPerWeek: 3,
  frozenHorizonDays: 2,
};

const DEFAULT_ANSWERS = {
  disponibilidad:
    'Tengo unas 4 horas libres reales por dia habil repartidas entre manana temprano y despues del trabajo, mas dos bloques largos el sabado y el domingo.',
  frenos:
    'Si acumulo demasiada exigencia seguida me saturo, y quiero evitar estudiar muy tarde para no cortar el descanso.',
  objetivo:
    'Quiero llegar en unas 20 semanas a un nivel B2 funcional, hablar 20 minutos seguidos en ingles, leer textos cortos sin traducir todo y sostener el vocabulario activo.',
  experiencia:
    'Ya sostuve unas cuantas semanas de estudio con Anki, podcasts y lectura, asi que no quiero volver a un plan de principiante absoluto.',
} as const;

const DOMAIN_CHOICES = {
  '1': 'idiomas',
  '2': 'running',
  '3': 'guitarra',
  '4': 'otro',
} as const;

const DAY_ALIASES = {
  monday: 'monday',
  lunes: 'monday',
  lun: 'monday',
  tuesday: 'tuesday',
  martes: 'tuesday',
  mar: 'tuesday',
  wednesday: 'wednesday',
  miercoles: 'wednesday',
  mier: 'wednesday',
  mie: 'wednesday',
  thursday: 'thursday',
  jueves: 'thursday',
  jue: 'thursday',
  friday: 'friday',
  viernes: 'friday',
  vie: 'friday',
  saturday: 'saturday',
  sabado: 'saturday',
  sab: 'saturday',
  sunday: 'sunday',
  domingo: 'sunday',
  dom: 'sunday',
} as const;

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };
export type InteractiveWeekDay = typeof DAY_ALIASES[keyof typeof DAY_ALIASES];

interface PromptSession {
  readline: Interface | null;
  bufferedAnswers: string[];
  interactive: boolean;
}

export interface InteractiveBlockedSlotInput {
  day: InteractiveWeekDay;
  startTime: string;
  endTime: string;
  reason: string;
}

export interface InteractiveRunnerInput {
  goalText: string;
  goalId: string;
  domainHint: string;
  answers: Record<'disponibilidad' | 'frenos' | 'objetivo' | 'experiencia', string>;
  timezone: string;
  wakeTime: string;
  sleepTime: string;
  worksMondayToFriday: boolean;
  workStartTime: string | null;
  workEndTime: string | null;
  extraBlockedSlots: InteractiveBlockedSlotInput[];
  initialHabitState: HabitState | null;
  previousProgressionKeys: string[];
  slackPolicy: SlackPolicy;
}

function createPrompt(question: string, defaultValue?: string): string {
  return defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function inferDomainHint(goalText: string): string {
  const inferred = slugify(goalText).split('-').filter(Boolean).slice(0, 3).join('-');
  return inferred || 'meta-general';
}

function generateGoalId(goalText: string, domainHint: string): string {
  const goalSlug = slugify(goalText).slice(0, 48) || 'meta';
  const domainSlug = slugify(domainHint) || 'meta';
  return `goal-${domainSlug}-${goalSlug}`.replace(/-+/g, '-');
}

function parseTimeToMinutes(value: string): number {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return Number.NaN;
  }

  return (Number.parseInt(match[1] ?? '0', 10) * 60) + Number.parseInt(match[2] ?? '0', 10);
}

function validateRequiredText(value: string, label: string): ValidationResult<string> {
  const normalized = normalizeText(value);
  if (!normalized) {
    return { ok: false, error: `${label} no puede quedar vacio.` };
  }

  return { ok: true, value: normalized };
}

function validatePositiveInteger(
  value: string,
  label: string,
  minValue = 0,
): ValidationResult<number> {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: `${label} tiene que ser un numero entero.` };
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (parsed < minValue) {
    return { ok: false, error: `${label} tiene que ser mayor o igual a ${minValue}.` };
  }

  return { ok: true, value: parsed };
}

function validateDomainChoice(value: string): ValidationResult<keyof typeof DOMAIN_CHOICES> {
  const choice = value.trim();
  if (choice in DOMAIN_CHOICES) {
    return { ok: true, value: choice as keyof typeof DOMAIN_CHOICES };
  }

  return { ok: false, error: 'Elegi 1, 2, 3 o 4.' };
}

function validateDayName(value: string): ValidationResult<InteractiveWeekDay> {
  const normalized = value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const day = DAY_ALIASES[normalized as keyof typeof DAY_ALIASES];

  if (!day) {
    return { ok: false, error: 'Dia invalido. Usa lunes a domingo.' };
  }

  return { ok: true, value: day };
}

function ensureTimeRange(startTime: string, endTime: string, label: string): ValidationResult<{
  startTime: string;
  endTime: string;
}> {
  if (parseTimeToMinutes(endTime) <= parseTimeToMinutes(startTime)) {
    return {
      ok: false,
      error: `${label}: la hora de fin tiene que ser posterior a la de inicio.`,
    };
  }

  return {
    ok: true,
    value: { startTime, endTime },
  };
}

export function validateTimeFormat(value: string): ValidationResult<string> {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return { ok: false, error: 'Usa formato HH:MM de 24 horas.' };
  }

  const hours = Number.parseInt(match[1] ?? '0', 10);
  const minutes = Number.parseInt(match[2] ?? '0', 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return { ok: false, error: 'La hora tiene que estar entre 00:00 y 23:59.' };
  }

  return {
    ok: true,
    value: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
  };
}

export function validateTimezone(value: string): ValidationResult<string> {
  const timezone = value.trim();
  if (!timezone) {
    return { ok: false, error: 'La zona horaria no puede quedar vacia.' };
  }

  if (!IANAZone.isValidZone(timezone)) {
    return { ok: false, error: 'Zona horaria invalida. Ejemplo valido: America/Argentina/Buenos_Aires.' };
  }

  return { ok: true, value: timezone };
}

export async function ask(
  session: PromptSession,
  question: string,
  defaultValue?: string,
): Promise<string> {
  let normalized = '';

  if (session.interactive && session.readline) {
    const answer = await session.readline.question(createPrompt(question, defaultValue));
    normalized = answer.trim();
  } else {
    stderr.write(createPrompt(question, defaultValue));
    const answer = session.bufferedAnswers.shift() ?? '';
    stderr.write('\n');
    normalized = answer.trim();
  }

  if (!normalized && typeof defaultValue === 'string') {
    return defaultValue;
  }

  return normalized;
}

export async function askYesNo(
  session: PromptSession,
  question: string,
  defaultValue: boolean,
): Promise<boolean> {
  const defaultLabel = defaultValue ? 's' : 'n';

  while (true) {
    const answer = (await ask(session, `${question} (s/n)`, defaultLabel))
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (answer === 's' || answer === 'si' || answer === 'y' || answer === 'yes') {
      return true;
    }

    if (answer === 'n' || answer === 'no') {
      return false;
    }

    console.error('Responde s o n.');
  }
}

export async function askWithValidation<T>(
  session: PromptSession,
  question: string,
  validate: (value: string) => ValidationResult<T>,
  defaultValue?: string,
): Promise<T> {
  while (true) {
    const answer = await ask(session, question, defaultValue);
    const result = validate(answer);
    if (result.ok) {
      return result.value;
    }

    console.error(result.error);
  }
}

async function askTimeRange(
  session: PromptSession,
  startLabel: string,
  endLabel: string,
  defaultStart: string,
  defaultEnd: string,
  rangeLabel: string,
): Promise<{ startTime: string; endTime: string }> {
  while (true) {
    const startTime = await askWithValidation(session, startLabel, validateTimeFormat, defaultStart);
    const endTime = await askWithValidation(session, endLabel, validateTimeFormat, defaultEnd);
    const range = ensureTimeRange(startTime, endTime, rangeLabel);
    if (range.ok) {
      return range.value;
    }

    console.error(range.error);
  }
}

function printTitle(title: string): void {
  console.error(title);
}

async function createPromptSession(): Promise<PromptSession> {
  const interactive = Boolean(stdin.isTTY && stderr.isTTY);
  const readline = createInterface({
    input: stdin,
    output: stderr,
    terminal: interactive,
  });

  if (interactive) {
    return {
      readline,
      bufferedAnswers: [],
      interactive,
    };
  }

  const bufferedAnswers: string[] = [];
  for await (const line of readline) {
    bufferedAnswers.push(line);
  }
  readline.close();

  return {
    readline: null,
    bufferedAnswers,
    interactive,
  };
}

export async function collectInteractiveInput(): Promise<InteractiveRunnerInput> {
  printTitle('=== LAP - Planificador Interactivo ===');
  printTitle('');

  const session = await createPromptSession();

  const handleSigint = () => {
    stderr.write('\n');
    session.readline?.close();
    process.exit(130);
  };

  process.on('SIGINT', handleSigint);

  try {
    printTitle('--- Tu meta ---');
    const goalText = await askWithValidation(
      session,
      'Describi tu meta en una o dos oraciones',
      (value) => validateRequiredText(value, 'La meta'),
    );

    printTitle('Que area describe mejor tu meta?');
    printTitle('  1) idiomas  2) running  3) guitarra  4) otro');
    const domainChoice = await askWithValidation(
      session,
      'Elegi',
      validateDomainChoice,
      DEFAULT_DOMAIN_CHOICE,
    );
    const selectedDomain = DOMAIN_CHOICES[domainChoice];
    const domainHint = selectedDomain === 'otro' ? inferDomainHint(goalText) : selectedDomain;
    const goalId = generateGoalId(goalText, domainHint);

    printTitle('');
    printTitle('--- Sobre vos ---');
    const disponibilidad = await ask(session, 'Cuanto tiempo libre tenes por dia?', DEFAULT_ANSWERS.disponibilidad);
    const frenos = await ask(session, 'Que te frena o te cuesta?', DEFAULT_ANSWERS.frenos);
    const objetivo = await ask(session, 'Objetivo concreto y plazo?', DEFAULT_ANSWERS.objetivo);
    const experiencia = await ask(session, 'Experiencia previa?', DEFAULT_ANSWERS.experiencia);

    printTitle('');
    printTitle('--- Horarios ---');
    const timezone = await askWithValidation(session, 'Zona horaria', validateTimezone, DEFAULT_TIMEZONE);
    const wakeTime = await askWithValidation(session, 'Te levantas a las', validateTimeFormat, DEFAULT_WAKE_TIME);
    let sleepTime = await askWithValidation(session, 'Te acostas a las', validateTimeFormat, DEFAULT_SLEEP_TIME);
    while (parseTimeToMinutes(sleepTime) <= parseTimeToMinutes(wakeTime)) {
      console.error('La hora de dormir tiene que ser posterior a la de despertar.');
      sleepTime = await askWithValidation(session, 'Te acostas a las', validateTimeFormat, DEFAULT_SLEEP_TIME);
    }

    const worksMondayToFriday = await askYesNo(session, 'Trabajas lunes a viernes?', true);
    let workStartTime: string | null = null;
    let workEndTime: string | null = null;
    if (worksMondayToFriday) {
      const workRange = await askTimeRange(
        session,
        'Entrada',
        'Salida',
        DEFAULT_WORK_START,
        DEFAULT_WORK_END,
        'Trabajo',
      );
      workStartTime = workRange.startTime;
      workEndTime = workRange.endTime;
    }

    const extraBlockedSlots: InteractiveBlockedSlotInput[] = [];
    while (await askYesNo(session, 'Otro bloque ocupado?', false)) {
      const reason = normalizeText(await ask(session, 'Motivo', 'Compromiso')) || 'Compromiso';
      const day = await askWithValidation(session, 'Dia (lunes a domingo)', validateDayName);
      const range = await askTimeRange(
        session,
        'Inicio',
        'Fin',
        DEFAULT_WORK_START,
        DEFAULT_WORK_END,
        reason,
      );

      extraBlockedSlots.push({
        day,
        startTime: range.startTime,
        endTime: range.endTime,
        reason,
      });
    }

    printTitle('');
    printTitle('--- Historial ---');
    let initialHabitState: HabitState | null = null;
    let previousProgressionKeys: string[] = [];
    if (await askYesNo(session, 'Ya venis con esta actividad hace un tiempo?', false)) {
      const weeksActive = await askWithValidation(
        session,
        'Semanas activas',
        (value) => validatePositiveInteger(value, 'Semanas activas'),
        String(DEFAULT_HABIT_WEEKS),
      );
      const level = await askWithValidation(
        session,
        'Nivel actual',
        (value) => validatePositiveInteger(value, 'Nivel actual'),
        String(DEFAULT_HABIT_LEVEL),
      );
      const sessionsPerWeek = await askWithValidation(
        session,
        'Sesiones por semana',
        (value) => validatePositiveInteger(value, 'Sesiones por semana'),
        String(DEFAULT_HABIT_SESSIONS),
      );
      const minimumMinutes = await askWithValidation(
        session,
        'Minutos minimos por sesion',
        (value) => validatePositiveInteger(value, 'Minutos minimos por sesion', 1),
        String(DEFAULT_HABIT_MINUTES),
      );

      initialHabitState = {
        progressionKey: domainHint,
        weeksActive,
        level,
        currentDose: {
          sessionsPerWeek,
          minimumViable: {
            minutes: minimumMinutes,
            description: DEFAULT_MINIMUM_VIABLE_DESCRIPTION,
          },
        },
        protectedFromReset: weeksActive >= 2,
      };
      previousProgressionKeys = [domainHint];
    }

    printTitle('');
    printTitle('--- Holgura ---');
    let slackPolicy = DEFAULT_SLACK_POLICY;
    if (await askYesNo(session, 'Personalizar holgura?', false)) {
      const weeklyTimeBufferMin = await askWithValidation(
        session,
        'Buffer semanal en minutos',
        (value) => validatePositiveInteger(value, 'Buffer semanal en minutos'),
        String(DEFAULT_SLACK_POLICY.weeklyTimeBufferMin),
      );
      const maxChurnMovesPerWeek = await askWithValidation(
        session,
        'Maximo de movimientos por semana',
        (value) => validatePositiveInteger(value, 'Maximo de movimientos por semana'),
        String(DEFAULT_SLACK_POLICY.maxChurnMovesPerWeek),
      );
      const frozenHorizonDays = await askWithValidation(
        session,
        'Dias congelados',
        (value) => validatePositiveInteger(value, 'Dias congelados'),
        String(DEFAULT_SLACK_POLICY.frozenHorizonDays),
      );

      slackPolicy = {
        weeklyTimeBufferMin,
        maxChurnMovesPerWeek,
        frozenHorizonDays,
      };
    }

    printTitle('');
    printTitle('Listo! Arrancando pipeline...');
    printTitle('');

    return {
      goalText,
      goalId,
      domainHint,
      answers: {
        disponibilidad,
        frenos,
        objetivo,
        experiencia,
      },
      timezone,
      wakeTime,
      sleepTime,
      worksMondayToFriday,
      workStartTime,
      workEndTime,
      extraBlockedSlots,
      initialHabitState,
      previousProgressionKeys,
      slackPolicy,
    };
  } finally {
    process.removeListener('SIGINT', handleSigint);
    session.readline?.close();
  }
}
