import { describe, expect, it } from 'vitest'

import { resolveInteractiveDefaultProvider } from '../src/lib/pipeline/v5/interactive-coordinator'

describe('interactive coordinator provider defaults', () => {
  it('prefiere el provider explicito del request', () => {
    expect(resolveInteractiveDefaultProvider({
      provider: 'openrouter',
      workflowProvider: 'ollama:qwen3:8b',
      resourceMode: 'auto',
      deploymentMode: 'local',
      hasApiKey: false
    })).toBe('openrouter')
  })

  it('hereda el provider del workflow cuando existe', () => {
    expect(resolveInteractiveDefaultProvider({
      provider: undefined,
      workflowProvider: 'openrouter:openai/gpt-4o-mini',
      resourceMode: 'auto',
      deploymentMode: 'local',
      hasApiKey: false
    })).toBe('openrouter:openai/gpt-4o-mini')
  })

  it('usa ollama por defecto en local cuando no hay credenciales ni gate previo', () => {
    expect(resolveInteractiveDefaultProvider({
      provider: undefined,
      workflowProvider: null,
      resourceMode: 'auto',
      deploymentMode: 'local',
      hasApiKey: false
    })).toBe('ollama')
  })

  it('mantiene el default cloud cuando el usuario aporta su propia clave', () => {
    expect(resolveInteractiveDefaultProvider({
      provider: undefined,
      workflowProvider: null,
      resourceMode: 'auto',
      deploymentMode: 'local',
      hasApiKey: true
    })).toBeUndefined()
  })
})
