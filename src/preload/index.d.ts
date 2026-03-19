import { ElectronAPI } from '@electron-toolkit/preload'
import type { LapAPI } from '../shared/types/lap-api'

declare global {
  interface Window {
    electron: ElectronAPI
    api: LapAPI
  }
}
