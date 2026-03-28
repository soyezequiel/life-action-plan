import type { AgentRuntime, LLMMessage } from '../../runtime/types'
import { strategicPlanDraftSchema, type GoalDraft, type StrategicPlanDraft } from '../../../shared/schemas/flow'
import type { Perfil } from '../../../shared/schemas/perfil'
import type { FlowTaskProgress } from '../../../shared/types/flow-api'

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
  if (firstBrace < 0) return cleaned

  let depth = 0
  let inString = false
  let escaping = false

  for (let i = firstBrace; i < cleaned.length; i++) {
    const char = cleaned[i]
    if (inString) {
      if (escaping) escaping = false
      else if (char === '\\') escaping = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') { inString = true; continue }
    if (char === '{') { depth++; continue }
    if (char === '}') {
      depth--
      if (depth === 0) return cleaned.slice(firstBrace, i + 1)
    }
  }
  return cleaned.slice(firstBrace)
}

function buildStrategyMessages(goals: GoalDraft[], profile: Perfil, fallback: StrategicPlanDraft): LLMMessage[] {
  return [
    {
      role: 'system',
      content: [
        'Sos el estratega de LAP.',
        'Tu objetivo es diseñar un plan estratégico realista y accionable basado en las metas del usuario y su disponibilidad.',
        'Reglas:',
        '- Expandí las fases y sus descripciones para que no sean genéricas. Dales contexto específico basado en el perfil y las restricciones.',
        '- El plan debe estar pensado como si lo fuera a ejecutar una persona real, no un robot.',
        '- Ajustá los hitos y métricas para que sean útiles y evidencien progreso claro en la realidad.',
        '- Identificá conflictos REALES (ej. si dos fases demandan mucho trabajo al mismo tiempo).',
        '- Devolvé SOLO un JSON válido sin Markdown. El JSON debe cumplir con el schema especificado.'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        goals: goals.map(g => ({ descripcion: g.text, prioridad: g.priority, esfuerzo: g.effort, hsSemanales: g.hoursPerWeek, meses: g.horizonMonths })),
        profileContext: {
          horasLaboralesDisponibles: profile.participantes[0]?.calendario?.horasLibresEstimadas?.diasLaborales ?? 0,
          horasDescansoDisponibles: profile.participantes[0]?.calendario?.horasLibresEstimadas?.diasDescanso ?? 0,
          problemasActuales: profile.participantes[0]?.problemasActuales ?? [],
          notasTemporales: profile.estadoDinamico?.notasTemporales ?? []
        },
        draftBasis: fallback,
        responseFormat: {
          title: "string corto y motivador",
          summary: "string (explicación de la estrategia general que vas a aplicar y por qué tiene sentido para esta persona)",
          totalMonths: "number",
          estimatedWeeklyHours: "number",
          phases: [
            {
              id: "string",
              title: "string",
              summary: "string",
              goalIds: ["string"],
              dependencies: ["string (opcional)"],
              startMonth: "number",
              endMonth: "number",
              hoursPerWeek: "number",
              milestone: "string",
              metrics: ["string"]
            }
          ],
          milestones: ["string"],
          conflicts: ["string"]
        }
      })
    }
  ]
}

export async function generateStrategyWithAgent(input: {
  runtime: AgentRuntime
  goals: GoalDraft[]
  profile: Perfil
  fallbackStrategy: StrategicPlanDraft
}, onProgress?: (msg: FlowTaskProgress) => void): Promise<StrategicPlanDraft> {
  onProgress?.({ workflowId: '...', step: 'strategy', stage: 'thinking', current: 2, total: 5, message: 'El agente estratega está armando las fases...' })

  try {
    const response = await input.runtime.chat(buildStrategyMessages(input.goals, input.profile, input.fallbackStrategy))
    const extracted = extractFirstJsonObject(response.content)
    const parsed = strategicPlanDraftSchema.parse(JSON.parse(extracted))
    return parsed
  } catch (error) {
    console.warn('Strategy agent failed, returning fallback.', error)
    return input.fallbackStrategy
  }
}
