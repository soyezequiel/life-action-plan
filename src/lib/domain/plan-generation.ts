import {
  DEFAULT_OLLAMA_FALLBACK_MODEL,
  buildWithOllamaFallback
} from '../../utils/plan-build-fallback'
import { createInstrumentedRuntime } from '../../debug/instrumented-runtime'
import { generatePlan } from '../skills/plan-builder'
import { getProvider } from '../providers/provider-factory'
import { traceCollector } from '../../debug/trace-collector'
import { resolvePlanBuildExecution, type ResolvedPlanBuildExecution } from '../runtime/build-execution'
import { apiErrorMessages } from '../../shared/api-utils'
import type { Perfil } from '../../shared/schemas/perfil'
import type { GeneratedPlan } from '../skills/plan-builder'
import type { SimulationFinding } from '../../shared/types/lap-api'

export interface PlanGenerationOptions {
  profileId: string
  thinkingMode?: 'enabled' | 'disabled'
  traceId?: string | null
  requestedExecution: ResolvedPlanBuildExecution
  fallbackExecution?: ResolvedPlanBuildExecution | null
  previousFindings?: SimulationFinding[]
  buildConstraints?: string[]
  onProgress?: (stage: string, current: number, total: number, charCount: number, chunk?: string) => void
  onFallback?: (originalModel: string, fallbackModel: string, originalError: Error, requestedMode: string, fallbackMode?: string | null) => void
}

export interface PlanGenerationOutcome {
  result: GeneratedPlan
  fallbackUsed: boolean
  finalModelId: string
  requestedExecution: ResolvedPlanBuildExecution
  finalExecution: ResolvedPlanBuildExecution
  streamedCharCount: number
}

export async function executePlanGenerationWorkflow(
  profile: Perfil,
  options: PlanGenerationOptions
): Promise<PlanGenerationOutcome> {
  const {
    profileId,
    thinkingMode,
    traceId: initialTraceId,
    requestedExecution,
    fallbackExecution,
    previousFindings,
    buildConstraints,
    onProgress,
    onFallback
  } = options

  if (!requestedExecution.executionContext.canExecute) {
    const error = new Error('PLAN_EXECUTION_BLOCKED')
    ;(error as any).executionBlockReasonCode = requestedExecution.executionContext.blockReasonCode
    ;(error as any).requestedExecution = requestedExecution
    throw error
  }

  if (!requestedExecution.runtime) {
    throw new Error('BUILD_RUNTIME_UNAVAILABLE')
  }

  const allowFallback = Boolean(fallbackExecution?.executionContext.canExecute && fallbackExecution.runtime)
  let streamedCharCount = 0

  let traceId = initialTraceId
  if (!traceId) {
    traceId = traceCollector.startTrace('plan-builder', requestedExecution.runtime.modelId, {
      profileId,
      transport: 'api',
      executionMode: requestedExecution.executionContext.mode,
      resourceOwner: requestedExecution.executionContext.resourceOwner
    })
  }

  try {
    const buildResult = await buildWithOllamaFallback(
      requestedExecution.runtime.modelId,
      async (nextModelId) => {
        const activeExecution = nextModelId === requestedExecution.runtime!.modelId
        ? requestedExecution
        : fallbackExecution && fallbackExecution.runtime && nextModelId === fallbackExecution.runtime.modelId
          ? fallbackExecution
          : null // If we reach here, we needed a generic fallback mechanism. In practice, nextModelId will either be requested or fallback.

      if (!activeExecution || !activeExecution.executionContext.canExecute || !activeExecution.runtime) {
        throw new Error(apiErrorMessages.localAssistantUnavailable())
      }

      const activeRuntime = getProvider(activeExecution.runtime.modelId, {
        apiKey: activeExecution.runtime.apiKey,
        baseURL: activeExecution.runtime.baseURL,
        thinkingMode
      })
      const instrumentedRuntime = createInstrumentedRuntime(
        activeRuntime,
        traceId ?? null,
        'plan-builder',
        activeExecution.runtime.modelId
      )

      return generatePlan(instrumentedRuntime, profile, {
        planDir: '',
        profileId,
        userLocale: 'es-AR',
        formalityLevel: 'informal',
        tokenMultiplier: 1.22
      }, {
        previousFindings,
        constraints: buildConstraints,
        onStageChange: (stage) => {
          if (onProgress) {
            if (stage === 'generating') {
              onProgress('generating', 2, 4, streamedCharCount)
            } else if (stage === 'validating') {
              onProgress('validating', 3, 4, streamedCharCount)
            }
          }
        },
        onToken: (chunk) => {
          streamedCharCount += chunk.length
          if (onProgress) {
            onProgress('generating', 2, 4, streamedCharCount, chunk)
          }
        }
      })
    },
    { 
      allowFallback,
      onFallback: async (originalError) => {
        if (onFallback) {
          onFallback(
            requestedExecution.runtime!.modelId,
            fallbackExecution?.runtime?.modelId ?? DEFAULT_OLLAMA_FALLBACK_MODEL,
            originalError,
            requestedExecution.executionContext.mode,
            fallbackExecution?.executionContext.mode ?? null
          )
        }
      } 
    }
  )

  if (traceId) {
    traceCollector.completeTrace(traceId)
  }

  const fallbackUsed = buildResult.fallbackUsed
  const finalModelId = buildResult.modelId
  const finalExecution = fallbackUsed && fallbackExecution
    ? fallbackExecution
    : requestedExecution

  return {
    result: buildResult.result,
    fallbackUsed,
    finalModelId,
    requestedExecution,
    finalExecution,
    streamedCharCount
  }
} catch (err) {
  if (traceId) {
    traceCollector.failTrace(traceId, err)
  }
  throw err
}
}
