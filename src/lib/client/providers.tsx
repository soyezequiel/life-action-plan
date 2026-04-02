'use client'

import type { PropsWithChildren } from 'react'
import type { Session } from 'next-auth'
import { AppProviders } from './app-services'

interface ClientProvidersProps extends PropsWithChildren {
  session: Session | null
}

export default function ClientProviders({ children, session }: ClientProvidersProps) {
  return <AppProviders session={session}>{children}</AppProviders>
}
