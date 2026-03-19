import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  DebugEvent,
  DebugSnapshotResult,
  IntakeExpressData,
  PlanBuildProgress,
  PlanSimulationProgress
} from '../shared/types/ipc'
import type { LapAPI } from '../shared/types/lap-api'

const api: LapAPI = {
  intake: {
    save: (data: IntakeExpressData) => ipcRenderer.invoke('intake:save', data)
  },
  plan: {
    build: (profileId: string, apiKey: string, provider?: string) =>
      ipcRenderer.invoke('plan:build', profileId, apiKey, provider),
    onBuildProgress: (listener: (progress: PlanBuildProgress) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, progress: PlanBuildProgress) => {
        listener(progress)
      }

      ipcRenderer.on('plan:build:progress', wrappedListener)

      return () => {
        ipcRenderer.removeListener('plan:build:progress', wrappedListener)
      }
    },
    list: (profileId: string) => ipcRenderer.invoke('plan:list', profileId),
    simulate: (planId: string, mode?: 'interactive' | 'automatic') => ipcRenderer.invoke('plan:simulate', planId, mode),
    onSimulationProgress: (listener: (progress: PlanSimulationProgress) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, progress: PlanSimulationProgress) => {
        listener(progress)
      }

      ipcRenderer.on('plan:simulate:progress', wrappedListener)

      return () => {
        ipcRenderer.removeListener('plan:simulate:progress', wrappedListener)
      }
    },
    exportCalendar: (planId: string) => ipcRenderer.invoke('plan:export-ics', planId)
  },
  profile: {
    get: (profileId: string) => ipcRenderer.invoke('profile:get', profileId),
    latest: () => ipcRenderer.invoke('profile:latest')
  },
  progress: {
    list: (planId: string, fecha: string) => ipcRenderer.invoke('progress:list', planId, fecha),
    toggle: (progressId: string) => ipcRenderer.invoke('progress:toggle', progressId)
  },
  streak: {
    get: (planId: string) => ipcRenderer.invoke('streak:get', planId)
  },
  wallet: {
    status: () => ipcRenderer.invoke('wallet:status'),
    connect: (connectionUrl: string) => ipcRenderer.invoke('wallet:connect', connectionUrl),
    disconnect: () => ipcRenderer.invoke('wallet:disconnect')
  },
  cost: {
    summary: (planId: string) => ipcRenderer.invoke('cost:summary', planId)
  },
  debug: {
    enable: () => ipcRenderer.invoke('debug:enable'),
    disable: () => ipcRenderer.invoke('debug:disable'),
    status: () => ipcRenderer.invoke('debug:status'),
    snapshot: (): Promise<DebugSnapshotResult> => ipcRenderer.invoke('debug:snapshot'),
    onEvent: (listener: (event: DebugEvent) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, event: DebugEvent) => {
        listener(event)
      }

      ipcRenderer.on('debug:event', wrappedListener)

      return () => {
        ipcRenderer.removeListener('debug:event', wrappedListener)
      }
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
