import { DateTime } from 'luxon'
import type { AgentRuntime, SkillContext, SkillResult, Skill } from './skill-interface'
import { perfilSchema } from '../../shared/schemas/perfil'

// ─── Basic (web compatible) intake type ───────────────────────────────────────

export interface IntakeExpressData {
  nombre: string
  edad: number
  ubicacion: string
  ocupacion: string
  objetivo: string
}

// ─── Enriched intake type (from the terminal runner config) ───────────────────

export interface IntakeEnrichedData extends IntakeExpressData {
  objetivos?: Array<{
    descripcion: string
    prioridad?: number
    horasSemanales?: number
    tipo?: 'meta' | 'habito' | 'exploracion'
  }>
  horarios?: {
    despertar?: string
    dormir?: string
    trabajoInicio?: string
    trabajoFin?: string
    tiempoTransporte?: number
  }
  energia?: {
    cronotipo?: 'matutino' | 'vespertino' | 'neutro'
    horasProductivasMax?: number
    horaPicoEnergia?: string
    horaBajaEnergia?: string
  }
  motivacion?: {
    nivel?: number
    estres?: number
    fracasosPrevios?: string[]
    fortalezas?: string[]
  }
  compromisos?: Array<{
    descripcion: string
    horario?: string
    recurrencia?: string
    duracion?: number
  }>
  dependientes?: Array<{
    nombre: string
    relacion: string
    impactoHorario?: string
  }>
  disponibilidad?: {
    horasLibresLaborales?: number
    horasLibresFinDeSemana?: number
  }
  salud?: {
    condiciones?: string[]
    restricciones?: string[]
  }
}

// ─── Profile builder (enriched) ───────────────────────────────────────────────

export function intakeExpressToProfile(data: IntakeExpressData) {
  return intakeEnrichedToProfile(data)
}

export function intakeEnrichedToProfile(data: IntakeEnrichedData) {
  const now = DateTime.utc().toISO()!

  // Resolve schedule — prefer explicit values, fall back to defaults
  const despertar = data.horarios?.despertar ?? '07:00'
  const dormir = data.horarios?.dormir ?? '23:00'
  const trabajoInicio = data.horarios?.trabajoInicio ?? '09:00'
  const trabajoFin = data.horarios?.trabajoFin ?? '18:00'
  const tiempoTransporte = data.horarios?.tiempoTransporte ?? 30

  // Resolve energy
  const cronotipo = data.energia?.cronotipo ?? 'neutro'
  const horasProductivasMaximas = data.energia?.horasProductivasMax ?? 6
  const horarioPicoEnergia = data.energia?.horaPicoEnergia ?? '09:00-12:00'
  const horarioBajoEnergia = data.energia?.horaBajaEnergia ?? '14:00-16:00'

  // Resolve availability
  const horasLibresLaborales = data.disponibilidad?.horasLibresLaborales ?? 4
  const horasLibresFDS = data.disponibilidad?.horasLibresFinDeSemana ?? 10

  // Resolve emotional state
  const motivacionNivel = data.motivacion?.nivel ?? 3
  const estresNivel = data.motivacion?.estres ?? 2

  // Resolve problems / history
  const problemasActuales: string[] = [
    ...(data.motivacion?.fracasosPrevios ?? []),
    ...(data.salud?.condiciones ?? []),
    ...(data.salud?.restricciones ?? [])
  ]
  const tendencias: string[] = data.motivacion?.fortalezas ?? []

  // Build dependientes
  const dependientesRaw = data.dependientes ?? []
  const dependientes = dependientesRaw.map(d => ({
    nombre: d.nombre,
    relacion: (d.relacion as any) === 'hijo' || (d.relacion as any) === 'madre' || (d.relacion as any) === 'padre' || (d.relacion as any) === 'pareja'
      ? d.relacion as 'hijo' | 'madre' | 'padre' | 'pareja'
      : 'otro' as const,
    edad: null,
    rol: 'dependiente' as const,
    disponibilidad: d.impactoHorario ?? '',
    restricciones: '',
    variabilidad: 'variable' as const
  }))

  // Build compromisos
  const compromisos = (data.compromisos ?? []).map(c => ({
    descripcion: c.descripcion,
    fecha: null,
    recurrencia: c.recurrencia ?? null,
    duracion: c.duracion ?? 60
  }))

  // Build objectives — if enriched objetivos provided, use them; else use single objetivo
  const objetivos = data.objetivos && data.objetivos.length > 0
    ? data.objetivos.map((obj, idx) => ({
        id: `obj${idx + 1}`,
        descripcion: obj.descripcion,
        tipo: (obj.tipo ?? 'meta') as 'meta' | 'habito' | 'exploracion',
        responsable: 'p1',
        prioridad: obj.prioridad ?? 3,
        plazo: null,
        tipoTimeline: 'controlable' as const,
        rangoEstimado: { optimista: null, probable: null, pesimista: null },
        motivacion: obj.descripcion,
        relaciones: [],
        horasSemanalesEstimadas: obj.horasSemanales ?? 10
      }))
    : [{
        id: 'obj1',
        descripcion: data.objetivo,
        tipo: 'meta' as const,
        responsable: 'p1',
        prioridad: 3,
        plazo: null,
        tipoTimeline: 'controlable' as const,
        rangoEstimado: { optimista: null, probable: null, pesimista: null },
        motivacion: data.objetivo,
        relaciones: [],
        horasSemanalesEstimadas: 10
      }]

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
        dependientes,
        habilidades: {
          actuales: [],
          aprendiendo: []
        },
        condicionesSalud: [],
        patronesEnergia: {
          cronotipo,
          horarioPicoEnergia,
          horarioBajoEnergia,
          horasProductivasMaximas
        },
        problemasActuales,
        patronesConocidos: {
          diaTipicoBueno: '',
          diaTipicoMalo: '',
          tendencias
        },
        rutinaDiaria: {
          porDefecto: {
            despertar,
            dormir,
            trabajoInicio,
            trabajoFin,
            tiempoTransporte
          },
          fasesHorario: []
        },
        calendario: {
          fuente: 'ninguno' as const,
          eventosInamovibles: [],
          eventosFlexibles: [],
          horasLibresEstimadas: {
            diasLaborales: horasLibresLaborales,
            diasDescanso: horasLibresFDS
          }
        },
        compromisos
      }
    ],
    objetivos,
    estadoDinamico: {
      ultimaActualizacion: now,
      salud: 'buena' as const,
      nivelEnergia: 'medio' as const,
      estadoEmocional: {
        motivacion: motivacionNivel,
        estres: estresNivel,
        satisfaccion: 3
      },
      notasTemporales: [],
      umbralStaleness: 7
    }
  }

  return perfilSchema.parse(profile)
}

// ─── Skill declaration ────────────────────────────────────────────────────────

export const planIntake: Skill = {
  name: 'plan-intake',
  tier: 'medio',
  getSystemPrompt(ctx: SkillContext): string {
    return [
      'You are a friendly life coach helping someone create an action plan.',
      'Ask no more than 5 quick conversational questions to understand their situation.',
      'Never show more than one question at a time.',
      'Infer timezone, routine defaults, and baseline energy without extra follow-up questions.',
      'If something small is missing, make a reasonable temporary assumption and keep going.',
      `Respond in ${ctx.userLocale === 'es-AR' ? 'informal Argentine Spanish (voseo)' : "the user's language"}.`,
      'Never use technical jargon. Be warm, empathetic, and brief.',
      'Questions: name, age, city, current occupation, main goal for next months.'
    ].join('\n')
  },
  async run(_runtime: AgentRuntime, _ctx: SkillContext): Promise<SkillResult> {
    return {
      success: true,
      filesWritten: [],
      summary: 'Intake express completed via UI',
      tokensUsed: { input: 0, output: 0 }
    }
  }
}
