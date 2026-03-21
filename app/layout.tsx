import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Manrope, Geist_Mono } from 'next/font/google'
import ClientProviders from '../src/lib/client/providers'
import esAR from '../src/i18n/locales/es-AR.json'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-ui',
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
    icon: '/favicon.ico',
    apple: '/icon.png'
  }
}

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="es-AR" className={`${manrope.variable} ${geistMono.variable}`}>
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  )
}
