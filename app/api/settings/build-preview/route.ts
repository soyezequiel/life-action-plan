import { buildUsagePreviewQuerySchema } from '../../_schemas'
import { jsonResponse } from '../../_shared'
import { getDeploymentMode } from '../../../../src/lib/env/deployment'
import { resolveBuildModel } from '../../../../src/lib/providers/provider-metadata'
import { resolvePlanBuildExecution } from '../../../../src/lib/runtime/build-execution'
import { summarizeResourceUsage } from '../../../../src/lib/runtime/resource-usage-summary'

function hasUserApiKey(rawValue: string | undefined): boolean {
  const normalized = rawValue?.trim().toLowerCase() || ''
  return normalized === '1' || normalized === 'true'
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const parsed = buildUsagePreviewQuerySchema.safeParse({
    provider: url.searchParams.get('provider') || undefined,
    hasUserApiKey: url.searchParams.get('hasUserApiKey') || undefined,
    backendCredentialId: url.searchParams.get('backendCredentialId') || undefined,
    resourceMode: url.searchParams.get('resourceMode') || undefined
  })

  if (!parsed.success) {
    return jsonResponse({
      success: false,
      error: 'INVALID_BUILD_PREVIEW_QUERY'
    }, { status: 400 })
  }

  const resolvedModel = resolveBuildModel(parsed.data.provider)
  const backendCredentialId = parsed.data.backendCredentialId?.trim() || ''
  const requestedMode = parsed.data.resourceMode === 'backend'
    ? 'backend-cloud'
    : parsed.data.resourceMode === 'user'
      ? 'user-cloud'
      : backendCredentialId
        ? 'backend-cloud'
        : undefined
  const execution = await resolvePlanBuildExecution({
    modelId: resolvedModel,
    deploymentMode: getDeploymentMode(),
    requestedMode,
    userSuppliedApiKey: hasUserApiKey(parsed.data.hasUserApiKey) ? 'preview-user-key' : '',
    backendCredentialId
  })

  return jsonResponse({
    success: true,
    usage: summarizeResourceUsage({
      executionContext: execution.executionContext,
      billingPolicy: execution.billingPolicy
    })
  })
}
