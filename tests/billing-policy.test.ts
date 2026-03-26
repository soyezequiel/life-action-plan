import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveBillingPolicy } from '../src/lib/payments/billing-policy'
import type { ResolvedExecutionContext } from '../src/shared/types/execution-context'

function createContext(overrides: Partial<ResolvedExecutionContext> = {}): ResolvedExecutionContext {
  return {
    mode: 'backend-cloud',
    resourceOwner: 'backend',
    executionTarget: 'cloud',
    credentialSource: 'backend-stored',
    provider: {
      providerId: 'openai',
      modelId: 'openai:gpt-4o-mini',
      providerKind: 'cloud'
    },
    chargePolicy: 'charge',
    chargeReason: 'backend_resource',
    credentialId: 'cred-backend',
    canExecute: true,
    resolutionSource: 'auto-backend-stored',
    blockReasonCode: null,
    blockReasonDetail: null,
    ...overrides
  }
}

describe('billing policy', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('cobra una operacion backend-cloud billable usando la estrategia fija actual', () => {
    vi.stubEnv('LAP_PLAN_BUILD_CHARGE_SATS', '7')

    const decision = resolveBillingPolicy({
      operation: 'plan_build',
      executionContext: createContext()
    })

    expect(decision).toEqual(expect.objectContaining({
      operation: 'plan_build',
      executionMode: 'backend-cloud',
      resourceOwner: 'backend',
      billableOperation: true,
      estimatedAmountStrategy: 'fixed_plan_build_sats',
      estimatedCostSats: 7,
      estimatedCostUsd: 0.007,
      chargeable: true,
      skipReasonCode: null
    }))
  })

  it('saltea el cobro si el recurso es del usuario aunque la operacion sea build', () => {
    const decision = resolveBillingPolicy({
      operation: 'plan_build',
      executionContext: createContext({
        mode: 'user-cloud',
        resourceOwner: 'user',
        credentialSource: 'user-stored',
        chargePolicy: 'skip',
        chargeReason: 'user_resource',
        credentialId: 'cred-user',
        resolutionSource: 'auto-user-stored'
      })
    })

    expect(decision).toEqual(expect.objectContaining({
      executionMode: 'user-cloud',
      resourceOwner: 'user',
      chargeable: false,
      skipReasonCode: 'user_resource',
      skipReasonDetail: 'RESOURCE_OWNER_USER'
    }))
  })

  it('saltea el cobro si el modo codex usa la sesion local solo como herramienta interna', () => {
    const decision = resolveBillingPolicy({
      operation: 'plan_build',
      executionContext: createContext({
        mode: 'codex-cloud',
        resourceOwner: 'backend',
        credentialSource: 'none',
        chargePolicy: 'skip',
        chargeReason: 'internal_tooling',
        credentialId: null,
        resolutionSource: 'requested-mode'
      })
    })

    expect(decision).toEqual(expect.objectContaining({
      executionMode: 'codex-cloud',
      resourceOwner: 'backend',
      chargeable: false,
      skipReasonCode: 'internal_tooling',
      skipReasonDetail: 'INTERNAL_TOOLING_MODE'
    }))
  })

  it('saltea backend-local en desarrollo porque no genera cobro real para el usuario', () => {
    const decision = resolveBillingPolicy({
      operation: 'plan_build',
      executionContext: createContext({
        mode: 'backend-local',
        executionTarget: 'backend-local',
        credentialSource: 'none',
        provider: {
          providerId: 'ollama',
          modelId: 'ollama:qwen3:8b',
          providerKind: 'local'
        },
        credentialId: null,
        resolutionSource: 'auto-backend-local'
      })
    })

    expect(decision).toEqual(expect.objectContaining({
      executionMode: 'backend-local',
      resourceOwner: 'backend',
      chargeable: false,
      skipReasonCode: 'operation_not_chargeable',
      skipReasonDetail: 'LOCAL_EXECUTION_NO_CHARGE'
    }))
  })

  it('deja simulate sin cobro mientras no tenga estrategia de monto', () => {
    const decision = resolveBillingPolicy({
      operation: 'plan_simulate',
      executionContext: createContext()
    })

    expect(decision).toEqual(expect.objectContaining({
      operation: 'plan_simulate',
      billableOperation: true,
      estimatedAmountStrategy: 'none',
      estimatedCostSats: 0,
      chargeable: false,
      skipReasonCode: 'operation_not_chargeable',
      skipReasonDetail: 'NO_ESTIMATE_STRATEGY'
    }))
  })

  it('bloquea el billing si la ejecucion ya viene bloqueada desde el resolvedor', () => {
    const decision = resolveBillingPolicy({
      operation: 'plan_build',
      executionContext: createContext({
        canExecute: false,
        blockReasonCode: 'backend_credential_missing',
        blockReasonDetail: 'No active backend credential is configured for provider openai.'
      })
    })

    expect(decision).toEqual(expect.objectContaining({
      chargeable: false,
      skipReasonCode: 'execution_blocked',
      skipReasonDetail: 'No active backend credential is configured for provider openai.'
    }))
  })

  it('saltea user-local por owner del recurso y no por el nombre del modelo', () => {
    const decision = resolveBillingPolicy({
      operation: 'plan_build',
      executionContext: createContext({
        mode: 'user-local',
        resourceOwner: 'user',
        executionTarget: 'user-local',
        credentialSource: 'none',
        provider: {
          providerId: 'ollama',
          modelId: 'ollama:qwen3:8b',
          providerKind: 'local'
        },
        chargePolicy: 'skip',
        chargeReason: 'user_resource',
        credentialId: null,
        resolutionSource: 'requested-mode'
      })
    })

    expect(decision).toEqual(expect.objectContaining({
      executionMode: 'user-local',
      chargeable: false,
      skipReasonCode: 'user_resource'
    }))
  })
})
