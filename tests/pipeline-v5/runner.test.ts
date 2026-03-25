import { describe, expect, it, beforeEach, vi } from 'vitest';

import type { AgentRuntime, LLMMessage, LLMResponse } from '../../src/lib/runtime/types';
import type { ActivityRequest, SchedulerInput, SchedulerOutput } from '../../src/lib/scheduler/types';

const mockedModules = vi.hoisted(() => ({
  solveScheduleMock: vi.fn<(_: SchedulerInput) => Promise<SchedulerOutput>>(),
  executeCoVeVerifierMock: vi.fn(),
  executeRepairManagerMock: vi.fn(),
}));

vi.mock('../../src/lib/scheduler/solver', () => ({
  solveSchedule: mockedModules.solveScheduleMock,
}));

vi.mock('../../src/lib/pipeline/v5/cove-verifier', () => ({
  executeCoVeVerifier: mockedModules.executeCoVeVerifierMock,
}));

vi.mock('../../src/lib/pipeline/v5/repair-manager', () => ({
  executeRepairManager: mockedModules.executeRepairManagerMock,
}));

import { FlowRunnerV5 } from '../../src/lib/pipeline/v5/runner';

function makeRuntime(): AgentRuntime {
  async function respond(messages: LLMMessage[]): Promise<LLMResponse> {
    const prompt = messages[messages.length - 1]?.content ?? '';

    if (prompt.includes('array "questions"')) {
      return {
        content: '{"questions":["¿Cuantas horas reales le podes dedicar?","¿Para cuando lo queres listo?","¿Que ya tenes avanzado?"]}',
        usage: { promptTokens: 10, completionTokens: 10 },
      };
    }

    if (prompt.includes('"freeHoursWeekday"')) {
      return {
        content: '{"freeHoursWeekday":2,"freeHoursWeekend":5,"energyLevel":"medium","fixedCommitments":["Trabajo de 9 a 18"],"scheduleConstraints":["Evitar trasnochar"]}',
        usage: { promptTokens: 10, completionTokens: 10 },
      };
    }

    return {
      content: '{"phases":[{"name":"Fundamentos","durationWeeks":2,"focus_esAR":"Armar la base"},{"name":"Cierre","durationWeeks":1,"focus_esAR":"Terminar y publicar"}],"milestones":["Base armada","Entrega hecha"]}',
      usage: { promptTokens: 10, completionTokens: 10 },
    };
  }

  return {
    chat: respond,
    async *stream() {
      yield '';
    },
    newContext() {
      return makeRuntime();
    },
  };
}

function makeEvent(activity: ActivityRequest, startAt: string, durationMin = activity.durationMin) {
  const createdAt = '2026-03-30T00:00:00.000Z';
  return {
    id: `${activity.id}_s0_test`,
    kind: 'time_event' as const,
    title: activity.label,
    status: 'active' as const,
    goalIds: [activity.goalId],
    startAt,
    durationMin,
    rigidity: activity.constraintTier === 'hard' ? 'hard' as const : 'soft' as const,
    createdAt,
    updatedAt: createdAt,
  };
}

describe('FlowRunnerV5', () => {
  beforeEach(() => {
    mockedModules.solveScheduleMock.mockReset();
    mockedModules.executeCoVeVerifierMock.mockReset();
    mockedModules.executeRepairManagerMock.mockReset();
  });

  it('orquesta las fases hasta package y deja PhaseIO compatible', async () => {
    mockedModules.solveScheduleMock.mockImplementation(async (input) => ({
      events: [makeEvent(input.activities[0], '2026-03-30T18:00:00.000Z')],
      unscheduled: [],
      tradeoffs: [],
      metrics: { fillRate: 1, solverTimeMs: 5, solverStatus: 'optimal' },
    }));
    mockedModules.executeCoVeVerifierMock.mockResolvedValue({ findings: [{ question: '¿Es viable?', answer: 'Si.', severity: 'INFO' }] });
    mockedModules.executeRepairManagerMock.mockResolvedValue({
      patchesApplied: [],
      iterations: 0,
      scoreBefore: 100,
      scoreAfter: 100,
      finalSchedule: {
        events: [],
        unscheduled: [],
        tradeoffs: [],
        metrics: { fillRate: 1, solverTimeMs: 0, solverStatus: 'optimal' },
      },
    });

    const tracker = {
      onPhaseStart: vi.fn(),
      onPhaseSuccess: vi.fn(),
      onPhaseSkipped: vi.fn(),
      onProgress: vi.fn(),
      onRepairAttempt: vi.fn(),
    };

    const runner = new FlowRunnerV5({
      runtime: makeRuntime(),
      text: 'Terminar el portfolio',
      answers: {
        disponibilidad: 'Dos horas por dia y mas el sabado',
      },
      availability: [
        { day: 'monday', startTime: '18:00', endTime: '21:00' },
        { day: 'wednesday', startTime: '18:00', endTime: '21:00' },
      ],
      weekStartDate: '2026-03-30T00:00:00Z',
      goalId: 'goal-portfolio',
    });

    const context = await runner.runFullPipeline(tracker);

    expect(context.package?.items.length).toBeGreaterThan(0);
    expect(context.package?.summary_esAR).toContain('portfolio');
    expect(context.phaseIO.classify?.input).toEqual({ text: 'Terminar el portfolio' });
    expect(context.phaseIO.package?.output.qualityScore).toBeGreaterThanOrEqual(80);
    expect(tracker.onPhaseSuccess).toHaveBeenCalled();
    expect(tracker.onPhaseSkipped).toHaveBeenCalledWith('repair');
    expect(tracker.onPhaseSkipped).toHaveBeenCalledWith('adapt');
  });

  it('hace repair loop cuando validacion dura o CoVe fallan y revalida hasta quedar estable', async () => {
    mockedModules.solveScheduleMock.mockImplementation(async (input) => ({
      events: [
        makeEvent(input.activities[0], '2026-03-30T18:00:00.000Z'),
        makeEvent(input.activities[1] ?? input.activities[0], '2026-03-30T18:00:00.000Z'),
      ],
      unscheduled: [],
      tradeoffs: [],
      metrics: { fillRate: 1, solverTimeMs: 5, solverStatus: 'optimal' },
    }));

    mockedModules.executeCoVeVerifierMock
      .mockResolvedValueOnce({
        findings: [{ question: '¿Hay solapamientos?', answer: 'Si, hay conflicto real.', severity: 'FAIL' }],
      })
      .mockResolvedValueOnce({
        findings: [{ question: '¿Hay solapamientos?', answer: 'No, ya no se pisan.', severity: 'INFO' }],
      });

    mockedModules.executeRepairManagerMock.mockImplementation(async (runtime, input) => ({
      patchesApplied: [{ type: 'MOVE', targetId: input.schedule.events[1].id }],
      iterations: 1,
      scoreBefore: 60,
      scoreAfter: 95,
      finalSchedule: {
        ...input.schedule,
        events: [
          input.schedule.events[0],
          {
            ...input.schedule.events[1],
            startAt: '2026-04-01T18:00:00.000Z',
          },
        ],
      },
    }));

    const tracker = {
      onRepairAttempt: vi.fn(),
      onPhaseSkipped: vi.fn(),
    };

    const runner = new FlowRunnerV5({
      runtime: makeRuntime(),
      text: 'Terminar el portfolio',
      answers: {
        disponibilidad: 'Dos horas por dia y algo el miercoles',
      },
      availability: [
        { day: 'monday', startTime: '18:00', endTime: '21:00' },
        { day: 'wednesday', startTime: '18:00', endTime: '21:00' },
      ],
      weekStartDate: '2026-03-30T00:00:00Z',
      goalId: 'goal-portfolio',
    });

    const context = await runner.runFullPipeline(tracker);

    expect(context.repairCycles).toBe(1);
    expect(mockedModules.executeRepairManagerMock).toHaveBeenCalledTimes(1);
    expect(mockedModules.executeCoVeVerifierMock).toHaveBeenCalledTimes(2);
    expect(context.hardValidate?.findings).toHaveLength(0);
    expect(context.package?.qualityScore).toBe(95);
    expect(tracker.onRepairAttempt).toHaveBeenCalledTimes(1);
    expect(tracker.onPhaseSkipped).toHaveBeenCalledWith('adapt');
  });
});
