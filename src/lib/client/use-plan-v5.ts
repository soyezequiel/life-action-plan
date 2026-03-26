'use client';

import { startTransition, useEffect, useState } from 'react';

import { t } from '../../i18n';
import type { AdaptiveOutput, PlanPackage } from '../pipeline/v5/phase-io-v5';

interface UsePlanV5Result {
  package: PlanPackage | null;
  adaptive: AdaptiveOutput | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface OkResponse<T> {
  ok: true;
  data: T;
}

interface ErrorResponse {
  ok: false;
  error: string;
}

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json() as T | ErrorResponse;

  if (!response.ok) {
    if (typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string') {
      throw new Error(payload.error);
    }

    throw new Error(t('planV5.error'));
  }

  return payload as T;
}

export function usePlanV5(planId?: string): UsePlanV5Result {
  const [planPackage, setPlanPackage] = useState<PlanPackage | null>(null);
  const [adaptive, setAdaptive] = useState<AdaptiveOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const search = new URLSearchParams();
    if (planId) {
      search.set('planId', planId);
    }
    const suffix = search.toString() ? `?${search.toString()}` : '';

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const [packageResponse, adaptiveResponse] = await Promise.all([
          readJson<OkResponse<PlanPackage>>(`/api/plan/v5/package${suffix}`, {
            signal: controller.signal,
          }),
          readJson<OkResponse<AdaptiveOutput | null>>(`/api/plan/v5/adaptive${suffix}`, {
            signal: controller.signal,
          }),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        setPlanPackage(packageResponse.data);
        setAdaptive(adaptiveResponse.data);
      } catch (cause) {
        if (controller.signal.aborted) {
          return;
        }

        const message = cause instanceof Error && cause.message.trim()
          ? cause.message
          : t('planV5.error');
        setError(message);
        setPlanPackage(null);
        setAdaptive(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [planId, requestVersion]);

  return {
    package: planPackage,
    adaptive,
    loading,
    error,
    refetch() {
      startTransition(() => {
        setRequestVersion((current) => current + 1);
      });
    },
  };
}
