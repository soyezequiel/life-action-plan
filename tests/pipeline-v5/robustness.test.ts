import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

import { preferEquivalenceSwaps, transferHabitStateForEquivalentSwap } from '../../src/lib/domain/equivalence';
import type { HabitState, HabitStateStore } from '../../src/lib/domain/habit-state';
import { validateReplanAgainstSlackPolicy } from '../../src/lib/domain/slack-policy';
import type { TimeEventItem } from '../../src/lib/domain/plan-item';
import { executeHardValidator } from '../../src/lib/pipeline/v5/hard-validator';
import type { UserProfileV5 } from '../../src/lib/pipeline/v5/phase-io-v5';
import { FlowRunnerV5 } from '../../src/lib/pipeline/v5/runner';
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
  if (prompt.toLowerCase().includes('running')) {
    return {
      phases: [
        { name: 'Base estable', durationWeeks: 3, focus_esAR: 'Sostener frecuencia sin cortar la racha.' },
        { name: 'Consolidacion', durationWeeks: 3, focus_esAR: 'Subir confianza sin tocar de mas la carga.' },
      ],
      milestones: ['Completar dos semanas consistentes', 'Llegar al finde con energia'],
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
    goalId: 'goal-v5-robustness',
    ...extra,
  };
}

function makeActivity(overrides: Partial<ActivityRequest> & Pick<ActivityRequest, 'id' | 'label'>): ActivityRequest {
  return {
    equivalenceGroupId: `group-${overrides.id}`,
    durationMin: 40,
    frequencyPerWeek: 3,
    goalId: 'goal-v5-robustness',
    constraintTier: 'hard',
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

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class InMemoryHabitStateStore implements HabitStateStore {
  states: HabitState[];
  loadCalls: string[][] = [];
  saveCalls: HabitState[][] = [];

  constructor(states: HabitState[]) {
    this.states = cloneValue(states);
  }

  async loadByProgressionKeys(progressionKeys: string[]): Promise<HabitState[]> {
    this.loadCalls.push([...progressionKeys]);
    return cloneValue(this.states.filter((state) => progressionKeys.includes(state.progressionKey)));
  }

  async save(states: HabitState[]): Promise<void> {
    const cloned = cloneValue(states);
    this.saveCalls.push(cloned);
    this.states = cloned;
  }
}

describe('pipeline v5 robustness', () => {
  it('mantiene la proyeccion de 3 capas: skeleton a 12 semanas y detalle concreto a 2 semanas', async () => {
    const runner = new FlowRunnerV5(makeConfig('correr 3 veces por semana', {}, { goalId: 'goal-running' }));

    const context = await runner.runFullPipeline();
    const plan = context.package?.plan;

    expect(plan).toBeDefined();
    expect(plan?.skeleton.horizonWeeks).toBe(12);
    expect(plan?.skeleton.phases.at(-1)?.endWeek).toBe(12);
    expect(plan?.detail.horizonWeeks).toBe(2);
    expect(plan?.detail.weeks).toHaveLength(2);
    expect(plan?.detail.scheduledEvents).toHaveLength((plan?.operational.scheduledEvents.length ?? 0) * 2);
    expect(plan?.operational.horizonDays).toBe(7);
    expect(plan?.detail.weeks[0]?.scheduledEvents).toEqual(plan?.operational.scheduledEvents);

    const weekOne = plan?.detail.weeks[0]?.scheduledEvents ?? [];
    const weekTwo = plan?.detail.weeks[1]?.scheduledEvents ?? [];

    expect(weekTwo).toHaveLength(weekOne.length);

    weekOne.forEach((event, index) => {
      const shifted = weekTwo[index];

      expect(shifted?.title).toBe(event.title);
      expect(shifted?.durationMin).toBe(event.durationMin);
      expect(
        DateTime.fromISO(shifted?.startAt ?? '', { zone: 'UTC' })
          .diff(DateTime.fromISO(event.startAt, { zone: 'UTC' }), 'days')
          .days,
      ).toBe(7);
    });
  });

  it('respeta la Frozen Zone y bloquea un re-plan que intenta mover un slot de manana', () => {
    const validation = validateReplanAgainstSlackPolicy(
      [
        {
          itemId: 'run-1',
          fromStartAt: '2026-03-31T18:00:00.000Z',
          toStartAt: '2026-04-02T18:00:00.000Z',
          durationMin: 40,
        },
      ],
      {
        weeklyTimeBufferMin: 120,
        maxChurnMovesPerWeek: 3,
        frozenHorizonDays: 2,
      },
      '2026-03-30T09:00:00.000Z',
    );

    expect(validation.ok).toBe(false);
    expect(validation.proposedMoves).toBe(1);
    expect(validation.exceedsMaxChurn).toBe(false);
    expect(validation.frozenViolations).toEqual([
      expect.objectContaining({
        itemId: 'run-1',
        side: 'source',
        moveStartAt: '2026-03-31T18:00:00.000Z',
        frozenWindowStartAt: '2026-03-30T00:00:00.000Z',
        frozenWindowEndAt: '2026-04-01T00:00:00.000Z',
      }),
    ]);
  });

  it('persiste HabitState entre planes y nunca baja el level despues de una semana ejecutada', async () => {
    const capturedStrategyPrompts: string[] = [];
    const store = new InMemoryHabitStateStore([
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
    ]);

    const firstRunner = new FlowRunnerV5(
      makeConfig(
        'correr 3 veces por semana',
        {
          strategy: (prompt) => {
            capturedStrategyPrompts.push(prompt);
            return defaultStrategy(prompt);
          },
        },
        {
          goalId: 'goal-running',
          habitStateStore: store,
          previousProgressionKeys: ['running'],
        },
      ),
    );

    const firstContext = await firstRunner.runFullPipeline();
    const firstState = firstContext.package?.habitStates[0];

    expect(firstState).toEqual(
      expect.objectContaining({
        progressionKey: 'running',
        weeksActive: 4,
        level: 2,
        protectedFromReset: true,
      }),
    );
    expect(capturedStrategyPrompts[0]).toContain('weeksActive=4');
    expect(capturedStrategyPrompts[0]).toContain('level=2');

    store.states = [
      {
        ...cloneValue(firstState as HabitState),
        weeksActive: 5,
        level: 3,
        protectedFromReset: true,
      },
    ];

    const secondRunner = new FlowRunnerV5(
      makeConfig(
        'correr 3 veces por semana',
        {
          strategy: (prompt) => {
            capturedStrategyPrompts.push(prompt);
            return defaultStrategy(prompt);
          },
        },
        {
          goalId: 'goal-running',
          habitStateStore: store,
          previousProgressionKeys: ['running'],
        },
      ),
    );

    const secondContext = await secondRunner.runFullPipeline();
    const secondState = secondContext.package?.habitStates[0];

    expect(secondState).toEqual(
      expect.objectContaining({
        progressionKey: 'running',
        weeksActive: 5,
        level: 3,
        protectedFromReset: true,
      }),
    );
    expect(secondState?.weeksActive).toBeGreaterThanOrEqual(firstState?.weeksActive ?? 0);
    expect(secondState?.level).toBeGreaterThanOrEqual(firstState?.level ?? 0);
    expect(capturedStrategyPrompts[1]).toContain('weeksActive=5');
    expect(capturedStrategyPrompts[1]).toContain('level=3');
    expect(store.loadCalls).toEqual([['running'], ['running']]);
    expect(store.saveCalls[0]?.[0]?.level).toBe(2);
    expect(store.saveCalls[1]?.[0]?.level).toBe(3);
  });

  it('permite swap equivalente de Correr a Bici sin invalidar el plan', async () => {
    const availability = [
      { day: 'monday', startTime: '18:00', endTime: '20:00' },
      { day: 'wednesday', startTime: '18:00', endTime: '20:00' },
      { day: 'friday', startTime: '18:00', endTime: '20:00' },
    ] satisfies AvailabilityWindow[];

    const running = {
      ...makeActivity({
        id: 'run-easy',
        label: 'Correr',
        equivalenceGroupId: 'cardio-outdoor-base',
      }),
      progressionKey: 'running-base',
    };
    const bike = {
      ...makeActivity({
        id: 'bike-easy',
        label: 'Bici',
        equivalenceGroupId: 'cardio-outdoor-base',
      }),
      progressionKey: 'bike-base',
    };

    const swapPlan = preferEquivalenceSwaps([running], [bike]);
    const transferredState = transferHabitStateForEquivalentSwap(
      {
        progressionKey: 'running-base',
        weeksActive: 6,
        level: 3,
        currentDose: {
          sessionsPerWeek: 3,
          minimumViable: {
            minutes: 20,
            description: 'Trote corto',
          },
        },
        protectedFromReset: true,
      },
      running,
      bike,
    );

    const bikeSchedule = makeSchedule([
      makeEvent(bike, '2026-03-30T18:00:00.000Z'),
      makeEvent(bike, '2026-04-01T18:00:00.000Z'),
      makeEvent(bike, '2026-04-03T18:00:00.000Z'),
    ]);

    const validation = await executeHardValidator({
      schedule: bikeSchedule,
      originalInput: makeScheduleInput([bike], availability),
    });

    expect(swapPlan.swaps).toEqual([
      expect.objectContaining({
        previousActivityId: 'run-easy',
        nextActivityId: 'bike-easy',
        equivalenceGroupId: 'cardio-outdoor-base',
        preservesDuration: true,
        preservesFrequency: true,
      }),
    ]);
    expect(transferredState).toEqual(
      expect.objectContaining({
        progressionKey: 'bike-base',
        weeksActive: 6,
        level: 3,
        protectedFromReset: true,
      }),
    );
    expect(validation.findings).toEqual([]);
  });
});
