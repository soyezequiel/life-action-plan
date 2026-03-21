import type { IntakeExpressData, LapAPI } from '../../shared/types/lap-api'
import type { DebugEvent } from '../../shared/types/debug'
import type {
  IntakeSaveResult,
  PlanBuildProgress,
  PlanBuildResult,
  PlanExportCalendarResult,
  PlanSimulationProgress,
  PlanSimulationResult,
  PlanRow,
  ProgressRow,
  ProgressToggleResult,
  StreakResult,
  WalletConnectResult,
  WalletDisconnectResult,
  WalletStatus,
  CostSummary,
  DebugSnapshotResult,
  DebugStatusResult,
} from '../../shared/types/lap-api'
import type { Perfil } from '../../shared/schemas/perfil'
import { extractErrorMessage } from './error-utils'
import { DEFAULT_OPENAI_BUILD_MODEL } from '../providers/provider-metadata'

const buildProgressListeners = new Set<(progress: PlanBuildProgress) => void>()
const simulationProgressListeners = new Set<(progress: PlanSimulationProgress) => void>()

async function readResponseText(response: Response): Promise<string> {
  return extractErrorMessage(await response.text())
}

async function readJsonOrText<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? ''
  const text = await response.text()

  if (!text) {
    return undefined as T
  }

  if (contentType.includes('application/json')) {
    return JSON.parse(text) as T
  }

  try {
    return JSON.parse(text) as T
  } catch {
    return text as T
  }
}

function ensureLeadingSlash(path: string): string {
  return path.startsWith('/') ? path : `/${path}`
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(ensureLeadingSlash(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  })

  if (!response.ok) {
    throw new Error(await readResponseText(response))
  }

  return readJsonOrText<T>(response)
}

function emitBuildProgress(progress: PlanBuildProgress): void {
  for (const listener of buildProgressListeners) {
    listener(progress)
  }
}

function emitSimulationProgress(progress: PlanSimulationProgress): void {
  for (const listener of simulationProgressListeners) {
    listener(progress)
  }
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

function mergeBuildProgress(
  current: PlanBuildProgress,
  next: Partial<PlanBuildProgress>
): PlanBuildProgress {
  return {
    ...current,
    ...next,
    charCount: next.charCount ?? current.charCount
  }
}

function mergeSimulationProgress(
  current: PlanSimulationProgress,
  next: Partial<PlanSimulationProgress>
): PlanSimulationProgress {
  return {
    ...current,
    ...next
  }
}

async function consumeBuildStream(response: Response, initial: PlanBuildProgress): Promise<PlanBuildResult> {
  if (!response.body) {
    return readJsonOrText<PlanBuildResult>(response)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let latestProgress = initial
  let result: PlanBuildResult | null = null

  const handlePayload = (payload: string): void => {
    const decoded = decodeLine(payload)
    if (!decoded) {
      return
    }

    try {
      const parsed = JSON.parse(decoded) as Record<string, unknown>
      const progressPayload = parsed.type === 'progress' && parsed.progress && typeof parsed.progress === 'object'
        ? parsed.progress as Record<string, unknown>
        : parsed
      const resultPayload = parsed.type === 'result' && parsed.result && typeof parsed.result === 'object'
        ? parsed.result as Record<string, unknown>
        : parsed

      if (
        typeof progressPayload.profileId === 'string' &&
        typeof progressPayload.provider === 'string' &&
        typeof progressPayload.stage === 'string'
      ) {
        latestProgress = mergeBuildProgress(latestProgress, {
          profileId: progressPayload.profileId,
          provider: progressPayload.provider,
          stage: progressPayload.stage as PlanBuildProgress['stage'],
          current: typeof progressPayload.current === 'number' ? progressPayload.current : latestProgress.current,
          total: typeof progressPayload.total === 'number' ? progressPayload.total : latestProgress.total,
          charCount: typeof progressPayload.charCount === 'number' ? progressPayload.charCount : latestProgress.charCount,
          chunk: typeof progressPayload.chunk === 'string' ? progressPayload.chunk : undefined
        })
        emitBuildProgress(latestProgress)
        return
      }

      if (typeof progressPayload.chunk === 'string') {
        latestProgress = mergeBuildProgress(latestProgress, {
          charCount: latestProgress.charCount + progressPayload.chunk.length
        })
        emitBuildProgress({
          ...latestProgress,
          stage: 'generating',
          current: Math.max(latestProgress.current, 2)
        })
      }

      if (
        typeof resultPayload.success === 'boolean' ||
        typeof resultPayload.planId === 'string' ||
        typeof resultPayload.error === 'string'
      ) {
        result = resultPayload as unknown as PlanBuildResult
      }

      return
    } catch {
      latestProgress = mergeBuildProgress(latestProgress, {
        stage: 'generating',
        current: Math.max(latestProgress.current, 2),
        charCount: latestProgress.charCount + decoded.length
      })
      emitBuildProgress({
        ...latestProgress,
        chunk: decoded
      })
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

  try {
    return JSON.parse(buffer) as PlanBuildResult
  } catch {
    return { success: false, error: 'INVALID_STREAM_RESPONSE' }
  }
}

async function consumeSimulationStream(response: Response, initial: PlanSimulationProgress): Promise<PlanSimulationResult> {
  if (!response.body) {
    return readJsonOrText<PlanSimulationResult>(response)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let latestProgress = initial
  let result: PlanSimulationResult | null = null

  const handlePayload = (payload: string): void => {
    const decoded = decodeLine(payload)
    if (!decoded) {
      return
    }

    try {
      const parsed = JSON.parse(decoded) as Record<string, unknown>
      const progressPayload = parsed.type === 'progress' && parsed.progress && typeof parsed.progress === 'object'
        ? parsed.progress as Record<string, unknown>
        : parsed
      const resultPayload = parsed.type === 'result' && parsed.result && typeof parsed.result === 'object'
        ? parsed.result as Record<string, unknown>
        : parsed

      if (typeof progressPayload.planId === 'string' && typeof progressPayload.stage === 'string') {
        latestProgress = mergeSimulationProgress(latestProgress, {
          planId: progressPayload.planId,
          mode: typeof progressPayload.mode === 'string'
            ? (progressPayload.mode as PlanSimulationProgress['mode'])
            : latestProgress.mode,
          stage: progressPayload.stage as PlanSimulationProgress['stage'],
          current: typeof progressPayload.current === 'number' ? progressPayload.current : latestProgress.current,
          total: typeof progressPayload.total === 'number' ? progressPayload.total : latestProgress.total
        })
        emitSimulationProgress(latestProgress)
        return
      }

      if (
        typeof resultPayload.success === 'boolean' ||
        typeof resultPayload.error === 'string' ||
        typeof resultPayload.simulation === 'object'
      ) {
        result = resultPayload as unknown as PlanSimulationResult
      }
    } catch {
      latestProgress = mergeSimulationProgress(latestProgress, {})
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

  try {
    return JSON.parse(buffer) as PlanSimulationResult
  } catch {
    return { success: false, error: 'INVALID_STREAM_RESPONSE' }
  }
}

async function downloadBlob(response: Response, fileName: string): Promise<PlanExportCalendarResult> {
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)

  return {
    success: true,
    filePath: fileName
  }
}

export const browserLapClient: LapAPI = {
  intake: {
    async save(data: IntakeExpressData) {
      return fetchJson<IntakeSaveResult>('/api/intake', {
        method: 'POST',
        body: JSON.stringify(data)
      })
    }
  },
  plan: {
    async build(profileId: string, apiKey: string, provider?: string) {
      const initial: PlanBuildProgress = {
        profileId,
        provider: provider ?? DEFAULT_OPENAI_BUILD_MODEL,
        stage: 'preparing',
        current: 1,
        total: 4,
        charCount: 0
      }

      emitBuildProgress(initial)

      const response = await fetch('/api/plan/build', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ profileId, apiKey, provider })
      })

      if (!response.ok) {
        throw new Error(await readResponseText(response))
      }

      return consumeBuildStream(response, initial)
    },
    onBuildProgress(listener: (progress: PlanBuildProgress) => void) {
      buildProgressListeners.add(listener)

      return () => {
        buildProgressListeners.delete(listener)
      }
    },
    async list(profileId: string) {
      return fetchJson<PlanRow[]>(`/api/plan/list?profileId=${encodeURIComponent(profileId)}`)
    },
    async simulate(planId: string, mode: 'interactive' | 'automatic' = 'interactive') {
      const initial: PlanSimulationProgress = {
        planId,
        mode,
        stage: 'schedule',
        current: 1,
        total: 4
      }

      emitSimulationProgress(initial)

      const response = await fetch('/api/plan/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ planId, mode })
      })

      if (!response.ok) {
        throw new Error(await readResponseText(response))
      }

      return consumeSimulationStream(response, initial)
    },
    onSimulationProgress(listener: (progress: PlanSimulationProgress) => void) {
      simulationProgressListeners.add(listener)

      return () => {
        simulationProgressListeners.delete(listener)
      }
    },
    async exportCalendar(planId: string) {
      const response = await fetch('/api/plan/export-ics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ planId })
      })

      if (!response.ok) {
        return {
          success: false,
          error: await readResponseText(response)
        }
      }

      const contentType = response.headers.get('content-type') ?? ''
      const disposition = response.headers.get('content-disposition') ?? ''
      const fileNameMatch = disposition.match(/filename="?([^";]+)"?/i)
      const fileName = fileNameMatch?.[1] ?? `lap-${planId}.ics`

      if (contentType.includes('application/json')) {
        return readJsonOrText<PlanExportCalendarResult>(response)
      }

      return downloadBlob(response, fileName)
    }
  },
  profile: {
    async get(profileId: string) {
      return fetchJson<Perfil | null>(`/api/profile?profileId=${encodeURIComponent(profileId)}`)
    },
    async latest() {
      return fetchJson<string | null>('/api/profile/latest')
    }
  },
  progress: {
    async list(planId: string, fecha?: string) {
      const params = new URLSearchParams({ planId })
      if (fecha) {
        params.set('fecha', fecha)
      }

      return fetchJson<ProgressRow[]>(`/api/progress/list?${params.toString()}`)
    },
    async toggle(progressId: string) {
      return fetchJson<ProgressToggleResult>('/api/progress/toggle', {
        method: 'POST',
        body: JSON.stringify({ progressId })
      })
    }
  },
  streak: {
    async get(planId: string) {
      return fetchJson<StreakResult>(`/api/streak?planId=${encodeURIComponent(planId)}`)
    }
  },
  wallet: {
    async status() {
      return fetchJson<WalletStatus>('/api/wallet/status')
    },
    async connect(connectionUrl: string) {
      return fetchJson<WalletConnectResult>('/api/wallet/connect', {
        method: 'POST',
        body: JSON.stringify({ connectionUrl })
      })
    },
    async disconnect() {
      return fetchJson<WalletDisconnectResult>('/api/wallet/disconnect', {
        method: 'POST'
      })
    }
  },
  cost: {
    async summary(planId: string) {
      return fetchJson<CostSummary>(`/api/cost?planId=${encodeURIComponent(planId)}`)
    }
  },
  debug: {
    async enable() {
      return fetchJson<DebugStatusResult>('/api/debug', {
        method: 'POST',
        body: JSON.stringify({ enabled: true })
      })
    },
    async disable() {
      return fetchJson<DebugStatusResult>('/api/debug', {
        method: 'POST',
        body: JSON.stringify({ enabled: false })
      })
    },
    async clear() {
      return fetchJson<DebugStatusResult>('/api/debug', {
        method: 'POST',
        body: JSON.stringify({ action: 'clear' })
      })
    },
    async status() {
      return fetchJson<DebugStatusResult>('/api/debug')
    },
    async snapshot() {
      return fetchJson<DebugSnapshotResult>('/api/debug/snapshot')
    },
    onEvent(_listener: (event: DebugEvent) => void) {
      return () => {
        // The Next.js backend exposes snapshots instead of an event stream.
      }
    }
  }
}
