import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

import { FlowRunnerV5 } from '../src/lib/pipeline/v5/runner';
import type { UserProfileV5 } from '../src/lib/pipeline/v5/phase-io-v5';
import type { AgentRuntime, LLMMessage, LLMResponse } from '../src/lib/runtime/types';
import type { HabitState, HabitStateStore } from '../src/lib/domain/habit-state';
import type { AvailabilityWindow } from '../src/lib/scheduler/types';

const OUTPUT_FILE = resolve(process.cwd(), 'tmp/pipeline-v5-example.json');
const TIMEZONE = 'America/Argentina/Buenos_Aires';
const WEEK_START = '2026-03-30T03:00:00Z';
const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const PROFILE: UserProfileV5 = {
  freeHoursWeekday: 3,
  freeHoursWeekend: 6,
  energyLevel: 'medium',
  fixedCommitments: ['Trabajo lunes a viernes de 9 a 18'],
  scheduleConstraints: ['Evitar practicar muy tarde'],
};

const PREVIOUS_HABIT_STATE: HabitState = {
  progressionKey: 'guitarra',
  weeksActive: 6,
  level: 2,
  currentDose: {
    sessionsPerWeek: 4,
    minimumViable: {
      minutes: 10,
      description: 'Tocar aunque sea una rueda de acordes',
    },
  },
  protectedFromReset: true,
};

function jsonResponse(content: unknown): LLMResponse {
  return {
    content: JSON.stringify(content),
    usage: { promptTokens: 10, completionTokens: 10 },
  };
}

function createRuntime(): AgentRuntime {
  async function chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const prompt = messages[messages.length - 1]?.content ?? '';

    if (prompt.includes('array "questions"')) {
      return jsonResponse({
        questions: [
          '¿Qué momento del día te resulta más realista para practicar?',
          '¿Qué venías sosteniendo estas últimas semanas?',
          '¿Qué te corta más fácil la continuidad?',
        ],
      });
    }

    if (prompt.includes('"freeHoursWeekday"')) {
      return jsonResponse(PROFILE);
    }

    if (prompt.includes('Chain-of-Verification')) {
      return jsonResponse({
        findings: [
          {
            question: '¿Hay distribución razonable de sesiones?',
            answer: 'Sí, la práctica quedó repartida a lo largo de la semana.',
            severity: 'INFO',
          },
          {
            question: '¿Existe margen para absorber imprevistos?',
            answer: 'Sí, el plan operacional reserva buffers explícitos de slack.',
            severity: 'INFO',
          },
        ],
      });
    }

    if (prompt.includes('Estado actual del habito')) {
      return jsonResponse({
        phases: [
          { name: 'Consolidación', durationWeeks: 4, focus_esAR: 'Sostener una práctica ya instalada sin volver a cero.' },
          { name: 'Repertorio útil', durationWeeks: 4, focus_esAR: 'Convertir técnica en canciones y fluidez real.' },
          { name: 'Siguiente escalón', durationWeeks: 4, focus_esAR: 'Subir dificultad con una base ya protegida.' },
        ],
        milestones: [
          'Sostener 3 semanas seguidas sin perder continuidad',
          'Tocar una canción completa con cambios limpios',
          'Cerrar una rutina propia de práctica',
        ],
      });
    }

    return jsonResponse({
      phases: [
        { name: 'Fundamentos', durationWeeks: 4, focus_esAR: 'Instalar una rutina básica.' },
        { name: 'Desarrollo', durationWeeks: 4, focus_esAR: 'Subir dificultad de forma gradual.' },
      ],
      milestones: ['Completar el primer mes'],
    });
  }

  return {
    chat,
    async *stream() {
      yield '';
    },
    newContext() {
      return createRuntime();
    },
  };
}

function makeAvailability(startTime = '07:00', endTime = '22:00'): AvailabilityWindow[] {
  return WEEK_DAYS.map((day) => ({ day, startTime, endTime }));
}

function createHabitStateStore(): HabitStateStore {
  let savedStates: HabitState[] = [];

  return {
    async loadByProgressionKeys(progressionKeys: string[]) {
      console.error(`[V5 Example] HabitState.loadByProgressionKeys -> ${progressionKeys.join(', ') || '(none)'}`);
      return progressionKeys.includes(PREVIOUS_HABIT_STATE.progressionKey) ? [PREVIOUS_HABIT_STATE] : [];
    },
    async save(states: HabitState[]) {
      savedStates = states;
      console.error(`[V5 Example] HabitState.save -> ${states.map((state) => state.progressionKey).join(', ') || '(none)'}`);
    },
  };
}

async function run(): Promise<void> {
  const runner = new FlowRunnerV5({
    runtime: createRuntime(),
    text: 'aprender guitarra',
    answers: {
      disponibilidad: 'Puedo practicar de lunes a viernes a la tarde y algo más largo el sábado.',
      frenos: 'Si llego cansado, me cuesta arrancar.',
      objetivo: 'Quiero consolidar la práctica y tocar canciones completas.',
    },
    timezone: TIMEZONE,
    availability: makeAvailability(),
    weekStartDate: WEEK_START,
    goalId: 'goal-guitar-v5-example',
    slackPolicy: {
      weeklyTimeBufferMin: 150,
      maxChurnMovesPerWeek: 3,
      frozenHorizonDays: 2,
    },
    habitStateStore: createHabitStateStore(),
  });

  const context = await runner.runFullPipeline({
    onPhaseStart: (phase) => {
      console.error(`[V5 Example] -> ${phase}`);
    },
    onPhaseSkipped: (phase) => {
      console.error(`[V5 Example] skipped: ${phase}`);
    },
    onRepairAttempt: (attempt, maxAttempts, findings) => {
      console.error(`[V5 Example] repair ${attempt}/${maxAttempts} with ${findings.length} findings`);
    },
  });

  if (!context.package) {
    throw new Error('V5 example finished without package output');
  }

  mkdirSync(resolve(process.cwd(), 'tmp'), { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(context.package, null, 2), 'utf8');

  const skeletonPhases = context.package.plan.skeleton.phases.map((phase) => ({
    title: phase.title,
    weeks: `${phase.startWeek}-${phase.endWeek}`,
    objectives: phase.objectives,
    milestoneIds: phase.milestoneIds ?? [],
  }));
  const detailWeeks = context.package.plan.detail.weeks.map((week) => ({
    weekIndex: week.weekIndex,
    startDate: week.startDate,
    endDate: week.endDate,
    scheduledEvents: week.scheduledEvents.length,
  }));
  const operationalDays = context.package.plan.operational.days.map((day) => ({
    date: day.date,
    scheduledEvents: day.scheduledEvents.length,
    buffers: day.buffers.map((buffer) => ({
      startAt: buffer.startAt,
      durationMin: buffer.durationMin,
      kind: buffer.kind,
    })),
  }));

  const result = {
    classification: context.classification,
    strategy: context.strategy,
    summary: {
      summary_esAR: context.package.summary_esAR,
      qualityScore: context.package.qualityScore,
      warnings: context.package.warnings,
      implementationIntentions: context.package.implementationIntentions,
    },
    habitStates: context.package.habitStates,
    slackPolicy: context.package.slackPolicy,
    rollingWave: {
      skeleton: {
        horizonWeeks: context.package.plan.skeleton.horizonWeeks,
        phases: skeletonPhases,
        milestones: context.package.plan.skeleton.milestones.map((milestone) => ({
          title: milestone.title,
          dueDate: milestone.dueDate,
        })),
      },
      detail: {
        horizonWeeks: context.package.plan.detail.horizonWeeks,
        weeks: detailWeeks,
      },
      operational: {
        horizonDays: context.package.plan.operational.horizonDays,
        totalBufferMin: context.package.plan.operational.totalBufferMin,
        days: operationalDays,
      },
    },
    outputFile: OUTPUT_FILE,
  };

  console.log('\n--- V5 PIPELINE RESULT START ---');
  console.log(JSON.stringify(result, null, 2));
  console.log('--- V5 PIPELINE RESULT END ---\n');

  console.error('[V5 Example] Resumen');
  console.error(`  summary: ${context.package.summary_esAR}`);
  console.error(`  qualityScore: ${context.package.qualityScore}`);
  console.error(`  skeleton phases: ${context.package.plan.skeleton.phases.length}`);
  console.error(`  detail weeks: ${context.package.plan.detail.weeks.length}`);
  console.error(`  operational buffers: ${context.package.plan.operational.buffers.length}`);
  console.error(`  habitStates: ${context.package.habitStates.length}`);
  console.error(`  output file: ${OUTPUT_FILE}`);
}

run().catch((error) => {
  console.error('[V5 Example] Runtime error:', error);
  process.exit(1);
});
