import { ElectronAPI } from '@electron-toolkit/preload'
import type { IntakeExpressData, IntakeSaveResult, PlanBuildResult } from '../shared/types/ipc'
import type { Perfil } from '../shared/schemas/perfil'

interface LapAPI {
  intake: {
    save: (data: IntakeExpressData) => Promise<IntakeSaveResult>
  }
  plan: {
    build: (profileId: string, apiKey: string) => Promise<PlanBuildResult>
  }
  profile: {
    get: (profileId: string) => Promise<Perfil | null>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: LapAPI
  }
}
