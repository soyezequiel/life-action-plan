import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Geist_Mono, Manrope, Fraunces } from 'next/font/google'
import ClientProviders from '../src/lib/client/providers'
import esAR from '../src/i18n/locales/es-AR.json'
import { getCurrentSession } from '@/src/lib/server/request-context'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap'
})

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap'
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap'
})

export const metadata: Metadata = {
  title: esAR.app.name,
  description: esAR.app.tagline,
  icons: {
    icon: [
      {
        url: '/pulso-mark.svg',
        type: 'image/svg+xml'
      },
      '/favicon.ico'
    ],
    apple: '/pulso-mark.svg',
    shortcut: '/pulso-mark.svg'
  }
}

export default async function RootLayout({
  children
}: Readonly<{
  children: ReactNode
}>) {
  const session = await getCurrentSession()

  return (
    <html lang="es-AR" className={`${manrope.variable} ${fraunces.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body>
        <ClientProviders session={session}>{children}</ClientProviders>
      </body>
    </html>
  )
}
