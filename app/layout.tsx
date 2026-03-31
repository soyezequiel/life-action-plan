import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Geist_Mono, Plus_Jakarta_Sans, Space_Grotesk } from 'next/font/google'
import ClientProviders from '../src/lib/client/providers'
import esAR from '../src/i18n/locales/es-AR.json'
import './globals.css'

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap'
})

const spaceGrotesk = Space_Grotesk({
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

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="es-AR" className={`${plusJakartaSans.variable} ${spaceGrotesk.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  )
}
