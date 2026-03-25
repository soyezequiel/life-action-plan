import { z } from 'zod'
import type { AgentRuntime, LLMMessage } from '../../runtime/types'
import { presentationDraftSchema, type PresentationDraft, type StrategicPlanDraft, type StrategicSimulationSnapshot } from '../../../shared/schemas/flow'
import type { FlowTaskProgress } from '../../../shared/types/flow-api'

function stripFormatting(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
}

function extractFirstJsonObject(content: string): string {
  const cleaned = stripFormatting(content)
  const firstBrace = cleaned.indexOf('{')
  if (firstBrace < 0) return cleaned
  let depth = 0, inString = false, escaping = false
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

export async function generatePresentationWithAgent(input: {
  runtime: AgentRuntime
  strategy: StrategicPlanDraft
  simulation: StrategicSimulationSnapshot
  fallback: PresentationDraft
}, onProgress?: (msg: FlowTaskProgress) => void): Promise<PresentationDraft> {
  onProgress?.({ workflowId: '...', step: 'presentation', stage: 'thinking', current: 2, total: 3, message: 'El agente presentador está armando el desglose final...' })

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: [
        'Escribe en español claro una presentación completa de este plan estratégico.',
        'La presentación debe ser detallada, nada de textos livianos o huecos.',
        'Explica cómo cada fase conecta con la realidad del usuario que vimos en la simulación.',
        'Devuelve SOLO un JSON valido.',
        'JSON esperado:',
        '{',
        '  "title": "string",',
        '  "summary": "Resumen rico explicando el contexto y por qué este plan es diferente a uno genérico",',
        '  "timeline": [{"id": "phase-...", "label": "Título de fase", "detail": "Explicación muy detallada sobre qué se hace en esta fase y cómo lidiar con sus posibles choques que detectó la simulación", "window": "Mes ..."}],',
        '  "cards": [{"id": "card-1", "title": "...", "body": "...", "goalIds": []}],',
        '  "feedbackRounds": 0,',
        '  "accepted": false,',
        '  "latestFeedback": null',
        '}'
      ].join('\n')
    },
    {
      role: 'user',
      content: `Estrategia base: ${JSON.stringify(input.strategy, null, 2)}\nHallazgos de la simulación: ${JSON.stringify(input.simulation, null, 2)}`
    }
  ]

  try {
    const response = await input.runtime.chat(messages)
    const extracted = extractFirstJsonObject(response.content)
    const parsed = presentationDraftSchema.parse(JSON.parse(extracted))
    return parsed
  } catch (error) {
    console.warn('Presentation agent failed, returning fallback.', error)
    return input.fallback
  }
}
