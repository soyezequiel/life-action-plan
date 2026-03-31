import type { PlanPackage, StoredAdaptiveState, V5PhaseSnapshot } from '@/src/lib/pipeline/shared/phase-io'

export interface StoredPlanV5Manifest {
  package?: PlanPackage | null
  adaptive?: StoredAdaptiveState | null
  run?: V5PhaseSnapshot | null
}

export function safeParseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {}
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function readPlanV5Manifest(manifestJson: string | null | undefined): StoredPlanV5Manifest | null {
  const manifest = safeParseJsonRecord(manifestJson)
  const candidate = manifest.v5

  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  const v5 = candidate as Record<string, unknown>
  return {
    package: (v5.package && typeof v5.package === 'object' ? v5.package : null) as PlanPackage | null,
    adaptive: (v5.adaptive && typeof v5.adaptive === 'object' ? v5.adaptive : null) as StoredAdaptiveState | null,
    run: (v5.run && typeof v5.run === 'object' ? v5.run : null) as V5PhaseSnapshot | null
  }
}
