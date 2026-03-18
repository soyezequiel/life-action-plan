import type { Skill, AgentRuntime, SkillContext, SkillResult } from './skill-interface'
import type { Perfil } from '../shared/schemas/perfil'

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

  async run(runtime: AgentRuntime, ctx: SkillContext): Promise<SkillResult> {
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
  let parsed: { nombre: string; resumen: string; eventos: PlanEvent[] }
  try {
    // Strip markdown code fences if present
    const cleaned = response.content
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error('El asistente no pudo generar un plan válido. Intentá de nuevo.')
  }

  return {
    nombre: parsed.nombre,
    resumen: parsed.resumen,
    eventos: parsed.eventos ?? [],
    tokensUsed: {
      input: response.usage.promptTokens,
      output: response.usage.completionTokens
    }
  }
}
