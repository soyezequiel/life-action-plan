import { describe, expect, it } from 'vitest'
import { calculateHabitStreak } from '../src/utils/streaks'

describe('calculateHabitStreak', () => {
  it('devuelve cero si no hay hábitos completados', () => {
    expect(calculateHabitStreak([], '2026-03-18')).toEqual({ current: 0, best: 0 })
  })

  it('cuenta días consecutivos únicos aunque haya más de un hábito el mismo día', () => {
    const rows = [
      { fecha: '2026-03-16', tipo: 'habito', completado: true },
      { fecha: '2026-03-17', tipo: 'habito', completado: true },
      { fecha: '2026-03-17', tipo: 'habito', completado: true },
      { fecha: '2026-03-18', tipo: 'habito', completado: true }
    ]

    expect(calculateHabitStreak(rows, '2026-03-18')).toEqual({ current: 3, best: 3 })
  })

  it('mantiene la racha actual si el último día completado fue ayer', () => {
    const rows = [
      { fecha: '2026-03-15', tipo: 'habito', completado: true },
      { fecha: '2026-03-16', tipo: 'habito', completado: true },
      { fecha: '2026-03-17', tipo: 'habito', completado: true }
    ]

    expect(calculateHabitStreak(rows, '2026-03-18')).toEqual({ current: 3, best: 3 })
  })

  it('corta la racha actual si hubo un hueco mayor a un día', () => {
    const rows = [
      { fecha: '2026-03-10', tipo: 'habito', completado: true },
      { fecha: '2026-03-11', tipo: 'habito', completado: true },
      { fecha: '2026-03-13', tipo: 'habito', completado: true }
    ]

    expect(calculateHabitStreak(rows, '2026-03-18')).toEqual({ current: 0, best: 2 })
  })

  it('ignora tareas comunes e inválidos al calcular la racha', () => {
    const rows = [
      { fecha: '2026-03-16', tipo: 'tarea', completado: true },
      { fecha: 'no-fecha', tipo: 'habito', completado: true },
      { fecha: '2026-03-17', tipo: 'habito', completado: false },
      { fecha: '2026-03-18', tipo: 'habito', completado: true }
    ]

    expect(calculateHabitStreak(rows, '2026-03-18')).toEqual({ current: 1, best: 1 })
  })
})
