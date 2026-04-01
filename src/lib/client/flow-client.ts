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
  FlowSimulationTreeRequest,
  FlowSimulationTreeResult,
  FlowStrategyResult,
  FlowTaskProgress,
  FlowTopDownRequest,
  FlowTopDownResult
} from '../../shared/types/flow-api'

async function readResponseText(response: Response): Promise<string> {
  return (await response.text()).trim() || 'REQUEST_FAILED'
}

async function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (typeof Event !== 'undefined' && error instanceof Event) {
      throw new Error(`DOM Event interceptado en fetch: ${error.type || 'Desconocido'}`)
    }
    throw error
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await safeFetch(path, {
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
  const response = await safeFetch(path, {
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
  activate(workflowId: string, onProgress?: (progress: FlowTaskProgress) => void) {
    return postSse<FlowActivationResult>(
      `/api/flow/session/${encodeURIComponent(workflowId)}/activate`,
      {},
      onProgress
    )
  },
  initializeSimTree(workflowId: string) {
    return fetchJson<FlowSimulationTreeResult>(
      `/api/flow/session/${encodeURIComponent(workflowId)}/simulation-tree`,
      { method: 'POST', body: JSON.stringify({ action: 'initialize' } satisfies FlowSimulationTreeRequest) }
    )
  },
  expandSimNode(workflowId: string, nodeId: string, treeVersion: number) {
    return fetchJson<FlowSimulationTreeResult>(
      `/api/flow/session/${encodeURIComponent(workflowId)}/simulation-tree`,
      { method: 'POST', body: JSON.stringify({ action: 'expand-node', nodeId, treeVersion } satisfies FlowSimulationTreeRequest) }
    )
  },
  simulateNode(workflowId: string, nodeId: string, treeVersion: number, onProgress?: (progress: FlowTaskProgress) => void) {
    return postSse<FlowSimulationTreeResult>(
      `/api/flow/session/${encodeURIComponent(workflowId)}/simulation-tree`,
      { action: 'simulate-node', nodeId, treeVersion } satisfies FlowSimulationTreeRequest,
      onProgress
    )
  },
  simulateRange(workflowId: string, params: { rangeStart?: string; rangeEnd?: string; treeVersion?: number }, onProgress?: (progress: FlowTaskProgress) => void) {
    return postSse<FlowSimulationTreeResult>(
      `/api/flow/session/${encodeURIComponent(workflowId)}/simulation-tree`,
      { action: 'simulate-range', ...params } satisfies FlowSimulationTreeRequest,
      onProgress
    )
  },
  applySimCorrections(workflowId: string, corrections: FlowSimulationTreeRequest['corrections'], treeVersion: number, onProgress?: (progress: FlowTaskProgress) => void) {
    return postSse<FlowSimulationTreeResult>(
      `/api/flow/session/${encodeURIComponent(workflowId)}/simulation-tree`,
      { action: 'apply-corrections', corrections, treeVersion } satisfies FlowSimulationTreeRequest,
      onProgress
    )
  },
  lockSimNode(workflowId: string, nodeId: string, treeVersion: number) {
    return fetchJson<FlowSimulationTreeResult>(
      `/api/flow/session/${encodeURIComponent(workflowId)}/simulation-tree`,
      { method: 'POST', body: JSON.stringify({ action: 'lock-node', nodeId, treeVersion } satisfies FlowSimulationTreeRequest) }
    )
  },
  applyResumePatch(workflowId: string, body: FlowResumePatchRequest) {
    return fetchJson<FlowSessionResult & { patchSummary?: string }>(
      `/api/flow/session/${encodeURIComponent(workflowId)}/resume`,
      {
        method: 'POST',
        body: JSON.stringify(body)
      }
    )
  },
  async exportSimulation(workflowId: string, format: 'json' | 'csv' = 'json'): Promise<void> {
    const url = `/api/flow/session/${encodeURIComponent(workflowId)}/export-simulation?format=${format}`
    const response = await safeFetch(url)

    if (!response.ok) {
      throw new Error(await readResponseText(response))
    }

    const blob = await response.blob()
    const disposition = response.headers.get('Content-Disposition') ?? ''
    const filenameMatch = disposition.match(/filename="(.+?)"/)
    const filename = filenameMatch?.[1] ?? `lap-simulation-${workflowId}.${format}`

    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(objectUrl)
  }
}
