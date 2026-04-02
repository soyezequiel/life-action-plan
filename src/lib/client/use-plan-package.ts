'use client'

import { startTransition, useEffect, useState } from 'react'

import { t } from '../../i18n'
import type { PlanPackage } from '../pipeline/shared/phase-io'

interface UsePlanPackageResult {
  package: PlanPackage | null
  loading: boolean
  error: string | null
  refetch: () => void
}

interface OkResponse<T> {
  ok: true
  data: T
}

interface ErrorResponse {
  ok: false
  error: string
}

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  const payload = await response.json() as T | ErrorResponse

  if (!response.ok) {
    if (typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string') {
      throw new Error(payload.error)
    }

    throw new Error(t('planV5.error'))
  }

  return payload as T
}

export function usePlanPackage(planId?: string): UsePlanPackageResult {
  const [planPackage, setPlanPackage] = useState<PlanPackage | null>(null)
  const [loading, setLoading] = useState(Boolean(planId))
  const [error, setError] = useState<string | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    if (!planId) {
      setPlanPackage(null)
      setError(null)
      setLoading(false)
      return () => {
        controller.abort()
      }
    }

    async function load(): Promise<void> {
      setLoading(true)
      setError(null)

      try {
        const search = new URLSearchParams({ planId: planId! })
        const response = await readJson<OkResponse<PlanPackage>>(`/api/plan/package?${search.toString()}`, {
          signal: controller.signal
        })

        if (!controller.signal.aborted) {
          setPlanPackage(response.data)
        }
      } catch (cause) {
        if (controller.signal.aborted) {
          return
        }

        const message = cause instanceof Error && cause.message.trim()
          ? cause.message
          : t('planV5.error')
        setError(message)
        setPlanPackage(null)
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      controller.abort()
    }
  }, [planId, requestVersion])

  return {
    package: planPackage,
    loading,
    error,
    refetch() {
      startTransition(() => {
        setRequestVersion((current) => current + 1)
      })
    }
  }
}
