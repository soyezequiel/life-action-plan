import { describe, expect, it } from 'vitest'

import { createPipelineRuntimeRecorder } from '../src/lib/flow/pipeline-runtime-data'
import {
  resolveInteractiveDefaultProvider,
  resetSnapshotFromPhase
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
