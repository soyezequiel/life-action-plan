import type {
  DebugEvent,
  IntakeExpressData,
  PlanBuildProgress,
  PlanExportCalendarResult,
  PlanSimulationProgress,
  SimulationMode
} from '../../../shared/types/ipc'
import type { LapAPI } from '../../../shared/types/lap-api'
import { mockLapApi } from '../mock-api'

const DEV_API_BASE = '/__lap/api'
class DevApiHttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'DevApiHttpError'
    this.status = status
  }
}

interface AvailabilityState {
  checkedAt: number
  value: boolean | null
}

const debugListeners = new Set<(event: DebugEvent) => void>()
const buildProgressListeners = new Set<(progress: PlanBuildProgress) => void>()
const simulationProgressListeners = new Set<(progress: PlanSimulationProgress) => void>()

let availabilityState: AvailabilityState = {
  checkedAt: 0,
  value: null
}
let debugEventSource: EventSource | null = null
let buildEventSource: EventSource | null = null
let simulationEventSource: EventSource | null = null

function markAvailability(value: boolean | null): void {
  availabilityState = {
    value,
    checkedAt: value === null ? 0 : Date.now()
  }
}

async function fetchDevApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${DEV_API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  })

  if (!response.ok) {
    markAvailability(true)
    throw new DevApiHttpError(response.status, await response.text())
  }

  markAvailability(true)

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

async function withDevApi<T>(runDevApi: () => Promise<T>, runFallback: () => Promise<T>): Promise<T> {
  try {
    return await runDevApi()
  } catch (error) {
    if (error instanceof DevApiHttpError) {
      throw error
    }

    markAvailability(false)
    return runFallback()
  }
}

function resetDebugEventSource(): void {
  debugEventSource?.close()
  debugEventSource = null
  markAvailability(null)
}

function resetBuildEventSource(): void {
  buildEventSource?.close()
  buildEventSource = null
  markAvailability(null)
}

function resetSimulationEventSource(): void {
  simulationEventSource?.close()
  simulationEventSource = null
  markAvailability(null)
}

function ensureDebugEventSource(): void {
  if (debugEventSource || typeof EventSource === 'undefined') {
    return
  }

  debugEventSource = new EventSource(`${DEV_API_BASE}/debug/events`)
  debugEventSource.onopen = () => {
    markAvailability(true)
  }
  debugEventSource.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data) as DebugEvent
      for (const listener of debugListeners) {
        listener(event)
      }
    } catch {
      // Ignore malformed events and keep the stream open.
    }
  }
  debugEventSource.onerror = () => {
    resetDebugEventSource()
  }
}

function ensureBuildEventSource(): void {
  if (buildEventSource || typeof EventSource === 'undefined') {
    return
  }

  buildEventSource = new EventSource(`${DEV_API_BASE}/plan/build/events`)
  buildEventSource.onopen = () => {
    markAvailability(true)
  }
  buildEventSource.onmessage = (message) => {
    try {
      const progress = JSON.parse(message.data) as PlanBuildProgress
      for (const listener of buildProgressListeners) {
        listener(progress)
      }
    } catch {
      // Ignore malformed events and keep the stream open.
    }
  }
  buildEventSource.onerror = () => {
    resetBuildEventSource()
  }
}

function ensureSimulationEventSource(): void {
  if (simulationEventSource || typeof EventSource === 'undefined') {
    return
  }

  simulationEventSource = new EventSource(`${DEV_API_BASE}/plan/simulate/events`)
  simulationEventSource.onopen = () => {
    markAvailability(true)
  }
  simulationEventSource.onmessage = (message) => {
    try {
      const progress = JSON.parse(message.data) as PlanSimulationProgress
      for (const listener of simulationProgressListeners) {
        listener(progress)
      }
    } catch {
      // Ignore malformed events and keep the stream open.
    }
  }
  simulationEventSource.onerror = () => {
    resetSimulationEventSource()
  }
}

export const browserHttpLapClient: LapAPI = {
  intake: {
    save: async (data: IntakeExpressData) => withDevApi(
      () => fetchDevApi('/intake/save', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
      () => mockLapApi.intake.save(data)
    )
  },
  plan: {
    build: async (profileId: string, apiKey: string, provider?: string) => withDevApi(
      () => fetchDevApi('/plan/build', {
        method: 'POST',
        body: JSON.stringify({ profileId, apiKey, provider })
      }),
      () => mockLapApi.plan.build(profileId, apiKey, provider)
    ),
    onBuildProgress: (listener: (progress: PlanBuildProgress) => void) => {
      buildProgressListeners.add(listener)
      ensureBuildEventSource()

      const fallbackUnsubscribe = availabilityState.value === false
        ? mockLapApi.plan.onBuildProgress(listener)
        : null

      return () => {
        fallbackUnsubscribe?.()
        buildProgressListeners.delete(listener)

        if (buildProgressListeners.size === 0) {
          resetBuildEventSource()
        }
      }
    },
    list: async (profileId: string) => withDevApi(
      () => fetchDevApi(`/plan/list?profileId=${encodeURIComponent(profileId)}`),
      () => mockLapApi.plan.list(profileId)
    ),
    simulate: async (planId: string, mode: SimulationMode = 'interactive') => withDevApi(
      () => fetchDevApi('/plan/simulate', {
        method: 'POST',
        body: JSON.stringify({ planId, mode })
      }),
      () => mockLapApi.plan.simulate(planId, mode)
    ),
    onSimulationProgress: (listener: (progress: PlanSimulationProgress) => void) => {
      simulationProgressListeners.add(listener)
      ensureSimulationEventSource()

      const fallbackUnsubscribe = availabilityState.value === false
        ? mockLapApi.plan.onSimulationProgress(listener)
        : null

      return () => {
        fallbackUnsubscribe?.()
        simulationProgressListeners.delete(listener)

        if (simulationProgressListeners.size === 0) {
          resetSimulationEventSource()
        }
      }
    },
    exportCalendar: async (planId: string): Promise<PlanExportCalendarResult> => withDevApi<PlanExportCalendarResult>(
      async (): Promise<PlanExportCalendarResult> => {
        const result = await fetchDevApi<{
          success: boolean
          fileName?: string
          calendar?: string
          error?: string
        }>(`/plan/export-ics?planId=${encodeURIComponent(planId)}`)

        if (!result.success || !result.calendar || !result.fileName) {
          return {
            success: false,
            error: result.error
          }
        }

        const blob = new Blob([result.calendar], { type: 'text/calendar;charset=utf-8' })
        const objectUrl = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = objectUrl
        anchor.download = result.fileName
        anchor.click()
        URL.revokeObjectURL(objectUrl)

        return {
          success: true,
          filePath: result.fileName
        }
      },
      () => mockLapApi.plan.exportCalendar(planId)
    )
  },
  profile: {
    get: async (profileId: string) => withDevApi(
      () => fetchDevApi(`/profile/get?profileId=${encodeURIComponent(profileId)}`),
      () => mockLapApi.profile.get(profileId)
    ),
    latest: async () => withDevApi(
      () => fetchDevApi('/profile/latest'),
      () => mockLapApi.profile.latest()
    )
  },
  progress: {
    list: async (planId: string, fecha: string) => withDevApi(
      () => fetchDevApi(`/progress/list?planId=${encodeURIComponent(planId)}&fecha=${encodeURIComponent(fecha)}`),
      () => mockLapApi.progress.list(planId, fecha)
    ),
    toggle: async (progressId: string) => withDevApi(
      () => fetchDevApi('/progress/toggle', {
        method: 'POST',
        body: JSON.stringify({ progressId })
      }),
      () => mockLapApi.progress.toggle(progressId)
    )
  },
  streak: {
    get: async (planId: string) => withDevApi(
      () => fetchDevApi(`/streak/get?planId=${encodeURIComponent(planId)}`),
      () => mockLapApi.streak.get(planId)
    )
  },
  wallet: {
    status: async () => withDevApi(
      () => fetchDevApi('/wallet/status'),
      () => mockLapApi.wallet.status()
    ),
    connect: async (connectionUrl: string) => withDevApi(
      () => fetchDevApi('/wallet/connect', {
        method: 'POST',
        body: JSON.stringify({ connectionUrl })
      }),
      () => mockLapApi.wallet.connect(connectionUrl)
    ),
    disconnect: async () => withDevApi(
      () => fetchDevApi('/wallet/disconnect', {
        method: 'POST'
      }),
      () => mockLapApi.wallet.disconnect()
    )
  },
  cost: {
    summary: async (planId: string) => withDevApi(
      () => fetchDevApi(`/cost/summary?planId=${encodeURIComponent(planId)}`),
      () => mockLapApi.cost.summary(planId)
    )
  },
  debug: {
    enable: async () => withDevApi(
      async () => {
        ensureDebugEventSource()
        return fetchDevApi('/debug/enable', { method: 'POST' })
      },
      () => mockLapApi.debug.enable()
    ),
    disable: async () => withDevApi(
      () => fetchDevApi('/debug/disable', { method: 'POST' }),
      () => mockLapApi.debug.disable()
    ),
    status: async () => withDevApi(
      () => fetchDevApi('/debug/status'),
      () => mockLapApi.debug.status()
    ),
    snapshot: async () => withDevApi(
      () => fetchDevApi('/debug/snapshot'),
      () => mockLapApi.debug.snapshot()
    ),
    onEvent: (listener: (event: DebugEvent) => void) => {
      debugListeners.add(listener)
      ensureDebugEventSource()

      const fallbackUnsubscribe = availabilityState.value === false
        ? mockLapApi.debug.onEvent(listener)
        : null

      return () => {
        fallbackUnsubscribe?.()
        debugListeners.delete(listener)

        if (debugListeners.size === 0) {
          resetDebugEventSource()
        }
      }
    }
  }
}
