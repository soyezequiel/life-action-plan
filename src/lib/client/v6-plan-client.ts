import type { ClarificationRound } from '../pipeline/v6/types'

export interface V6StreamCallbacks {
  onPhase: (phase: string, iteration: number) => void
  onProgress: (score: number, lastAction: string) => void
  onNeedsInput: (sessionId: string, questions: ClarificationRound) => void
  onComplete: (planId: string, score: number, iterations: number) => void
  onError: (message: string) => void
}

interface SseEnvelope {
  type?: unknown
  data?: unknown
  result?: unknown
}

interface ParsedSseBlock {
  eventType: string | null
  data: string
}

async function readErrorMessage(response: Response): Promise<string> {
  const rawText = (await response.text()).trim()

  if (!rawText) {
    return 'No pudimos continuar en este momento.'
  }

  try {
    const parsed = JSON.parse(rawText) as { error?: unknown; message?: unknown }

    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.error.trim()
    }

    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim()
    }
  } catch {
    // Keep the raw response when it is not valid JSON.
  }

  return rawText
}

function parseSseBlock(block: string): ParsedSseBlock | null {
  const normalized = block.trim()

  if (!normalized) {
    return null
  }

  const lines = normalized.split('\n')
  let eventType: string | null = null
  const dataLines: string[] = []

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      continue
    }

    const separatorIndex = line.indexOf(':')

    if (separatorIndex < 0) {
      dataLines.push(line.trim())
      continue
    }

    const field = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1)

    if (value.startsWith(' ')) {
      value = value.slice(1)
    }

    if (field === 'event') {
      eventType = value.trim() || null
    }

    if (field === 'data') {
      dataLines.push(value)
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  return {
    eventType,
    data: dataLines.join('\n').trim()
  }
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function dispatchSsePayload(payloadText: string, explicitEventType: string | null, callbacks: V6StreamCallbacks): void {
  let parsed: unknown = payloadText
  let eventType = explicitEventType

  try {
    parsed = JSON.parse(payloadText) as SseEnvelope
  } catch {
    if (!eventType) {
      return
    }
  }

  if (parsed && typeof parsed === 'object') {
    const envelope = parsed as SseEnvelope
    if (!eventType && typeof envelope.type === 'string') {
      eventType = envelope.type
    }

    if (eventType === 'result') {
      const result = envelope.result
      if (
        result
        && typeof result === 'object'
        && 'success' in result
        && (result as { success?: unknown }).success === false
      ) {
        callbacks.onError(toStringValue((result as { error?: unknown }).error, 'No pudimos continuar en este momento.'))
      }
      return
    }

    const data = typeof envelope.data !== 'undefined' ? envelope.data : parsed

    if (eventType === 'v6:phase' && data && typeof data === 'object') {
      const value = data as { phase?: unknown; iteration?: unknown }
      callbacks.onPhase(toStringValue(value.phase), toNumber(value.iteration))
      return
    }

    if (eventType === 'v6:progress' && data && typeof data === 'object') {
      const value = data as { score?: unknown; lastAction?: unknown }
      callbacks.onProgress(toNumber(value.score), toStringValue(value.lastAction))
      return
    }

    if (eventType === 'v6:needs_input' && data && typeof data === 'object') {
      const value = data as { sessionId?: unknown; questions?: unknown }
      callbacks.onNeedsInput(
        toStringValue(value.sessionId),
        (value.questions ?? null) as ClarificationRound
      )
      return
    }

    if (eventType === 'v6:complete' && data && typeof data === 'object') {
      const value = data as { planId?: unknown; score?: unknown; iterations?: unknown }
      callbacks.onComplete(
        toStringValue(value.planId),
        toNumber(value.score),
        toNumber(value.iterations)
      )
    }
  }
}

async function consumeSseStream(response: Response, callbacks: V6StreamCallbacks): Promise<void> {
  if (!response.body) {
    const payload = (await response.text()).trim()
    if (payload) {
      dispatchSsePayload(payload, null, callbacks)
    }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()

    if (value) {
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n')

      let boundaryIndex = buffer.indexOf('\n\n')
      while (boundaryIndex >= 0) {
        const block = buffer.slice(0, boundaryIndex)
        buffer = buffer.slice(boundaryIndex + 2)

        const parsed = parseSseBlock(block)
        if (parsed) {
          dispatchSsePayload(parsed.data, parsed.eventType, callbacks)
        }

        boundaryIndex = buffer.indexOf('\n\n')
      }
    }

    if (done) {
      break
    }
  }

  buffer += decoder.decode().replace(/\r\n/g, '\n')
  const tail = parseSseBlock(buffer)
  if (tail) {
    dispatchSsePayload(tail.data, tail.eventType, callbacks)
  }
}

async function postV6Stream(
  path: string,
  body: Record<string, unknown>,
  callbacks: V6StreamCallbacks
): Promise<void> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      callbacks.onError(await readErrorMessage(response))
      return
    }

    await consumeSseStream(response, callbacks)
  } catch (error) {
    const message = error instanceof Error && error.message.trim()
      ? error.message
      : 'No pudimos continuar en este momento.'
    callbacks.onError(message)
  }
}

export async function startV6PlanBuild(
  goalText: string,
  profileId: string,
  provider: string,
  callbacks: V6StreamCallbacks
): Promise<void> {
  return postV6Stream('/api/plan/build', {
    pipelineVersion: 'v6',
    goalText,
    profileId,
    provider
  }, callbacks)
}

export async function resumeV6PlanBuild(
  sessionId: string,
  answers: Record<string, string>,
  callbacks: V6StreamCallbacks
): Promise<void> {
  return postV6Stream('/api/plan/build/resume', {
    sessionId,
    answers
  }, callbacks)
}
