import type { Skill, AgentRuntime, SkillContext, SkillResult } from './skill-interface'
import type { Perfil } from '../shared/schemas/perfil'
import { z } from 'zod'

/**
 * Plan Builder Core — Genera un plan de acción a 1 mes.
 *
 * Toma el perfil del Intake Express, lo envía al LLM con un system prompt
 * que genera una matriz de tareas/eventos semanales, y devuelve JSON
 * parseado para insertar en SQLite.
 */

export interface PlanEvent {
  semana: number
  dia: string // 'lunes' | 'martes' | etc.
  hora: string // HH:MM
  duracion: number // minutos
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

const planEventSchema = z.object({
  semana: z.number().int().min(1),
  dia: z.string().min(1),
  hora: z.string().regex(/^\d{2}:\d{2}$/),
  duracion: z.number().int().positive(),
  actividad: z.string().min(1),
  categoria: z.enum(['estudio', 'ejercicio', 'trabajo', 'habito', 'descanso', 'otro']),
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

function normalizeCategoria(value: unknown): PlanEvent['categoria'] | '' {
  const normalized = normalizeText(value).toLowerCase()
  const categorias: PlanEvent['categoria'][] = ['estudio', 'ejercicio', 'trabajo', 'habito', 'descanso', 'otro']

  return categorias.includes(normalized as PlanEvent['categoria'])
    ? normalized as PlanEvent['categoria']
    : ''
}

function normalizeGeneratedPlan(input: unknown) {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const rawEventos = Array.isArray(source.eventos) ? source.eventos : []

  return {
    nombre: normalizeText(source.nombre),
    resumen: normalizeText(source.resumen),
    eventos: rawEventos.map((event) => {
      const rawEvent = event && typeof event === 'object' ? event as Record<string, unknown> : {}

      return {
        semana: normalizeInteger(rawEvent.semana),
        dia: normalizeText(rawEvent.dia).toLowerCase(),
        hora: normalizeHora(rawEvent.hora),
        duracion: normalizeInteger(rawEvent.duracion),
        actividad: normalizeText(rawEvent.actividad),
        categoria: normalizeCategoria(rawEvent.categoria),
        objetivoId: normalizeText(rawEvent.objetivoId)
      }
    })
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
    `Ocupación: ${p.datosPersonales.narrativaPersonal}`,
    `Objetivo principal: ${obj?.descripcion ?? 'No especificado'}`,
    `Horario: despierta ${p.rutinaDiaria.porDefecto.despertar}, duerme ${p.rutinaDiaria.porDefecto.dormir}`,
    `Trabajo: ${p.rutinaDiaria.porDefecto.trabajoInicio ?? 'sin horario fijo'} a ${p.rutinaDiaria.porDefecto.trabajoFin ?? ''}`,
    `Horas libres estimadas: ${p.calendario.horasLibresEstimadas.diasLaborales}h en días laborales, ${p.calendario.horasLibresEstimadas.diasDescanso}h fines de semana`
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
    // This is called from the IPC handler with the profile already loaded
    // The actual execution is in generatePlan() below
    return {
      success: true,
      filesWritten: [],
      summary: 'Plan builder ready',
      tokensUsed: { input: 0, output: 0 }
    }
  }
}

/**
 * Generates a plan by calling the LLM with the profile data.
 * Called from the main process IPC handler.
 */
export async function generatePlan(
  runtime: AgentRuntime,
  profile: Perfil,
  ctx: SkillContext
): Promise<GeneratedPlan> {
  const systemPrompt = planBuilder.getSystemPrompt(ctx)
  const userPrompt = buildUserPrompt(profile)

  const response = await runtime.chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ])

  // Parse the JSON response
  try {
    const extractedJson = extractFirstJsonObject(response.content)
    const parsed = JSON.parse(extractedJson)
    const validated = generatedPlanSchema.parse(normalizeGeneratedPlan(parsed))

    return {
      nombre: validated.nombre,
      resumen: validated.resumen,
      eventos: validated.eventos,
      tokensUsed: {
        input: response.usage.promptTokens,
        output: response.usage.completionTokens
      }
    }
  } catch {
    throw new Error('El asistente no pudo generar un plan válido. Intentá de nuevo.')
  }
}
