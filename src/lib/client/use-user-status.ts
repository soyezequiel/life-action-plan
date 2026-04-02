'use client'

import { startTransition, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'

import type { UserStatusSnapshotResult } from '../../shared/types/lap-api'

import { useLapClient } from './app-services'
import { LOCAL_PROFILE_ID_STORAGE_KEY } from './storage-keys'

export type OnboardingStep = 'LOADING' | 'SETUP' | 'PLAN' | 'READY'

export interface UserStatus {
  hasWallet: boolean
  hasApiKey: boolean
  hasPlan: boolean
  latestProfileId: string | null
  onboardingStep: OnboardingStep
  isConfigured: boolean
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const USER_STATUS_CACHE_STORAGE_KEY = 'lap.user-status.v1'
const USER_STATUS_CACHE_TTL_MS = 60_000

interface CachedUserStatusSnapshot {
  userId: string
  timestamp: number
  snapshot: UserStatusSnapshotResult
}

function readStoredProfileId(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storedValue = window.localStorage.getItem(LOCAL_PROFILE_ID_STORAGE_KEY)?.trim() || ''
  return storedValue || null
}

function readCachedSnapshot(userId: string | null): UserStatusSnapshotResult | null {
  if (typeof window === 'undefined' || !userId) {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(USER_STATUS_CACHE_STORAGE_KEY)
    if (!rawValue) {
      return null
    }

    const parsed = JSON.parse(rawValue) as CachedUserStatusSnapshot
    if (
      parsed.userId !== userId
      || typeof parsed.timestamp !== 'number'
      || Date.now() - parsed.timestamp > USER_STATUS_CACHE_TTL_MS
    ) {
      return null
    }

    return parsed.snapshot
  } catch {
    return null
  }
}

function writeCachedSnapshot(userId: string, snapshot: UserStatusSnapshotResult): void {
  if (typeof window === 'undefined') {
    return
  }

  const payload: CachedUserStatusSnapshot = {
    userId,
    timestamp: Date.now(),
    snapshot,
  }

  window.localStorage.setItem(USER_STATUS_CACHE_STORAGE_KEY, JSON.stringify(payload))
}

function clearCachedSnapshot(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(USER_STATUS_CACHE_STORAGE_KEY)
}

export function useUserStatus(): UserStatus {
  const lapClient = useLapClient()
  const { data: session, status: sessionStatus } = useSession()
  const userId = session?.user?.id ?? null
  const [cachedSnapshot, setCachedSnapshot] = useState<UserStatusSnapshotResult | null>(null)

  const [hasWallet, setHasWallet] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [hasPlan, setHasPlan] = useState(false)
  const [latestProfileId, setLatestProfileId] = useState<string | null>(null)
  const [loading, setLoading] = useState(() => {
    if (sessionStatus === 'loading') {
      return true
    }

    return sessionStatus === 'authenticated'
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      setCachedSnapshot(null)
      return
    }

    setCachedSnapshot(readCachedSnapshot(userId))
  }, [sessionStatus, userId])

  const refresh = async () => {
    if (sessionStatus !== 'authenticated') {
      setLoading(false)
      return
    }

    if (typeof lapClient.user?.status !== 'function') {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const snapshot = await lapClient.user.status(readStoredProfileId())
      setHasWallet(snapshot.hasWallet)
      setHasApiKey(snapshot.hasApiKey)
      setHasPlan(snapshot.hasPlan)
      setLatestProfileId(snapshot.latestProfileId)

      if (userId) {
        writeCachedSnapshot(userId, snapshot)
      }

      if (snapshot.latestProfileId && typeof window !== 'undefined') {
        window.localStorage.setItem(LOCAL_PROFILE_ID_STORAGE_KEY, snapshot.latestProfileId)
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
      if (cachedSnapshot) {
        setHasWallet(cachedSnapshot.hasWallet)
        setHasApiKey(cachedSnapshot.hasApiKey)
        setHasPlan(cachedSnapshot.hasPlan)
        setLatestProfileId(cachedSnapshot.latestProfileId)
        setLoading(false)
        setError(null)
        return
      }

      refresh().catch((err) => {
        console.error('[LAP] Unhandled error in useUserStatus refresh:', err)
      })
    } else if (sessionStatus === 'unauthenticated') {
      clearCachedSnapshot()
      setHasWallet(false)
      setHasApiKey(false)
      setHasPlan(false)
      setLatestProfileId(null)
      setLoading(false)
    }
  }, [cachedSnapshot, sessionStatus, userId])

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !cachedSnapshot) {
      return
    }

    startTransition(() => {
      void refresh()
    })
  }, [cachedSnapshot, sessionStatus])

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
    latestProfileId,
    onboardingStep,
    isConfigured,
    loading: loading || sessionStatus === 'loading',
    error,
    refresh
  }
}
