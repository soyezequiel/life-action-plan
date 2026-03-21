import { describe, it, expect } from 'vitest'
import { t, setLocale, getCurrentLocale } from '../src/i18n'

describe('i18n', () => {
  it('devuelve la traducción para una key simple', () => {
    expect(t('app.name')).toBe('Pulso')
  })

  it('devuelve la traducción para keys anidadas', () => {
    expect(t('intake.questions.nombre')).toBe('¿Cómo te llamás?')
  })

  it('interpola parámetros con {{param}}', () => {
    const result = t('intake.progress', { current: 2, total: 5 })
    expect(result).toBe('Pregunta 2 de 5')
  })

  it('devuelve la key si no existe la traducción', () => {
    expect(t('clave.inexistente')).toBe('clave.inexistente')
  })

  it('devuelve la key si el valor no es string', () => {
    // 'intake.questions' es un objeto, no string
    expect(t('intake.questions')).toBe('intake.questions')
  })

  it('conserva {{param}} si el param no se provee', () => {
    const result = t('intake.progress', { current: 1 })
    expect(result).toContain('{{total}}')
  })

  it('getCurrentLocale devuelve es-AR por defecto', () => {
    expect(getCurrentLocale()).toBe('es-AR')
  })

  it('setLocale ignora locales desconocidos', () => {
    setLocale('fr-FR')
    expect(getCurrentLocale()).toBe('es-AR')
  })

  it('tiene las keys necesarias para el dashboard check-in', () => {
    expect(t('dashboard.title')).toBe('Tu día')
    expect(t('dashboard.check_in')).toBe('¡Listo!')
    expect(t('dashboard.undo')).toBe('Deshacer')
    expect(t('dashboard.done_count', { done: 3, total: 5 })).toBe('3 de 5 listas')
    expect(t('dashboard.all_done')).toContain('Completaste')
    expect(t('dashboard.category.estudio')).toBe('Estudio')
    expect(t('dashboard.category.ejercicio')).toBe('Ejercicio')
    expect(t('dashboard.minutes', { min: 30 })).toBe('30 min')
  })
  it('tiene las keys del inspector para la espera inicial del stream', () => {
    expect(t('debug.stream_waiting')).toContain('esperando')
    expect(t('debug.first_token_ready', { seconds: '1.2' })).toBe('Primer token: 1.2 s')
    expect(t('debug.timing_first_token_pending')).toBe('Todavia no llego')
  })
})
