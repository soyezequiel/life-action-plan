import { jsonResponse } from '../../../_shared'
import { resolveUserId } from '../../../_user-settings'
import { getDeploymentMode } from '../../../../../src/lib/env/deployment'
import { resolveBuildModel } from '../../../../../src/lib/providers/provider-metadata'
import { resolvePlanBuildExecution } from '../../../../../src/lib/runtime/build-execution'
import { summarizeResourceUsage } from '../../../../../src/lib/runtime/resource-usage-summary'
import { credentialCheckQuerySchema } from '../../../_schemas'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const parsed = credentialCheckQuerySchema.safeParse({
    provider: url.searchParams.get('provider') || undefined,
    resourceMode: url.searchParams.get('resourceMode') || undefined,
    backendCredentialId: url.searchParams.get('backendCredentialId') || undefined
  })

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      error: 'INVALID_CREDENTIAL_CHECK_QUERY'
    }, { status: 400 })
  }

  const resolvedModel = resolveBuildModel(parsed.data.provider)
  const requestedMode = parsed.data.resourceMode === 'backend'
    ? 'backend-cloud'
    : parsed.data.resourceMode === 'user'
      ? 'user-cloud'
      : parsed.data.resourceMode === 'codex'
        ? 'codex-cloud'
        : undefined

  const execution = await resolvePlanBuildExecution({
    modelId: resolvedModel,
    deploymentMode: getDeploymentMode(),
    requestedMode,
    userId: resolveUserId(request),
    userSuppliedApiKey: '',
    backendCredentialId: parsed.data.backendCredentialId
  })

  const usage = summarizeResourceUsage({
    executionContext: execution.executionContext,
    billingPolicy: execution.billingPolicy
  })

  return jsonResponse({
    success: true,
    canExecute: usage.canExecute,
    blockReasonCode: usage.blockReasonCode ?? null,
    blockReasonDetail: usage.blockReasonDetail ?? null,
    mode: usage.mode,
    credentialSource: usage.credentialSource,
    chargeable: usage.chargeable,
    estimatedCostSats: usage.estimatedCostSats,
    provider: resolvedModel
  })
}
