'use client'

import React, { createContext, useContext, useEffect } from 'react'
import type { PropsWithChildren } from 'react'
import type { LapAPI } from '../../shared/types/lap-api'
import { browserLapClient } from './browser-http-client'
import { setLocale } from '../../i18n'
import { UserStatusProvider } from './UserStatusProvider'
import { UserStatusGuard } from '@/components/guards/UserStatusGuard'
import { SessionProvider } from "next-auth/react"
import { extractErrorMessage } from './error-utils'

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

function UnhandledRejectionBootstrap(): null {
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      const message = extractErrorMessage(event.reason)
      
      // If it's a DOM Event or something without a stack trace, it's likely the cause of [object Event]
      if (typeof Event !== 'undefined' && event.reason instanceof Event) {
        console.error('[LAP] Unhandled Rejection (Event intercepted):', message)
        event.preventDefault()
        throw new Error(`DOM Event interceptado globalmente: ${event.reason.type || 'Desconocido'}`)
      }

      if (message.includes('event') || (typeof event.reason === 'object' && event.reason !== null && !('stack' in event.reason))) {
        console.error('[LAP] Unhandled Rejection (Formatted):', message)
        // For non-events, we let them bubble so Next.js can format them if it knows how
      }
    };

    window.addEventListener('unhandledrejection', handleRejection)
    return () => window.removeEventListener('unhandledrejection', handleRejection)
  }, [])

  return null
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
            <UnhandledRejectionBootstrap />
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
