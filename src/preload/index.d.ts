import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  IntakeExpressData, IntakeSaveResult, PlanBuildResult,
  PlanRow, ProgressRow, ProgressToggleResult
} from '../shared/types/ipc'
import type { Perfil } from '../shared/schemas/perfil'

interface LapAPI {
  intake: {
    save: (data: IntakeExpressData) => Promise<IntakeSaveResult>
  }
  plan: {
    build: (profileId: string, apiKey: string, provider?: string) => Promise<PlanBuildResult>
    list: (profileId: string) => Promise<PlanRow[]>
  }
  profile: {
    get: (profileId: string) => Promise<Perfil | null>
    latest: () => Promise<string | null>
  }
  progress: {
    list: (planId: string, fecha: string) => Promise<ProgressRow[]>
    toggle: (progressId: string) => Promise<ProgressToggleResult>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: LapAPI
  }
}
