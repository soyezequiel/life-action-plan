import type { Skill, AgentRuntime, SkillContext, SkillResult } from './skill-interface'
import { perfilSchema } from '../shared/schemas/perfil'
import { DateTime } from 'luxon'

/**
 * Intake Express — 5 preguntas rápidas para el hackathon.
 *
 * En lugar del assessment holístico completo (6 secciones),
 * recolecta lo mínimo para generar un plan a 1 mes.
 */

export interface IntakeExpressData {
  nombre: string
  edad: number
  ubicacion: string
  ocupacion: string
  objetivo: string
}

/**
 * Convierte las 5 respuestas express en un perfil Zod-valid mínimo.
 * Los campos que no se preguntan se rellenan con defaults seguros.
 */
export function intakeExpressToProfile(data: IntakeExpressData) {
  const now = DateTime.utc().toISO()!

  const profile = {
    version: '3.0',
    planificacionConjunta: false,
    participantes: [
      {
        id: 'p1',
        datosPersonales: {
          nombre: data.nombre,
          edad: data.edad,
          sexo: 'no-especificado',
          ubicacion: {
            ciudad: data.ubicacion,
            pais: 'AR',
            zonaHoraria: 'America/Argentina/Buenos_Aires',
            zonaHorariaSecundaria: null,
            feriadosRelevantes: [],
            conectividad: 'alta' as const,
            accesoCursos: 'online' as const,
            distanciaCentroUrbano: 0,
            transporteDisponible: 'publico' as const,
            adversidadesLocales: []
          },
          idioma: 'es',
          nivelAcademico: 'no-especificado',
          nivelEconomico: 'medio' as const,
          narrativaPersonal: data.ocupacion
        },
        dependientes: [],
        habilidades: {
          actuales: [],
          aprendiendo: []
        },
        condicionesSalud: [],
        patronesEnergia: {
          cronotipo: 'neutro' as const,
          horarioPicoEnergia: '09:00-12:00',
          horarioBajoEnergia: '14:00-16:00',
          horasProductivasMaximas: 6
        },
        problemasActuales: [],
        patronesConocidos: {
          diaTipicoBueno: '',
          diaTipicoMalo: '',
          tendencias: []
        },
        rutinaDiaria: {
          porDefecto: {
            despertar: '07:00',
            dormir: '23:00',
            trabajoInicio: '09:00',
            trabajoFin: '18:00',
            tiempoTransporte: 30
          },
          fasesHorario: []
        },
        calendario: {
          fuente: 'ninguno' as const,
          eventosInamovibles: [],
          eventosFlexibles: [],
          horasLibresEstimadas: {
            diasLaborales: 4,
            diasDescanso: 10
          }
        },
        compromisos: []
      }
    ],
    objetivos: [
      {
        id: 'obj1',
        descripcion: data.objetivo,
        tipo: 'meta' as const,
        responsable: 'p1',
        prioridad: 3,
        plazo: null,
        tipoTimeline: 'controlable' as const,
        rangoEstimado: {
          optimista: null,
          probable: null,
          pesimista: null
        },
        motivacion: data.objetivo,
        relaciones: [],
        horasSemanalesEstimadas: 10
      }
    ],
    estadoDinamico: {
      ultimaActualizacion: now,
      salud: 'buena' as const,
      nivelEnergia: 'medio' as const,
      estadoEmocional: {
        motivacion: 3,
        estres: 2,
        satisfaccion: 3
      },
      notasTemporales: [],
      umbralStaleness: 7
    }
  }

  // Validate with Zod
  return perfilSchema.parse(profile)
}

export const planIntake: Skill = {
  name: 'plan-intake',
  tier: 'medio',

  getSystemPrompt(ctx: SkillContext): string {
    return [
      'You are a friendly life coach helping someone create an action plan.',
      'Ask 5 quick conversational questions to understand their situation.',
      `Respond in ${ctx.userLocale === 'es-AR' ? 'informal Argentine Spanish (voseo)' : 'the user\'s language'}.`,
      'Never use technical jargon. Be warm, empathetic, and brief.',
      'Questions: name, age, city, current occupation, main goal for next months.'
    ].join('\n')
  },

  async run(_runtime: AgentRuntime, _ctx: SkillContext): Promise<SkillResult> {
    // In the hackathon flow, intake is handled by the React UI directly
    // via IPC calls. This skill.run() is for the full LLM-driven intake (future).
    return {
      success: true,
      filesWritten: [],
      summary: 'Intake express completed via UI',
      tokensUsed: { input: 0, output: 0 }
    }
  }
}
