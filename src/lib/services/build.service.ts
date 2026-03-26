import { getDeploymentMode } from '../env/deployment'
import {
  resolvePlanBuildExecution,
  toOperationChargeSkipReason,
  type ResolvedPlanBuildExecution
} from '../runtime/build-execution'
import {
  DEFAULT_OLLAMA_FALLBACK_MODEL
} from '../../utils/plan-build-fallback'
import { executeWithBilling } from '../billing/operation-lifecycle'
import {
  createPlan,
  estimateCostSats,
  estimateCostUsd,
  seedProgressFromEvents,
  trackCost,
  trackEvent,
  getProfile
} from '../db/db-helpers'
import {
  buildPlanManifest,
  createUniquePlanSlug,
  getProfileTimezone,
  parseStoredProfile
} from '../domain/plan-helpers'
import { resolveBuildModel } from '../providers/provider-metadata'
import { summarizeResourceUsage } from '../runtime/resource-usage-summary'
import { toResourceUsageTrackingPayload } from '../runtime/resource-usage-tracking'
import { executePlanGenerationWorkflow } from '../domain/plan-generation'

import type { PlanBuildRequestData, BuildResult, BuildServiceOptions } from './types'
import { apiErrorMessages } from '../../shared/api-utils'
import { planBuildRequestSchema } from '../../shared/api-schemas'
import type { OperationChargeSummary, PlanBuildProgress, SimulationFinding } from '../../shared/types/lap-api'

type BuildServiceError = Error & {
  charge?: OperationChargeSummary
}

export async function processPlanBuild(
  rawData: PlanBuildRequestData & {
    previousFindings?: SimulationFinding[]
    buildConstraints?: string[]
  },
  options: BuildServiceOptions = {}
): Promise<BuildResult> {
  const data = planBuildRequestSchema.parse(rawData)
  const { profileId, apiKey, provider, backendCredentialId, resourceMode, thinkingMode } = data
  const previousFindings = rawData.previousFindings
  const buildConstraints = rawData.buildConstraints
  const requestedModelId = resolveBuildModel(provider)
  const deploymentMode = getDeploymentMode()
  const userId = options.userId
  const requestedMode = resourceMode === 'backend'
    ? 'backend-cloud'
    : resourceMode === 'user'
      ? 'user-cloud'
      : resourceMode === 'codex'
        ? 'codex-cloud'
      : backendCredentialId
        ? 'backend-cloud'
        : undefined

  let streamedCharCount = 0
  let requestedExecution: ResolvedPlanBuildExecution | null = null
  let fallbackExecution: ResolvedPlanBuildExecution | null = null

  try {
    const profileRow = await getProfile(profileId)
    if (!profileRow) {
      throw new Error(apiErrorMessages.profileNotFound())
    }

    const profile = parseStoredProfile(profileRow.data)
    if (!profile) {
      throw new Error(apiErrorMessages.profileNotFound())
    }

    requestedExecution = await resolvePlanBuildExecution({
      modelId: requestedModelId,
      deploymentMode,
      userId: userId ?? undefined,
      requestedMode,
      userSuppliedApiKey: apiKey,
      backendCredentialId
    })

    const { executionContext, billingPolicy } = requestedExecution
    const requestedResourceUsage = summarizeResourceUsage({
      executionContext,
      billingPolicy
    })
    
    if (executionContext.mode === 'backend-cloud') {
      fallbackExecution = await resolvePlanBuildExecution({
        modelId: DEFAULT_OLLAMA_FALLBACK_MODEL,
        deploymentMode,
        requestedMode: 'backend-local'
      })
    }

    let currentWorkflowModelId = requestedModelId

    const { result: workflowResult, charge: finalChargeRecord } = await executeWithBilling({
      profileId,
      operation: 'plan_build',
      modelId: requestedModelId,
      userId: userId ?? undefined,
      billingPolicy,
      resourceUsage: requestedResourceUsage,
      description: `LAP plan build ${profileId}`,
      onStartEvent: 'PLAN_BUILD_STARTED',
      onFailureEvent: 'PLAN_BUILD_CHARGE_FAILED',
      extraEventData: toResourceUsageTrackingPayload(requestedResourceUsage)
    }, async () => {
      if (options.onProgress) {
        options.onProgress({
          profileId,
          provider: requestedModelId,
          stage: 'preparing',
          current: 1,
          total: 4,
          charCount: 0
        })
      }

      const workflowResult = await executePlanGenerationWorkflow(profile, {
        profileId,
        thinkingMode,
        requestedExecution: requestedExecution!,
        fallbackExecution,
        previousFindings,
        buildConstraints,
        onProgress: (stage, current, total, charCount, chunk) => {
          streamedCharCount = charCount
          if (options.onProgress) {
            options.onProgress({
              profileId,
              provider: currentWorkflowModelId,
              stage: stage as PlanBuildProgress['stage'],
              current,
              total,
              charCount,
              chunk
            })
          }
        },
        onFallback: async (originalModel, fallbackModel, originalError, reqMode, fallMode) => {
          currentWorkflowModelId = fallbackModel
          await trackEvent('PLAN_BUILD_FALLBACK', {
            profileId,
            originalModel,
            fallbackModel,
            originalError: originalError.message,
            requestedExecutionMode: reqMode,
            fallbackExecutionMode: fallMode
          })
        }
      })

      const actualCostUsd = estimateCostUsd(
        workflowResult.finalModelId,
        workflowResult.result.tokensUsed.input,
        workflowResult.result.tokensUsed.output
      )
      const actualCostSats = estimateCostSats(actualCostUsd)

      return {
        data: workflowResult,
        finalModelId: workflowResult.finalModelId,
        finalCostUsd: actualCostUsd,
        finalCostSats: actualCostSats,
        billingMetadata: {
            fallbackUsed: workflowResult.fallbackUsed,
            requestedExecutionContext: requestedExecution!.executionContext,
            finalExecutionContext: workflowResult.finalExecution.executionContext,
            tokensUsed: workflowResult.result.tokensUsed
        }
      }
    })

    const result = workflowResult.result
    const fallbackUsed = workflowResult.fallbackUsed
    const finalModelId = workflowResult.finalModelId
    const finalExecution = workflowResult.finalExecution
    const actualCostUsd = estimateCostUsd(
        finalModelId,
        result.tokensUsed.input,
        result.tokensUsed.output
    )
    const actualCostSats = estimateCostSats(actualCostUsd)
    const timezone = getProfileTimezone(profile)

    if (options.onProgress) {
      options.onProgress({
        profileId,
        provider: finalModelId,
        stage: 'saving',
        current: 4,
        total: 4,
        charCount: streamedCharCount
      })
    }

    const planSlug = await createUniquePlanSlug(result.nombre)
    const manifest = buildPlanManifest({
      nombre: result.nombre,
      fallbackUsed,
      modelId: finalModelId,
      tokensInput: result.tokensUsed.input,
      tokensOutput: result.tokensUsed.output,
      costUsd: actualCostUsd,
      costSats: actualCostSats,
      charge: finalChargeRecord
    })
    const planId = await createPlan(profileId, result.nombre, planSlug, manifest)

    await trackCost(
      planId,
      'plan_build',
      finalModelId,
      result.tokensUsed.input,
      result.tokensUsed.output,
      finalChargeRecord.chargeId
    )

    const seeded = await seedProgressFromEvents(planId, result.eventos, timezone)
    await trackEvent('PLAN_BUILT', {
      planId,
      fallbackUsed,
      eventCount: result.eventos.length,
      progressSeeded: seeded,
      tokensInput: result.tokensUsed.input,
      tokensOutput: result.tokensUsed.output,
      costUsd: actualCostUsd,
      costSats: actualCostSats,
      chargeId: finalChargeRecord.chargeId,
      chargeStatus: finalChargeRecord.status,
      chargedSats: finalChargeRecord.chargedSats,
      ...toResourceUsageTrackingPayload(summarizeResourceUsage({
        executionContext: finalExecution.executionContext,
        billingPolicy: finalExecution.billingPolicy
      }))
    })

    return {
      planId,
      nombre: result.nombre,
      resumen: result.resumen,
      eventos: result.eventos,
      tokensUsed: result.tokensUsed,
      fallbackUsed,
      charge: finalChargeRecord,
      resourceUsage: summarizeResourceUsage({
        executionContext: finalExecution.executionContext,
        billingPolicy: finalExecution.billingPolicy
      })
    }

  } catch (error) {
    const finalError = error instanceof Error ? error : new Error(String(error))
    const charge = (finalError as BuildServiceError).charge
    
    const failedResourceUsage = requestedExecution
      ? summarizeResourceUsage({
          executionContext: requestedExecution.executionContext,
          billingPolicy: requestedExecution.billingPolicy
        })
      : null

    await trackEvent('ERROR_OCCURRED', {
      code: 'PLAN_BUILD_FAILED',
      message: finalError.message,
      profileId,
      chargeId: charge?.chargeId ?? null,
      ...toResourceUsageTrackingPayload(charge?.resourceUsage ?? failedResourceUsage)
    })

    throw finalError
  }
}
