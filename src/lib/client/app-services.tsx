'use client'

import React, { createContext, useContext, useEffect } from 'react'
import type { PropsWithChildren } from 'react'
import type { LapAPI } from '../../shared/types/lap-api'
import { browserLapClient } from './browser-http-client'
import { setLocale } from '../../i18n'
import { UserStatusProvider } from './UserStatusProvider'
import { UserStatusGuard } from '@/components/guards/UserStatusGuard'
import { SessionProvider } from "next-auth/react"

export interface AppServices {
  lapClient: LapAPI
}

const AppServicesContext = createContext<AppServices | null>(null)

interface AppServicesProviderProps extends PropsWithChildren {
  services?: AppServices
}

export function AppServicesProvider({ children, services }: AppServicesProviderProps) {
  const resolvedServices = services ?? { lapClient: browserLapClient }

  return (
    <AppServicesContext.Provider value={resolvedServices}>
      {children}
    </AppServicesContext.Provider>
  )
}

function I18nBootstrap(): null {
  useEffect(() => {
    const storedLocale = window.localStorage.getItem('lap.locale') ?? 'es-AR'
    setLocale(storedLocale)
  }, [])

  return null
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SessionProvider>
      <AppServicesProvider>
        <UserStatusProvider>
          <UserStatusGuard>
            <I18nBootstrap />
            {children}
          </UserStatusGuard>
        </UserStatusProvider>
      </AppServicesProvider>
    </SessionProvider>
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
