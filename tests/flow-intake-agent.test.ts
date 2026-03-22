import { describe, expect, it } from 'vitest'
import type { AgentRuntime, LLMMessage, LLMResponse } from '../src/lib/runtime/types'
import { analyzeObjectives } from '../src/lib/flow/engine'
import {
  createFallbackIntakeBlocks,
  generateIntakeBlocksWithAgent,
  markIntakeBlocksComplete
} from '../src/lib/flow/intake-agent'

function createRuntime(content: string): AgentRuntime {
  return {
    async chat(_messages: LLMMessage[]): Promise<LLMResponse> {
      return {
        content,
        usage: {
          promptTokens: 10,
          completionTokens: 20
        }
      }
    },
    async *stream() {
      yield content
    },
    newContext(): AgentRuntime {
      return createRuntime(content)
    }
  }
}

describe('flow intake agent', () => {
  it('materializes llm-selected questions with required availability pairs', async () => {
    const goals = analyzeObjectives(['Cambiar de trabajo en 6 meses'])
    const runtime = createRuntime(JSON.stringify({
      rationale: 'Necesito entender el resultado concreto y la disponibilidad real.',
      blocks: [
        {
          id: 'fit',
          title: 'Aterricemos la meta',
          description: 'Lo justo para saber qué cuenta como avance.',
          questions: [
            {
              key: 'goalClarity',
              label: '¿Cómo se vería un avance concreto para esta meta?',
              placeholder: 'Ej: conseguir 3 entrevistas'
            },
            {
              key: 'trabajoInicio',
              label: '¿Cuándo empieza tu horario fijo?',
              placeholder: '09:00'
            },
            {
              key: 'horasLibresLaborales',
              label: 'Entre semana, ¿cuántas horas reales tenés?',
              placeholder: null
            }
          ]
        }
      ]
    }))

    const result = await generateIntakeBlocksWithAgent({
      runtime,
      goals
    })
    const keys = result.blocks.flatMap((block) => block.questions.map((question) => question.key))

    expect(result.rationale).toContain('disponibilidad real')
    expect(keys).toEqual(expect.arrayContaining([
      'goalClarity',
      'trabajoInicio',
      'trabajoFin',
      'horasLibresLaborales',
      'horasLibresDescanso'
    ]))
  })

  it('builds a heuristic fallback when goals need schedule context', () => {
    const goals = analyzeObjectives([
      'Cambiar de trabajo en 6 meses',
      'Aprender ingles para entrevistas'
    ])

    const blocks = createFallbackIntakeBlocks(goals)
    const keys = blocks.flatMap((block) => block.questions.map((question) => question.key))

    expect(keys).toEqual(expect.arrayContaining([
      'ocupacion',
      'trabajoInicio',
      'trabajoFin',
      'horariosFijos',
      'mejorMomento',
      'horasLibresLaborales',
      'horasLibresDescanso'
    ]))
  })

  it('asks for the best moment when the goal is a health routine', () => {
    const goals = analyzeObjectives(['Meditar todos los dias'])
    const blocks = createFallbackIntakeBlocks(goals)
    const keys = blocks.flatMap((block) => block.questions.map((question) => question.key))

    expect(goals[0]?.category).toBe('salud')
    expect(keys).toContain('mejorMomento')
  })

  it('recomputes completion without replacing generated questions', () => {
    const goals = analyzeObjectives(['Cambiar de trabajo en 6 meses'])
    const blocks = createFallbackIntakeBlocks(goals)
    const completed = markIntakeBlocksComplete(blocks, {
      horasLibresLaborales: '2',
      horasLibresDescanso: '4',
      trabajoInicio: '09:00',
      trabajoFin: '18:00',
      horariosFijos: 'Martes 19 a 21',
      goalClarity: 'Conseguir un puesto junior en producto',
      ocupacion: 'Marketing',
      mejorMomento: 'mañana',
      restricciones: 'No puedo mover el trabajo'
    })

    expect(completed.map((block) => block.questions)).toEqual(blocks.map((block) => block.questions))
    expect(completed.every((block) => block.completed)).toBe(true)
  })
})
