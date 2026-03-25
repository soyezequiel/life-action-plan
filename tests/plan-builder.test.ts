import { describe, expect, it, vi } from 'vitest'
import { generatePlan, planBuilder } from '../src/lib/skills/plan-builder'
import type { AgentRuntime, SkillContext } from '../src/lib/runtime/types'
import type { Perfil } from '../src/shared/schemas/perfil'

const ctx: SkillContext = {
  planDir: '',
  profileId: 'test-123',
  userLocale: 'es-AR',
  formalityLevel: 'informal',
  tokenMultiplier: 1.22
}

const profile = {
  participantes: [
    {
      datosPersonales: {
        nombre: 'Ezequiel',
        edad: 30,
        ubicacion: {
          ciudad: 'Buenos Aires'
        },
        narrativaPersonal: 'Programador'
      },
      rutinaDiaria: {
        porDefecto: {
          despertar: '07:00',
          dormir: '23:00',
          trabajoInicio: '09:00',
          trabajoFin: '18:00'
        }
      },
      calendario: {
        horasLibresEstimadas: {
          diasLaborales: 3,
          diasDescanso: 6
        }
      },
      patronesEnergia: {
        cronotipo: 'Búho',
        horarioPicoEnergia: '20:00',
        horarioBajoEnergia: '14:00',
        horasProductivasMaximas: 6
      },
      compromisos: [],
      dependientes: [],
      problemasActuales: []
    }
  ],
  estadoDinamico: {
    estadoEmocional: {
      motivacion: 4,
      estres: 2
    },
    nivelEnergia: 'alto'
  },
  objetivos: [
    {
      descripcion: 'Aprender TypeScript',
      id: 'obj1',
      prioridad: 5,
      horasSemanalesEstimadas: 10
    }
  ]
} as unknown as Perfil

function createRuntime(content: string): AgentRuntime {
  return {
    async chat() {
      return {
        content,
        usage: {
          promptTokens: 123,
          completionTokens: 456
        }
      }
    },
    async *stream() {
      yield content
    },
    newContext() {
      return createRuntime(content)
    }
  }
}

function createStreamingRuntime(chunks: string[], usage = { promptTokens: 12, completionTokens: 34 }): AgentRuntime {
  return {
    async chat() {
      return {
        content: chunks.join(''),
        usage
      }
    },
    async *stream() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
    async streamChat(_messages, onToken) {
      for (const chunk of chunks) {
        onToken(chunk)
      }

      return {
        content: chunks.join(''),
        usage
      }
    },
    newContext() {
      return createStreamingRuntime(chunks, usage)
    }
  }
}

describe('planBuilder', () => {
  it('tiene name y tier correctos', () => {
    expect(planBuilder.name).toBe('plan-builder')
    expect(planBuilder.tier).toBe('alto')
  })

  describe('getSystemPrompt', () => {
    it('incluye instrucciones de formato JSON', () => {
      const prompt = planBuilder.getSystemPrompt(ctx)
      expect(prompt).toContain('JSON')
      expect(prompt).toContain('"semana"')
      expect(prompt).toContain('"dia"')
      expect(prompt).toContain('"hora"')
    })

    it('incluye reglas de planificacion realista', () => {
      const prompt = planBuilder.getSystemPrompt(ctx)
      expect(prompt).toContain('sleep')
      expect(prompt).toContain('work')
      expect(prompt).toContain('Max 2-3')
    })

    it('usa voseo argentino para es-AR', () => {
      const prompt = planBuilder.getSystemPrompt(ctx)
      expect(prompt).toContain('Argentine Spanish')
      expect(prompt).toContain('voseo')
    })

    it('usa lenguaje simple para otros locales', () => {
      const prompt = planBuilder.getSystemPrompt({ ...ctx, userLocale: 'en-US' })
      expect(prompt).toContain('plain, simple language')
      expect(prompt).not.toContain('voseo')
    })

    it('prohibe jargon tecnico', () => {
      const prompt = planBuilder.getSystemPrompt(ctx)
      expect(prompt).toContain('Never use jargon')
      expect(prompt).toContain('Q1')
    })

    it('requiere categorias validas', () => {
      const prompt = planBuilder.getSystemPrompt(ctx)
      expect(prompt).toContain('estudio')
      expect(prompt).toContain('ejercicio')
      expect(prompt).toContain('habito')
      expect(prompt).toContain('descanso')
    })
  })

  describe('generatePlan', () => {
    it('parsea JSON dentro de code fences', async () => {
      const runtime = createRuntime([
        '```json',
        '{"nombre":"Plan simple","resumen":"Resumen corto","eventos":[{"semana":1,"dia":"lunes","hora":"08:00","duracion":30,"actividad":"Estudiar","categoria":"estudio","objetivoId":"obj1"}]}',
        '```'
      ].join('\n'))

      const result = await generatePlan(runtime, profile, ctx)

      expect(result.nombre).toBe('Plan simple')
      expect(result.eventos).toHaveLength(1)
      expect(result.tokensUsed).toEqual({ input: 123, output: 456 })
    })

    it('parsea JSON aunque el modelo devuelva think blocks y texto extra', async () => {
      const runtime = createRuntime([
        '<think>Voy a revisar trabajo, descanso y habitos antes de responder.</think>',
        'Aca va tu plan:',
        '{"nombre":"Plan con fallback","resumen":"Plan ordenado","eventos":[{"semana":1,"dia":"martes","hora":"19:00","duracion":45,"actividad":"Caminar","categoria":"ejercicio","objetivoId":"obj1"}]}',
        'Espero que te sirva.'
      ].join('\n'))

      const result = await generatePlan(runtime, profile, ctx)

      expect(result.nombre).toBe('Plan con fallback')
      expect(result.eventos[0]?.categoria).toBe('ejercicio')
    })

    it('normaliza campos extra y numeros serializados como texto', async () => {
      const runtime = createRuntime(JSON.stringify({
        nombre: ' Plan tolerante ',
        resumen: ' Resumen valido ',
        comentario: 'ignorar',
        eventos: [
          {
            semana: '1',
            dia: ' MiErCoLeS ',
            hora: '8:05',
            duracion: '30',
            actividad: ' Respirar tranquilo ',
            categoria: ' HABITO ',
            objetivoId: ' obj1 ',
            detalle: 'ignorar'
          }
        ]
      }))

      const result = await generatePlan(runtime, profile, ctx)

      expect(result).toMatchObject({
        nombre: 'Plan tolerante',
        resumen: 'Resumen valido',
        eventos: [
          {
            semana: 1,
            dia: 'miercoles',
            hora: '08:05',
            duracion: 30,
            actividad: 'Respirar tranquilo',
            categoria: 'habito',
            objetivoId: 'obj1'
          }
        ]
      })
    })

    it('recupera eventos si falta objetivoId y usa aliases de categoria', async () => {
      const runtime = createRuntime(JSON.stringify({
        nombre: 'Plan recuperable',
        resumen: 'Resumen util',
        eventos: [
          {
            semana: 1,
            dia: 'Viernes',
            hora: '19:30',
            duracion: 40,
            descripcion: 'Caminar por el barrio',
            categoria: 'salud'
          }
        ]
      }))

      const result = await generatePlan(runtime, profile, ctx)

      expect(result.eventos).toEqual([
        {
          semana: 1,
          dia: 'viernes',
          hora: '19:30',
          duracion: 40,
          actividad: 'Caminar por el barrio',
          categoria: 'ejercicio',
          objetivoId: 'obj1'
        }
      ])
    })

    it('acepta la clave alternativa "actividades" y filtra eventos rotos', async () => {
      const runtime = createRuntime(JSON.stringify({
        nombre: 'Plan mixto',
        resumen: 'Resumen mixto',
        actividades: [
          {
            semana: 1,
            dia: 'lunes',
            horario: '08:00',
            minutos: 30,
            tarea: 'Leer media hora',
            tipo: 'estudio'
          },
          {
            semana: 2
          }
        ]
      }))

      const result = await generatePlan(runtime, profile, ctx)

      expect(result.eventos).toEqual([
        {
          semana: 1,
          dia: 'lunes',
          hora: '08:00',
          duracion: 30,
          actividad: 'Leer media hora',
          categoria: 'estudio',
          objetivoId: 'obj1'
        }
      ])
    })

    it('falla con mensaje controlado si la estructura no es valida', async () => {
      const runtime = createRuntime('{"nombre":"Plan roto","resumen":"Sin eventos validos","eventos":[{"semana":1}]}')

      await expect(generatePlan(runtime, profile, ctx)).rejects.toThrow('El asistente no pudo generar un plan valido. Intentalo de nuevo.')
    })
    it('emite progreso real cuando el runtime soporta streamChat', async () => {
      const runtime = createStreamingRuntime([
        '{"nombre":"Plan stream","resumen":"Resumen stream","eventos":[',
        '{"semana":1,"dia":"jueves","hora":"20:00","duracion":35,"actividad":"Repasar TS","categoria":"estudio","objetivoId":"obj1"}',
        ']}'
      ])
      const onStageChange = vi.fn()
      const onToken = vi.fn()

      const result = await generatePlan(runtime, profile, ctx, {
        onStageChange,
        onToken
      })

      expect(result.nombre).toBe('Plan stream')
      expect(result.tokensUsed).toEqual({ input: 12, output: 34 })
      expect(onStageChange).toHaveBeenNthCalledWith(1, 'generating')
      expect(onStageChange).toHaveBeenNthCalledWith(2, 'validating')
      expect(onToken).toHaveBeenCalledTimes(3)
      expect(onToken).toHaveBeenNthCalledWith(1, '{"nombre":"Plan stream","resumen":"Resumen stream","eventos":[')
      expect(onToken).toHaveBeenNthCalledWith(2, '{"semana":1,"dia":"jueves","hora":"20:00","duracion":35,"actividad":"Repasar TS","categoria":"estudio","objetivoId":"obj1"}')
      expect(onToken).toHaveBeenNthCalledWith(3, ']}')
    })
  })
})
