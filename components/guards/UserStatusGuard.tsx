'use client'

import React, { useEffect, ReactNode } from 'react'
import { useUserStatusContext } from '@/src/lib/client/UserStatusProvider'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import { MaterialIcon } from '@/components/midnight-mint/MaterialIcon'
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
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF9]">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative h-16 w-16">
            <motion.div 
              className="absolute inset-0 rounded-2xl border-2 border-[#1E293B]/10"
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />
            <motion.div 
              className="absolute inset-0 rounded-2xl border-t-2 border-[#1E293B]"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <MaterialIcon name="pumping_station" className="animate-pulse text-[#1E293B]" />
            </div>
          </div>
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-[#1E293B]/40">
            {t('app.loading')}
          </p>
        </motion.div>
      </div>
    )
  }

  return <>{children}</>
}
