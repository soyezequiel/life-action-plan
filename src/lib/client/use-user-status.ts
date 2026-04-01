'use client'

import { useState, useEffect, useMemo } from 'react'
import { useLapClient } from './app-services'
import { useSession } from 'next-auth/react'

export type OnboardingStep = 'LOADING' | 'SETUP' | 'PLAN' | 'READY'

export interface UserStatus {
  hasWallet: boolean
  hasApiKey: boolean
  hasPlan: boolean
  onboardingStep: OnboardingStep
  isConfigured: boolean
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useUserStatus(): UserStatus {
  const lapClient = useLapClient()
  const { data: session, status: sessionStatus } = useSession()
  
  const [hasWallet, setHasWallet] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [hasPlan, setHasPlan] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    if (sessionStatus !== 'authenticated') {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      
      // 1. Check Wallet & API Key (Parallel)
      const [walletStatus, openaiStatus, openrouterStatus] = await Promise.all([
        lapClient.wallet.status(),
        lapClient.settings.apiKeyStatus('openai'),
        lapClient.settings.apiKeyStatus('openrouter')
      ])

      const configuredWallet = walletStatus.configured
      const configuredApi = openaiStatus.configured || openrouterStatus.configured
      
      setHasWallet(configuredWallet)
      setHasApiKey(configuredApi)

      // 2. Check Plan
      const latestProfileId = await lapClient.profile.latest()
      if (latestProfileId) {
        const plans = await lapClient.plan.list(latestProfileId)
        setHasPlan(plans.length > 0)
      } else {
        setHasPlan(false)
      }

      setError(null)
    } catch (err) {
      console.error('Failed to fetch user status:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      refresh().catch(err => {
        console.error('[LAP] Unhandled error in useUserStatus refresh:', err)
      })
    } else if (sessionStatus === 'unauthenticated') {
      setLoading(false)
    }
  }, [sessionStatus])

  const isConfigured = hasWallet || hasApiKey
  
  const onboardingStep = useMemo((): OnboardingStep => {
    if (loading || sessionStatus === 'loading') return 'LOADING'
    if (!isConfigured) return 'SETUP'
    if (!hasPlan) return 'PLAN'
    return 'READY'
  }, [loading, sessionStatus, isConfigured, hasPlan])

  return {
    hasWallet,
    hasApiKey,
    hasPlan,
    onboardingStep,
    isConfigured,
    loading: loading || sessionStatus === 'loading',
    error,
    refresh
  }
}
