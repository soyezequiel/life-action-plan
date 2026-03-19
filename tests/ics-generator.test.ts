import { describe, expect, it } from 'vitest'
import { generateIcsCalendar } from '../src/utils/ics-generator'

describe('generateIcsCalendar', () => {
  it('arma un calendario válido con encabezado y eventos', () => {
    const calendar = generateIcsCalendar({
      planName: 'Mi plan',
      timezone: 'America/Argentina/Buenos_Aires',
      rows: [
        {
          id: 'task-1',
          fecha: '2026-03-18',
          descripcion: 'Estudiar TypeScript',
          completado: false,
          notas: JSON.stringify({ hora: '08:30', duracion: 45, categoria: 'estudio' })
        }
      ]
    })

    expect(calendar).toContain('BEGIN:VCALENDAR')
    expect(calendar).toContain('END:VCALENDAR')
    expect(calendar).toContain('BEGIN:VEVENT')
    expect(calendar).toContain('SUMMARY:Estudiar TypeScript')
    expect(calendar).toContain('DTSTART:20260318T113000Z')
    expect(calendar).toContain('DTEND:20260318T121500Z')
  })

  it('escapa caracteres reservados y saltos de línea', () => {
    const calendar = generateIcsCalendar({
      planName: 'Plan, semanal',
      timezone: 'America/Argentina/Buenos_Aires',
      rows: [
        {
          id: 'task-2',
          fecha: '2026-03-19',
          descripcion: 'Leer, repasar; ajustar\nnotas',
          completado: true,
          notas: JSON.stringify({ hora: '10:00', duracion: 30, categoria: 'trabajo' })
        }
      ]
    })

    expect(calendar).toContain('X-WR-CALNAME:Plan\\, semanal')
    expect(calendar).toContain('SUMMARY:Leer\\, repasar\\; ajustar\\nnotas')
    expect(calendar).toContain('DESCRIPTION:Categoría: Trabajo\\nEstado: Completada')
  })

  it('omite filas con fecha inválida', () => {
    const calendar = generateIcsCalendar({
      planName: 'Mi plan',
      timezone: 'America/Argentina/Buenos_Aires',
      rows: [
        {
          id: 'task-3',
          fecha: 'no-fecha',
          descripcion: 'No debería aparecer',
          completado: false,
          notas: JSON.stringify({ hora: '09:00', duracion: 30, categoria: 'otro' })
        }
      ]
    })

    expect(calendar).not.toContain('BEGIN:VEVENT')
    expect(calendar).not.toContain('SUMMARY:No debería aparecer')
  })
})
