import { describe, it, expect } from 'vitest'
import { perfilSchema } from '../src/shared/schemas/perfil'
import { intakeExpressToProfile } from '../src/lib/skills/plan-intake'

describe('Zod schemas (.strict())', () => {
  it('perfilSchema rechaza campos extra (strict mode)', () => {
    const validProfile = intakeExpressToProfile({
      nombre: 'Test',
      edad: 25,
      ubicacion: 'CABA',
      ocupacion: 'Dev',
      objetivo: 'Aprender Rust'
    })

    // Agregar campo extra debería fallar en strict
    const withExtra = { ...validProfile, campoExtra: 'no debería pasar' }
    const result = perfilSchema.safeParse(withExtra)
    expect(result.success).toBe(false)
  })

  it('perfilSchema valida un perfil generado por intake', () => {
    const profile = intakeExpressToProfile({
      nombre: 'Ana',
      edad: 35,
      ubicacion: 'Córdoba',
      ocupacion: 'Contadora',
      objetivo: 'Correr una maratón'
    })

    const result = perfilSchema.safeParse(profile)
    expect(result.success).toBe(true)
  })

  it('perfilSchema requiere al menos 1 participante', () => {
    const result = perfilSchema.safeParse({
      version: '3.0',
      planificacionConjunta: false,
      participantes: [],
      objetivos: [],
      estadoDinamico: {
        ultimaActualizacion: '2026-01-01',
        salud: 'buena',
        nivelEnergia: 'medio',
        estadoEmocional: { motivacion: 3, estres: 2, satisfaccion: 3 },
        notasTemporales: [],
        umbralStaleness: 7
      }
    })
    expect(result.success).toBe(false)
  })

  it('perfilSchema valida estadoEmocional en rango 1-5', () => {
    const profile = intakeExpressToProfile({
      nombre: 'Luis',
      edad: 40,
      ubicacion: 'Rosario',
      ocupacion: 'Chef',
      objetivo: 'Abrir restaurante'
    })

    // Forzar valor fuera de rango
    const modified = JSON.parse(JSON.stringify(profile))
    modified.estadoDinamico.estadoEmocional.motivacion = 10
    const result = perfilSchema.safeParse(modified)
    expect(result.success).toBe(false)
  })
})
