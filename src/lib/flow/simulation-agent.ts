import { z } from 'zod'
import type { AgentRuntime, LLMMessage } from '../runtime/types'
import type {
  RealityCheckResult,
  StrategicPlanDraft,
  StrategicSimulationSnapshot
} from '../../shared/schemas/flow'

const simulationReviewSchema = z.object({
  reviewSummary: z.string().trim().min(1).max(360),
  checkedAreas: z.array(z.string().trim().min(1).max(200)).min(3).max(6),
  extraFindings: z.array(z.string().trim().min(1).max(240)).max(5).default([])
}).strict()

export interface GeneratedSimulationReview {
  reviewSummary: string
  checkedAreas: string[]
  extraFindings: string[]
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

function compactStrategy(strategy: StrategicPlanDraft): string {
  return JSON.stringify({
    title: strategy.title,
    summary: strategy.summary,
    totalMonths: strategy.totalMonths,
    estimatedWeeklyHours: strategy.estimatedWeeklyHours,
    phases: strategy.phases.map((phase) => ({
      title: phase.title,
      summary: phase.summary,
      startMonth: phase.startMonth,
      endMonth: phase.endMonth,
      hoursPerWeek: phase.hoursPerWeek,
      milestone: phase.milestone,
      metrics: phase.metrics
    })),
    conflicts: strategy.conflicts
  })
}

function compactReality(realityCheck: RealityCheckResult): string {
  return JSON.stringify({
    status: realityCheck.status,
    availableHours: realityCheck.availableHours,
    neededHours: realityCheck.neededHours,
    summary: realityCheck.summary,
    recommendations: realityCheck.recommendations,
    adjustmentsApplied: realityCheck.adjustmentsApplied
  })
}

function compactSimulation(simulation: StrategicSimulationSnapshot): string {
  return JSON.stringify({
    finalStatus: simulation.finalStatus,
    reviewSummary: simulation.reviewSummary,
    checkedAreas: simulation.checkedAreas,
    findings: simulation.findings,
    iterations: simulation.iterations
  })
}

export async function generateSimulationReviewWithAgent(input: {
  runtime: AgentRuntime
  strategy: StrategicPlanDraft
  realityCheck: RealityCheckResult
  deterministicSimulation: StrategicSimulationSnapshot
}): Promise<GeneratedSimulationReview> {
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: [
        'Eres un planner senior.',
        'Revisas una simulacion estrategica ya calculada y la explicas mejor.',
        'No inventes capacidades magicas ni diagnosticos grandilocuentes.',
        'Debes responder solo JSON valido.',
        'JSON esperado:',
        '{',
        '  "reviewSummary": "explicacion clara de que valido y que conclusion saco",',
        '  "checkedAreas": ["3 a 6 chequeos concretos que hiciste"],',
        '  "extraFindings": ["hallazgos puntuales y accionables sin repetir lo obvio"]',
        '}'
      ].join(' ')
    },
    {
      role: 'user',
      content: [
        'Plan estrategico:',
        compactStrategy(input.strategy),
        'Chequeo de realidad:',
        compactReality(input.realityCheck),
        'Simulacion deterministica base:',
        compactSimulation(input.deterministicSimulation),
        'Objetivo: explicar con claridad como se simulo, que se puso a prueba y que conclusion practica sale.',
        'No repitas textos literales del input si puedes decirlos mas claro.',
        'No menciones que eres un modelo.'
      ].join('\n')
    }
  ]

  const response = await input.runtime.chat(messages)
  const parsed = simulationReviewSchema.parse(JSON.parse(extractFirstJsonObject(response.content)))

  return {
    reviewSummary: parsed.reviewSummary,
    checkedAreas: parsed.checkedAreas,
    extraFindings: parsed.extraFindings
  }
}
