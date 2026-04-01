import { beforeEach, describe, expect, it, vi } from 'vitest'
import { extractErrorMessage } from '../src/lib/client/error-utils'

describe('extractErrorMessage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('extrae el mensaje de un objeto Error estándar', () => {
    const error = new Error('Test error')
    expect(extractErrorMessage(error)).toBe('Test error')
  })

  it('devuelve el string original si es un string', () => {
    expect(extractErrorMessage('Simple string')).toBe('Simple string')
  })

  it('procesa JSON en el string si contiene un campo error', () => {
    const payload = JSON.stringify({ error: 'Payload error' })
    expect(extractErrorMessage(payload)).toBe('Payload error')
  })

  it('maneja el objeto Event de navegador para evitar [object Event]', () => {
    // Simulamos la presencia de Event en el entorno global (como en el navegador)
    class MockEvent {
      type: string
      constructor(type: string) {
        this.type = type
      }
    }
    vi.stubGlobal('Event', MockEvent)
    
    const event = new (globalThis as any).Event('network_failure')
    expect(extractErrorMessage(event)).toBe('Network or system event: network_failure')
  })

  it('maneja objetos con propiedad type como eventos de navegador', () => {
    const obj = { type: 'connection_lost' }
    expect(extractErrorMessage(obj)).toBe('Browser event: connection_lost')
  })

  it('maneja objetos con propiedad message', () => {
    const obj = { message: 'Object with message' }
    expect(extractErrorMessage(obj)).toBe('Object with message')
  })

  it('devuelve la representación en string si no es un objeto genérico', () => {
    expect(extractErrorMessage(123)).toBe('123')
    expect(extractErrorMessage(null)).toBe('null')
  })

  it('devuelve Unknown error para objetos vacíos o genéricos sin propiedades útiles', () => {
    expect(extractErrorMessage({})).toBe('Unknown error')
  })
})
