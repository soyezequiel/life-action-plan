import { DateTime } from 'luxon'

export const FAKE_OPENAI_KEY_PREFIX = 'sk-fake'
export const FAKE_OPENAI_MODEL_ID = 'openai:gpt-5-mini'
export const FAKE_OPENAI_API_BASE_PATH = '/__lap/api/mock-openai/v1'

export function shouldUseFakeOpenAI(apiKey: string, modelId: string): boolean {
  return modelId.startsWith('openai:') && apiKey.trim().toLowerCase().startsWith(FAKE_OPENAI_KEY_PREFIX)
}

export function resolveFakeOpenAIModelId(requestedModelId: string, apiKey: string): string {
  return shouldUseFakeOpenAI(apiKey, requestedModelId)
    ? FAKE_OPENAI_MODEL_ID
    : requestedModelId
}

function extractTextFromOpenAIContentPart(part: unknown): string {
  if (!part || typeof part !== 'object') {
    return ''
  }

  const record = part as Record<string, unknown>

  if (typeof record.text === 'string') {
    return record.text
  }

  return ''
}

function extractOpenAIInputText(body: Record<string, unknown>): string {
  const input = Array.isArray(body.input) ? body.input : []

  return input
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return ''
      }

      const record = item as Record<string, unknown>
      const content = record.content

      if (typeof content === 'string') {
        return content
      }

      if (Array.isArray(content)) {
        return content
          .map((part) => extractTextFromOpenAIContentPart(part))
          .filter(Boolean)
          .join('\n')
      }

      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function extractProfileLine(inputText: string, label: string, fallback: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = inputText.match(new RegExp(`^${escapedLabel}:\\s*(.+)$`, 'im'))
  return match?.[1]?.trim() || fallback
}

function inferPrimaryCategory(objective: string): 'estudio' | 'ejercicio' | 'trabajo' | 'habito' | 'descanso' | 'otro' {
  const normalized = objective.toLowerCase()

  if (/(correr|entren|yoga|gym|gim|salud|ejercicio)/.test(normalized)) {
    return 'ejercicio'
  }

  if (/(trabajo|empleo|laburo|cliente|venta|negocio|proyecto)/.test(normalized)) {
    return 'trabajo'
  }

  if (/(habito|rutina|orden|meditar|constancia)/.test(normalized)) {
    return 'habito'
  }

  if (/(descanso|dormir|pausa|relajar)/.test(normalized)) {
    return 'descanso'
  }

  if (objective.trim()) {
    return 'estudio'
  }

  return 'otro'
}

function shortenObjective(objective: string): string {
  const compact = objective.trim()
  return compact.length > 48 ? `${compact.slice(0, 45)}...` : compact || 'tu objetivo principal'
}

export function buildFakeOpenAIPlan(body: Record<string, unknown>): {
  nombre: string
  resumen: string
  eventos: Array<{
    semana: number
    dia: string
    hora: string
    duracion: number
    actividad: string
    categoria: string
    objetivoId: string
  }>
  reasoning: string
} {
  const inputText = extractOpenAIInputText(body)
  const nombre = extractProfileLine(inputText, 'Nombre', 'Tu plan')
  const ciudad = extractProfileLine(inputText, 'Ciudad', 'tu ciudad')
  const objetivo = extractProfileLine(inputText, 'Objetivo principal', 'avanzar con una meta concreta')
  const objetivoCorto = shortenObjective(objetivo)
  const categoriaPrincipal = inferPrimaryCategory(objetivo)

  return {
    nombre: `Plan de ${nombre}`,
    resumen: `Armé un borrador simple para ${nombre} en ${ciudad}, con pasos cortos y sostenibles para avanzar con ${objetivoCorto}. Incluye foco principal, hábito de apoyo y un cierre semanal para ajustar sin sobrecargarte.`,
    reasoning: `Estoy armando un borrador corto, realista y fácil de revisar para ${nombre}, priorizando constancia y poco ruido.`,
    eventos: [
      {
        semana: 1,
        dia: 'lunes',
        hora: '07:30',
        duracion: 25,
        actividad: `Bloque corto para avanzar con ${objetivoCorto}`,
        categoria: categoriaPrincipal,
        objetivoId: 'obj1'
      },
      {
        semana: 1,
        dia: 'martes',
        hora: '20:00',
        duracion: 20,
        actividad: 'Revisión simple de avances y próximos pasos',
        categoria: 'habito',
        objetivoId: 'obj1'
      },
      {
        semana: 1,
        dia: 'jueves',
        hora: '07:45',
        duracion: 15,
        actividad: 'Rutina base para sostener energía y orden',
        categoria: 'habito',
        objetivoId: 'obj1'
      },
      {
        semana: 1,
        dia: 'sabado',
        hora: '10:00',
        duracion: 45,
        actividad: `Sesión principal enfocada en ${objetivoCorto}`,
        categoria: categoriaPrincipal,
        objetivoId: 'obj1'
      },
      {
        semana: 1,
        dia: 'domingo',
        hora: '18:00',
        duracion: 20,
        actividad: 'Cierre semanal y ajuste liviano del plan',
        categoria: 'descanso',
        objetivoId: 'obj1'
      }
    ]
  }
}

function chunkText(value: string, chunkSize: number): string[] {
  const chunks: string[] = []

  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize))
  }

  return chunks.length > 0 ? chunks : ['']
}

export function buildFakeOpenAIResponsesPayload(body: Record<string, unknown>): Record<string, unknown> {
  const plan = buildFakeOpenAIPlan(body)
  const responseId = 'resp_fake_local'
  const reasoningId = 'rs_fake_local'
  const messageId = 'msg_fake_local'
  const text = JSON.stringify({
    nombre: plan.nombre,
    resumen: plan.resumen,
    eventos: plan.eventos
  })

  return {
    id: responseId,
    created_at: Math.floor(DateTime.utc().toSeconds()),
    model: typeof body.model === 'string' && body.model ? body.model : 'gpt-5-mini',
    output: [
      {
        type: 'reasoning',
        id: reasoningId,
        encrypted_content: null,
        summary: [
          {
            type: 'summary_text',
            text: plan.reasoning
          }
        ]
      },
      {
        type: 'message',
        role: 'assistant',
        id: messageId,
        phase: 'final_answer',
        content: [
          {
            type: 'output_text',
            text,
            annotations: []
          }
        ]
      }
    ],
    usage: {
      input_tokens: Math.max(120, Math.ceil(extractOpenAIInputText(body).length / 4)),
      output_tokens: Math.max(180, Math.ceil(text.length / 3)),
      output_tokens_details: {
        reasoning_tokens: Math.max(24, Math.ceil(plan.reasoning.length / 5))
      }
    },
    service_tier: null
  }
}

export function buildFakeOpenAIStreamEvents(body: Record<string, unknown>): Array<Record<string, unknown>> {
  const payload = buildFakeOpenAIResponsesPayload(body)
  const output = Array.isArray(payload.output) ? payload.output : []
  const reasoning = output.find((item) => item && typeof item === 'object' && (item as Record<string, unknown>).type === 'reasoning') as Record<string, unknown> | undefined
  const message = output.find((item) => item && typeof item === 'object' && (item as Record<string, unknown>).type === 'message') as Record<string, unknown> | undefined
  const reasoningId = typeof reasoning?.id === 'string' ? reasoning.id : 'rs_fake_local'
  const messageId = typeof message?.id === 'string' ? message.id : 'msg_fake_local'
  const reasoningText = Array.isArray(reasoning?.summary)
    ? reasoning.summary
      .map((part) => part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string'
        ? String((part as Record<string, unknown>).text)
        : ''
      )
      .join(' ')
      .trim()
    : ''
  const answerText = Array.isArray(message?.content)
    ? message.content
      .map((part) => part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string'
        ? String((part as Record<string, unknown>).text)
        : ''
      )
      .join('')
    : ''

  return [
    {
      type: 'response.created',
      response: {
        id: payload.id,
        created_at: payload.created_at,
        model: payload.model,
        service_tier: null
      }
    },
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: {
        type: 'reasoning',
        id: reasoningId,
        encrypted_content: null
      }
    },
    ...chunkText(reasoningText, 44).filter(Boolean).map((delta) => ({
      type: 'response.reasoning_summary_text.delta',
      item_id: reasoningId,
      summary_index: 0,
      delta
    })),
    {
      type: 'response.reasoning_summary_part.done',
      item_id: reasoningId,
      summary_index: 0
    },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item: {
        type: 'reasoning',
        id: reasoningId,
        encrypted_content: null
      }
    },
    {
      type: 'response.output_item.added',
      output_index: 1,
      item: {
        type: 'message',
        id: messageId,
        phase: 'final_answer'
      }
    },
    ...chunkText(answerText, 34).filter(Boolean).map((delta) => ({
      type: 'response.output_text.delta',
      item_id: messageId,
      delta,
      logprobs: null
    })),
    {
      type: 'response.output_item.done',
      output_index: 1,
      item: {
        type: 'message',
        id: messageId,
        phase: 'final_answer'
      }
    },
    {
      type: 'response.completed',
      response: {
        incomplete_details: null,
        usage: payload.usage,
        service_tier: null
      }
    }
  ]
}
