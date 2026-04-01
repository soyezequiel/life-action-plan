'use client'

import { useState, useEffect, useMemo } from 'react'
import { useLapClient } from './app-services'
import { useSession } from 'next-auth/react'
import { LOCAL_PROFILE_ID_STORAGE_KEY } from './storage-keys'

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

function readStoredProfileId(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storedValue = window.localStorage.getItem(LOCAL_PROFILE_ID_STORAGE_KEY)?.trim() || ''
  return storedValue || null
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
      const configChecks = await Promise.allSettled([
        lapClient.wallet.status(),
        lapClient.settings.apiKeyStatus('openai'),
        lapClient.settings.apiKeyStatus('openrouter')
      ])

      const [walletStatus, openaiStatus, openrouterStatus] = configChecks
      const refreshErrors: string[] = []

      if (walletStatus.status === 'fulfilled') {
        setHasWallet(walletStatus.value.configured)
      } else {
        console.error('Failed to fetch wallet status:', walletStatus.reason)
        refreshErrors.push(walletStatus.reason instanceof Error ? walletStatus.reason.message : 'wallet_status_failed')
      }

      const apiStatuses = [openaiStatus, openrouterStatus].filter((result) => result.status === 'fulfilled')
      if (apiStatuses.length > 0) {
        setHasApiKey(apiStatuses.some((result) => result.value.configured))
      } else {
        console.error('Failed to fetch API key status:', {
          openai: openaiStatus.status === 'rejected' ? openaiStatus.reason : null,
          openrouter: openrouterStatus.status === 'rejected' ? openrouterStatus.reason : null
        })
        const apiFailure = openaiStatus.status === 'rejected'
          ? openaiStatus.reason
          : openrouterStatus.status === 'rejected'
            ? openrouterStatus.reason
            : null
        refreshErrors.push(apiFailure instanceof Error ? apiFailure.message : 'api_key_status_failed')
      }

      let latestProfileId: string | null = null

      try {
        latestProfileId = await lapClient.profile.latest()
      } catch (err) {
        console.error('Failed to resolve latest profile id:', err)
        refreshErrors.push(err instanceof Error ? err.message : 'latest_profile_failed')
      }

      const candidateProfileIds = Array.from(new Set([
        latestProfileId,
        readStoredProfileId(),
      ].filter((value): value is string => Boolean(value))))

      let nextHasPlan = false

      for (const profileId of candidateProfileIds) {
        try {
          const plans = await lapClient.plan.list(profileId)
          if (plans.length > 0) {
            nextHasPlan = true
            break
          }
        } catch (err) {
          console.error(`Failed to fetch plans for profile ${profileId}:`, err)
          refreshErrors.push(err instanceof Error ? err.message : 'plan_list_failed')
        }
      }

      setHasPlan(nextHasPlan)
      setError(refreshErrors[0] ?? null)
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
