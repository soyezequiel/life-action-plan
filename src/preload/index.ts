import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { IntakeExpressData } from '../shared/types/ipc'

const api = {
  intake: {
    save: (data: IntakeExpressData) => ipcRenderer.invoke('intake:save', data)
  },
  plan: {
    build: (profileId: string, apiKey: string, provider?: string) =>
      ipcRenderer.invoke('plan:build', profileId, apiKey, provider),
    list: (profileId: string) => ipcRenderer.invoke('plan:list', profileId),
    simulate: (planId: string, mode?: 'interactive' | 'automatic') => ipcRenderer.invoke('plan:simulate', planId, mode),
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
