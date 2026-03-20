'use client'

import type { PropsWithChildren } from 'react'
import { AppProviders } from './app-services'

export default function ClientProviders({ children }: PropsWithChildren) {
  return <AppProviders>{children}</AppProviders>
}
