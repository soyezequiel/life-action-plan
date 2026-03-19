import { browserHttpLapClient } from './browser-http-client'
import type { LapAPI, LapWindow } from '../../../shared/types/lap-api'
import type { AppServices } from '../app-services'

export function resolveLapClient(targetWindow?: LapWindow | null): LapAPI {
  if (targetWindow?.electron && targetWindow.api) {
    return targetWindow.api
  }

  return browserHttpLapClient
}

export function getLapClient(targetWindow?: LapWindow | null): LapAPI {
  if (typeof targetWindow !== 'undefined') {
    return resolveLapClient(targetWindow)
  }

  if (typeof window === 'undefined') {
    return resolveLapClient(null)
  }

  return resolveLapClient(window as LapWindow)
}

export function createDefaultAppServices(targetWindow?: LapWindow | null): AppServices {
  return {
    lapClient: getLapClient(targetWindow)
  }
}
