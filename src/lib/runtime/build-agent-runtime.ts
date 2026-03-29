import { getProvider } from '../providers/provider-factory'
import type { AgentRuntime } from './types'
import type { BuildRuntimeConfig } from './build-execution'

interface BuildAgentRuntimeOptions {
  thinkingMode?: 'enabled' | 'disabled'
}

export function createBuildAgentRuntime(
  runtimeConfig: BuildRuntimeConfig,
  options: BuildAgentRuntimeOptions = {},
): AgentRuntime {
  return getProvider(runtimeConfig.modelId, {
    apiKey: runtimeConfig.apiKey,
    baseURL: runtimeConfig.baseURL,
    thinkingMode: options.thinkingMode,
    authMode: runtimeConfig.authMode,
  })
}
