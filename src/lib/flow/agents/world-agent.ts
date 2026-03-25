import { z } from 'zod'
import type { Perfil } from '../../../shared/schemas/perfil'
import type {
  GoalDraft,
  RealityCheckResult,
  StrategicPlanDraft
} from '../../../shared/schemas/flow'
import type { SimDisruption, SimNode } from '../../../shared/schemas/simulation-tree'
import type { SimPersona } from '../../../shared/schemas/persona-profile'
import type { AgentRuntime } from '../../runtime/types'
import { extractFirstJsonObject } from './llm-json-parser'

export interface WorldAgentInput {
  runtime: AgentRuntime
  node: SimNode
  strategy: StrategicPlanDraft
  profile: Perfil
  realityCheck: RealityCheckResult
  goals: GoalDraft[]
  persona?: SimPersona | null
  parentContext?: string
  traceId?: string | null
}

export interface WorldAgentOutput {
  disruptions: SimDisruption[]
  environmentSummary: string
  difficultyScore: number
}

const worldAgentResponseSchema = z.object({
  disruptions: z.array(z.object({
    id: z.string(),
    type: z.enum(['schedule_conflict', 'energy_drop', 'external_event', 'dependency_delay', 'motivation_loss', 'health_issue']),
    description: z.string(),
    impactHours: z.number().min(0),
    affectedGoalIds: z.array(z.string()).default([])
  })).max(4).default([]),
  environmentSummary: z.string().trim().min(1).max(300),
  difficultyScore: z.number().min(1).max(10)
})

function seededRandom(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  return Math.abs(hash % 1000) / 1000
}

export function worldAgentFallback(node: SimNode, strategy: StrategicPlanDraft): WorldAgentOutput {
  const rand = seededRandom(node.id)
  const plannedHours = node.plannedHours

  const disruptions: SimDisruption[] = []
  const rand2 = seededRandom(`${node.id}-2`)

  if (rand > 0.3) {
    const impactHours = plannedHours * (0.05 + rand * 0.15)
    const types: SimDisruption['type'][] = ['schedule_conflict', 'energy_drop', 'external_event']
    const type = types[Math.floor(rand2 * types.length)] ?? 'energy_drop'
    const affectedGoalIds = strategy.phases
      .filter((p) => {
        const nodeMonth = node.label.includes('Mes')
          ? Number.parseInt(node.id.replace('month-', ''), 10)
          : 0
        return nodeMonth === 0 || (p.startMonth <= nodeMonth && p.endMonth >= nodeMonth)
      })
      .flatMap((p) => p.goalIds)
      .slice(0, 1)

    disruptions.push({
      id: `d-${node.id}-1`,
      type,
      description: type === 'schedule_conflict'
        ? 'Semana con obligaciones inesperadas que compiten por el tiempo disponible.'
        : type === 'energy_drop'
          ? 'Energía más baja de lo habitual, menor capacidad para bloques largos.'
          : 'Evento externo que requirió atención fuera del plan.',
      impactHours: Math.round(impactHours * 10) / 10,
      affectedGoalIds
    })
  }

  const difficultyScore = Math.round(3 + rand * 5)

  return {
    disruptions,
    environmentSummary: disruptions.length > 0
      ? `Período con ${disruptions.length} evento(s) que impactan la disponibilidad.`
      : 'Período sin disrupciones significativas.',
    difficultyScore
  }
}

function buildCompactProfile(profile: Perfil): string {
  const p = profile.participantes[0]
  if (!p) return 'Perfil no disponible.'

  const parts: string[] = [
    `Ocupación: ${p.datosPersonales.narrativaPersonal || 'no especificada'}`,
    `Horas libres laborales: ${p.calendario.horasLibresEstimadas.diasLaborales}h, fines de semana: ${p.calendario.horasLibresEstimadas.diasDescanso}h`
  ]
  if (p.problemasActuales.length > 0) parts.push(`Restricciones: ${p.problemasActuales.slice(0, 2).join(', ')}`)
  return parts.join('. ')
}

export async function runWorldAgent(input: WorldAgentInput): Promise<WorldAgentOutput> {
  const { runtime, node, strategy, profile, realityCheck, goals, persona } = input
  const availableHours = realityCheck.availableHours
  const planned = node.plannedHours

  const highImpact = `${(planned * 0.15).toFixed(1)}-${(planned * 0.25).toFixed(1)}`
  const medImpact = `${(planned * 0.05).toFixed(1)}-${(planned * 0.15).toFixed(1)}`
  const lowImpact = `${(planned * 0.01).toFixed(1)}-${(planned * 0.05).toFixed(1)}`

  const nodeMonthIndex = node.id.startsWith('month-')
    ? Number.parseInt(node.id.replace('month-', ''), 10)
    : null

  const activeGoals = nodeMonthIndex
    ? strategy.phases
        .filter((p) => p.startMonth <= nodeMonthIndex && p.endMonth >= nodeMonthIndex)
        .map((p) => {
          const goalNames = p.goalIds.map((id) => goals.find((g) => g.id === id)?.text ?? id).join(', ')
          return `- ${p.title}: ${goalNames} (${p.hoursPerWeek}h/semana)`
        })
        .join('\n')
    : 'No determinable para esta granularidad.'

  const uncoveredGoals = goals
    .filter((g) => {
      if (!nodeMonthIndex) return false
      const covered = strategy.phases
        .filter((p) => p.goalIds.includes(g.id))
        .some((p) => p.startMonth <= nodeMonthIndex && p.endMonth >= nodeMonthIndex)
      return !covered && nodeMonthIndex <= g.horizonMonths
    })
    .map((g) => `- ${g.text} (deadline: mes ${g.horizonMonths})`)
    .join('\n')

  const systemPrompt = `Sos el simulador de entorno de LAP.
Tu trabajo es generar disrupciones REALISTAS para el periodo: ${node.label} (${node.period.start} a ${node.period.end}).

Contexto del usuario:
- Perfil: ${buildCompactProfile(profile)}
- Horas planificadas en este periodo: ${planned}h
- Horas disponibles según reality check: ${availableHours}h/semana

OBJETIVOS ACTIVOS en este periodo (con fases planificadas):
${activeGoals || 'Ninguno identificado.'}

OBJETIVOS SIN COBERTURA en este periodo (tienen deadline pero no tienen fase activa):
${uncoveredGoals || 'Ninguno.'}
Si hay objetivos sin cobertura, eso PUEDE ser fuente de disrupción.

ESCALA DE REFERENCIA para impactHours:
- Este periodo tiene ${planned}h planificadas.
- Disrupción ALTA: impacta ${highImpact}h
- Disrupción MEDIA: impacta ${medImpact}h
- Disrupción BAJA: impacta ${lowImpact}h
Respetá esta escala. No generes impactos desproporcionados.

REGLAS:
1. Genera entre 0 y 4 disrupciones por periodo.
2. Las disrupciones deben ser PROPORCIONALES a la granularidad del periodo.
3. No inventes catástrofes improbables. Sé realista con el perfil.
4. Responde SOLO JSON válido.

JSON esperado:
{
  "disruptions": [
    { "id": "d-1", "type": "schedule_conflict|energy_drop|external_event|dependency_delay|motivation_loss|health_issue", "description": "...", "impactHours": N, "affectedGoalIds": ["..."] }
  ],
  "environmentSummary": "resumen de 1 línea del entorno simulado",
  "difficultyScore": N
}${persona ? `

CONTEXTO DE PERSONALIDAD del usuario (usá esto para generar disrupciones más realistas):
- Tipo: ${persona.personalityType}
- Reacción al estrés: ${persona.stressResponse}
- Puntos de falla: ${persona.likelyFailurePoints.join(', ') || 'no identificados'}
- Debilidades: ${persona.weaknesses.join(', ')}` : ''}`

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('WORLD_AGENT_TIMEOUT')), 120000)
    })

    const chatPromise = runtime.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generá las disrupciones para el periodo ${node.label}.` }
    ])

    const response = await Promise.race([chatPromise, timeoutPromise])
    const parsed = worldAgentResponseSchema.parse(
      JSON.parse(extractFirstJsonObject(response.content))
    )

    return {
      disruptions: parsed.disruptions.map((d) => ({
        id: d.id,
        type: d.type,
        description: d.description,
        impactHours: Math.max(0, d.impactHours),
        affectedGoalIds: d.affectedGoalIds
      })),
      environmentSummary: parsed.environmentSummary,
      difficultyScore: parsed.difficultyScore
    }
  } catch {
    return worldAgentFallback(node, strategy)
  }
}
