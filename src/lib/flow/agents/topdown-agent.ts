import { z } from 'zod'
import type { AgentRuntime, LLMMessage } from '../../runtime/types'
import { topDownLevelDraftSchema, type StrategicPlanDraft, type TopDownLevelDraft, type TopDownLevel } from '../../../shared/schemas/flow'

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

export async function generateTopDownWithAgent(input: {
  runtime: AgentRuntime
  strategy: StrategicPlanDraft
  levelAction: 'generate' | 'confirm' | 'revise' | 'back'
  requiredLevel: TopDownLevel
  fallback: TopDownLevelDraft
}): Promise<TopDownLevelDraft> {
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: [
        'Eres un analista de proyectos.',
        `Tu trabajo es hacer un desglose ("breakdown") realista del plan para el nivel temporal: ${input.requiredLevel}.`,
        'El desglose debe pensar exactamente cómo dividir el trabajo en piezas más pequeñas de esfuerzo. Da ejemplos (samples) reales.',
        'No des solo tareas genéricas. Dales nombres de tareas realistas.',
        'Debes responder solo JSON valido.',
        'JSON esperado:',
        '{',
        '  "level": "(' + input.requiredLevel + ')",',
        '  "title": "string descriptivo (ej: Desglose Mensual)",',
        '  "summary": "Breve explicación de cómo lograste dividir el tiempo de este nivel",',
        '  "samples": [{"id": "sample-...", "label": "Título del bloque/tarea", "items": ["subtarea 1", "subtarea 2", "..."]}],',
        '  "confirmed": false,',
        '  "revisionCount": 0',
        '}'
      ].join('\n')
    },
    {
      role: 'user',
      content: `Estrategia Original:\n${JSON.stringify(input.strategy, null, 2)}`
    }
  ]

  try {
    const response = await input.runtime.chat(messages)
    const extracted = extractFirstJsonObject(response.content)
    const parsed = topDownLevelDraftSchema.parse(JSON.parse(extracted))
    return parsed
  } catch (error) {
    console.warn('Topdown agent failed, returning fallback.', error)
    return input.fallback
  }
}
