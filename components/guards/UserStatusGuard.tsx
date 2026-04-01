'use client'

import React, { useEffect, ReactNode } from 'react'
import { useUserStatusContext } from '@/src/lib/client/UserStatusProvider'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { motion } from 'framer-motion'
import PulsoLogoAnimated from '@/components/ui/PulsoLogoAnimated'
import { t } from '@/src/i18n'

export function UserStatusGuard({ children }: { children: ReactNode }) {
  const { onboardingStep, loading, sessionStatus } = { ...useUserStatusContext(), sessionStatus: useSession().status }
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (loading || sessionStatus === 'loading') return

    // If not authenticated, let the middleware or other auth guards handle it
    if (sessionStatus !== 'authenticated') return

    const isSettings = pathname?.startsWith('/settings')
    const isIntake = pathname?.startsWith('/intake')
    const isFlow = pathname?.startsWith('/flow')
    const isPlanStageSurface = isIntake || isFlow

    // 1. SETUP stage: Only /settings is allowed
    if (onboardingStep === 'SETUP' && !isSettings) {
      router.replace('/settings')
    }
    
    // 2. PLAN stage: Only /intake, /flow, or /settings are allowed
    if (onboardingStep === 'PLAN' && !isPlanStageSurface && !isSettings) {
      router.replace('/intake')
    }
  }, [onboardingStep, loading, sessionStatus, pathname, router])

  // Only block the entire app while the session itself is unresolved.
  // Once the user is authenticated, we prefer a fast render and redirect if needed
  // instead of a global loading wall on every section change.
  if (sessionStatus === 'loading') {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-transparent text-[color:var(--text-primary)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(15,118,110,0.08),transparent_26%),radial-gradient(circle_at_80%_18%,rgba(200,182,255,0.14),transparent_24%),linear-gradient(180deg,rgba(255,253,249,0.96),rgba(246,241,232,0.96))]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.1]" style={{
          backgroundImage: 'radial-gradient(circle, rgba(31,41,55,0.08) 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-8 relative z-10"
        >
          <PulsoLogoAnimated variant="mark" size={80} speed={1.2} />
          
          <div className="flex flex-col items-center gap-2">
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.4em] text-[color:var(--text-muted)]">
              {t('app.loading')}
            </p>
            <motion.div 
              className="h-px w-12 bg-gradient-to-r from-transparent via-[#0f766e]/40 to-transparent"
              animate={{ scaleX: [0, 1.5, 0], opacity: [0, 1, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </motion.div>
      </div>
    )
  }

  return <>{children}</>
}
