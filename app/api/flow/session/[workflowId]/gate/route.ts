import { DateTime } from 'luxon'
import { t } from '../../../../../../src/i18n'
import { getDeploymentMode } from '../../../../../../src/lib/env/deployment'
import {
  DEFAULT_CODEX_BUILD_MODEL,
  DEFAULT_OPENAI_BUILD_MODEL,
  DEFAULT_OPENROUTER_BUILD_MODEL,
  resolveBuildModel
} from '../../../../../../src/lib/providers/provider-metadata'
import { resolvePlanBuildExecution } from '../../../../../../src/lib/runtime/build-execution'
import { summarizeResourceUsage } from '../../../../../../src/lib/runtime/resource-usage-summary'
import { flowGateRequestSchema } from '../../../../_schemas'
import { jsonResponse } from '../../../../_shared'
import { resolveUserId } from '../../../../_user-settings'
import { getWalletStatus } from '../../../../_wallet'
import { loadOwnedWorkflow, notFoundResponse, persistWorkflowState, invalidRequestResponse } from '../../../_helpers'

interface RouteContext {
  params: Promise<{ workflowId: string }>
}

function resolveGateSummary(input: {
  canExecute: boolean
  walletRequired: boolean
  walletReady: boolean
  llmMode: 'service' | 'own' | 'codex' | 'local'
  choice: 'pulso' | 'advanced'
  hasUserApiKey: boolean
  blockReasonCode: string | null
}): string {
  if (!input.canExecute) {
    if (input.llmMode === 'own' && input.hasUserApiKey) {
      return t('flow.gate.summary_key_missing')
    }

    if (input.blockReasonCode === 'backend_credential_missing') {
      return input.choice === 'pulso'
        ? t('flow.gate.summary_backend_missing')
        : t('flow.gate.summary_backend_missing_advanced')
    }

    if (input.blockReasonCode === 'codex_mode_unavailable') {
      return t('flow.gate.summary_codex_unavailable')
    }

    if (input.blockReasonCode === 'codex_auth_missing') {
      return t('flow.gate.summary_codex_missing')
    }

    if (input.blockReasonCode === 'backend_local_unavailable') {
      return t('flow.gate.summary_local_unavailable')
    }

    return t('flow.gate.summary_generic_blocked')
  }

  if (input.walletRequired && !input.walletReady) {
    return t('flow.gate.summary_wallet_needed')
  }

  return t('flow.gate.summary_ready')
}

async function resolvePulsoExecution(input: {
  provider: string
  deploymentMode: ReturnType<typeof getDeploymentMode>
  userId: string
  backendCredentialId?: string
}): Promise<{
  modelId: string
  execution: Awaited<ReturnType<typeof resolvePlanBuildExecution>>
}> {
  const candidateModels = Array.from(new Set([
    resolveBuildModel(input.provider),
    DEFAULT_OPENAI_BUILD_MODEL,
    DEFAULT_OPENROUTER_BUILD_MODEL
  ]))

  let fallback: {
    modelId: string
    execution: Awaited<ReturnType<typeof resolvePlanBuildExecution>>
  } | null = null

  for (const modelId of candidateModels) {
    const execution = await resolvePlanBuildExecution({
      modelId,
      deploymentMode: input.deploymentMode,
      requestedMode: 'backend-cloud',
      userId: input.userId,
      userSuppliedApiKey: '',
      backendCredentialId: input.backendCredentialId
    })

    if (!fallback) {
      fallback = {
        modelId,
        execution
      }
    }

    if (execution.executionContext.canExecute) {
      return {
        modelId,
        execution
      }
    }
  }

  return fallback ?? {
    modelId: resolveBuildModel(input.provider),
    execution: await resolvePlanBuildExecution({
      modelId: resolveBuildModel(input.provider),
      deploymentMode: input.deploymentMode,
      requestedMode: 'backend-cloud',
      userId: input.userId,
      userSuppliedApiKey: '',
      backendCredentialId: input.backendCredentialId
    })
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const parsed = flowGateRequestSchema.safeParse(await request.json().catch(() => null))

  if (!parsed.success) {
    return invalidRequestResponse()
  }

  const { workflowId } = await context.params
  const session = await loadOwnedWorkflow(request, workflowId)

  if (!session) {
    return notFoundResponse()
  }

  const deploymentMode = getDeploymentMode()
  const userId = resolveUserId(request)
  let resolvedModel = parsed.data.llmMode === 'codex'
    ? DEFAULT_CODEX_BUILD_MODEL
    : resolveBuildModel(parsed.data.provider)
  const requestedMode = parsed.data.llmMode === 'local'
    ? 'backend-local'
    : parsed.data.llmMode === 'own'
      ? 'user-cloud'
      : parsed.data.llmMode === 'codex'
        ? 'codex-cloud'
      : 'backend-cloud'
  const backendCredentialId = parsed.data.backendCredentialId?.trim() || undefined
  const execution = parsed.data.choice === 'pulso' && parsed.data.llmMode === 'service'
    ? await resolvePulsoExecution({
        provider: parsed.data.provider,
        deploymentMode,
        userId,
        backendCredentialId
      }).then((result) => {
        resolvedModel = result.modelId
        return result.execution
      })
    : await resolvePlanBuildExecution({
        modelId: resolvedModel,
        deploymentMode,
        requestedMode,
        userId,
        userSuppliedApiKey: '',
        backendCredentialId
      })
  resolvedModel = execution.requestedModelId
  const usage = summarizeResourceUsage({
    executionContext: execution.executionContext,
    billingPolicy: execution.billingPolicy
  })
  const walletStatus = await getWalletStatus(userId)
  const walletRequired = usage.chargeable && parsed.data.llmMode !== 'own'
  const walletReady = walletStatus.planBuildChargeReady !== false
  const ready = usage.canExecute
    && (parsed.data.llmMode !== 'own' || Boolean(parsed.data.hasUserApiKey))
    && (!walletRequired || walletReady)
  const legacySummary = !usage.canExecute
    ? parsed.data.llmMode === 'own' && parsed.data.hasUserApiKey
      ? 'Todavía falta dejar una clave activa en Ajustes para usar esta ruta.'
      : 'Todavía falta resolver cómo ejecutar el asistente en esta ruta.'
    : walletRequired && walletStatus.planBuildChargeReady === false
      ? 'La ruta está disponible, pero antes tenés que dejar lista la billetera.'
      : 'Ya quedó lista la base técnica para pasar a tus objetivos.'
  const summary = resolveGateSummary({
    canExecute: usage.canExecute,
    walletRequired,
    walletReady,
    llmMode: parsed.data.llmMode,
    choice: parsed.data.choice,
    hasUserApiKey: Boolean(parsed.data.hasUserApiKey),
    blockReasonCode: usage.blockReasonCode
  })
  void legacySummary
  const nextState = {
    ...session.state,
    gate: {
      choice: parsed.data.choice,
      llmMode: parsed.data.llmMode,
      provider: resolvedModel,
      backendCredentialId: parsed.data.backendCredentialId ?? null,
      hasUserApiKey: Boolean(parsed.data.hasUserApiKey),
      estimatedCostSats: usage.estimatedCostSats,
      estimatedCostUsd: usage.estimatedCostSats / 1000,
      ready,
      walletRequired,
      summary,
      updatedAt: DateTime.utc().toISO() ?? '2026-03-21T00:00:00.000Z'
    }
  }
  const nextSession = await persistWorkflowState({
    workflowId,
    state: nextState,
    currentStep: ready ? 'objectives' : 'gate',
    status: ready ? 'in_progress' : session.status,
    checkpointCode: 'gate-configured',
    checkpointPayload: {
      ready,
      estimatedCostSats: usage.estimatedCostSats,
      provider: resolvedModel
    }
  })

  return jsonResponse({
    success: true,
    session: nextSession,
    walletStatus,
    usage
  })
}
