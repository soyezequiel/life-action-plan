'use client'

import React, { useEffect, ReactNode } from 'react'
import { useUserStatusContext } from '@/src/lib/client/UserStatusProvider'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
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

    // 1. SETUP stage: Only /settings is allowed
    if (onboardingStep === 'SETUP' && !isSettings) {
      router.replace('/settings')
    }
    
    // 2. PLAN stage: Only /intake, /flow (build) or /settings are allowed
    if (onboardingStep === 'PLAN' && !isIntake && !isFlow && !isSettings) {
      router.replace('/intake')
    }
  }, [onboardingStep, loading, sessionStatus, pathname, router])

  // Show a distinctive loading state while resolving status
  if (loading || sessionStatus === 'loading') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#090B0D] text-[#F8FBFF] overflow-hidden relative">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ 
          backgroundImage: 'radial-gradient(circle, #F8FBFF 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-8 relative z-10"
        >
          <PulsoLogoAnimated variant="mark" size={80} speed={1.2} />
          
          <div className="flex flex-col items-center gap-2">
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.4em] text-[#F8FBFF]/40">
              {t('app.loading')}
            </p>
            <motion.div 
              className="h-px w-12 bg-gradient-to-r from-transparent via-[#14E6BE]/40 to-transparent"
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
