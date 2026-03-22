import type {
  FlowSessionCreateRequest,
  FlowActivationResult,
  FlowCalendarRequest,
  FlowCalendarResult,
  FlowGateRequest,
  FlowIntakeRequest,
  FlowObjectivesRequest,
  FlowPresentationRequest,
  FlowPresentationResult,
  FlowRealityCheckRequest,
  FlowRealityResult,
  FlowResumePatchRequest,
  FlowSessionResult,
  FlowSimulationResult,
  FlowStrategyResult,
  FlowTaskProgress,
  FlowTopDownRequest,
  FlowTopDownResult
} from '../../shared/types/flow-api'

async function readResponseText(response: Response): Promise<string> {
  return (await response.text()).trim() || 'REQUEST_FAILED'
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  })

  if (!response.ok) {
    throw new Error(await readResponseText(response))
  }

  return response.json() as Promise<T>
}

function decodeLine(line: string): string {
  const trimmed = line.trim()
  if (!trimmed) {
    return ''
  }

  if (trimmed.startsWith('data:')) {
    return trimmed.slice(5).trim()
  }

  return trimmed
}

async function consumeSseResult<T>(
  response: Response,
  onProgress?: (progress: FlowTaskProgress) => void
): Promise<T> {
  if (!response.body) {
    return response.json() as Promise<T>
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: T | null = null

  const handlePayload = (payload: string): void => {
    const decoded = decodeLine(payload)
    if (!decoded) {
      return
    }

    try {
      const parsed = JSON.parse(decoded) as Record<string, unknown>
      const progressPayload = parsed.type === 'progress' ? parsed.progress as FlowTaskProgress : null
      const resultPayload = parsed.type === 'result' ? parsed.result as T : null

      if (progressPayload && onProgress) {
        onProgress(progressPayload)
        return
      }

      if (resultPayload) {
        result = resultPayload
      }
    } catch {
      // Ignore malformed chunks from the stream consumer.
    }
  }

  while (true) {
    const { done, value } = await reader.read()

    if (value) {
      buffer += decoder.decode(value, { stream: !done })
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        handlePayload(buffer.slice(0, newlineIndex))
        buffer = buffer.slice(newlineIndex + 1)
        newlineIndex = buffer.indexOf('\n')
      }
    }

    if (done) {
      break
    }
  }

  buffer += decoder.decode()
  handlePayload(buffer)

  if (result) {
    return result
  }

  throw new Error('INVALID_FLOW_STREAM')
}

async function postSse<T>(
  path: string,
  body: unknown,
  onProgress?: (progress: FlowTaskProgress) => void
): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    throw new Error(await readResponseText(response))
  }

  return consumeSseResult<T>(response, onProgress)
}

export const flowClient = {
  createSession(input?: string | FlowSessionCreateRequest) {
    const body = typeof input === 'string'
      ? { workflowId: input }
      : input ?? {}

    return fetchJson<FlowSessionResult>('/api/flow/session', {
      method: 'POST',
      body: JSON.stringify(body)
    })
  },
  getSession(workflowId: string) {
    return fetchJson<FlowSessionResult>(`/api/flow/session/${encodeURIComponent(workflowId)}`)
  },
  saveGate(workflowId: string, body: FlowGateRequest) {
    return fetchJson<FlowSessionResult & { walletStatus?: unknown; usage?: unknown }>(
      `/api/flow/session/${encodeURIComponent(workflowId)}/gate`,
      {
        method: 'POST',
        body: JSON.stringify(body)
      }
    )
  },
  saveObjectives(workflowId: string, body: FlowObjectivesRequest) {
    return fetchJson<FlowSessionResult>(`/api/flow/session/${encodeURIComponent(workflowId)}/objectives`, {
      method: 'POST',
      body: JSON.stringify(body)
    })
  },
  saveIntake(workflowId: string, body: FlowIntakeRequest) {
    return fetchJson<FlowSessionResult & { profileId?: string }>(
      `/api/flow/session/${encodeURIComponent(workflowId)}/intake`,
      {
        method: 'POST',
        body: JSON.stringify(body)
      }
    )
  },
  runStrategy(workflowId: string, onProgress?: (progress: FlowTaskProgress) => void) {
    return postSse<FlowStrategyResult>(
      `/api/flow/session/${encodeURIComponent(workflowId)}/strategy`,
      {},
      onProgress
    )
  },
  saveRealityCheck(workflowId: string, body: FlowRealityCheckRequest) {
    return fetchJson<FlowRealityResult>(`/api/flow/session/${encodeURIComponent(workflowId)}/reality-check`, {
      method: 'POST',
      body: JSON.stringify(body)
    })
  },
  runSimulation(workflowId: string, onProgress?: (progress: FlowTaskProgress) => void) {
    return postSse<FlowSimulationResult>(
      `/api/flow/session/${encodeURIComponent(workflowId)}/simulation`,
      {},
      onProgress
    )
  },
  loadPresentation(workflowId: string) {
    return fetchJson<FlowPresentationResult>(`/api/flow/session/${encodeURIComponent(workflowId)}/presentation`, {
      method: 'POST',
      body: JSON.stringify({})
    })
  },
  applyPresentationFeedback(workflowId: string, body: FlowPresentationRequest, onProgress?: (progress: FlowTaskProgress) => void) {
    return postSse<FlowPresentationResult>(
      `/api/flow/session/${encodeURIComponent(workflowId)}/presentation/feedback`,
      body,
      onProgress
    )
  },
  saveCalendar(workflowId: string, body: FlowCalendarRequest) {
    return fetchJson<FlowCalendarResult>(`/api/flow/session/${encodeURIComponent(workflowId)}/calendar`, {
      method: 'POST',
      body: JSON.stringify(body)
    })
  },
  runTopDown(workflowId: string, body: FlowTopDownRequest, onProgress?: (progress: FlowTaskProgress) => void) {
    return postSse<FlowTopDownResult>(
      `/api/flow/session/${encodeURIComponent(workflowId)}/topdown`,
      body,
      onProgress
    )
  },
  activate(workflowId: string) {
    return fetchJson<FlowActivationResult>(`/api/flow/session/${encodeURIComponent(workflowId)}/activate`, {
      method: 'POST',
      body: JSON.stringify({})
    })
  },
  applyResumePatch(workflowId: string, body: FlowResumePatchRequest) {
    return fetchJson<FlowSessionResult & { patchSummary?: string }>(
      `/api/flow/session/${encodeURIComponent(workflowId)}/resume`,
      {
        method: 'POST',
        body: JSON.stringify(body)
      }
    )
  }
}
