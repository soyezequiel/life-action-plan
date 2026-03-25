import { z } from 'zod'
import type { AgentRuntime, LLMMessage } from '../runtime/types'
import { extractFirstJsonObject } from './agents/llm-json-parser'
import type {
  RealityCheckResult,
  StrategicPlanDraft,
  StrategicSimulationSnapshot
} from '../../shared/schemas/flow'

const simulationReviewSchema = z.object({
  reviewSummary: z.string().trim().min(1).max(2000),
  checkedAreas: z.array(z.string().trim().min(1).max(200)).min(3).max(6),
  extraFindings: z.array(z.string().trim().min(1).max(240)).max(5).default([])
}).strict()

export interface GeneratedSimulationReview {
  reviewSummary: string
  checkedAreas: string[]
  extraFindings: string[]
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
        'Eres el agente simulador de LAP.',
        'Tu trabajo no es solo hacer un resumen gerencial, sino ponerte en la piel del usuario y hacer una simulación cronológica mental del plan detallando TODO lo que va a ir haciendo semana a semana, mes a mes.',
        'Debes narrar cómo interactúan las fases con sus horas libres, relatando de manera empática los momentos donde podría haber fricción, cansancio, choques de horarios o cuellos de botella.',
        'Sé descriptivo pero conciso.',
        'Menciona claramente si el plan tiene puntos de quiebre o fallas graves.',
        'Debes responder solo JSON valido.',
        'JSON esperado:',
        '{',
        '  "reviewSummary": "Relato cronológico (en 2-3 párrafos) simulando la experiencia real trabajando el plan. Explica fricciones y escenarios.",',
        '  "checkedAreas": ["Fricciones específicas verificadas (ej: cruce de horarios en semana 4)"],',
        '  "extraFindings": ["Hallazgos que harían caer el plan en un escenario pesimista y cómo evitarlo"]',
        '}'
      ].join(' ')
    },
    {
      role: 'user',
      content: [
        'Plan estrategico a simular:',
        compactStrategy(input.strategy),
        'Chequeo de realidad base:',
        compactReality(input.realityCheck),
        'Simulacion deterministica pre-calculada:',
        compactSimulation(input.deterministicSimulation),
        'Haz un relato cronológico de cómo te iría intentando cumplir todo esto paso a paso en base al "Chequeo de realidad". Encuentra los huecos.'
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
