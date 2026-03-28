import { DateTime } from 'luxon'
import { z } from 'zod'
import type { Perfil } from '../../../shared/schemas/perfil'
import type {
  StrategicPlanDraft
} from '../../../shared/schemas/flow'
import type {
  SimActionLogEntry,
  SimDisruption,
  SimFinding,
  SimGoalBreakdownEntry,
  SimNode,
  SimResponse
} from '../../../shared/schemas/simulation-tree'
import type { SimPersona } from '../../../shared/schemas/persona-profile'
import type { FlowTaskProgress } from '../../../shared/types/flow-api'
import type { AgentRuntime, LLMMessage } from '../../runtime/types'
import { extractFirstJsonObject } from './llm-json-parser'

export interface UserAgentInput {
  runtime: AgentRuntime
  node: SimNode
  disruptions: SimDisruption[]
  strategy: StrategicPlanDraft
  profile: Perfil
  goalPriorities: Array<{ id: string; priority: number }>
  persona?: SimPersona | null
  onProgress?: (progress: Partial<FlowTaskProgress>) => void
}

export interface UserAgentOutput {
  responses: SimResponse[]
  actualHours: number
  qualityScore: number
  goalBreakdown: SimNode['goalBreakdown']
  personalFindings: SimFinding[]
  actionLog: SimActionLogEntry[]
}

const userAgentResponseSchema = z.object({
  responses: z.array(z.object({
    id: z.string(),
    action: z.enum(['reschedule', 'skip', 'reduce', 'swap', 'push_back', 'absorb']),
    description: z.string(),
    hoursRecovered: z.number().min(0),
    tradeoff: z.string().nullable().default(null)
  })).default([]),
  actualHours: z.number().min(0),
  qualityScore: z.number().min(0).max(100),
  goalBreakdown: z.record(z.string(), z.object({
    plannedHours: z.number().min(0),
    requiredHours: z.number().min(0).default(0),
    actualHours: z.number().min(0).nullable(),
    status: z.enum(['on_track', 'behind', 'ahead', 'blocked', 'skipped'])
  })).default({}),
  personalFindings: z.array(z.object({
    id: z.string(),
    severity: z.enum(['critical', 'warning', 'info']),
    message: z.string(),
    nodeId: z.string(),
    target: z.enum(['tree', 'strategy']).default('tree'),
    suggestedFix: z.string().nullable().default(null)
  })).default([])
})

function nowIso(): string {
  return DateTime.utc().toISO() ?? '2026-01-01T00:00:00.000Z'
}

export function userAgentFallback(node: SimNode, disruptions: SimDisruption[]): UserAgentOutput {
  const totalImpactHours = disruptions.reduce((sum, d) => sum + d.impactHours, 0)
  const actualHours = Math.max(0, node.plannedHours - totalImpactHours)
  const qualityScore = node.plannedHours > 0
    ? Math.round((actualHours / node.plannedHours) * 100)
    : 100

  const responses: SimResponse[] = disruptions.map((d, i) => ({
    id: `r-${node.id}-${i + 1}`,
    action: 'absorb' as const,
    description: `Absorber la disrupción "${d.description.slice(0, 60)}".`,
    hoursRecovered: 0,
    tradeoff: null
  }))

  // Update goalBreakdown using actual hours proportionally
  const updatedBreakdown: SimNode['goalBreakdown'] = {}
  for (const [goalId, entry] of Object.entries(node.goalBreakdown)) {
    const ratio = node.plannedHours > 0 ? actualHours / node.plannedHours : 1
    const goalActual = Math.round(entry.plannedHours * ratio * 10) / 10
    const status: SimGoalBreakdownEntry['status'] = goalActual >= entry.requiredHours
      ? 'on_track'
      : goalActual <= 0
        ? 'skipped'
        : 'behind'
    updatedBreakdown[goalId] = {
      ...entry,
      actualHours: goalActual,
      status
    }
  }

  const fallbackLog: SimActionLogEntry = {
    step: 1,
    timestamp: nowIso(),
    phase: 'observe',
    agentRole: 'yo',
    content: `Fallback heurístico: ${Math.round(actualHours * 10) / 10}h reales de ${node.plannedHours}h planificadas. ${disruptions.length} disrupción(es) absorbida(s).`,
    toolUsed: null,
    durationMs: 0
  }

  return {
    responses,
    actualHours: Math.round(actualHours * 10) / 10,
    qualityScore,
    goalBreakdown: updatedBreakdown,
    personalFindings: [],
    actionLog: [fallbackLog]
  }
}

function buildCompactProfile(profile: Perfil): string {
  const p = profile.participantes[0]
  if (!p) return 'Perfil no disponible.'
  return [
    `Ocupación: ${p.datosPersonales.narrativaPersonal || 'no especificada'}`,
    `Mejor momento: ${p.patronesEnergia.cronotipo}`,
    `Horas laborales libres: ${p.calendario.horasLibresEstimadas.diasLaborales}h`
  ].join('. ')
}

function buildPersonaBlock(persona: SimPersona | null | undefined): string {
  if (!persona) return ''
  return `
PERSONALIDAD SIMULADA:
- Tipo: ${persona.personalityType}
- Patrón de energía: ${persona.energyPattern}
- Reacción al estrés: ${persona.stressResponse}
- Estilo de motivación: ${persona.motivationStyle}
- Fortalezas: ${persona.strengths.join(', ')}
- Debilidades: ${persona.weaknesses.join(', ')}
- Puntos probables de falla: ${persona.likelyFailurePoints.join(', ') || 'ninguno identificado'}
- Narrativa: ${persona.narrative}`
}

/**
 * ReACT loop: el user-agent razona, actúa y observa en pasos separados.
 * Inspirado en el ReportAgent de MiroFish-Offline.
 *
 * Iteración 1 — REASON: analizar disrupciones y contexto
 * Iteración 2 — ACT: decidir respuestas concretas
 * Iteración 3 — OBSERVE: calcular resultado final (JSON estructurado)
 */
export async function runUserAgent(input: UserAgentInput): Promise<UserAgentOutput> {
  const { runtime, node, disruptions, profile, goalPriorities, persona, onProgress } = input
  const actionLog: SimActionLogEntry[] = []
  let stepCounter = 0

  const prioritiesText = goalPriorities
    .sort((a, b) => a.priority - b.priority)
    .map((gp) => `Prioridad ${gp.priority}: ${gp.id}`)
    .join(', ')

  const goalBreakdownText = Object.entries(node.goalBreakdown)
    .map(([id, entry]) =>
      `${id}: planificado=${entry.plannedHours}h, requerido=${entry.requiredHours}h`
    )
    .join('\n')

  const personaBlock = buildPersonaBlock(persona)

  const systemPrompt = `Sos el simulador de decisiones del usuario en LAP.
Representás a una persona real con estas características:
- Perfil: ${buildCompactProfile(profile)}
- Prioridades: ${prioritiesText}
${personaBlock}

Periodo: ${node.label} (${node.period.start} a ${node.period.end})
Horas planificadas: ${node.plannedHours}h

Disrupciones en este periodo:
${JSON.stringify(disruptions, null, 2)}

Desglose por objetivo (planned = horas con fase activa, required = horas que el goal necesita):
${goalBreakdownText}

Si un objetivo tiene requiredHours > plannedHours, significa que el plan NO le asigna suficiente tiempo.
Eso es un problema del plan, no del usuario. Mencionalo como finding si es significativo.

IMPORTANTE: actualHours NUNCA puede ser mayor que ${node.plannedHours} (no se puede crear tiempo).`

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt }
  ]

  try {
    const STEP_TIMEOUT = 120000

    // ============ STEP 1: REASON ============
    onProgress?.({ reactPhase: 'reason', message: `Analizando disrupciones en ${node.label}...` })
    const reasonStart = Date.now()

    messages.push({
      role: 'user',
      content: `PASO 1 — REASON: Analizá las ${disruptions.length} disrupción(es) y cómo afectan las metas según tu personalidad y situación. ¿Cuáles son prioritarias? ¿Cuáles podés absorber? Pensá en voz alta, no des JSON todavía.`
    })

    const reasonResponse = await Promise.race([
      runtime.chat(messages),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('REASON_TIMEOUT')), STEP_TIMEOUT))
    ])

    stepCounter += 1
    actionLog.push({
      step: stepCounter,
      timestamp: nowIso(),
      phase: 'reason',
      agentRole: 'yo',
      content: reasonResponse.content.slice(0, 2000),
      toolUsed: null,
      durationMs: Date.now() - reasonStart
    })

    messages.push({ role: 'assistant', content: reasonResponse.content })

    // ============ STEP 2: ACT ============
    onProgress?.({ reactPhase: 'act', message: `Decidiendo respuestas a disrupciones en ${node.label}...` })
    const actStart = Date.now()

    messages.push({
      role: 'user',
      content: `PASO 2 — ACT: Ahora decidí la respuesta concreta a cada disrupción. Para cada una, elegí una acción (reschedule, skip, reduce, swap, push_back, absorb) y explicá el tradeoff. Pensá en voz alta, no des JSON todavía.`
    })

    const actResponse = await Promise.race([
      runtime.chat(messages),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ACT_TIMEOUT')), STEP_TIMEOUT))
    ])

    stepCounter += 1
    actionLog.push({
      step: stepCounter,
      timestamp: nowIso(),
      phase: 'act',
      agentRole: 'yo',
      content: actResponse.content.slice(0, 2000),
      toolUsed: null,
      durationMs: Date.now() - actStart
    })

    messages.push({ role: 'assistant', content: actResponse.content })

    // ============ STEP 3: OBSERVE ============
    onProgress?.({ reactPhase: 'observe', message: `Calculando resultado final de ${node.label}...` })
    const observeStart = Date.now()

    messages.push({
      role: 'user',
      content: `PASO 3 — OBSERVE: Basándote en tu análisis y decisiones, calculá el resultado final. Respondé SOLO JSON válido:
{
  "responses": [{"id": "r-1", "action": "reschedule|skip|reduce|swap|push_back|absorb", "description": "...", "hoursRecovered": N, "tradeoff": "..."}],
  "actualHours": N,
  "qualityScore": N,
  "goalBreakdown": {"goal-id": {"plannedHours": N, "requiredHours": N, "actualHours": N, "status": "on_track|behind|ahead|blocked|skipped"}},
  "personalFindings": [{"id": "f-1", "severity": "critical|warning|info", "message": "...", "nodeId": "${node.id}", "target": "tree|strategy", "suggestedFix": "..."}]
}`
    })

    const observeResponse = await Promise.race([
      runtime.chat(messages),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('OBSERVE_TIMEOUT')), STEP_TIMEOUT))
    ])

    stepCounter += 1

    const parsed = userAgentResponseSchema.parse(
      JSON.parse(extractFirstJsonObject(observeResponse.content))
    )

    actionLog.push({
      step: stepCounter,
      timestamp: nowIso(),
      phase: 'observe',
      agentRole: 'yo',
      content: observeResponse.content.slice(0, 2000),
      toolUsed: null,
      durationMs: Date.now() - observeStart
    })

    // Clamp actualHours to never exceed plannedHours
    const actualHours = Math.min(parsed.actualHours, node.plannedHours)

    return {
      responses: parsed.responses,
      actualHours: Math.round(actualHours * 10) / 10,
      qualityScore: parsed.qualityScore,
      goalBreakdown: parsed.goalBreakdown,
      personalFindings: parsed.personalFindings.map((f) => ({
        ...f,
        nodeId: node.id,
        suggestedFix: f.suggestedFix ?? null
      })),
      actionLog
    }
  } catch {
    // If ReACT fails at any step, return whatever actionLog we collected + fallback
    const fallback = userAgentFallback(node, disruptions)
    return {
      ...fallback,
      actionLog: [...actionLog, ...fallback.actionLog]
    }
  }
}
