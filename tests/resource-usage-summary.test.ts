import { describe, expect, it } from 'vitest'

import { extractResourceUsageFromMetadata } from '../src/lib/runtime/resource-usage-summary'

const backendCloudUsage = {
  mode: 'backend-cloud',
  resourceOwner: 'backend',
  executionTarget: 'cloud',
  credentialSource: 'backend-stored',
  chargePolicy: 'charge',
  chargeReason: 'backend_resource',
  chargeable: true,
  estimatedCostSats: 5,
  billingReasonCode: null,
  billingReasonDetail: null,
  canExecute: true,
  blockReasonCode: null,
  blockReasonDetail: null,
  providerId: 'openai',
  modelId: 'openai:gpt-4o-mini'
} as const

describe('extractResourceUsageFromMetadata', () => {
  it('prioriza el resumen canonico si ya esta guardado', () => {
    expect(extractResourceUsageFromMetadata({
      resourceUsage: backendCloudUsage,
      finalExecutionContext: {
        mode: 'user-cloud',
        resourceOwner: 'user',
        executionTarget: 'cloud',
        credentialSource: 'user-supplied',
        chargePolicy: 'skip',
        chargeReason: 'user_resource',
        canExecute: true,
        blockReasonCode: null,
        blockReasonDetail: null,
        provider: {
          providerId: 'openai',
          modelId: 'openai:gpt-4o-mini'
        }
      },
      billingPolicy: {
        chargeable: false,
        estimatedCostSats: 5,
        skipReasonCode: 'user_resource',
        skipReasonDetail: 'RESOURCE_OWNER_USER'
      }
    })).toEqual(backendCloudUsage)
  })

  it('reconstruye el resumen desde metadata legacy cuando falta el campo canonico', () => {
    expect(extractResourceUsageFromMetadata({
      finalExecutionContext: {
        mode: 'backend-cloud',
        resourceOwner: 'backend',
        executionTarget: 'cloud',
        credentialSource: 'backend-stored',
        chargePolicy: 'charge',
        chargeReason: 'backend_resource',
        canExecute: true,
        blockReasonCode: null,
        blockReasonDetail: null,
        provider: {
          providerId: 'openai',
          modelId: 'openai:gpt-4o-mini'
        }
      },
      billingPolicy: {
        chargeable: true,
        estimatedCostSats: 5,
        skipReasonCode: null,
        skipReasonDetail: null
      }
    })).toEqual(backendCloudUsage)
  })
})
