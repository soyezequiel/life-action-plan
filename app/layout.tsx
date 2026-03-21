import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Inter, Plus_Jakarta_Sans, Geist_Mono } from 'next/font/google'
import ClientProviders from '../src/lib/client/providers'
import esAR from '../src/i18n/locales/es-AR.json'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap'
})

const plusJakartaSans = Plus_Jakarta_Sans({
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
    <html lang="es-AR" className={`${inter.variable} ${plusJakartaSans.variable} ${geistMono.variable}`}>
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  )
}
