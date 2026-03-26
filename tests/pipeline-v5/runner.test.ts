import { describe, expect, it } from 'vitest';

import type { TimeEventItem } from '../../src/lib/domain/plan-item';
import { FlowRunnerV5, type FlowRunnerV5Context } from '../../src/lib/pipeline/v5/runner';
import type { UserProfileV5 } from '../../src/lib/pipeline/v5/phase-io-v5';
import type { AgentRuntime, LLMMessage, LLMResponse } from '../../src/lib/runtime/types';
import type { ActivityRequest, AvailabilityWindow, SchedulerInput, SchedulerOutput } from '../../src/lib/scheduler/types';

const WEEK_START = '2026-03-30T00:00:00Z';
const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

type RuntimeOverrides = {
  requirements?: (prompt: string) => unknown;
  profile?: (prompt: string) => unknown;
  strategy?: (prompt: string) => unknown;
  cove?: (prompt: string) => unknown;
  repair?: (prompt: string) => unknown;
};

const DEFAULT_PROFILE: UserProfileV5 = {
  freeHoursWeekday: 3,
  freeHoursWeekend: 5,
  energyLevel: 'medium',
  fixedCommitments: ['Trabajo de 9 a 18'],
  scheduleConstraints: ['Evitar trasnochar'],
};

function jsonResponse(content: unknown): LLMResponse {
  return {
    content: JSON.stringify(content),
    usage: { promptTokens: 10, completionTokens: 10 },
  };
}

function defaultStrategy(prompt: string) {
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes('guitarra') || lowerPrompt.includes('skill_acquisition')) {
    return {
      phases: [
        { name: 'Fundamentos', durationWeeks: 3, focus_esAR: 'Postura, ritmo y primeros acordes.' },
        { name: 'Repertorio', durationWeeks: 3, focus_esAR: 'Combinar tecnica con canciones completas.' },
      ],
      milestones: ['Tocar una cancion simple completa', 'Sostener una practica semanal estable'],
    };
  }

  return {
    phases: [
      { name: 'Base semanal', durationWeeks: 2, focus_esAR: 'Instalar una rutina simple y sostenible.' },
    ],
    milestones: ['Completar la primera semana sin cortar la racha'],
  };
}

function createRuntime(overrides: RuntimeOverrides = {}): AgentRuntime {
  async function chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const prompt = messages[messages.length - 1]?.content ?? '';

    if (prompt.includes('array "questions"')) {
      return jsonResponse(
        overrides.requirements?.(prompt) ?? {
          questions: [
            'Cuantas horas reales le podes dedicar por semana?',
            'Que franja te queda mas comoda para sostenerlo?',
            'Que te freno las veces anteriores?',
          ],
        },
      );
    }

    if (prompt.includes('"freeHoursWeekday"')) {
      return jsonResponse(overrides.profile?.(prompt) ?? DEFAULT_PROFILE);
    }

    if (prompt.includes('Chain-of-Verification')) {
      return jsonResponse(
        overrides.cove?.(prompt) ?? {
          findings: [
            {
              question: 'El plan tiene una base razonable?',
              answer: 'Si, el calendario queda consistente.',
              severity: 'INFO',
            },
          ],
        },
      );
    }

    if (prompt.includes('Repair Manager')) {
      return jsonResponse(overrides.repair?.(prompt) ?? { op: null });
    }

    return jsonResponse(overrides.strategy?.(prompt) ?? defaultStrategy(prompt));
  }

  return {
    chat,
    async *stream() {
      yield '';
    },
    newContext() {
      return createRuntime(overrides);
    },
  };
}

function makeAvailability(startTime = '06:00', endTime = '22:00'): AvailabilityWindow[] {
  return WEEK_DAYS.map((day) => ({ day, startTime, endTime }));
}

function makeConfig(
  text: string,
  runtimeOverrides: RuntimeOverrides = {},
  extra: Partial<ConstructorParameters<typeof FlowRunnerV5>[0]> = {},
): ConstructorParameters<typeof FlowRunnerV5>[0] {
  return {
    runtime: createRuntime(runtimeOverrides),
    text,
    answers: {
      disponibilidad: 'Entre semana tengo dos o tres horas y el finde un poco mas.',
    },
    availability: makeAvailability(),
    weekStartDate: WEEK_START,
    goalId: 'goal-v5-test',
    ...extra,
  };
}

function makeActivity(overrides: Partial<ActivityRequest> & Pick<ActivityRequest, 'id' | 'label'>): ActivityRequest {
  return {
    equivalenceGroupId: `group-${overrides.id}`,
    durationMin: 60,
    frequencyPerWeek: 1,
    goalId: 'goal-v5-test',
    constraintTier: 'soft_strong',
    ...overrides,
  };
}

function makeEvent(activity: ActivityRequest, startAt: string, durationMin = activity.durationMin): TimeEventItem {
  const createdAt = '2026-03-30T00:00:00.000Z';

  return {
    id: `${activity.id}_${startAt.replace(/[:.-]/g, '')}`,
    kind: 'time_event',
    title: activity.label,
    status: 'active',
    goalIds: [activity.goalId],
    startAt,
    durationMin,
    rigidity: activity.constraintTier === 'hard' ? 'hard' : 'soft',
    createdAt,
    updatedAt: createdAt,
  };
}

function makeSchedule(events: TimeEventItem[]): SchedulerOutput {
  return {
    events,
    unscheduled: [],
    tradeoffs: [],
    metrics: {
      fillRate: 1,
      solverTimeMs: 1,
      solverStatus: 'optimal',
    },
  };
}

function makeScheduleInput(
  activities: ActivityRequest[],
  availability: AvailabilityWindow[] = makeAvailability(),
): SchedulerInput {
  return {
    activities,
    availability,
    blocked: [],
    preferences: [],
    weekStartDate: WEEK_START,
  };
}

describe('FlowRunnerV5', () => {
  it('happy path simple: correr 3 veces por semana produce 3 time events con scheduler real', async () => {
    const runner = new FlowRunnerV5(makeConfig('correr 3 veces por semana', {}, { goalId: 'goal-running' }));

    const context = await runner.runFullPipeline();
    const timeEvents = context.package?.plan.operational.scheduledEvents ?? [];

    expect(context.classification?.goalType).toBe('RECURRENT_HABIT');
    expect(context.template?.activities).toHaveLength(1);
    expect(context.template?.activities[0]?.equivalenceGroupId).toBe('cardio-outdoor-base');
    expect(context.template?.activities[0]?.frequencyPerWeek).toBe(3);
    expect(context.schedule?.events).toHaveLength(3);
    expect(context.schedule?.unscheduled).toHaveLength(0);
    expect(timeEvents).toHaveLength(3);
    expect(context.package?.plan.detail.weeks).toHaveLength(2);
  });

  it('happy path complejo: aprender guitarra arma un plan con progresion y sesiones', async () => {
    const runner = new FlowRunnerV5(makeConfig('aprender guitarra', {}, { goalId: 'goal-guitar' }));

    const context = await runner.runFullPipeline();
    const timeEvents = context.package?.plan.operational.scheduledEvents ?? [];
    const milestones = context.package?.plan.skeleton.milestones ?? [];

    expect(context.classification?.goalType).toBe('SKILL_ACQUISITION');
    expect(context.template?.activities.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(timeEvents.length).toBeGreaterThanOrEqual(10);
    expect(context.phaseIO.strategy?.output.phases.length).toBeGreaterThanOrEqual(2);
    expect(milestones.length).toBeGreaterThanOrEqual(1);
    expect(context.package?.summary_esAR).toContain('aprender guitarra');
    expect(context.package?.habitStates[0]?.progressionKey).toBe('guitarra');
  });

  it('escenario multi objetivo: valida un plan combinado inyectando una plantilla mixta', async () => {
    const activities: ActivityRequest[] = [
      makeActivity({ id: 'run', label: 'Running suave', durationMin: 40, frequencyPerWeek: 1 }),
      makeActivity({ id: 'guitar', label: 'Practica de guitarra', durationMin: 30, frequencyPerWeek: 1 }),
      makeActivity({ id: 'save', label: 'Revision semanal de ahorro', durationMin: 20, frequencyPerWeek: 1 }),
    ];

    const runner = new FlowRunnerV5(
      makeConfig('correr + guitarra + ahorrar', {}, { goalId: 'goal-combined' }),
      {
        template: { activities },
        strategy: {
          phases: [{ name: 'Semana integrada', durationWeeks: 1, focus_esAR: 'Repartir foco entre habito, skill y finanzas.' }],
          milestones: ['Sostener las tres frentes en la misma semana'],
        },
      },
    );

    await runner.executePhase('schedule');
    await runner.executePhase('package');

    const context = runner.getContext();
    const scheduledTitles = context.schedule?.events.map((event) => event.title) ?? [];

    expect(scheduledTitles).toEqual(
      expect.arrayContaining(['Running suave', 'Practica de guitarra', 'Revision semanal de ahorro']),
    );
    expect(context.package?.plan.operational.scheduledEvents).toHaveLength(3);
    expect(context.package?.summary_esAR).toContain('correr + guitarra + ahorrar');
  });

  it('repair loop: corrige un overlap inyectado en una sola reparacion', async () => {
    const availability = [
      { day: 'monday', startTime: '18:00', endTime: '20:00' },
      { day: 'wednesday', startTime: '18:00', endTime: '20:00' },
    ] satisfies AvailabilityWindow[];
    const activityA = makeActivity({ id: 'focus-a', label: 'Bloque A', constraintTier: 'hard' });
    const activityB = makeActivity({ id: 'focus-b', label: 'Bloque B', constraintTier: 'hard' });
    const schedule = makeSchedule([
      makeEvent(activityA, '2026-03-30T18:00:00.000Z'),
      makeEvent(activityB, '2026-03-30T18:00:00.000Z'),
    ]);

    const runner = new FlowRunnerV5(
      makeConfig('resolver overlap', {
        repair: () => ({
          op: {
            type: 'MOVE',
            targetId: schedule.events[1].id,
            newStartAt: '2026-04-01T18:00:00.000Z',
          },
        }),
      }, { availability }),
      {
        schedule,
        scheduleInput: makeScheduleInput([activityA, activityB], availability),
        profile: DEFAULT_PROFILE,
      },
    );

    await runner.executePhase('hardValidate');
    await runner.executePhase('coveVerify');
    await runner.executePhase('repair');
    await runner.executePhase('hardValidate');

    const context = runner.getContext();

    expect(context.repair?.iterations).toBeLessThanOrEqual(3);
    expect(context.repair?.patchesApplied).toEqual([{ type: 'MOVE', targetId: schedule.events[1].id }]);
    expect(context.schedule?.events[1]?.startAt).toBe('2026-04-01T18:00:00.000Z');
    expect(context.hardValidate?.findings).toHaveLength(0);
  });

  it('CoVe detecta falta de descanso y repair lo corrige', async () => {
    const activity = makeActivity({
      id: 'run-daily',
      label: 'Running diario',
      durationMin: 45,
      frequencyPerWeek: 7,
      constraintTier: 'soft_strong',
    });
    const eventDates = [
      '2026-03-30T07:00:00.000Z',
      '2026-03-31T07:00:00.000Z',
      '2026-04-01T07:00:00.000Z',
      '2026-04-02T07:00:00.000Z',
      '2026-04-03T07:00:00.000Z',
      '2026-04-04T07:00:00.000Z',
      '2026-04-05T07:00:00.000Z',
    ];
    const events = eventDates.map((date) => makeEvent(activity, date));
    const sundayEventId = events[6].id;

    const runner = new FlowRunnerV5(
      makeConfig('chequear descanso', {
        cove: (prompt) => {
          const eventCount = prompt.match(/- ID:/g)?.length ?? 0;
          if (eventCount >= 7) {
            return {
              findings: [
                {
                  question: 'Hay al menos un dia libre?',
                  answer: 'No, la agenda ocupa los 7 dias de la semana.',
                  severity: 'FAIL',
                },
              ],
            };
          }

          return {
            findings: [
              {
                question: 'Hay al menos un dia libre?',
                answer: 'Si, quedo al menos un dia completo para recuperar.',
                severity: 'INFO',
              },
            ],
          };
        },
        repair: () => ({
          op: {
            type: 'DROP',
            targetId: sundayEventId,
          },
        }),
      }),
      {
        schedule: makeSchedule(events),
        scheduleInput: makeScheduleInput([activity]),
        profile: DEFAULT_PROFILE,
      },
    );

    await runner.executePhase('softValidate');
    const firstSoft = runner.getContext().softValidate;
    await runner.executePhase('coveVerify');
    const firstCove = runner.getContext().coveVerify;
    await runner.executePhase('repair');
    await runner.executePhase('softValidate');
    await runner.executePhase('coveVerify');

    const context = runner.getContext();

    expect(firstSoft?.findings.some((finding) => finding.code === 'SV-NO-REST')).toBe(true);
    expect(firstCove?.findings.some((finding) => finding.severity === 'FAIL')).toBe(true);
    expect(context.repair?.patchesApplied).toEqual([{ type: 'DROP', targetId: sundayEventId }]);
    expect(context.schedule?.events).toHaveLength(6);
    expect(context.softValidate?.findings.some((finding) => finding.code === 'SV-NO-REST')).toBe(false);
    expect(context.coveVerify?.findings.some((finding) => finding.severity === 'FAIL')).toBe(false);
  });

  it('recupera HabitState previo y lo pasa a Strategy antes de empaquetar', async () => {
    let capturedPrompt = '';
    const loadCalls: string[][] = [];
    const saveCalls: string[][] = [];
    const store = {
      async loadByProgressionKeys(progressionKeys: string[]) {
        loadCalls.push(progressionKeys);
        return [
          {
            progressionKey: 'running',
            weeksActive: 4,
            level: 2,
            currentDose: {
              sessionsPerWeek: 3,
              minimumViable: {
                minutes: 15,
                description: 'Trote corto',
              },
            },
            protectedFromReset: true,
          },
        ];
      },
      async save(states: Array<{ progressionKey: string }>) {
        saveCalls.push(states.map((state) => state.progressionKey));
      },
    };

    const runner = new FlowRunnerV5(
      makeConfig(
        'correr 3 veces por semana',
        {
          strategy: (prompt) => {
            capturedPrompt = prompt;
            return {
              phases: [
                { name: 'Consolidacion', durationWeeks: 2, focus_esAR: 'Mantener una rutina ya instalada.' },
              ],
              milestones: ['Sostener una semana completa sin reiniciar'],
            };
          },
        },
        {
          goalId: 'goal-running',
          habitStateStore: store,
          previousProgressionKeys: ['running'],
        },
      ),
    );

    const context = await runner.runFullPipeline();

    expect(loadCalls).toEqual([['running']]);
    expect(context.phaseIO.strategy?.input.habitStates).toEqual([
      expect.objectContaining({
        progressionKey: 'running',
        weeksActive: 4,
        level: 2,
      }),
    ]);
    expect(capturedPrompt).toContain('weeksActive=4');
    expect(capturedPrompt).toContain('evita una fase de "introduccion"');
    expect(context.package?.habitStates[0]).toEqual(
      expect.objectContaining({
        progressionKey: 'running',
        weeksActive: 4,
        level: 2,
      }),
    );
    expect(saveCalls).toEqual([['running']]);
  });

  it('package wiring: genera el plan de 3 capas, summary y qualityScore desde el runner', async () => {
    const activity = makeActivity({ id: 'portfolio', label: 'Bloque de portfolio', durationMin: 60 });
    const runner = new FlowRunnerV5(
      makeConfig('terminar portfolio', {}, { goalId: 'goal-portfolio' }),
      {
        schedule: makeSchedule([makeEvent(activity, '2026-03-30T18:00:00.000Z')]),
        classification: {
          goalType: 'FINITE_PROJECT',
          confidence: 0.8,
          risk: 'LOW',
          extractedSignals: {
            isRecurring: false,
            hasDeliverable: true,
            hasNumericTarget: false,
            requiresSkillProgression: false,
            dependsOnThirdParties: false,
            isOpenEnded: false,
            isRelational: false,
          },
        },
        strategy: {
          phases: [{ name: 'Entrega', durationWeeks: 1, focus_esAR: 'Cerrar la version presentable.' }],
          milestones: ['Publicar una version estable'],
        },
      } satisfies Partial<FlowRunnerV5Context>,
    );

    await runner.executePhase('package');

    const pkg = runner.getContext().package;

    expect(pkg?.items.length).toBeGreaterThanOrEqual(4);
    expect(pkg?.plan.skeleton.horizonWeeks).toBe(12);
    expect(pkg?.plan.detail.horizonWeeks).toBe(2);
    expect(pkg?.plan.operational.horizonDays).toBe(7);
    expect(pkg?.summary_esAR).toContain('terminar portfolio');
    expect(pkg?.qualityScore).toBeGreaterThan(0);
    expect(pkg?.implementationIntentions.length).toBeGreaterThan(0);
    expect(pkg?.habitStates).toEqual([]);
  });

  it('adaptive wiring: cuando la adherencia cae emite PARTIAL_REPAIR con MVH para relanzar la semana', async () => {
    const runner = new FlowRunnerV5(
      makeConfig('correr 3 veces por semana', {}, {
        goalId: 'goal-running',
        activityLogs: [
          { occurredAt: '2026-03-30T07:00:00.000Z', plannedMinutes: 40, completedMinutes: 40, outcome: 'SUCCESS' },
          { occurredAt: '2026-03-31T07:00:00.000Z', plannedMinutes: 40, completedMinutes: 40, outcome: 'SUCCESS' },
          { occurredAt: '2026-04-01T07:00:00.000Z', plannedMinutes: 40, completedMinutes: 40, outcome: 'SUCCESS' },
          { occurredAt: '2026-04-02T07:00:00.000Z', plannedMinutes: 40, completedMinutes: 40, outcome: 'SUCCESS' },
          { occurredAt: '2026-04-03T07:00:00.000Z', plannedMinutes: 40, completedMinutes: 40, outcome: 'SUCCESS' },
          { occurredAt: '2026-04-04T07:00:00.000Z', plannedMinutes: 40, completedMinutes: 0, outcome: 'MISSED' },
          { occurredAt: '2026-04-05T07:00:00.000Z', plannedMinutes: 40, completedMinutes: 0, outcome: 'MISSED' },
          { occurredAt: '2026-04-06T07:00:00.000Z', plannedMinutes: 40, completedMinutes: 0, outcome: 'MISSED' },
        ],
      }),
    );

    const context = await runner.runFullPipeline();
    const minimumViableMinutes = context.package?.habitStates[0]?.currentDose.minimumViable.minutes;

    expect(context.adapt?.mode).toBe('PARTIAL_REPAIR');
    expect(context.adapt?.dispatch.rerunFromPhase).toBe('schedule');
    expect(context.adapt?.dispatch.phasesToRun).toEqual(
      expect.arrayContaining(['schedule', 'hardValidate', 'softValidate', 'coveVerify', 'repair', 'package']),
    );
    expect(context.adapt?.dispatch.activityAdjustments[0]).toEqual(
      expect.objectContaining({
        suggestedDurationMin: minimumViableMinutes,
        minimumViableMinutes,
        relaxConstraintTierTo: 'soft_weak',
        countsMinimumViableAsSuccess: true,
      }),
    );
    expect(context.phaseIO.adapt?.output.mode).toBe('PARTIAL_REPAIR');
  });

  it('emite PhaseIO para cada fase sincronica relevante cuando el repair loop corre una vez', async () => {
    let coveCalls = 0;
    const runner = new FlowRunnerV5(
      makeConfig('aprender guitarra', {
        cove: () => {
          coveCalls += 1;
          if (coveCalls === 1) {
            return {
              findings: [
                {
                  question: 'Conviene revisar una sesion?',
                  answer: 'Hay una observacion pendiente para re-chequear.',
                  severity: 'FAIL',
                },
              ],
            };
          }

          return {
            findings: [
              {
                question: 'Conviene revisar una sesion?',
                answer: 'Quedo consistente despues del loop.',
                severity: 'INFO',
              },
            ],
          };
        },
      }),
    );

    const context = await runner.runFullPipeline();
    const phaseKeys = Object.keys(context.phaseIO);

    expect(phaseKeys.length).toBeGreaterThanOrEqual(11);
    expect(phaseKeys).toEqual(
      expect.arrayContaining([
        'classify',
        'requirements',
        'profile',
        'strategy',
        'template',
        'schedule',
        'hardValidate',
        'softValidate',
        'coveVerify',
        'repair',
        'package',
      ]),
    );
    expect(context.phaseIO.adapt).toBeUndefined();
  });
});
