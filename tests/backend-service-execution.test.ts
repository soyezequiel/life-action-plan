import { describe, expect, it } from 'vitest'
import { resolveBackendServiceExecution } from '../src/lib/runtime/backend-service-execution'

describe('backend service execution', () => {
  it('resuelve plan_simulate como recurso backend-local y reutiliza billing policy', () => {
    const resolution = resolveBackendServiceExecution({
      operation: 'plan_simulate',
      providerId: 'lap',
      modelId: 'lap:plan-simulator'
    })

    expect(resolution.executionContext).toEqual(expect.objectContaining({
      mode: 'backend-local',
      resourceOwner: 'backend',
      executionTarget: 'backend-local',
      credentialSource: 'none',
      canExecute: true,
      provider: expect.objectContaining({
        providerId: 'lap',
        modelId: 'lap:plan-simulator',
        providerKind: 'local'
      })
    }))
    expect(resolution.billingPolicy).toEqual(expect.objectContaining({
      operation: 'plan_simulate',
      executionMode: 'backend-local',
      resourceOwner: 'backend',
      chargeable: false,
      skipReasonCode: 'operation_not_chargeable'
    }))
  })
})
