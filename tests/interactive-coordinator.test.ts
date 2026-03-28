import { describe, expect, it } from 'vitest'

import { createPipelineRuntimeRecorder } from '../src/lib/flow/pipeline-runtime-data'
import { FlowRunnerV5 } from '../src/lib/pipeline/v5/runner'
import {
  InteractivePipelineCoordinator,
  resolveInteractiveDefaultProvider,
  resetSnapshotFromPhase,
  shouldPauseScheduleReview
} from '../src/lib/pipeline/v5/interactive-coordinator'
import { interactiveSessionStateSchema } from '../src/shared/schemas/pipeline-interactive'

describe('interactive coordinator provider defaults', () => {
  it('prefiere el provider explicito del request', () => {
    expect(resolveInteractiveDefaultProvider({
      provider: 'openrouter',
      workflowProvider: 'ollama:qwen3:8b',
      resourceMode: 'auto',
      deploymentMode: 'local',
      hasApiKey: false
    })).toBe('openrouter')
  })

  it('hereda el provider del workflow cuando existe', () => {
    expect(resolveInteractiveDefaultProvider({
      provider: undefined,
      workflowProvider: 'openrouter:openai/gpt-4o-mini',
      resourceMode: 'auto',
      deploymentMode: 'local',
      hasApiKey: false
    })).toBe('openrouter:openai/gpt-4o-mini')
  })

  it('usa ollama por defecto en local cuando no hay credenciales ni gate previo', () => {
    expect(resolveInteractiveDefaultProvider({
      provider: undefined,
      workflowProvider: null,
      resourceMode: 'auto',
      deploymentMode: 'local',
      hasApiKey: false
    })).toBe('ollama')
  })

  it('mantiene el default cloud cuando el usuario aporta su propia clave', () => {
    expect(resolveInteractiveDefaultProvider({
      provider: undefined,
      workflowProvider: null,
      resourceMode: 'auto',
      deploymentMode: 'local',
      hasApiKey: true
    })).toBeUndefined()
  })
})

describe('interactive coordinator rewind helpers', () => {
  it('restaura el objetivo base y limpia respuestas si se vuelve a classify', () => {
    const interactiveState = interactiveSessionStateSchema.parse({
      request: {
        modelId: 'openai:gpt-5-mini',
        deploymentMode: 'local'
      },
      seed: {
        goalText: 'Aprender guitarra. Contexto adicional: solo tengo noches libres.',
        baseGoalText: 'Aprender guitarra',
        profileId: 'profile-1',
        timezone: 'America/Buenos_Aires',
        weekStartDate: '2026-03-23',
        answers: {
          'Cuando practicas mejor?': 'De noche'
        }
      },
      config: {
        pausePoints: {}
      }
    })
    const recorder = createPipelineRuntimeRecorder({
      source: 'interactive',
      modelId: 'openai:gpt-5-mini',
      goalText: interactiveState.seed.goalText,
      profileId: interactiveState.seed.profileId,
      interactiveState
    })
    const snapshot = recorder.getSnapshot()

    snapshot.run.goalText = interactiveState.seed.goalText
    snapshot.pauseHistory = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        phase: 'classify',
        type: 'classify_review',
        output: {},
        createdAt: '2026-03-27T10:00:00.000Z',
        updatedAt: '2026-03-27T10:00:00.000Z'
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        phase: 'requirements',
        type: 'requirements_answer',
        output: {},
        createdAt: '2026-03-27T10:05:00.000Z',
        updatedAt: '2026-03-27T10:05:00.000Z'
      }
    ]

    const reset = resetSnapshotFromPhase(snapshot, 'classify')

    expect(reset.interactiveState?.seed.goalText).toBe('Aprender guitarra')
    expect(reset.interactiveState?.seed.answers).toEqual({})
    expect(reset.run.goalText).toBe('Aprender guitarra')
    expect(reset.pauseHistory).toEqual([])
  })

  it('limpia respuestas pero conserva el objetivo contextual si se vuelve a requirements', () => {
    const interactiveState = interactiveSessionStateSchema.parse({
      request: {
        modelId: 'openai:gpt-5-mini',
        deploymentMode: 'local'
      },
      seed: {
        goalText: 'Aprender guitarra. Contexto adicional: solo tengo noches libres.',
        baseGoalText: 'Aprender guitarra',
        profileId: 'profile-1',
        timezone: 'America/Buenos_Aires',
        weekStartDate: '2026-03-23',
        answers: {
          'Cuando practicas mejor?': 'De noche'
        }
      },
      config: {
        pausePoints: {}
      }
    })
    const recorder = createPipelineRuntimeRecorder({
      source: 'interactive',
      modelId: 'openai:gpt-5-mini',
      goalText: interactiveState.seed.goalText,
      profileId: interactiveState.seed.profileId,
      interactiveState
    })
    const snapshot = recorder.getSnapshot()

    snapshot.run.goalText = interactiveState.seed.goalText

    const reset = resetSnapshotFromPhase(snapshot, 'requirements')

    expect(reset.interactiveState?.seed.goalText).toBe('Aprender guitarra. Contexto adicional: solo tengo noches libres.')
    expect(reset.interactiveState?.seed.answers).toEqual({})
    expect(reset.run.goalText).toBe('Aprender guitarra. Contexto adicional: solo tengo noches libres.')
  })
})

describe('interactive coordinator requirements answers', () => {
  it('permite continuar aunque todas las respuestas esten vacias', async () => {
    const interactiveState = interactiveSessionStateSchema.parse({
      request: {
        modelId: 'openai:gpt-5-mini',
        deploymentMode: 'local'
      },
      seed: {
        goalText: 'Aprender guitarra',
        baseGoalText: 'Aprender guitarra',
        profileId: 'profile-1',
        timezone: 'America/Buenos_Aires',
        weekStartDate: '2026-03-23',
        answers: {}
      },
      config: {
        pausePoints: {}
      }
    })
    const recorder = createPipelineRuntimeRecorder({
      source: 'interactive',
      modelId: 'openai:gpt-5-mini',
      goalText: interactiveState.seed.goalText,
      profileId: interactiveState.seed.profileId,
      interactiveState
    })
    const snapshot = recorder.markPhaseAsPausedForUserInput('requirements', 'requirements_answer', {
      questions: ['Cuantas horas por semana tienes libres?']
    })
    const pausePoint = snapshot.currentPausePoint

    expect(pausePoint).not.toBeNull()

    const runner = new FlowRunnerV5({
      runtime: {} as never,
      text: interactiveState.seed.goalText,
      answers: {},
      timezone: interactiveState.seed.timezone,
      availability: [],
      blocked: [],
      preferences: [],
      weekStartDate: interactiveState.seed.weekStartDate,
      inlineAdaptive: false
    })
    const coordinator = new InteractivePipelineCoordinator({
      ownerUserId: null,
      executionUserId: 'user-1'
    })

    const result = await (coordinator as unknown as {
      validateAndApplyPauseInput: (params: {
        pausePoint: NonNullable<typeof pausePoint>
        input: unknown
        recorder: typeof recorder
        runner: FlowRunnerV5
      }) => Promise<{ answers: Record<string, string> }>
    }).validateAndApplyPauseInput({
      pausePoint: pausePoint as NonNullable<typeof pausePoint>,
      input: { answers: {} },
      recorder,
      runner
    })

    expect(result).toEqual({ answers: {} })
    expect(recorder.getSnapshot().interactiveState?.seed.answers).toEqual({})
    expect(recorder.getSnapshot().currentPausePoint?.userInput).toEqual({ answers: {} })
    expect(runner.getContext().config.answers).toEqual({})
  })
})

describe('interactive coordinator schedule pause gating', () => {
  it('omite la pausa de agenda cuando no hay eventos ni pendientes para revisar', () => {
    expect(shouldPauseScheduleReview({
      events: [],
      unscheduled: [],
      tradeoffs: [],
      metrics: {
        fillRate: 1,
        solverTimeMs: 1,
        solverStatus: 'optimal'
      }
    })).toBe(false)
  })

  it('mantiene la pausa de agenda si hay algo visible para revisar', () => {
    expect(shouldPauseScheduleReview({
      events: [],
      unscheduled: [
        {
          activityId: 'phase-1',
          reason: 'scheduled 0 of 1 sessions',
          suggestion_esAR: 'Revisar disponibilidad'
        }
      ],
      tradeoffs: [],
      metrics: {
        fillRate: 0,
        solverTimeMs: 1,
        solverStatus: 'feasible'
      }
    })).toBe(true)
  })
})
