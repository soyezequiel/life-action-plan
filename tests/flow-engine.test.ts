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

  it('expands goal categorization and effort heuristics for common real-life phrasings', () => {
    const goals = analyzeObjectives([
      'Dejar de fumar',
      'Aprobar el final de algebra',
      'Meditar todos los dias',
      'Mudanza a otra ciudad',
      'Get a remote job',
      'Correr 42 km'
    ])

    expect(goals[0]).toMatchObject({ category: 'salud', effort: 'alto' })
    expect(goals[1]).toMatchObject({ category: 'educacion' })
    expect(goals[2]).toMatchObject({ category: 'salud' })
    expect(goals[3]).toMatchObject({ category: 'mixto' })
    expect(goals[4]).toMatchObject({ category: 'carrera' })
    expect(goals[5]).toMatchObject({ category: 'salud', effort: 'alto' })
  })

  it('parses indirect annual horizons before falling back to the effort default', () => {
    const goals = analyzeObjectives(['Leer 24 libros al año'])

    expect(goals[0]?.category).toBe('educacion')
    expect(goals[0]?.horizonMonths).toBe(12)
  })

  it('cleans conversational prefixes from single-goal plan titles', () => {
    const goals = analyzeObjectives(['Quiero bajar de peso'])
    const profile = buildProfileFromFlow(goals, {
      horasLibresLaborales: '2',
      horasLibresDescanso: '4'
    })
    const strategy = buildStrategicPlanRefined(goals, profile)

    expect(strategy.title).toBe('Plan para bajar de peso')
  })

  it('flags only genuinely vague goals for clarification', () => {
    const vagueGoal = analyzeObjectives(['Ser feliz'])
    const actionableGoal = analyzeObjectives(['Correr una maraton en octubre'])
    const specificChangeGoal = analyzeObjectives(['Cambiar de trabajo'])

    expect(vagueGoal[0]?.needsClarification).toBe(true)
    expect(actionableGoal[0]?.needsClarification).toBe(false)
    expect(specificChangeGoal[0]?.needsClarification).toBe(false)
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
    if (!calendar) throw new Error('calendar is null')

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
    expect(result.state.strategy?.estimatedWeeklyHours).toBe(10)
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

  it('reports the most demanding month when several phases overlap', () => {
    const strategy = {
      title: 'Plan unificado de objetivos',
      summary: 'Dos frentes fuertes en paralelo al principio.',
      totalMonths: 6,
      estimatedWeeklyHours: 16,
      phases: [
        {
          id: 'phase-1',
          title: 'Fase 1: Cambio laboral',
          summary: 'Busqueda activa durante los primeros meses.',
          goalIds: ['goal-1'],
          dependencies: [],
          startMonth: 1,
          endMonth: 3,
          hoursPerWeek: 8,
          milestone: 'Cerrar entrevistas',
          metrics: []
        },
        {
          id: 'phase-2',
          title: 'Fase 2: Proyecto paralelo',
          summary: 'Frente paralelo concentrado al inicio.',
          goalIds: ['goal-2'],
          dependencies: [],
          startMonth: 1,
          endMonth: 3,
          hoursPerWeek: 8,
          milestone: 'Armar portfolio',
          metrics: []
        }
      ],
      milestones: ['Cerrar entrevistas', 'Armar portfolio'],
      conflicts: []
    } satisfies Parameters<typeof runStrategicSimulation>[0]
    const realityCheck = {
      status: 'ok',
      availableHours: 18,
      neededHours: 16,
      selectedAdjustment: 'keep',
      summary: 'La carga general entra.',
      recommendations: [],
      adjustmentsApplied: []
    } satisfies Parameters<typeof runStrategicSimulation>[1]
    const simulation = runStrategicSimulation(strategy, realityCheck)

    expect(simulation.findings.some((finding) => finding.includes('mes 1'))).toBe(true)
    expect(simulation.findings.some((finding) => finding.includes('2 frentes activos'))).toBe(true)
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
    const weeklyMinutes = trainingWeekOne.reduce((total, event) => total + event.duracion, 0)

    expect(trainingWeekOne).toHaveLength(3)
    expect(weeklyMinutes).toBeGreaterThanOrEqual((goals[1]?.hoursPerWeek ?? 0) * 60)
    expect(trainingWeekOne.some((event) => event.dia === 'martes' && event.hora === '19:30')).toBe(false)
    expect(trainingWeekOne.some((event) => event.dia === 'jueves' && event.hora === '19:30')).toBe(false)
    expect(trainingWeekOne.some((event) => event.dia === 'sabado' && event.hora === '07:30')).toBe(false)
    expect(new Set(weekOneSlotKeys).size).toBe(weekOneSlotKeys.length)
  })

  it('keeps weekly event minutes aligned with the hours promised by the plan', () => {
    const goals = analyzeObjectives(['Bajar de peso'])
    const profile = buildProfileFromFlow(goals, {
      horasLibresLaborales: '3',
      horasLibresDescanso: '4'
    })
    const strategy = buildStrategicPlanRefined(goals, profile)
    const weekOneMinutes = buildPlanEventsFromFlow({
      goals,
      strategy,
      calendar: buildCalendarState(undefined, ''),
      profile
    })
      .filter((event) => event.objetivoId === goals[0]?.id && event.semana === 1)
      .reduce((total, event) => total + event.duracion, 0)

    expect(weekOneMinutes).toBeGreaterThanOrEqual((goals[0]?.hoursPerWeek ?? 0) * 60)
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

  it('extends the last phase when sequential goals leave dead months at the end of the plan', () => {
    const goals = [
      {
        id: 'goal-1',
        text: 'Cambiar de trabajo',
        category: 'carrera',
        effort: 'medio',
        isHabit: false,
        needsClarification: false,
        priority: 1,
        horizonMonths: 12,
        hoursPerWeek: 5
      },
      {
        id: 'goal-2',
        text: 'Terminar una certificacion',
        category: 'educacion',
        effort: 'medio',
        isHabit: false,
        needsClarification: false,
        priority: 2,
        horizonMonths: 12,
        hoursPerWeek: 5
      }
    ] satisfies ReturnType<typeof analyzeObjectives>
    const profile = buildProfileFromFlow(goals, {
      horasLibresLaborales: '1',
      horasLibresDescanso: '1'
    })
    const strategy = buildStrategicPlanRefined(goals, profile)

    expect(strategy.totalMonths).toBe(12)
    expect(strategy.phases.at(-1)?.endMonth).toBe(12)
  })

  it('treats savings goals as support-track habits with minimal weekly load', () => {
    const goals = analyzeObjectives(['Ahorrar $5000'])
    const profile = buildProfileFromFlow(goals, {
      horasLibresLaborales: '2',
      horasLibresDescanso: '2'
    })
    const strategy = buildStrategicPlanRefined(goals, profile)
    const savingsPhase = strategy.phases.find((phase) => phase.goalIds.includes(goals[0]?.id ?? ''))

    expect(goals[0]?.isHabit).toBe(true)
    expect(goals[0]?.hoursPerWeek).toBe(1)
    expect(savingsPhase?.startMonth).toBe(1)
    expect(savingsPhase?.endMonth).toBe(strategy.totalMonths)
    expect(savingsPhase?.dependencies).toEqual([])
  })

  it('turns daily habits into short reminders instead of long agenda blocks', () => {
    const goals = analyzeObjectives(['Meditar todos los dias'])
    const profile = buildProfileFromFlow(goals, {
      horasLibresLaborales: '2',
      horasLibresDescanso: '2'
    })
    const strategy = buildStrategicPlanRefined(goals, profile)
    const habitEvents = buildPlanEventsFromFlow({
      goals,
      strategy,
      calendar: buildCalendarState(undefined, ''),
      profile
    }).filter((event) => event.objetivoId === goals[0]?.id && event.semana === 1)

    expect(goals[0]?.isHabit).toBe(true)
    expect(habitEvents).toHaveLength(7)
    expect(habitEvents.every((event) => event.duracion === 15)).toBe(true)
    expect(habitEvents.every((event) => event.categoria === 'habito')).toBe(true)
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
