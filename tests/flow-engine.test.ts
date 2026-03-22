import { describe, expect, it, vi } from 'vitest'
import { DateTime } from 'luxon'
import {
  analyzeObjectives,
  applyResumePatch,
  buildCalendarState,
  buildPlanEventsFromFlow,
  buildPresentationDraft,
  buildProfileFromFlow,
  buildStrategicPlanRefined,
  createEmptyFlowState,
  createIntakeBlocks,
  resolveRealityCheck,
  resolveTopDownLevels,
  runStrategicSimulation
} from '../src/lib/flow/engine'

describe('flow engine', () => {
  it('uses the named month when a goal points to a concrete month and year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'))

    try {
      const goals = analyzeObjectives(['Aprobar en diciembre 2026'])

      expect(goals[0]?.horizonMonths).toBe(9)
    } finally {
      vi.useRealTimers()
    }
  })

  it('creates a dynamic fallback intake that still keeps the feasibility questions required for the plan', () => {
    const goals = analyzeObjectives([
      'Bajar de peso',
      'Aprender ingles',
      'Mejorar mis finanzas'
    ])

    const blocks = createIntakeBlocks(goals)
    const keys = blocks.flatMap((block) => block.questions.map((question) => question.key))

    expect(blocks.length).toBeGreaterThanOrEqual(1)
    expect(blocks.length).toBeLessThanOrEqual(3)
    expect(blocks.every((block) => block.questions.length <= 5)).toBe(true)
    expect(keys).toEqual(expect.arrayContaining([
      'goalClarity',
      'trabajoInicio',
      'trabajoFin',
      'mejorMomento',
      'restricciones',
      'horasLibresLaborales',
      'horasLibresDescanso'
    ]))
    expect(blocks.flatMap((block) => block.questions).find((question) => question.key === 'horasLibresLaborales')).toMatchObject({
      type: 'range',
      min: 0,
      max: 6,
      step: 1,
      unit: 'hs'
    })
    expect(blocks.flatMap((block) => block.questions).find((question) => question.key === 'horasLibresDescanso')).toMatchObject({
      type: 'range',
      min: 0,
      max: 10,
      step: 1,
      unit: 'hs'
    })
  })

  it('maps plan duration to the expected top-down levels', () => {
    expect(resolveTopDownLevels(36)).toEqual(['year', 'quarter', 'month', 'week', 'day'])
    expect(resolveTopDownLevels(18)).toEqual(['quarter', 'month', 'week', 'day'])
    expect(resolveTopDownLevels(6)).toEqual(['month', 'week', 'day'])
    expect(resolveTopDownLevels(2)).toEqual(['week', 'day'])
    expect(resolveTopDownLevels(0)).toEqual(['day'])
  })

  it('infers a long horizon when the objective points to a concrete future year', () => {
    const targetYear = DateTime.local().plus({ years: 5 }).year
    const goals = analyzeObjectives([`Ser presidente de Argentina en ${targetYear}`])

    expect(goals[0]?.effort).toBe('alto')
    expect(goals[0]?.horizonMonths).toBe(60)
  })

  it('imports calendar hints from ics notes without destroying existing availability', () => {
    const calendar = buildCalendarState({
      monday: { morning: true, afternoon: true, evening: true },
      tuesday: { morning: true, afternoon: false, evening: true },
      wednesday: { morning: false, afternoon: true, evening: true },
      thursday: { morning: true, afternoon: true, evening: false },
      friday: { morning: true, afternoon: false, evening: true },
      saturday: { morning: true, afternoon: true, evening: true },
      sunday: { morning: false, afternoon: true, evening: false }
    }, 'Rutina base', 'Evento fijo el lunes y el jueves')

    expect(calendar.importedIcs).toBe(true)
    expect(calendar.grid.monday.morning).toBe(false)
    expect(calendar.grid.monday.afternoon).toBe(false)
    expect(calendar.grid.monday.evening).toBe(true)
    expect(calendar.grid.thursday.morning).toBe(false)
    expect(calendar.notes).toBe('Rutina base')
  })

  it('applies resume patches without dropping previous state', () => {
    const goals = analyzeObjectives([
      'Cambiar de trabajo en 6 meses',
      'Curso de ingles en 6 meses'
    ])
    const profile = buildProfileFromFlow(goals, {
      horasLibresLaborales: '2',
      horasLibresDescanso: '4'
    })
    const strategy = buildStrategicPlanRefined(goals, profile)
    const reality = resolveRealityCheck(strategy, profile, 'keep')
    const simulation = runStrategicSimulation(strategy, reality.result)
    const presentation = buildPresentationDraft(strategy, simulation)
    const baseState = {
      ...createEmptyFlowState(),
      goals,
      intakeBlocks: createIntakeBlocks(goals),
      intakeAnswers: {
        horasLibresLaborales: '2',
        horasLibresDescanso: '4'
      },
      strategy,
      realityCheck: reality.result,
      simulation,
      presentation,
      activation: {
        activatedAt: DateTime.utc().toISO() ?? '2026-03-21T00:00:00.000Z',
        planId: 'plan-1'
      }
    }

    const result = applyResumePatch(profile, baseState, 'Tengo menos tiempo porque empece un trabajo nuevo')

    expect(strategy.estimatedWeeklyHours).toBe(10)
    expect(result.strategyRebuilt).toBe(true)
    expect(result.profile?.participantes[0]?.calendario?.horasLibresEstimadas?.diasLaborales).toBe(1)
    expect(result.profile?.estadoDinamico.notasTemporales).toContain('Tengo menos tiempo porque empece un trabajo nuevo')
    expect(result.state.activation.planId).toBe('plan-1')
    expect(result.state.intakeAnswers.horasLibresLaborales).toBe('2')
    expect(result.state.intakeAnswers.horasLibresDescanso).toBe('4')
    expect(result.state.strategy?.estimatedWeeklyHours).toBe(5)
    expect(result.state.realityCheck?.availableHours).toBe(11)
    expect(result.state.simulation).toBeNull()
    expect(result.state.presentation).toBeNull()
    expect(result.state.resume?.patchSummary).toBe(result.patchSummary)
  })

  it('keeps support-track goals in parallel and leaves a reality baseline ready', () => {
    const goals = analyzeObjectives([
      'Cambiar de trabajo a producto en 6 meses',
      'Volver a entrenar 3 veces por semana'
    ])
    const profile = buildProfileFromFlow(goals, {
      horasLibresLaborales: '2',
      horasLibresDescanso: '4'
    })

    const strategy = buildStrategicPlanRefined(goals, profile)
    const reality = resolveRealityCheck(strategy, profile, 'keep')
    const careerPhase = strategy.phases.find((phase) => phase.goalIds.includes(goals[0]?.id ?? ''))
    const healthPhase = strategy.phases.find((phase) => phase.goalIds.includes(goals[1]?.id ?? ''))

    expect(careerPhase).toBeTruthy()
    expect(healthPhase).toBeTruthy()
    expect(healthPhase?.startMonth).toBe(1)
    expect(healthPhase?.dependencies).toEqual([])
    expect(strategy.estimatedWeeklyHours).toBeLessThanOrEqual(
      strategy.phases.reduce((total, phase) => total + phase.hoursPerWeek, 0)
    )
    expect(reality.result.availableHours).toBe(18)
    expect(reality.result.neededHours).toBe(strategy.estimatedWeeklyHours)
    expect(reality.result.summary.length).toBeGreaterThan(0)
  })

  it('splits a single long-horizon goal into sequential phases that cover the whole plan', () => {
    const targetYear = DateTime.local().plus({ years: 5 }).year
    const goals = analyzeObjectives([`Ser presidente de Argentina en ${targetYear}`])
    const profile = buildProfileFromFlow(goals, {
      horasLibresLaborales: '2',
      horasLibresDescanso: '4'
    })

    const strategy = buildStrategicPlanRefined(goals, profile)

    expect(strategy.phases.length).toBeGreaterThan(1)
    expect(strategy.phases[0]?.startMonth).toBe(1)
    expect(strategy.phases.at(-1)?.endMonth).toBe(strategy.totalMonths)
    expect(strategy.phases.every((phase, index) => (
      index === 0 || phase.startMonth === (strategy.phases[index - 1]?.endMonth ?? 0) + 1
    ))).toBe(true)
  })

  it('keeps simulation metadata explicit so the UI can show what was checked', () => {
    const goals = analyzeObjectives(['Cambiar de trabajo a producto en 6 meses'])
    const profile = buildProfileFromFlow(goals, {
      horasLibresLaborales: '2',
      horasLibresDescanso: '4'
    })
    const strategy = buildStrategicPlanRefined(goals, profile)
    const reality = resolveRealityCheck(strategy, profile, 'keep')
    const simulation = runStrategicSimulation(strategy, reality.result)

    expect(simulation.method).toBe('rules')
    expect(simulation.reviewSummary.length).toBeGreaterThan(0)
    expect(simulation.checkedAreas.length).toBeGreaterThanOrEqual(3)
  })

  it('builds first-week events without ignoring weekly frequency or fixed blocked slots', () => {
    const goals = analyzeObjectives([
      'Cambiar de trabajo a producto en 6 meses',
      'Volver a entrenar 3 veces por semana'
    ])
    const profile = buildProfileFromFlow(goals, {
      trabajoInicio: '09:00',
      trabajoFin: '18:00',
      horariosFijos: 'Martes y jueves 19 a 21 curso ingles. Sabados 10 a 12 compromiso familiar.',
      horasLibresLaborales: '3',
      horasLibresDescanso: '5'
    })
    const strategy = buildStrategicPlanRefined(goals, profile)
    const events = buildPlanEventsFromFlow({
      goals,
      strategy,
      calendar: buildCalendarState(undefined, ''),
      profile
    })

    const trainingWeekOne = events.filter((event) => event.objetivoId === goals[1]?.id && event.semana === 1)
    const weekOneSlotKeys = events
      .filter((event) => event.semana === 1)
      .map((event) => `${event.dia}-${event.hora}`)

    expect(trainingWeekOne).toHaveLength(3)
    expect(trainingWeekOne.every((event) => event.duracion <= 90)).toBe(true)
    expect(trainingWeekOne.some((event) => event.dia === 'martes' && event.hora === '19:30')).toBe(false)
    expect(trainingWeekOne.some((event) => event.dia === 'jueves' && event.hora === '19:30')).toBe(false)
    expect(trainingWeekOne.some((event) => event.dia === 'sabado' && event.hora === '07:30')).toBe(false)
    expect(new Set(weekOneSlotKeys).size).toBe(weekOneSlotKeys.length)
  })

  it('keeps blocked slots isolated by schedule fragment', () => {
    const goals = analyzeObjectives(['Aprender ingles en 6 meses'])
    const profile = buildProfileFromFlow(goals, {
      horariosFijos: 'martes y jueves 18 a 20, sabados a la manana',
      horasLibresLaborales: '2',
      horasLibresDescanso: '2'
    })
    const calendar = buildCalendarState({
      monday: { morning: false, afternoon: false, evening: false },
      tuesday: { morning: true, afternoon: false, evening: false },
      wednesday: { morning: false, afternoon: false, evening: false },
      thursday: { morning: false, afternoon: false, evening: false },
      friday: { morning: false, afternoon: false, evening: false },
      saturday: { morning: false, afternoon: false, evening: true },
      sunday: { morning: false, afternoon: false, evening: false }
    }, '')
    const strategy = buildStrategicPlanRefined(goals, profile)
    const weekOneEvents = buildPlanEventsFromFlow({
      goals,
      strategy,
      calendar,
      profile
    }).filter((event) => event.semana === 1)

    expect(weekOneEvents.some((event) => event.dia === 'martes' && event.hora === '07:30')).toBe(true)
    expect(weekOneEvents.some((event) => event.dia === 'sabado' && event.hora === '19:30')).toBe(true)
  })

  it('stores goal clarity as a clarification note instead of overwriting the good-day pattern', () => {
    const goals = analyzeObjectives(['Bajar de peso'])
    const goalClarity = 'Bajar 4 kg y sostener 3 entrenamientos por semana'
    const profile = buildProfileFromFlow(goals, {
      goalClarity,
      motivacion: 'Quiero sentirme mejor',
      horasLibresLaborales: '2',
      horasLibresDescanso: '4'
    })

    expect(profile.participantes[0]?.patronesConocidos?.diaTipicoBueno).toBe('Semana con bloques cortos y sostenidos.')
    expect(profile.participantes[0]?.patronesConocidos?.tendencias).toContain(`Meta clarificada: ${goalClarity}`)
    expect(profile.objetivos[0]?.motivacion).toBe(goalClarity)
  })
})
