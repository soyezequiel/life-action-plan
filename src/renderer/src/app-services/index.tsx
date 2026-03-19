import { createContext, useContext } from 'react'
import type { PropsWithChildren } from 'react'
import type { LapAPI } from '../../../shared/types/lap-api'
import { createDefaultAppServices } from '../lib/lap-client'

export interface AppServices {
  lapClient: LapAPI
}

const AppServicesContext = createContext<AppServices | null>(null)

interface AppServicesProviderProps extends PropsWithChildren {
  services?: AppServices
}

export function AppServicesProvider({ children, services }: AppServicesProviderProps) {
  const resolvedServices = services ?? createDefaultAppServices()

  return (
    <AppServicesContext.Provider value={resolvedServices}>
      {children}
    </AppServicesContext.Provider>
  )
}

export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext)

  if (!services) {
    throw new Error('AppServicesProvider is required')
  }

  return services
}

export function useLapClient(): LapAPI {
  return useAppServices().lapClient
}
