import { describe, expect, it } from 'vitest'
import { simulatePlanViability } from '../src/skills/plan-simulator'
import type { Perfil } from '../src/shared/schemas/perfil'
import type { ProgressRow } from '../src/shared/types/ipc'

const profile = {
  participantes: [
    {
      rutinaDiaria: {
        porDefecto: {
          despertar: '07:00',
          dormir: '23:00',
          trabajoInicio: '09:00',
          trabajoFin: '18:00'
        }
      },
      calendario: {
        horasLibresEstimadas: {
          diasLaborales: 4,
          diasDescanso: 8
        }
      }
    }
  ]
} as unknown as Perfil

function row(
  id: string,
  fecha: string,
  hora: string | null,
  duracion: number | null,
  descripcion = 'Actividad'
): ProgressRow {
  return {
    id,
    planId: 'plan-1',
    fecha,
    tipo: 'tarea',
    objetivoId: 'obj1',
    descripcion,
    completado: false,
    notas: hora && duracion
      ? JSON.stringify({ hora, duracion, categoria: 'estudio' })
      : null,
    createdAt: fecha
  }
}

describe('simulatePlanViability', () => {
  it('marca faltante si no hay actividades para revisar', () => {
    const result = simulatePlanViability(profile, [], {
      timezone: 'America/Argentina/Buenos_Aires',
      locale: 'es-AR'
    })

    expect(result.summary).toMatchObject({
      overallStatus: 'MISSING',
      missing: 1
    })
    expect(result.findings).toEqual([
      expect.objectContaining({ code: 'no_plan_items', status: 'MISSING' })
    ])
  })

  it('detecta choques de horario y de capacidad', () => {
    const result = simulatePlanViability(profile, [
      row('a', '2026-03-23', '10:00', 120, 'Trabajo cruzado'),
      row('b', '2026-03-23', '22:30', 90, 'Muy tarde'),
      row('c', '2026-03-23', '19:30', 90, 'Carga 1'),
      row('d', '2026-03-23', '21:00', 90, 'Carga 2')
    ], {
      timezone: 'America/Argentina/Buenos_Aires',
      locale: 'es-AR'
    })

    expect(result.summary.overallStatus).toBe('FAIL')
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'overlaps_work',
      'outside_awake_hours',
      'day_over_capacity',
      'too_many_activities'
    ]))
  })

  it('devuelve pass cuando el plan entra en tiempo y horario', () => {
    const result = simulatePlanViability(profile, [
      row('a', '2026-03-24', '07:30', 30, 'Caminar'),
      row('b', '2026-03-24', '19:00', 45, 'Leer'),
      row('c', '2026-03-29', '10:00', 60, 'Descanso largo')
    ], {
      timezone: 'America/Argentina/Buenos_Aires',
      locale: 'es-AR'
    })

    expect(result.summary).toMatchObject({
      overallStatus: 'PASS',
      fail: 0,
      warn: 0,
      missing: 0
    })
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'schedule_ok',
      'work_balance_ok',
      'capacity_ok',
      'metadata_ok'
    ]))
  })

  it('marca faltante sin inventar pass si faltan horarios', () => {
    const result = simulatePlanViability(profile, [
      row('a', '2026-03-25', null, null, 'Sin metadata')
    ], {
      timezone: 'America/Argentina/Buenos_Aires',
      locale: 'es-AR'
    })

    expect(result.summary.overallStatus).toBe('MISSING')
    expect(result.findings.map((finding) => finding.code)).toContain('missing_schedule')
    expect(result.findings.map((finding) => finding.code)).not.toContain('schedule_ok')
  })
})
