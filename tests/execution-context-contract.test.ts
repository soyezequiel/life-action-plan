import { describe, expect, it } from 'vitest'
import {
  createResourceExecutionContext,
  EXECUTION_MODE_SPECS,
  getChargePolicyForResourceOwner,
  resourceExecutionContextSchema
} from '../src/shared/schemas'

describe('execution context contract', () => {
  it('mantiene la matriz canonica de owner y cobro por modo', () => {
    expect(EXECUTION_MODE_SPECS['backend-cloud']).toMatchObject({
      resourceOwner: 'backend',
      executionTarget: 'cloud',
      chargePolicy: 'charge'
    })
    expect(EXECUTION_MODE_SPECS['user-cloud']).toMatchObject({
      resourceOwner: 'user',
      executionTarget: 'cloud',
      chargePolicy: 'skip'
    })
    expect(EXECUTION_MODE_SPECS['backend-local']).toMatchObject({
      resourceOwner: 'backend',
      executionTarget: 'backend-local',
      chargePolicy: 'charge'
    })
    expect(EXECUTION_MODE_SPECS['user-local']).toMatchObject({
      resourceOwner: 'user',
      executionTarget: 'user-local',
      chargePolicy: 'skip'
    })
  })

  it('crea un contexto valido para backend-cloud y cobra', () => {
    const context = createResourceExecutionContext({
      mode: 'backend-cloud',
      credentialSource: 'backend-stored',
      provider: {
        providerId: 'openrouter',
        modelId: 'openrouter:openai/gpt-4o-mini',
        providerKind: 'cloud'
      }
    })

    expect(context.resourceOwner).toBe('backend')
    expect(context.chargePolicy).toBe('charge')
    expect(context.chargeReason).toBe('backend_resource')
  })

  it('crea un contexto valido para user-cloud sin cobro', () => {
    const context = createResourceExecutionContext({
      mode: 'user-cloud',
      credentialSource: 'user-stored',
      provider: {
        providerId: 'openai',
        modelId: 'openai:gpt-4o-mini',
        providerKind: 'cloud'
      }
    })

    expect(context.resourceOwner).toBe('user')
    expect(context.chargePolicy).toBe('skip')
    expect(context.chargeReason).toBe('user_resource')
  })

  it('crea un contexto valido para backend-local y lo considera cobrable', () => {
    const context = createResourceExecutionContext({
      mode: 'backend-local',
      credentialSource: 'none',
      provider: {
        providerId: 'ollama',
        modelId: 'ollama:qwen3:8b',
        providerKind: 'local'
      }
    })

    expect(context.executionTarget).toBe('backend-local')
    expect(context.chargePolicy).toBe('charge')
  })

  it('crea un contexto valido para user-local sin cobro', () => {
    const context = createResourceExecutionContext({
      mode: 'user-local',
      credentialSource: 'none',
      provider: {
        providerId: 'ollama',
        modelId: 'ollama:qwen3:8b',
        providerKind: 'local'
      }
    })

    expect(context.executionTarget).toBe('user-local')
    expect(context.chargePolicy).toBe('skip')
  })

  it('rechaza campos extra por strict mode', () => {
    const result = resourceExecutionContextSchema.safeParse({
      mode: 'backend-cloud',
      resourceOwner: 'backend',
      executionTarget: 'cloud',
      credentialSource: 'backend-stored',
      chargePolicy: 'charge',
      chargeReason: 'backend_resource',
      provider: {
        providerId: 'openrouter',
        modelId: 'openrouter:openai/gpt-4o-mini',
        providerKind: 'cloud'
      },
      extra: 'no deberia pasar'
    })

    expect(result.success).toBe(false)
  })

  it('rechaza combinaciones inconsistentes entre modo y credentialSource', () => {
    const result = resourceExecutionContextSchema.safeParse({
      mode: 'user-cloud',
      resourceOwner: 'user',
      executionTarget: 'cloud',
      credentialSource: 'backend-stored',
      chargePolicy: 'skip',
      chargeReason: 'user_resource',
      provider: {
        providerId: 'openai',
        modelId: 'openai:gpt-4o-mini',
        providerKind: 'cloud'
      }
    })

    expect(result.success).toBe(false)
  })

  it('rechaza providerKind cloud en un target local', () => {
    const result = resourceExecutionContextSchema.safeParse({
      mode: 'backend-local',
      resourceOwner: 'backend',
      executionTarget: 'backend-local',
      credentialSource: 'none',
      chargePolicy: 'charge',
      chargeReason: 'backend_resource',
      provider: {
        providerId: 'ollama',
        modelId: 'ollama:qwen3:8b',
        providerKind: 'cloud'
      }
    })

    expect(result.success).toBe(false)
  })

  it('aplica la politica de cobro base segun owner', () => {
    expect(getChargePolicyForResourceOwner('backend')).toBe('charge')
    expect(getChargePolicyForResourceOwner('user')).toBe('skip')
  })
})
