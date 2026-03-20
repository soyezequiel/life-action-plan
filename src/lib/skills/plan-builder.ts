import { z } from 'zod'
import type { AgentRuntime, SkillContext, SkillResult, Skill } from './skill-interface'
import type { Perfil } from '../../shared/schemas/perfil'

export interface PlanEvent {
  semana: number
  dia: string
  hora: string
  duracion: number
  actividad: string
  categoria: 'estudio' | 'ejercicio' | 'trabajo' | 'habito' | 'descanso' | 'otro'
  objetivoId: string
}

export interface GeneratedPlan {
  nombre: string
  resumen: string
  eventos: PlanEvent[]
  tokensUsed: { input: number; output: number }
}

export interface GeneratePlanOptions {
  onStageChange?: (stage: 'generating' | 'validating') => void
  onToken?: (chunk: string) => void
}

const validCategories = ['estudio', 'ejercicio', 'trabajo', 'habito', 'descanso', 'otro'] as const

const categoryAliases: Record<string, PlanEvent['categoria']> = {
  habito: 'habito',
  habitos: 'habito',
  habit: 'habito',
  'habito diario': 'habito',
  rutina: 'habito',
  estudio: 'estudio',
  estudiar: 'estudio',
  aprendizaje: 'estudio',
  ejercicio: 'ejercicio',
  salud: 'ejercicio',
  fitness: 'ejercicio',
  entrenamiento: 'ejercicio',
  trabajo: 'trabajo',
  laboral: 'trabajo',
  laburo: 'trabajo',
  descanso: 'descanso',
  recuperacion: 'descanso',
  pausa: 'descanso',
  ocio: 'descanso',
  otro: 'otro'
}

const planEventSchema = z.object({
  semana: z.number().int().min(1),
  dia: z.string().min(1),
  hora: z.string().regex(/^\d{2}:\d{2}$/),
  duracion: z.number().int().positive(),
  actividad: z.string().min(1),
  categoria: z.enum(validCategories),
  objetivoId: z.string().min(1)
}).strict()

const generatedPlanSchema = z.object({
  nombre: z.string().min(1),
  resumen: z.string().min(1),
  eventos: z.array(planEventSchema).default([])
}).strict()

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeComparableText(value: unknown): string {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function normalizeInteger(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10)
    return Number.isFinite(parsed) ? parsed : Number.NaN
  }

  return Number.NaN
}

function normalizeHora(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) {
    return trimmed
  }

  return `${match[1].padStart(2, '0')}:${match[2]}`
}

function inferCategoriaFromActividad(value: unknown): PlanEvent['categoria'] | '' {
  const activity = normalizeComparableText(value)

  if (!activity) {
    return ''
  }

  if (/(leer|estudi|practicar|aprender|curso|investigar|repasar)/.test(activity)) return 'estudio'
  if (/(caminar|correr|gim|entren|yoga|ejercicio|movilidad)/.test(activity)) return 'ejercicio'
  if (/(trabajo|laburo|cliente|reunion|oficina|proyecto)/.test(activity)) return 'trabajo'
  if (/(habito|rutina|constancia|diario|meditar|ordenar|hidratar)/.test(activity)) return 'habito'
  if (/(descans|pausa|siesta|ocio|desconectar|relajar)/.test(activity)) return 'descanso'
  return ''
}

function normalizeCategoria(value: unknown, actividad?: unknown): PlanEvent['categoria'] {
  const normalized = normalizeComparableText(value)

  if (normalized in categoryAliases) {
    return categoryAliases[normalized]
  }

  if (validCategories.includes(normalized as PlanEvent['categoria'])) {
    return normalized as PlanEvent['categoria']
  }

  return inferCategoriaFromActividad(actividad) || 'otro'
}

function normalizeGeneratedPlan(
  input: unknown,
  fallbackObjectiveId: string
): { nombre: string; resumen: string; eventos: PlanEvent[]; rawEventCount: number } {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const rawEventos = Array.isArray(source.eventos)
    ? source.eventos
    : Array.isArray(source.actividades)
      ? source.actividades
      : []

  const normalizedEvents = rawEventos
    .map((event): PlanEvent => {
      const rawEvent = event && typeof event === 'object' ? event as Record<string, unknown> : {}
      const actividad = normalizeText(
        rawEvent.actividad ?? rawEvent.descripcion ?? rawEvent.tarea ?? rawEvent.nombre
      )

      const normalizedEvent: PlanEvent = {
        semana: normalizeInteger(rawEvent.semana ?? rawEvent.week ?? rawEvent.orden),
        dia: normalizeComparableText(rawEvent.dia ?? rawEvent['d\u00eda'] ?? rawEvent.day),
        hora: normalizeHora(rawEvent.hora ?? rawEvent.horario ?? rawEvent.inicio),
        duracion: normalizeInteger(rawEvent.duracion ?? rawEvent['duraci\u00f3n'] ?? rawEvent.minutos),
        actividad,
        categoria: normalizeCategoria(rawEvent.categoria ?? rawEvent.tipo ?? rawEvent.area, actividad),
        objetivoId: normalizeText(
          rawEvent.objetivoId ?? rawEvent.objetivo_id ?? rawEvent.objetivo ?? fallbackObjectiveId
        ) || fallbackObjectiveId
      }

      return normalizedEvent
    })
    .flatMap((event) => {
      const parsed = planEventSchema.safeParse(event)
      return parsed.success ? [parsed.data] : []
    }) as PlanEvent[]

  return {
    nombre: normalizeText(source.nombre),
    resumen: normalizeText(source.resumen),
    eventos: normalizedEvents,
    rawEventCount: rawEventos.length
  }
}

function stripFormatting(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()
}

function extractFirstJsonObject(content: string): string {
  const cleaned = stripFormatting(content)
  const firstBrace = cleaned.indexOf('{')

  if (firstBrace < 0) {
    return cleaned
  }

  let depth = 0
  let inString = false
  let escaping = false

  for (let index = firstBrace; index < cleaned.length; index += 1) {
    const char = cleaned[index]

    if (inString) {
      if (escaping) {
        escaping = false
      } else if (char === '\\') {
        escaping = true
      } else if (char === '"') {
        inString = false
      }

      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      depth += 1
      continue
    }

    if (char === '}') {
      depth -= 1

      if (depth === 0) {
        return cleaned.slice(firstBrace, index + 1)
      }
    }
  }

  return cleaned.slice(firstBrace)
}

function buildUserPrompt(profile: Perfil): string {
  const p = profile.participantes[0]
  const obj = profile.objetivos[0]

  return [
    `Nombre: ${p.datosPersonales.nombre}`,
    `Edad: ${p.datosPersonales.edad}`,
    `Ciudad: ${p.datosPersonales.ubicacion.ciudad}`,
    `Ocupacion: ${p.datosPersonales.narrativaPersonal}`,
    `Objetivo principal: ${obj?.descripcion ?? 'No especificado'}`,
    `Horario: despierta ${p.rutinaDiaria.porDefecto.despertar}, duerme ${p.rutinaDiaria.porDefecto.dormir}`,
    `Trabajo: ${p.rutinaDiaria.porDefecto.trabajoInicio ?? 'sin horario fijo'} a ${p.rutinaDiaria.porDefecto.trabajoFin ?? ''}`,
    `Horas libres estimadas: ${p.calendario.horasLibresEstimadas.diasLaborales}h en dias laborales, ${p.calendario.horasLibresEstimadas.diasDescanso}h fines de semana`
  ].join('\n')
}

export const planBuilder: Skill = {
  name: 'plan-builder',
  tier: 'alto',
  getSystemPrompt(ctx: SkillContext): string {
    const lang = ctx.userLocale === 'es-AR'
      ? 'Respond in informal Argentine Spanish (voseo). Use plain language a grandmother would understand.'
      : 'Respond in plain, simple language.'

    return [
      'You are a life planning assistant. Given a user profile, generate a realistic 1-month action plan.',
      '',
      'RULES:',
      '- Create weekly schedules with specific days, times, and durations',
      '- Respect the user\'s work schedule and sleep hours',
      '- Never schedule tasks during work or sleep hours',
      '- Be realistic: don\'t overload the user. Max 2-3 new activities per day',
      '- Include rest and buffer time',
      '- Never use jargon: no "Q1", "milestone", "throughput". Use "enero-marzo", "hito", "carga"',
      '- Each activity must link to the user\'s stated goal',
      '',
      'OUTPUT FORMAT: Respond with ONLY a JSON object (no markdown, no explanation):',
      '{',
      '  "nombre": "plan name in user language",',
      '  "resumen": "2-3 sentence summary of the plan",',
      '  "eventos": [',
      '    {',
      '      "semana": 1,',
      '      "dia": "lunes",',
      '      "hora": "HH:MM",',
      '      "duracion": minutes_number,',
      '      "actividad": "description",',
      '      "categoria": "estudio|ejercicio|trabajo|habito|descanso|otro",',
      '      "objetivoId": "obj1"',
      '    }',
      '  ]',
      '}',
      '',
      lang
    ].join('\n')
  },
  async run(_runtime: AgentRuntime, _ctx: SkillContext): Promise<SkillResult> {
    return {
      success: true,
      filesWritten: [],
      summary: 'Plan builder ready',
      tokensUsed: { input: 0, output: 0 }
    }
  }
}

export async function generatePlan(
  runtime: AgentRuntime,
  profile: Perfil,
  ctx: SkillContext,
  options?: GeneratePlanOptions
): Promise<GeneratedPlan> {
  const systemPrompt = planBuilder.getSystemPrompt(ctx)
  const userPrompt = buildUserPrompt(profile)
  const fallbackObjectiveId = profile.objetivos[0]?.id ?? 'obj1'
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt }
  ]

  options?.onStageChange?.('generating')

  const response = options?.onToken && typeof runtime.streamChat === 'function'
    ? await runtime.streamChat(messages, options.onToken)
    : await runtime.chat(messages)

  if (options?.onToken && typeof runtime.streamChat !== 'function' && response.content) {
    options.onToken(response.content)
  }

  try {
    options?.onStageChange?.('validating')
    const extractedJson = extractFirstJsonObject(response.content)
    const parsed = JSON.parse(extractedJson)
    const normalized = normalizeGeneratedPlan(parsed, fallbackObjectiveId)

    if (normalized.rawEventCount > 0 && normalized.eventos.length === 0) {
      throw new Error('No valid events after normalization')
    }

    const validated = generatedPlanSchema.parse({
      nombre: normalized.nombre,
      resumen: normalized.resumen,
      eventos: normalized.eventos as PlanEvent[]
    })

    return {
      nombre: validated.nombre,
      resumen: validated.resumen,
      eventos: validated.eventos as PlanEvent[],
      tokensUsed: {
        input: response.usage.promptTokens,
        output: response.usage.completionTokens
      }
    }
  } catch {
    throw new Error('El asistente no pudo generar un plan valido. Intentalo de nuevo.')
  }
}
