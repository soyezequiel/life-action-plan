import { DateTime } from 'luxon'
import type { Perfil } from '../../../shared/schemas/perfil'
import type { GoalDraft } from '../../../shared/schemas/flow'
import { simPersonaSchema, type SimPersona } from '../../../shared/schemas/persona-profile'
import type { AgentRuntime } from '../../runtime/types'
import { extractFirstJsonObject } from './llm-json-parser'

/**
 * PersonaBuilder: genera un SimPersona a partir del Perfil del intake.
 *
 * Dos modos:
 * - Con LLM: prompt que sintetiza personalidad a partir de las respuestas
 * - Sin LLM (fallback): mapeo determinista de campos del perfil
 *
 * Inspirado en OasisProfileGenerator de MiroFish-Offline.
 */

function nowIso(): string {
  return DateTime.utc().toISO() ?? '2026-01-01T00:00:00.000Z'
}

function buildProfileContext(profile: Perfil, goals: GoalDraft[]): string {
  const p = profile.participantes[0]
  if (!p) return 'Sin datos de participante.'

  const parts: string[] = [
    `Nombre: ${p.datosPersonales.nombre}`,
    `Edad: ${p.datosPersonales.edad}`,
    `Ocupación: ${p.datosPersonales.narrativaPersonal || 'no especificada'}`,
    `Cronotipo: ${p.patronesEnergia.cronotipo}`,
    `Pico energía: ${p.patronesEnergia.horarioPicoEnergia}`,
    `Bajo energía: ${p.patronesEnergia.horarioBajoEnergia}`,
    `Horas productivas máximas: ${p.patronesEnergia.horasProductivasMaximas}h`,
    `Horas libres laborales: ${p.calendario.horasLibresEstimadas.diasLaborales}h`,
    `Horas libres descanso: ${p.calendario.horasLibresEstimadas.diasDescanso}h`,
    `Dependientes: ${p.dependientes.length}`
  ]

  if (p.condicionesSalud.length > 0) {
    parts.push(`Condiciones de salud: ${p.condicionesSalud.map((c) => c.condicion).join(', ')}`)
  }

  if (p.problemasActuales.length > 0) {
    parts.push(`Problemas actuales: ${p.problemasActuales.slice(0, 3).join(', ')}`)
  }

  if (p.patronesConocidos.tendencias.length > 0) {
    parts.push(`Tendencias conocidas: ${p.patronesConocidos.tendencias.slice(0, 3).join(', ')}`)
  }

  if (p.patronesConocidos.diaTipicoBueno) {
    parts.push(`Día bueno típico: ${p.patronesConocidos.diaTipicoBueno}`)
  }

  if (p.patronesConocidos.diaTipicoMalo) {
    parts.push(`Día malo típico: ${p.patronesConocidos.diaTipicoMalo}`)
  }

  const goalsText = goals
    .map((g) => `- ${g.text} (prioridad ${g.priority}, ${g.hoursPerWeek}h/sem, ${g.horizonMonths} meses)`)
    .join('\n')

  parts.push(`\nMetas:\n${goalsText}`)

  return parts.join('\n')
}

const systemPrompt = `Sos un psicólogo conductual especializado en productividad personal.
Tu trabajo es construir un perfil de personalidad simulado de una persona real,
basándote en los datos de su intake y sus metas.

Este perfil se usará para simular cómo esta persona reaccionaría a disrupciones,
momentos de baja motivación y presión de plazos.

REGLAS:
1. Sé realista, no idealista. Basate en los patrones descritos.
2. La narrativa debe ser en tercera persona, 3-4 oraciones.
3. Los strengths y weaknesses deben ser específicos al contexto de esta persona.
4. likelyFailurePoints son los momentos donde esta persona probablemente abandonaría o fallaría.
5. Respondé SOLO JSON válido.

JSON esperado:
{
  "name": "string",
  "age": number,
  "occupation": "string",
  "personalityType": "disciplinado|flexible|procrastinador|perfeccionista|impulsivo|constante",
  "energyPattern": "matutino|vespertino|neutro",
  "stressResponse": "evita|enfrenta|posterga|se_paraliza|busca_ayuda",
  "motivationStyle": "intrinseca|extrinseca|social|por_deadline",
  "strengths": ["string (máx 5)"],
  "weaknesses": ["string (máx 5)"],
  "likelyFailurePoints": ["string (máx 5)"],
  "dependents": number,
  "healthConditions": ["string"],
  "weekdayFreeHours": number,
  "weekendFreeHours": number,
  "narrative": "string (3-4 oraciones en tercera persona)"
}`

export function buildPersonaFromRules(profile: Perfil, goals: GoalDraft[]): SimPersona {
  const p = profile.participantes[0]
  if (!p) {
    return {
      name: 'Usuario',
      age: 30,
      occupation: 'no especificada',
      personalityType: 'flexible',
      energyPattern: 'neutro',
      stressResponse: 'enfrenta',
      motivationStyle: 'intrinseca',
      strengths: ['Tiene objetivos definidos'],
      weaknesses: ['Información limitada para evaluar'],
      likelyFailurePoints: [],
      dependents: 0,
      healthConditions: [],
      weekdayFreeHours: 2,
      weekendFreeHours: 4,
      narrative: 'Usuario que busca organizar su vida con un plan de acción. Sin datos suficientes para un perfil detallado.',
      generatedWith: 'rules',
      generatedAt: nowIso()
    }
  }

  const totalWeeklyGoalHours = goals.reduce((sum, g) => sum + g.hoursPerWeek, 0)
  const freeHoursWeekly = (p.calendario.horasLibresEstimadas.diasLaborales * 5) +
    (p.calendario.horasLibresEstimadas.diasDescanso * 2)
  const loadRatio = freeHoursWeekly > 0 ? totalWeeklyGoalHours / freeHoursWeekly : 1

  // Infer personality type from patterns
  let personalityType: SimPersona['personalityType'] = 'flexible'
  if (p.patronesConocidos.tendencias.some((t) => /procrastin/i.test(t))) {
    personalityType = 'procrastinador'
  } else if (p.patronesConocidos.tendencias.some((t) => /perfeccion/i.test(t))) {
    personalityType = 'perfeccionista'
  } else if (p.patronesConocidos.tendencias.some((t) => /disciplin|constancia|habit/i.test(t))) {
    personalityType = 'disciplinado'
  }

  // Infer stress response
  let stressResponse: SimPersona['stressResponse'] = 'enfrenta'
  if (p.patronesConocidos.diaTipicoMalo.includes('evit')) stressResponse = 'evita'
  else if (p.patronesConocidos.diaTipicoMalo.includes('posterg')) stressResponse = 'posterga'

  const strengths: string[] = ['Tiene objetivos claros']
  if (p.calendario.horasLibresEstimadas.diasDescanso >= 4) {
    strengths.push('Buena disponibilidad en fines de semana')
  }
  if (goals.length <= 2) {
    strengths.push('Foco concentrado en pocas metas')
  }

  const weaknesses: string[] = []
  if (loadRatio > 0.8) {
    weaknesses.push('Carga semanal muy ajustada al tiempo libre')
  }
  if (p.dependientes.length > 0) {
    weaknesses.push(`Responsabilidades de cuidado (${p.dependientes.length} dependiente(s))`)
  }
  if (p.condicionesSalud.length > 0) {
    weaknesses.push(`Condiciones de salud que pueden afectar la ejecución`)
  }
  if (weaknesses.length === 0) {
    weaknesses.push('Horas disponibles pueden ser optimistas')
  }

  const likelyFailurePoints: string[] = []
  if (loadRatio > 0.9) {
    likelyFailurePoints.push('Semanas con cualquier imprevisto desbordan la capacidad')
  }
  if (personalityType === 'procrastinador') {
    likelyFailurePoints.push('Primeras semanas de hábitos nuevos antes de que se consoliden')
  }

  const narrative = [
    `${p.datosPersonales.nombre}, ${p.datosPersonales.edad} años, ${p.datosPersonales.narrativaPersonal || 'sin ocupación especificada'}.`,
    `Persona de tipo ${personalityType} con cronotipo ${p.patronesEnergia.cronotipo}.`,
    loadRatio > 0.7
      ? `Su plan demanda el ${Math.round(loadRatio * 100)}% de su tiempo libre disponible, lo que deja poco margen.`
      : `Su plan usa el ${Math.round(loadRatio * 100)}% de su tiempo libre, con margen razonable.`,
    p.dependientes.length > 0
      ? `Tiene ${p.dependientes.length} dependiente(s) que pueden generar interrupciones.`
      : ''
  ].filter(Boolean).join(' ')

  return {
    name: p.datosPersonales.nombre,
    age: p.datosPersonales.edad,
    occupation: p.datosPersonales.narrativaPersonal || 'no especificada',
    personalityType,
    energyPattern: p.patronesEnergia.cronotipo,
    stressResponse,
    motivationStyle: 'intrinseca',
    strengths,
    weaknesses,
    likelyFailurePoints,
    dependents: p.dependientes.length,
    healthConditions: p.condicionesSalud.map((c) => c.condicion),
    weekdayFreeHours: p.calendario.horasLibresEstimadas.diasLaborales,
    weekendFreeHours: p.calendario.horasLibresEstimadas.diasDescanso,
    narrative,
    generatedWith: 'rules',
    generatedAt: nowIso()
  }
}

export async function buildPersonaWithAgent(input: {
  runtime: AgentRuntime
  profile: Perfil
  goals: GoalDraft[]
}): Promise<SimPersona> {
  const { runtime, profile, goals } = input
  const context = buildProfileContext(profile, goals)

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('PERSONA_BUILDER_TIMEOUT')), 120000)
    })

    const chatPromise = runtime.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generá el perfil de personalidad simulado para esta persona:\n\n${context}` }
    ])

    const response = await Promise.race([chatPromise, timeoutPromise])
    const extracted = extractFirstJsonObject(response.content)
    const parsed = simPersonaSchema.omit({ generatedWith: true, generatedAt: true }).parse(
      JSON.parse(extracted)
    )

    return {
      ...parsed,
      generatedWith: 'llm',
      generatedAt: nowIso()
    }
  } catch {
    return buildPersonaFromRules(profile, goals)
  }
}
