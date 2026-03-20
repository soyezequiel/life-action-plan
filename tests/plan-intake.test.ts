import { describe, it, expect } from 'vitest'
import { intakeExpressToProfile } from '../src/lib/skills/plan-intake'
import type { IntakeExpressData } from '../src/lib/skills/plan-intake'

const validData: IntakeExpressData = {
  nombre: 'María',
  edad: 28,
  ubicacion: 'Buenos Aires',
  ocupacion: 'Diseñadora gráfica freelance',
  objetivo: 'Aprender programación web y conseguir trabajo tech'
}

describe('intakeExpressToProfile', () => {
  it('genera un perfil Zod-valid a partir de 5 respuestas', () => {
    const profile = intakeExpressToProfile(validData)

    expect(profile.version).toBe('3.0')
    expect(profile.participantes).toHaveLength(1)
    expect(profile.objetivos).toHaveLength(1)
  })

  it('mapea nombre, edad, ubicación correctamente', () => {
    const profile = intakeExpressToProfile(validData)
    const p = profile.participantes[0]

    expect(p.datosPersonales.nombre).toBe('María')
    expect(p.datosPersonales.edad).toBe(28)
    expect(p.datosPersonales.ubicacion.ciudad).toBe('Buenos Aires')
  })

  it('mapea ocupación como narrativaPersonal', () => {
    const profile = intakeExpressToProfile(validData)
    expect(profile.participantes[0].datosPersonales.narrativaPersonal).toBe('Diseñadora gráfica freelance')
  })

  it('mapea objetivo como primer objetivo', () => {
    const profile = intakeExpressToProfile(validData)
    const obj = profile.objetivos[0]

    expect(obj.id).toBe('obj1')
    expect(obj.descripcion).toContain('programación')
    expect(obj.tipo).toBe('meta')
  })

  it('usa defaults razonables para campos no preguntados', () => {
    const profile = intakeExpressToProfile(validData)
    const p = profile.participantes[0]

    expect(p.patronesEnergia.cronotipo).toBe('neutro')
    expect(p.rutinaDiaria.porDefecto.despertar).toBe('07:00')
    expect(p.rutinaDiaria.porDefecto.dormir).toBe('23:00')
    expect(p.calendario.horasLibresEstimadas.diasLaborales).toBe(4)
  })

  it('tiene timezone Argentina por defecto', () => {
    const profile = intakeExpressToProfile(validData)
    expect(profile.participantes[0].datosPersonales.ubicacion.zonaHoraria)
      .toBe('America/Argentina/Buenos_Aires')
  })

  it('rechaza nombre vacío (Zod validation)', () => {
    expect(() =>
      intakeExpressToProfile({ ...validData, nombre: '' })
    ).toThrow()
  })

  it('rechaza edad negativa', () => {
    expect(() =>
      intakeExpressToProfile({ ...validData, edad: -5 })
    ).toThrow()
  })

  it('rechaza edad > 150', () => {
    expect(() =>
      intakeExpressToProfile({ ...validData, edad: 200 })
    ).toThrow()
  })

  it('el perfil generado tiene estadoDinamico válido', () => {
    const profile = intakeExpressToProfile(validData)
    expect(profile.estadoDinamico.salud).toBe('buena')
    expect(profile.estadoDinamico.nivelEnergia).toBe('medio')
    expect(profile.estadoDinamico.estadoEmocional.motivacion).toBe(3)
  })
})
