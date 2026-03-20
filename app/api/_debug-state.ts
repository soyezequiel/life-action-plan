import { traceCollector } from './_domain'

interface DebugState {
  panelVisible: boolean
  keepAliveSubscription: (() => void) | null
}

function getGlobalState(): DebugState {
  const globalScope = globalThis as typeof globalThis & {
    __lapDebugState?: DebugState
  }

  if (!globalScope.__lapDebugState) {
    const isDev = process.env.NODE_ENV !== 'production'
    globalScope.__lapDebugState = {
      panelVisible: isDev,
      keepAliveSubscription: null
    }

    if (isDev && !globalScope.__lapDebugState.keepAliveSubscription) {
      globalScope.__lapDebugState.keepAliveSubscription = traceCollector.subscribe(() => {})
    }
  }

  return globalScope.__lapDebugState
}

export function enableDebugPanel() {
  const state = getGlobalState()
  state.panelVisible = true

  if (!state.keepAliveSubscription) {
    state.keepAliveSubscription = traceCollector.subscribe(() => {})
  }

  return {
    enabled: traceCollector.isEnabled(),
    panelVisible: true
  }
}

export function disableDebugPanel() {
  const state = getGlobalState()
  state.panelVisible = false

  state.keepAliveSubscription?.()
  state.keepAliveSubscription = null

  return {
    enabled: traceCollector.isEnabled(),
    panelVisible: false
  }
}

export function getDebugPanelStatus() {
  const state = getGlobalState()
  return {
    enabled: traceCollector.isEnabled(),
    panelVisible: state.panelVisible
  }
}

