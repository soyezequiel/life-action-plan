import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { IntakeExpressData } from '../shared/types/ipc'

const api = {
  intake: {
    save: (data: IntakeExpressData) => ipcRenderer.invoke('intake:save', data)
  },
  plan: {
    build: (profileId: string, apiKey: string) =>
      ipcRenderer.invoke('plan:build', profileId, apiKey)
  },
  profile: {
    get: (profileId: string) => ipcRenderer.invoke('profile:get', profileId)
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
