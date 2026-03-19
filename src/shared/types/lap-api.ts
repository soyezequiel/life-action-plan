import type { ElectronAPI } from '@electron-toolkit/preload'
import type { Perfil } from '../schemas/perfil'
import type {
  CostSummary,
  DebugEvent,
  DebugSnapshotResult,
  DebugStatusResult,
  IntakeExpressData,
  IntakeSaveResult,
  PlanBuildProgress,
  PlanBuildResult,
  PlanExportCalendarResult,
  PlanRow,
  PlanSimulationProgress,
  PlanSimulationResult,
  ProgressRow,
  ProgressToggleResult,
  StreakResult,
  WalletConnectResult,
  WalletDisconnectResult,
  WalletStatus
} from './ipc'

export interface LapAPI {
  intake: {
    save: (data: IntakeExpressData) => Promise<IntakeSaveResult>
  }
  plan: {
    build: (profileId: string, apiKey: string, provider?: string) => Promise<PlanBuildResult>
    onBuildProgress: (listener: (progress: PlanBuildProgress) => void) => () => void
    list: (profileId: string) => Promise<PlanRow[]>
    simulate: (planId: string, mode?: 'interactive' | 'automatic') => Promise<PlanSimulationResult>
    onSimulationProgress: (listener: (progress: PlanSimulationProgress) => void) => () => void
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
  cost: {
    summary: (planId: string) => Promise<CostSummary>
  }
  debug: {
    enable: () => Promise<DebugStatusResult>
    disable: () => Promise<DebugStatusResult>
    status: () => Promise<DebugStatusResult>
    snapshot: () => Promise<DebugSnapshotResult>
    onEvent: (listener: (event: DebugEvent) => void) => () => void
  }
}

export type LapWindow = Window & {
  electron?: ElectronAPI
  api?: LapAPI
}
