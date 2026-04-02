import { describe, expect, it, beforeEach, vi } from 'vitest';

const { solveScheduleMock } = vi.hoisted(() => ({
  solveScheduleMock: vi.fn(),
}));

vi.mock('../src/lib/scheduler/solver', () => ({
  solveSchedule: solveScheduleMock,
}));

import type { AgentRuntime } from '../src/lib/runtime/types';
import { schedulerAgent, type SchedulerInput } from '../src/lib/pipeline/v6/agents/scheduler-agent';

function createSchedulerInput(): SchedulerInput {
  return {
    strategicDraft: {
      phases: [
        {
          name: 'Base',
          durationWeeks: 2,
          focus_esAR: 'Practicar bloques cortos y consistentes.',
        },
      ],
      milestones: ['Completar la primera semana'],
    },
    userProfile: {
      freeHoursWeekday: 3,
      freeHoursWeekend: 4,
      energyLevel: 'medium',
      fixedCommitments: [],
      scheduleConstraints: [],
    },
    timezone: 'America/Argentina/Buenos_Aires',
    planningStartAt: '2026-04-01T12:30:00.000Z',
    weekStartDate: '2026-03-30T03:00:00.000Z',
    availability: [
      { day: 'monday', startTime: '08:00', endTime: '20:00' },
      { day: 'tuesday', startTime: '08:00', endTime: '20:00' },
      { day: 'wednesday', startTime: '08:00', endTime: '20:00' },
      { day: 'thursday', startTime: '08:00', endTime: '20:00' },
      { day: 'friday', startTime: '08:00', endTime: '20:00' },
    ],
    blocked: [],
    domainCard: null,
  };
}

function createRuntime(responseContent = '{}'): AgentRuntime {
  return {
    chat: vi.fn().mockResolvedValue({
      content: responseContent,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
      },
    }),
    async *stream() {
    },
    newContext() {
      return this;
    },
  };
}

describe('schedulerAgent planningStartAt', () => {
  beforeEach(() => {
    solveScheduleMock.mockReset();
  });

  it('passes the real timezone and blocks every slot before planningStartAt', async () => {
    solveScheduleMock.mockResolvedValue({
      events: [],
      unscheduled: [],
      metrics: {
        fillRate: 1,
        solverTimeMs: 12,
        solverStatus: 'optimal',
      },
    });

    await schedulerAgent.execute(createSchedulerInput(), createRuntime());

    expect(solveScheduleMock).toHaveBeenCalledTimes(1);
    const solverInput = solveScheduleMock.mock.calls[0][0];

    expect(solverInput.timezone).toBe('America/Argentina/Buenos_Aires');
    expect(solverInput.weekStartDate).toBe('2026-03-30T03:00:00.000Z');
    expect(solverInput.blocked).toEqual(expect.arrayContaining([
      {
        day: 'monday',
        startTime: '00:00',
        endTime: '24:00',
        reason: 'Antes de la fecha de inicio',
      },
      {
        day: 'tuesday',
        startTime: '00:00',
        endTime: '24:00',
        reason: 'Antes de la fecha de inicio',
      },
      {
        day: 'wednesday',
        startTime: '00:00',
        endTime: '09:30',
        reason: 'Antes de la fecha de inicio',
      },
    ]));
  });

  it('rejects fallback events that start before planningStartAt', async () => {
    solveScheduleMock.mockResolvedValue({
      events: [],
      unscheduled: [],
      metrics: {
        fillRate: 0,
        solverTimeMs: 3,
        solverStatus: 'fallback_unavailable',
      },
    });

    const runtime = createRuntime(JSON.stringify({
      events: [
        {
          activityId: 'phase-1-practicar-bloques-cortos-y-consistentes',
          startAt: '2026-03-31T18:00:00.000Z',
          durationMin: 60,
        },
      ],
      unscheduled: [],
    }));

    const result = await schedulerAgent.execute(createSchedulerInput(), runtime);

    expect(result.solverOutput.events).toHaveLength(0);
    expect(result.solverOutput.unscheduled).toEqual(expect.arrayContaining([
      expect.objectContaining({
        activityId: 'phase-1-practicar-bloques-cortos-y-consistentes',
        reason: 'conflicto_bloqueo',
      }),
    ]));
  });
});
