import { describe, it, expect } from 'vitest'
import { getProvider } from '../src/providers/provider-factory'

describe('getProvider', () => {
  it('crea un runtime OpenAI con modelo default', () => {
    const runtime = getProvider('openai:gpt-4o-mini', { apiKey: 'test-key' })
    expect(runtime).toBeDefined()
    expect(runtime.chat).toBeTypeOf('function')
    expect(runtime.stream).toBeTypeOf('function')
    expect(runtime.newContext).toBeTypeOf('function')
  })

  it('crea un runtime Ollama apuntando a localhost', () => {
    const runtime = getProvider('ollama:qwen3:8b', { apiKey: '' })
    expect(runtime).toBeDefined()
    expect(runtime.chat).toBeTypeOf('function')
  })

  it('soporta modelo sin prefijo (default openai)', () => {
    const runtime = getProvider('gpt-4o-mini', { apiKey: 'test-key' })
    expect(runtime).toBeDefined()
  })

  it('parsea correctamente modelId con múltiples ":" (ollama:qwen3:8b)', () => {
    // Verifica que "ollama:qwen3:8b" no pierda ":8b"
    const runtime = getProvider('ollama:qwen3:8b', { apiKey: '' })
    expect(runtime).toBeDefined()
    expect(runtime.chat).toBeTypeOf('function')
  })

  it('tira error para provider desconocido', () => {
    expect(() => getProvider('anthropic:claude-3', { apiKey: 'k' })).toThrow('Unknown provider')
  })

  it('newContext devuelve un nuevo runtime funcional', () => {
    const runtime = getProvider('openai:gpt-4o-mini', { apiKey: 'test-key' })
    const newRuntime = runtime.newContext()
    expect(newRuntime).toBeDefined()
    expect(newRuntime.chat).toBeTypeOf('function')
    expect(newRuntime).not.toBe(runtime)
  })
})
