import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  IntakeExpressData, IntakeSaveResult, PlanBuildResult,
  PlanExportCalendarResult,
  PlanRow,
  ProgressRow,
  ProgressToggleResult,
  StreakResult,
  WalletConnectResult,
  WalletDisconnectResult,
  WalletStatus
} from '../shared/types/ipc'
import type { Perfil } from '../shared/schemas/perfil'

interface LapAPI {
  intake: {
    save: (data: IntakeExpressData) => Promise<IntakeSaveResult>
  }
  plan: {
    build: (profileId: string, apiKey: string, provider?: string) => Promise<PlanBuildResult>
    list: (profileId: string) => Promise<PlanRow[]>
    exportCalendar: (planId: string) => Promise<PlanExportCalendarResult>
  }
  profile: {
    get: (profileId: string) => Promise<Perfil | null>
    latest: () => Promise<string | null>
  }
  progress: {
    list: (planId: string, fecha: string) => Promise<ProgressRow[]>
    toggle: (progressId: string) => Promise<ProgressToggleResult>
  }
  streak: {
    get: (planId: string) => Promise<StreakResult>
  }
  wallet: {
    status: () => Promise<WalletStatus>
    connect: (connectionUrl: string) => Promise<WalletConnectResult>
    disconnect: () => Promise<WalletDisconnectResult>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: LapAPI
  }
}
