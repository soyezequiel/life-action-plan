import {
  interactiveSessionCreateRequestSchema,
  interactiveSessionDeleteResponseSchema,
  interactiveSessionInputRequestSchema,
  interactiveSessionResponseSchema,
  type InteractiveSessionCreateRequest,
  type InteractiveSessionDeleteResponse,
  type InteractiveSessionInputRequest,
  type InteractiveSessionResponsePayload
} from '../../shared/schemas/pipeline-interactive'

async function readErrorMessage(response: Response): Promise<string> {
  const rawText = await response.text()

  if (!rawText.trim()) {
    return 'REQUEST_FAILED'
  }

  try {
    const parsed = JSON.parse(rawText) as { error?: unknown }
    return typeof parsed.error === 'string' && parsed.error.trim().length > 0
      ? parsed.error
      : rawText.trim()
  } catch {
    return rawText.trim()
  }
}

async function fetchInteractive<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
  init?: RequestInit
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  return schema.parse(await response.json())
}

export const interactiveFlowClient = {
  createSession(input: InteractiveSessionCreateRequest): Promise<InteractiveSessionResponsePayload> {
    const body = interactiveSessionCreateRequestSchema.parse(input)

    return fetchInteractive('/api/pipeline/interactive/session', interactiveSessionResponseSchema, {
      method: 'POST',
      body: JSON.stringify(body)
    })
  },
  getSession(sessionId: string): Promise<InteractiveSessionResponsePayload> {
    return fetchInteractive(
      `/api/pipeline/interactive/session/${encodeURIComponent(sessionId)}`,
      interactiveSessionResponseSchema
    )
  },
  applyInput(sessionId: string, input: InteractiveSessionInputRequest): Promise<InteractiveSessionResponsePayload> {
    const body = interactiveSessionInputRequestSchema.parse(input)

    return fetchInteractive(
      `/api/pipeline/interactive/session/${encodeURIComponent(sessionId)}/input`,
      interactiveSessionResponseSchema,
      {
        method: 'POST',
        body: JSON.stringify(body)
      }
    )
  },
  deleteSession(sessionId: string): Promise<InteractiveSessionDeleteResponse> {
    return fetchInteractive(
      `/api/pipeline/interactive/session/${encodeURIComponent(sessionId)}`,
      interactiveSessionDeleteResponseSchema,
      {
        method: 'DELETE'
      }
    )
  }
}
