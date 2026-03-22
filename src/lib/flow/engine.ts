import { DateTime } from 'luxon'
import { perfilSchema, type Perfil } from '../../shared/schemas/perfil'
import {
  availabilityGridSchema,
  flowStateSchema,
  type AvailabilityGrid,
  type FlowState,
  type GoalDraft,
  type IntakeBlock,
  type PresentationDraft,
  type RealityAdjustment,
  type RealityCheckResult,
  type StrategicPlanDraft,
  type StrategicSimulationSnapshot,
  type TopDownLevel,
  type TopDownLevelDraft
} from '../../shared/schemas/flow'
import { createFallbackIntakeBlocks } from './intake-agent'

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  monday: 'lunes',
  tuesday: 'martes',
  wednesday: 'miercoles',
  thursday: 'jueves',
  friday: 'viernes',
  saturday: 'sabado',
  sunday: 'domingo'
}

const SLOT_HOURS = {
  morning: 2,
  afternoon: 2,
  evening: 2
} as const

const SLOT_START: Record<keyof typeof SLOT_HOURS, string> = {
  morning: '07:30',
  afternoon: '15:00',
  evening: '19:30'
}

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12
}

function nowIso(): string {
  return DateTime.utc().toISO() ?? '2026-03-21T00:00:00.000Z'
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim() || ''
}

function normalizeComparableText(value: string | null | undefined): string {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function safeNumber(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseInt(normalizeText(value), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clipText(value: string, max = 80): string {
  const normalized = normalizeText(value)
  return normalized.length > max ? `${normalized.slice(0, max - 1).trim()}…` : normalized
}

function cleanGoalTextForTitle(text: string): string {
  return normalizeText(text)
    .replace(/^(quiero|necesito|me gustaria|me gustaría|voy a|tengo que|debo|quisiera|planeo)\s+/i, '')
}

function defaultAvailabilityGrid(): AvailabilityGrid {
  return availabilityGridSchema.parse({
    monday: { morning: false, afternoon: false, evening: true },
    tuesday: { morning: true, afternoon: false, evening: true },
    wednesday: { morning: false, afternoon: false, evening: true },
    thursday: { morning: true, afternoon: false, evening: true },
    friday: { morning: false, afternoon: false, evening: true },
    saturday: { morning: true, afternoon: true, evening: false },
    sunday: { morning: false, afternoon: true, evening: false }
  })
}

export function createEmptyFlowState(): FlowState {
  return flowStateSchema.parse({})
}

function inferGoalCategory(value: string): GoalDraft['category'] {
  const text = normalizeComparableText(value)

  if (/(salud|correr|entren|gim|peso|dormir|energia|fumar|tabaco|adiccion|meditar|yoga|nutricion|dieta|deporte|nadar|bici|ciclismo|maraton|triatlon|ironman|natacion|boxeo|crossfit)/.test(text)) return 'salud'
  if (/(ahorr|dinero|ingreso|finanza|deuda|presupuesto|invertir|inversion|plata|sueldo|cobrar)/.test(text)) return 'finanzas'
  if (/(curso|estudio|aprend|idioma|certificacion|examen|tesis|final|parcial|materia|carrera universitaria|facultad|maestria|doctorado|leer\s+\d+|libro)/.test(text)) return 'educacion'
  if (/(hobby|musica|arte|dibujo|foto|cocina|lectura|piano|guitarra|pintura|jardin|manualidad)/.test(text)) return 'hobby'
  if (/(trabajo|carrera|cliente|empresa|laburo|portfolio|freelance|emprendimiento|negocio|startup|ascenso|promocion|cv|entrevista|linkedin|remote.?job|developer|programador)/.test(text)) return 'carrera'
  if (/(mudanza|mudar|visa|emigrar|pasaporte|tramite|documento|licencia)/.test(text)) return 'mixto'
  return 'mixto'
}

function inferGoalEffort(value: string): GoalDraft['effort'] {
  const text = normalizeComparableText(value)

  if (/(empresa|maraton|mudanza|cambio de carrera|emprendimiento|tesis|presidente|gobernador|intendente|senador|diputado|campana|candidatura|politica|emigrar|triatlon|ironman|doctorado|startup|42\s*km|full.?stack)/.test(text)) return 'alto'
  if (/(dejar de fumar|dejar de|adiccion|tabaco)/.test(text)) return 'alto'
  if (/(curso|ahorrar|rutina|habito|constancia|idioma|leer|piano|guitarra|meditar|dieta)/.test(text)) return 'medio'
  return value.length > 80 ? 'alto' : 'medio'
}

function inferGoalHorizonMonths(value: string, effort: GoalDraft['effort']): number {
  const text = normalizeComparableText(value)
  const currentMonth = DateTime.local().startOf('month')
  const yearMatch = text.match(/(\d+)\s*(ano|anos|año|años)/)
  if (yearMatch) {
    return Math.min(Math.max(Number.parseInt(yearMatch[1] || '12', 10) * 12, 1), 60)
  }

  const monthYearMatch = text.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(?:de\s*|del?\s*)?(20\d{2})\b/)
  if (monthYearMatch) {
    const monthKey = monthYearMatch[1] ?? ''
    const targetMonthNumber = MONTH_NAME_TO_NUMBER[monthKey] ?? 1
    const targetYear = Number.parseInt(monthYearMatch[2] ?? '', 10)

    if (Number.isFinite(targetYear)) {
      const targetMonth = currentMonth.set({
        year: targetYear,
        month: targetMonthNumber
      })
      const diffMonths = Math.ceil(targetMonth.diff(currentMonth, 'months').months)

      return Math.min(Math.max(diffMonths, 1), 60)
    }
  }

  const absoluteYearMatch = text.match(/\b(20\d{2})\b/)
  if (absoluteYearMatch) {
    const targetYear = Number.parseInt(absoluteYearMatch[1] || '', 10)

    if (Number.isFinite(targetYear) && targetYear >= currentMonth.year) {
      const targetMonth = currentMonth.set({ year: targetYear })
      const diffMonths = Math.ceil(targetMonth.diff(currentMonth, 'months').months)

      return Math.min(Math.max(diffMonths, 1), 60)
    }
  }

  const monthMatch = text.match(/(\d+)\s*(mes|meses)/)
  if (monthMatch) {
    return Math.min(Math.max(Number.parseInt(monthMatch[1] || '6', 10), 1), 60)
  }

  const weekMatch = text.match(/(\d+)\s*(semana|semanas)/)
  if (weekMatch) {
    const weeks = Number.parseInt(weekMatch[1] || '8', 10)
    return Math.min(Math.max(Math.ceil(weeks / 4), 1), 60)
  }

  if (/(al ano|al año|por ano|por año|anual)/.test(text)) {
    return 12
  }

  if (/(al mes|por mes|mensual)/.test(text)) {
    return 1
  }

  if (effort === 'alto') return 12
  if (effort === 'medio') return 6
  return 3
}

function inferIsHabit(text: string, category: GoalDraft['category']): boolean {
  const normalized = normalizeComparableText(text)

  if (category === 'finanzas') return true
  if (/(dejar de|meditar|habito|rutina|diario|todos los dias|constancia|mantener)/.test(normalized)) return true
  return false
}

function isVagueGoal(text: string): boolean {
  const normalized = normalizeComparableText(text)

  if (normalized.length < 10) return true
  if (/^(ser|estar|sentir)\s/.test(normalized) && normalized.length < 25) return true
  if (/^(mejorar|cambiar|crecer|avanzar)$/.test(normalized)) return true
  return false
}

function inferGoalHoursPerWeek(
  effort: GoalDraft['effort'],
  value: string,
  category: GoalDraft['category'],
  isHabit: boolean
): number {
  const text = normalizeComparableText(value)

  if (isHabit) {
    if (category === 'finanzas') {
      return 1
    }

    return 2
  }

  if (/(todos los dias|diario|constante)/.test(text)) {
    return effort === 'alto' ? 10 : 6
  }

  if (effort === 'alto') return 8
  if (effort === 'medio') return 5
  return 3
}

export function analyzeObjectives(objectives: string[]): GoalDraft[] {
  return objectives
    .map((objective) => normalizeText(objective))
    .filter(Boolean)
    .map((objective, index) => {
      const category = inferGoalCategory(objective)
      const effort = inferGoalEffort(objective)
      const isHabit = inferIsHabit(objective, category)

      return {
        id: `goal-${index + 1}`,
        text: objective,
        category,
        effort,
        isHabit,
        needsClarification: isVagueGoal(objective),
        priority: Math.min(index + 1, 5),
        horizonMonths: inferGoalHorizonMonths(objective, effort),
        hoursPerWeek: inferGoalHoursPerWeek(effort, objective, category, isHabit)
      } satisfies GoalDraft
    })
}

export function reorderGoals(goals: GoalDraft[], orderedIds: string[]): GoalDraft[] {
  const byId = new Map(goals.map((goal) => [goal.id, goal]))
  const reordered = orderedIds
    .map((id) => byId.get(id))
    .filter((goal): goal is GoalDraft => Boolean(goal))
    .map((goal, index) => ({
      ...goal,
      priority: Math.min(index + 1, 5)
    }))
  const missing = goals
    .filter((goal) => !orderedIds.includes(goal.id))
    .map((goal, index) => ({
      ...goal,
      priority: Math.min(reordered.length + index + 1, 5)
    }))

  return [...reordered, ...missing]
}

export function createIntakeBlocks(_goals: GoalDraft[], answers: Record<string, string> = {}): IntakeBlock[] {
  return createFallbackIntakeBlocks(_goals, answers)
}

function bestMomentToChronotype(value: string): 'matutino' | 'vespertino' | 'neutro' {
  const normalized = normalizeComparableText(value)
  if (normalized === 'manana') return 'matutino'
  if (normalized === 'noche') return 'vespertino'
  return 'neutro'
}

export function buildProfileFromFlow(
  goals: GoalDraft[],
  answers: Record<string, string>,
  existingProfile?: Perfil | null
): Perfil {
  const existingParticipant = existingProfile?.participantes[0]
  const fallbackName = existingParticipant?.datosPersonales?.nombre || 'Vos'
  const fallbackCity = existingParticipant?.datosPersonales?.ubicacion?.ciudad || 'Buenos Aires'
  const fallbackOccupation = existingParticipant?.datosPersonales?.narrativaPersonal || 'ocupacion no especificada'
  const wake = normalizeText(answers.despertar) || existingParticipant?.rutinaDiaria?.porDefecto?.despertar || '07:00'
  const sleep = normalizeText(answers.dormir) || existingParticipant?.rutinaDiaria?.porDefecto?.dormir || '23:00'
  const workStart = normalizeText(answers.trabajoInicio) || existingParticipant?.rutinaDiaria?.porDefecto?.trabajoInicio || '09:00'
  const workEnd = normalizeText(answers.trabajoFin) || existingParticipant?.rutinaDiaria?.porDefecto?.trabajoFin || '18:00'
  const weekdayFree = safeNumber(answers.horasLibresLaborales, existingParticipant?.calendario?.horasLibresEstimadas?.diasLaborales ?? 2)
  const weekendFree = safeNumber(answers.horasLibresDescanso, existingParticipant?.calendario?.horasLibresEstimadas?.diasDescanso ?? 4)
  const now = nowIso()

  return perfilSchema.parse({
    version: '3.0',
    planificacionConjunta: false,
    participantes: [
      {
        id: 'p1',
        datosPersonales: {
          nombre: normalizeText(answers.nombre) || fallbackName,
          edad: safeNumber(answers.edad, existingParticipant?.datosPersonales?.edad ?? 30),
          sexo: 'no-especificado',
          ubicacion: {
            ciudad: normalizeText(answers.ubicacion) || fallbackCity,
            pais: 'AR',
            zonaHoraria: 'America/Argentina/Buenos_Aires',
            zonaHorariaSecundaria: null,
            feriadosRelevantes: [],
            conectividad: 'alta',
            accesoCursos: 'online',
            distanciaCentroUrbano: 0,
            transporteDisponible: 'publico',
            adversidadesLocales: normalizeText(answers.restricciones) ? [normalizeText(answers.restricciones)] : []
          },
          idioma: 'es',
          nivelAcademico: 'no-especificado',
          nivelEconomico: 'medio',
          narrativaPersonal: normalizeText(answers.ocupacion) || fallbackOccupation
        },
        dependientes: [],
        habilidades: {
          actuales: [],
          aprendiendo: []
        },
        condicionesSalud: [],
        patronesEnergia: {
          cronotipo: bestMomentToChronotype(answers.mejorMomento),
          horarioPicoEnergia: normalizeComparableText(answers.mejorMomento) === 'noche'
            ? '19:00-22:00'
            : normalizeComparableText(answers.mejorMomento) === 'tarde'
              ? '14:00-17:00'
              : '08:00-11:00',
          horarioBajoEnergia: normalizeComparableText(answers.mejorMomento) === 'manana' ? '15:00-17:00' : '07:00-09:00',
          horasProductivasMaximas: Math.max(2, Math.min(weekdayFree + 1, 8))
        },
        problemasActuales: normalizeText(answers.restricciones) ? [normalizeText(answers.restricciones)] : [],
        patronesConocidos: {
          diaTipicoBueno: existingParticipant?.patronesConocidos?.diaTipicoBueno || 'Semana con bloques cortos y sostenidos.',
          diaTipicoMalo: normalizeText(answers.restricciones) || 'Semana caótica sin espacio real.',
          tendencias: [
            ...(normalizeText(answers.horariosFijos) ? [normalizeText(answers.horariosFijos)] : []),
            ...(normalizeText(answers.goalClarity) ? [`Meta clarificada: ${normalizeText(answers.goalClarity)}`] : [])
          ]
        },
        rutinaDiaria: {
          porDefecto: {
            despertar: wake,
            dormir: sleep,
            trabajoInicio: normalizeText(workStart) || null,
            trabajoFin: normalizeText(workEnd) || null,
            tiempoTransporte: 30
          },
          fasesHorario: []
        },
        calendario: {
          fuente: 'texto',
          eventosInamovibles: normalizeText(answers.horariosFijos)
            ? [{ nombre: 'Horarios fijos', horario: normalizeText(answers.horariosFijos), recurrencia: 'semanal', categoria: 'otro', persona: 'p1' }]
            : [],
          eventosFlexibles: [],
          horasLibresEstimadas: {
            diasLaborales: Math.max(0, weekdayFree),
            diasDescanso: Math.max(0, weekendFree)
          }
        },
        compromisos: []
      }
    ],
    objetivos: goals.map((goal) => ({
      id: goal.id,
      descripcion: goal.text,
      tipo: goal.effort === 'bajo' ? 'habito' : 'meta',
      responsable: 'p1',
      prioridad: goal.priority,
      plazo: `${goal.horizonMonths} meses`,
      tipoTimeline: 'controlable',
      rangoEstimado: {
        optimista: `${Math.max(goal.horizonMonths - 1, 1)} meses`,
        probable: `${goal.horizonMonths} meses`,
        pesimista: `${goal.horizonMonths + 2} meses`
      },
      motivacion: normalizeText(answers.goalClarity) || normalizeText(answers.motivacion) || goal.text,
      relaciones: [],
      horasSemanalesEstimadas: goal.hoursPerWeek
    })),
    estadoDinamico: {
      ultimaActualizacion: now,
      salud: 'buena',
      nivelEnergia: bestMomentToChronotype(answers.mejorMomento) === 'vespertino' ? 'medio' : 'alto',
      estadoEmocional: {
        motivacion: 4,
        estres: normalizeText(answers.restricciones) ? 3 : 2,
        satisfaccion: 3
      },
      notasTemporales: normalizeText(answers.horariosFijos) ? [normalizeText(answers.horariosFijos)] : [],
      umbralStaleness: 7
    }
  })
}

function weeklyAvailableHours(profile: Perfil): number {
  const hours = profile.participantes[0]?.calendario?.horasLibresEstimadas
  const weekday = hours?.diasLaborales ?? 0
  const weekend = hours?.diasDescanso ?? 0
  return (weekday * 5) + (weekend * 2)
}

function buildConflicts(goals: GoalDraft[], availableHours: number): string[] {
  const conflicts: string[] = []

  if (goals.length > 1) {
    conflicts.push('Tus metas comparten tiempo y van a necesitar prioridades claras cuando la semana se complique.')
  }

  const needed = goals.reduce((total, goal) => total + goal.hoursPerWeek, 0)
  if (needed > availableHours) {
    conflicts.push('La carga total estimada hoy supera tu disponibilidad real.')
  }

  if (goals.some((goal) => goal.category === 'salud') && goals.some((goal) => goal.category === 'carrera')) {
    conflicts.push('Las metas de salud y carrera suelen competir por la misma energía entre semana.')
  }

  return conflicts
}

export function buildStrategicPlan(goals: GoalDraft[], profile: Perfil): StrategicPlanDraft {
  const availableHours = weeklyAvailableHours(profile)
  const totalMonths = Math.max(...goals.map((goal) => goal.horizonMonths), 1)
  let currentStart = 1
  const phases = goals.map((goal, index) => {
    const duration = Math.max(1, Math.min(goal.horizonMonths, goal.effort === 'alto' ? 4 : goal.effort === 'medio' ? 3 : 2))
    const shouldParallelize = index > 0 && goal.priority <= 2 && availableHours >= 14
    const startMonth = shouldParallelize ? Math.max(1, currentStart - 1) : currentStart
    const endMonth = Math.min(totalMonths, startMonth + duration - 1)
    currentStart = Math.min(totalMonths, endMonth + 1)

    return {
      id: `phase-${goal.id}`,
      title: `Fase ${index + 1}: ${clipText(goal.text, 48)}`,
      summary: `Bloque principal para mover ${clipText(goal.text, 120)} con ritmo sostenido y revisión semanal.`,
      goalIds: [goal.id],
      dependencies: index === 0 ? [] : [`phase-${goals[Math.max(index - 1, 0)]?.id ?? goal.id}`],
      startMonth,
      endMonth,
      hoursPerWeek: goal.hoursPerWeek,
      milestone: `Tener una primera versión visible de ${clipText(goal.text, 60)}`,
      metrics: [
        `${Math.max(2, Math.ceil(goal.hoursPerWeek / 2))} bloques semanales consistentes`,
        'Una revisión breve cada fin de semana'
      ]
    }
  })

  const estimatedWeeklyHours = phases.reduce((total, phase) => total + phase.hoursPerWeek, 0)

  return {
    title: goals.length > 1
      ? 'Plan unificado de objetivos'
      : `Plan para ${clipText(cleanGoalTextForTitle(goals[0]?.text || 'tu objetivo'), 80)}`,
    summary: goals.length > 1
      ? 'Armé una estrategia unificada que ordena tus metas por prioridad, carga y ventanas realistas de ejecución.'
      : 'Armé una estrategia de alto nivel para avanzar sin bajar todavía al detalle diario.',
    totalMonths,
    estimatedWeeklyHours,
    phases,
    milestones: phases.map((phase) => phase.milestone),
    conflicts: buildConflicts(goals, availableHours)
  }
}

function buildRefinedConflicts(goals: GoalDraft[], availableHours: number, peakWeeklyHours: number): string[] {
  const conflicts: string[] = []

  if (goals.length > 1) {
    conflicts.push('Tus metas comparten tiempo y necesitan un orden claro cuando la semana se aprieta.')
  }

  if (peakWeeklyHours > availableHours) {
    conflicts.push('El pico semanal del plan hoy supera tu disponibilidad real.')
  }

  if (
    goals.some((goal) => goal.category === 'salud')
    && goals.some((goal) => goal.category === 'carrera')
    && peakWeeklyHours >= Math.max(8, Math.floor(availableHours * 0.75))
  ) {
    conflicts.push('La meta de salud y la de carrera van a pedir cuidar mucho la energia entre semana.')
  }

  return conflicts
}

function isSupportTrackGoal(goal: GoalDraft): boolean {
  const text = normalizeComparableText(goal.text)

  return goal.isHabit
    || goal.category === 'salud'
    || /(veces por semana|por semana|rutina|habito|entren)/.test(text)
}

function buildRefinedMilestone(goal: GoalDraft): string {
  const text = clipText(goal.text, 60)

  if (goal.category === 'carrera') {
    return `Tener una busqueda activa y señales concretas de avance en ${text}`
  }

  if (goal.category === 'salud') {
    return 'Sostener la rutina durante varias semanas sin cortar la continuidad'
  }

  if (goal.category === 'educacion') {
    return `Completar un entregable concreto de ${text}`
  }

  if (goal.category === 'finanzas') {
    return `Ver una primera mejora medible en ${text}`
  }

  return `Tener una primera version sostenible de ${text}`
}

function buildRefinedPhaseSummary(goal: GoalDraft, index: number, supportTrack: boolean): string {
  const text = clipText(goal.text, 120)

  if (supportTrack) {
    return `Este frente acompana al objetivo principal para sostener energia, constancia y margen semanal mientras avanzas con ${text}.`
  }

  if (goal.category === 'carrera') {
    return `Bloque principal para mover ${text} con foco en avances visibles, revision semanal y menos frentes abiertos al mismo tiempo.`
  }

  if (goal.category === 'salud') {
    return `Rutina base para que ${text} se vuelva sostenible sin depender de motivacion alta todos los dias.`
  }

  return `Fase ${index + 1} para mover ${text} con un ritmo sostenido y revision semanal.`
}

function buildRefinedPhaseMetrics(goal: GoalDraft): string[] {
  if (goal.category === 'carrera') {
    return [
      '3 bloques semanales de trabajo profundo',
      '1 revision breve para medir señales reales de avance'
    ]
  }

  if (goal.category === 'salud') {
    return [
      '3 sesiones semanales protegidas en agenda',
      '1 chequeo corto para ajustar carga y descanso'
    ]
  }

  return [
    `${Math.max(2, Math.ceil(goal.hoursPerWeek / 2))} bloques semanales consistentes`,
    'Una revision breve cada fin de semana'
  ]
}

function resolveSingleGoalPhaseCount(goal: GoalDraft): number {
  if (goal.horizonMonths >= 36) return 5
  if (goal.horizonMonths >= 18) return 4
  if (goal.horizonMonths >= 9) return 3
  if (goal.horizonMonths >= 4) return 2
  return 1
}

function singleGoalStageTitles(goal: GoalDraft): string[] {
  if (goal.category === 'salud') {
    return ['Base sostenible', 'Constancia', 'Progresion', 'Consolidacion', 'Mantenimiento']
  }

  if (goal.category === 'educacion') {
    return ['Base de estudio', 'Practica guiada', 'Aplicacion', 'Validacion', 'Cierre']
  }

  if (goal.category === 'finanzas') {
    return ['Diagnostico', 'Ajuste', 'Acumulacion', 'Optimizacion', 'Consolidacion']
  }

  if (goal.category === 'carrera') {
    return ['Base y enfoque', 'Posicionamiento', 'Oportunidades reales', 'Consolidacion', 'Cierre']
  }

  return ['Base y direccion', 'Construccion', 'Senales reales', 'Consolidacion', 'Cierre']
}

function singleGoalStageSummary(goal: GoalDraft, index: number): string {
  const text = clipText(goal.text, 110)

  if (index === 0) {
    return `Bajar ${text} a un recorrido concreto, medible y compatible con tu semana real.`
  }

  if (index === 1) {
    return `Construir capacidad, activos o practica sostenida para que ${text} deje de depender de impulsos aislados.`
  }

  if (index === 2) {
    return `Buscar senales visibles de avance en el mundo real para validar si ${text} realmente se esta moviendo.`
  }

  if (index === 3) {
    return `Consolidar lo que mejor funcione, corregir cuellos de botella y sostener el ritmo en ${text}.`
  }

  return `Cerrar la etapa con una base repetible y lista para el siguiente salto de ${text}.`
}

function singleGoalStageMilestone(goal: GoalDraft, index: number): string {
  const text = clipText(goal.text, 60)

  if (index === 0) {
    return `Salir con una hoja de ruta concreta para ${text}`
  }

  if (index === 1) {
    return `Tener una base sostenida de trabajo para ${text}`
  }

  if (index === 2) {
    return `Ver senales visibles de avance en ${text}`
  }

  if (index === 3) {
    return `Consolidar lo que ya demuestra traccion para ${text}`
  }

  return `Cerrar la etapa con una posicion mas fuerte para ${text}`
}

function singleGoalStageMetrics(goal: GoalDraft, index: number): string[] {
  const protectedBlocks = Math.max(2, Math.ceil(goal.hoursPerWeek / 2))

  if (index === 0) {
    return [
      'Definir una senal concreta de avance para no trabajar a ciegas',
      `${protectedBlocks} bloques semanales protegidos desde el inicio`
    ]
  }

  if (index === 1) {
    return [
      'Sostener el ritmo durante varias semanas seguidas',
      'Revisar cada semana donde aparece friccion o dispersion'
    ]
  }

  if (index === 2) {
    return [
      'Buscar al menos una senal visible de avance por mes',
      'Medir si la carga sigue siendo sostenible en semanas reales'
    ]
  }

  if (index === 3) {
    return [
      'Corregir el principal cuello de botella sin abrir frentes extra',
      'Mantener continuidad incluso en semanas imperfectas'
    ]
  }

  return [
    'Cerrar la etapa con una base clara para el siguiente salto',
    'Dejar una revision final con lo que conviene mantener y lo que no'
  ]
}

function buildSingleGoalPhases(goal: GoalDraft, totalMonths: number): StrategicPlanDraft['phases'] {
  const phaseCount = Math.min(resolveSingleGoalPhaseCount(goal), Math.max(goal.horizonMonths, 1))
  const titles = singleGoalStageTitles(goal)
  const baseSpan = Math.floor(totalMonths / phaseCount)
  const remainder = totalMonths % phaseCount
  let cursor = 1

  return Array.from({ length: phaseCount }, (_, index) => {
    const span = baseSpan + (index < remainder ? 1 : 0)
    const startMonth = cursor
    const endMonth = index === phaseCount - 1
      ? totalMonths
      : Math.min(totalMonths, startMonth + Math.max(span, 1) - 1)
    cursor = endMonth + 1

    return {
      id: `phase-${goal.id}-${index + 1}`,
      title: `Fase ${index + 1}: ${titles[index] ?? titles[titles.length - 1] ?? 'Etapa'}`,
      summary: singleGoalStageSummary(goal, index),
      goalIds: [goal.id],
      dependencies: index === 0 ? [] : [`phase-${goal.id}-${index}`],
      startMonth,
      endMonth,
      hoursPerWeek: goal.hoursPerWeek,
      milestone: singleGoalStageMilestone(goal, index),
      metrics: singleGoalStageMetrics(goal, index)
    }
  })
}

function calculatePeakWeeklyHours(phases: StrategicPlanDraft['phases'], totalMonths: number): number {
  let peakHours = 0

  for (let month = 1; month <= totalMonths; month += 1) {
    const monthlyHours = phases.reduce((total, phase) => (
      phase.startMonth <= month && phase.endMonth >= month
        ? total + phase.hoursPerWeek
        : total
    ), 0)

    peakHours = Math.max(peakHours, monthlyHours)
  }

  return peakHours
}

export function buildStrategicPlanRefined(goals: GoalDraft[], profile: Perfil): StrategicPlanDraft {
  const availableHours = weeklyAvailableHours(profile)
  const totalMonths = Math.max(...goals.map((goal) => goal.horizonMonths), 1)
  const singleGoalPhases = goals.length === 1 && !goals[0]!.isHabit
    ? buildSingleGoalPhases(goals[0]!, totalMonths)
    : null
  let sequentialCursor = 1

  const phases = singleGoalPhases ?? goals.map((goal, index) => {
    const supportTrack = goal.isHabit || (index > 0 && isSupportTrackGoal(goal))
    const duration = goal.isHabit
      ? totalMonths
      : supportTrack
      ? Math.max(2, Math.min(goal.horizonMonths, 3))
      : Math.max(1, Math.min(goal.horizonMonths, goal.effort === 'alto' ? 4 : goal.effort === 'medio' ? 3 : 2))
    const startMonth = supportTrack
      ? 1
      : index > 0 && goal.priority <= 2 && availableHours >= 14
        ? Math.max(1, sequentialCursor - 1)
        : sequentialCursor
    const endMonth = Math.min(totalMonths, startMonth + duration - 1)

    if (!supportTrack) {
      sequentialCursor = Math.min(totalMonths, endMonth + 1)
    }

    return {
      id: `phase-${goal.id}`,
      title: `Fase ${index + 1}: ${clipText(goal.text, 48)}`,
      summary: buildRefinedPhaseSummary(goal, index, supportTrack),
      goalIds: [goal.id],
      dependencies: supportTrack || index === 0 ? [] : [`phase-${goals[Math.max(index - 1, 0)]?.id ?? goal.id}`],
      startMonth,
      endMonth,
      hoursPerWeek: goal.hoursPerWeek,
      milestone: buildRefinedMilestone(goal),
      metrics: buildRefinedPhaseMetrics(goal)
    }
  })

  const normalizedPhases = phases.length > 0 && phases[phases.length - 1]!.endMonth < totalMonths
    ? phases.map((phase, index) => index === phases.length - 1
      ? {
          ...phase,
          endMonth: totalMonths
        }
      : phase)
    : phases
  const estimatedWeeklyHours = calculatePeakWeeklyHours(normalizedPhases, totalMonths)

  return {
    title: goals.length > 1
      ? 'Plan unificado de objetivos'
      : `Plan para ${clipText(cleanGoalTextForTitle(goals[0]?.text || 'tu objetivo'), 80)}`,
    summary: goals.length > 1
      ? 'Arme una estrategia unificada que ordena tus metas por prioridad, carga y ventanas realistas de ejecucion.'
      : phases.length > 1
        ? 'Arme una estrategia dividida en etapas para que el objetivo no quede como un bloque unico y tengas una progresion visible.'
        : 'Arme una estrategia de alto nivel para avanzar sin bajar todavia al detalle diario.',
    totalMonths,
    estimatedWeeklyHours,
    phases: normalizedPhases,
    milestones: normalizedPhases.map((phase) => phase.milestone),
    conflicts: buildRefinedConflicts(goals, availableHours, estimatedWeeklyHours)
  }
}

export function resolveRealityCheck(
  strategy: StrategicPlanDraft,
  profile: Perfil,
  adjustment: RealityAdjustment = 'keep'
): { strategy: StrategicPlanDraft; result: RealityCheckResult } {
  const availableHours = weeklyAvailableHours(profile)
  let nextStrategy = strategy
  const applied: string[] = []

  if (adjustment === 'reduce_load') {
    nextStrategy = {
      ...strategy,
      estimatedWeeklyHours: Math.max(strategy.estimatedWeeklyHours - 2, 1),
      phases: strategy.phases.map((phase, index) => index === strategy.phases.length - 1
        ? { ...phase, hoursPerWeek: Math.max(phase.hoursPerWeek - 2, 1) }
        : phase)
    }
    applied.push('Bajé la intensidad del objetivo menos prioritario para hacerle lugar a tu semana real.')
  } else if (adjustment === 'extend_timeline') {
    nextStrategy = {
      ...strategy,
      totalMonths: Math.min(strategy.totalMonths + 2, 60),
      phases: strategy.phases.map((phase, index) => ({
        ...phase,
        startMonth: phase.startMonth + (index === 0 ? 0 : 1),
        endMonth: Math.min(phase.endMonth + 1, 60)
      }))
    }
    applied.push('Estiré el horizonte del plan para bajar la presión semanal.')
  } else if (adjustment === 'auto_prioritize') {
    nextStrategy = {
      ...strategy,
      phases: strategy.phases.map((phase, index) => ({
        ...phase,
        dependencies: index === 0 ? [] : [strategy.phases[index - 1]?.id ?? phase.id],
        startMonth: index + 1,
        endMonth: Math.max(index + 1, phase.endMonth)
      }))
    }
    applied.push('Reordené el plan para que la energía fuerte vaya primero a lo más importante.')
  }

  const neededHours = nextStrategy.estimatedWeeklyHours
  const overloaded = neededHours > Math.floor(availableHours * 0.85)
  const recommendations = overloaded
    ? [
        'Bajarle carga a la meta menos prioritaria.',
        'Estirar una o dos fases para repartir mejor el esfuerzo.',
        'Dejar que Pulso priorice automáticamente según el orden que marcaste.'
      ]
    : ['La carga semanal entra dentro de un margen razonable para avanzar con constancia.']

  return {
    strategy: nextStrategy,
    result: {
      status: overloaded ? 'adjustment_required' : 'ok',
      availableHours,
      neededHours,
      selectedAdjustment: adjustment,
      summary: overloaded
        ? 'Hoy el plan está más cargado de lo que tu semana parece aguantar con comodidad.'
        : 'La relación entre horas necesarias y disponibles está razonablemente balanceada.',
      recommendations,
      adjustmentsApplied: applied
    }
  }
}

export function runStrategicSimulation(
  strategy: StrategicPlanDraft,
  realityCheck: RealityCheckResult
): StrategicSimulationSnapshot {
  const availableHours = realityCheck.availableHours
  const iterations: StrategicSimulationSnapshot['iterations'] = []
  let finalStatus: StrategicSimulationSnapshot['finalStatus'] = 'PASS'
  const findings: string[] = []
  let worstMonth = 1
  let worstLoad = 0

  for (let month = 1; month <= strategy.totalMonths; month += 1) {
    const monthLoad = strategy.phases.reduce((total, phase) => (
      phase.startMonth <= month && phase.endMonth >= month
        ? total + phase.hoursPerWeek
        : total
    ), 0)

    if (monthLoad > worstLoad) {
      worstLoad = monthLoad
      worstMonth = month
    }
  }

  const difference = worstLoad - availableHours

  if (difference > 4) {
    iterations.push(
      {
        index: 1,
        status: 'FAIL' as const,
        summary: 'La primera corrida dejó semanas sobrecargadas.',
        changes: ['Detecté más horas de las que tu agenda tolera en días laborales.']
      },
      {
        index: 2,
        status: 'FAIL' as const,
        summary: 'La segunda corrida siguió chocando con la misma restricción.',
        changes: ['Mantener todas las metas activas a la vez te deja sin margen de recuperación.']
      },
      {
        index: 3,
        status: 'WARN' as const,
        summary: 'Apliqué una flexibilización automática del calendario para salir del loop.',
        changes: ['Separé mejor las fases y dejé semanas de descarga.']
      }
    )
    finalStatus = 'WARN'
    findings.push('Hubo que flexibilizar fechas para que la simulación no siguiera trabada.')
  } else if (difference > 0) {
    iterations.push(
      {
        index: 1,
        status: 'WARN' as const,
        summary: 'La simulación encontró días exigentes, pero manejables con prioridad clara.',
        changes: ['Conviene no abrir más de dos frentes fuertes al mismo tiempo.']
      },
      {
        index: 2,
        status: 'PASS' as const,
        summary: 'Con pequeños ajustes de ritmo, el plan entra.',
        changes: ['La semana gana margen si protegés los bloques de mayor energía.']
      }
    )
    finalStatus = 'PASS'
    findings.push('El plan entra, pero necesita disciplina para no sobrecargar la mitad de la semana.')
  } else {
    iterations.push({
      index: 1,
      status: 'PASS',
      summary: 'La simulación pasó sin conflictos estructurales.',
      changes: ['El plan tiene aire suficiente para sostenerse.']
    })
    finalStatus = 'PASS'
    findings.push('La distribución semanal se ve consistente con tu disponibilidad actual.')
  }

  if (worstLoad > availableHours) {
    findings.push(`El mes ${worstMonth} es el más exigente con ${worstLoad}h semanales contra ${availableHours}h disponibles.`)
  }

  const overlappingPhases = strategy.phases.filter((phase) => phase.startMonth <= worstMonth && phase.endMonth >= worstMonth)
  if (overlappingPhases.length > 1) {
    findings.push(`En el mes ${worstMonth} hay ${overlappingPhases.length} frentes activos al mismo tiempo.`)
  }

  if (realityCheck.adjustmentsApplied.length > 0) {
    findings.push(...realityCheck.adjustmentsApplied)
  }

  if (strategy.conflicts.length > 0) {
    findings.push(...strategy.conflicts.slice(0, 2))
  }

  return {
    ranAt: nowIso(),
    method: 'rules',
    finalStatus,
    reviewSummary: finalStatus === 'WARN'
      ? 'La corrida encontro tension en la carga semanal y aplico un ajuste para evitar que el plan quede fragil.'
      : 'La corrida no detecto choques estructurales y el plan entra dentro de un margen sostenible.',
    checkedAreas: [
      'Pico semanal por mes contra horas disponibles',
      'Choques entre fases activas al mismo tiempo',
      'Margen de recuperacion dentro de la semana'
    ],
    findings,
    iterations
  }
}

export function buildPresentationDraft(
  strategy: StrategicPlanDraft,
  simulation: StrategicSimulationSnapshot
): PresentationDraft {
  return {
    title: strategy.title,
    summary: `${strategy.summary} ${simulation.finalStatus === 'PASS' ? 'La simulación la ve viable.' : 'La simulación pidió algunos ajustes antes de activarlo.'}`,
    timeline: strategy.phases.map((phase) => ({
      id: phase.id,
      label: phase.title,
      window: `Mes ${phase.startMonth} a ${phase.endMonth}`,
      detail: phase.summary,
      status: 'editable'
    })),
    cards: strategy.phases.map((phase) => ({
      id: `card-${phase.id}`,
      title: phase.milestone,
      body: `Ritmo sugerido: ${phase.hoursPerWeek}h por semana. ${phase.metrics[0] ?? ''}`.trim(),
      goalIds: phase.goalIds
    })),
    feedbackRounds: 0,
    accepted: false,
    latestFeedback: null
  }
}

export function applyPresentationFeedback(
  draft: PresentationDraft,
  feedback: string,
  edits: Array<{ id: string; label?: string; detail?: string }> = [],
  accept = false
): PresentationDraft {
  const normalizedFeedback = normalizeText(feedback)
  const simpler = /simple|liviano|menos/i.test(normalizedFeedback)
  const moreAmbitious = /intenso|mas fuerte|mas agresivo|ambicioso/i.test(normalizedFeedback)

  const nextTimeline = draft.timeline.map((item) => {
    const override = edits.find((edit) => edit.id === item.id)
    let detail = override?.detail?.trim() || item.detail

    if (simpler) {
      detail = `${detail} Priorizá lo mínimo sostenible antes de sumar más bloques.`
    } else if (moreAmbitious) {
      detail = `${detail} Podés apretar un poco más si sostenés bien la primera semana.`
    }

    return {
      ...item,
      label: override?.label?.trim() || item.label,
      detail: clipText(detail, 240)
    }
  })

  const nextCards = draft.cards.map((card) => {
    const override = edits.find((edit) => edit.id === card.id)

    return {
      ...card,
      title: override?.label?.trim() || card.title,
      body: clipText(override?.detail?.trim() || card.body, 320)
    }
  })

  return {
    ...draft,
    timeline: nextTimeline,
    cards: nextCards,
    feedbackRounds: Math.min(draft.feedbackRounds + (normalizedFeedback ? 1 : 0), 10),
    accepted: accept,
    latestFeedback: normalizedFeedback || draft.latestFeedback
  }
}

function extractBusyDaysFromIcs(value: string): Array<(typeof DAY_KEYS)[number]> {
  const normalized = normalizeComparableText(value)
  return DAY_KEYS.filter((day) => normalized.includes(DAY_LABELS[day]))
}

export function buildCalendarState(
  grid: AvailabilityGrid | null | undefined,
  notes: string,
  icsText?: string
): FlowState['calendar'] {
  const normalizedGrid = grid ? availabilityGridSchema.parse(grid) : defaultAvailabilityGrid()
  const busyDays = extractBusyDaysFromIcs(icsText || '')
  const nextGrid = DAY_KEYS.reduce((acc, day) => {
    acc[day] = busyDays.includes(day)
      ? { morning: false, afternoon: false, evening: normalizedGrid[day].evening }
      : normalizedGrid[day]
    return acc
  }, {} as AvailabilityGrid)

  return {
    grid: nextGrid,
    notes: normalizeText(notes),
    importedIcs: Boolean(normalizeText(icsText)),
    summary: busyDays.length > 0
      ? `Tomé tu disponibilidad y además bloqueé ${busyDays.length} días detectados en el calendario importado.`
      : 'Ya quedó guardada tu disponibilidad semanal base.',
    updatedAt: nowIso()
  }
}

export function resolveTopDownLevels(totalMonths: number): TopDownLevel[] {
  if (totalMonths > 24) return ['year', 'quarter', 'month', 'week', 'day']
  if (totalMonths >= 12) return ['quarter', 'month', 'week', 'day']
  if (totalMonths >= 3) return ['month', 'week', 'day']
  if (totalMonths >= 1) return ['week', 'day']
  return ['day']
}

function levelLabel(level: TopDownLevel): string {
  switch (level) {
    case 'year':
      return 'Anual'
    case 'quarter':
      return 'Trimestral'
    case 'month':
      return 'Mensual'
    case 'week':
      return 'Semanal'
    default:
      return 'Diario'
  }
}

function levelSamples(level: TopDownLevel, strategy: StrategicPlanDraft): string[] {
  if (level === 'year') {
    return strategy.phases.slice(0, 2).map((phase) => `Consolidar ${clipText(phase.title, 110)}`)
  }

  if (level === 'quarter') {
    return strategy.phases.slice(0, 3).map((phase) => `Cerrar ${clipText(phase.milestone, 150)}`)
  }

  if (level === 'month') {
    return strategy.phases.slice(0, 3).map((phase) => `Mes foco en ${clipText(phase.summary, 180)}`)
  }

  if (level === 'week') {
    return strategy.phases.slice(0, 3).map((phase) => `${Math.max(2, Math.ceil(phase.hoursPerWeek / 2))} bloques de ${clipText(phase.title, 120)}`)
  }

  return strategy.phases.slice(0, 3).map((phase) => `Bloque corto de ${clipText(phase.title, 120)}`)
}

function createLevelDraft(level: TopDownLevel, strategy: StrategicPlanDraft, revisionCount = 0, confirmed = false): TopDownLevelDraft {
  return {
    level,
    title: `${levelLabel(level)} del plan`,
    summary: level === 'week' || level === 'day'
      ? 'Acá vas a ver solo una muestra corta para validar el patrón antes de expandirlo.'
      : `Desglose ${levelLabel(level).toLowerCase()} para ordenar el recorrido sin caer todavía al microdetalle.`,
    samples: [
      {
        id: `${level}-sample-1`,
        label: level === 'week' || level === 'day' ? 'Muestra inicial' : 'Vista de referencia',
        items: levelSamples(level, strategy)
      }
    ],
    confirmed,
    revisionCount
  }
}

export function buildTopDownState(
  strategy: StrategicPlanDraft,
  current: FlowState['topdown'] | null,
  action: 'generate' | 'confirm' | 'revise' | 'back'
): FlowState['topdown'] {
  const levels = current?.levels?.length
    ? current.levels
    : resolveTopDownLevels(strategy.totalMonths).map((level) => createLevelDraft(level, strategy))
  const currentLevelIndex = current?.currentLevelIndex ?? 0

  if (action === 'confirm') {
    return {
      levels: levels.map((level, index) => index === currentLevelIndex ? { ...level, confirmed: true } : level),
      currentLevelIndex: Math.min(currentLevelIndex + 1, levels.length - 1),
      updatedAt: nowIso()
    }
  }

  if (action === 'revise') {
    return {
      levels: levels.map((level, index) => index === currentLevelIndex
        ? createLevelDraft(level.level, strategy, Math.min(level.revisionCount + 1, 3), false)
        : level),
      currentLevelIndex,
      updatedAt: nowIso()
    }
  }

  if (action === 'back') {
    return {
      levels,
      currentLevelIndex: Math.max(currentLevelIndex - 1, 0),
      updatedAt: nowIso()
    }
  }

  return {
    levels,
    currentLevelIndex,
    updatedAt: nowIso()
  }
}

function categoryToPlanCategory(goal: GoalDraft): 'estudio' | 'ejercicio' | 'trabajo' | 'habito' | 'descanso' | 'otro' {
  if (goal.isHabit) {
    return 'habito'
  }

  switch (goal.category) {
    case 'educacion':
      return 'estudio'
    case 'salud':
      return 'ejercicio'
    case 'carrera':
      return 'trabajo'
    case 'hobby':
      return 'habito'
    default:
      return 'otro'
  }
}

type AvailableSlot = {
  dayKey: (typeof DAY_KEYS)[number]
  day: string
  hour: string
  slot: keyof typeof SLOT_HOURS
}

function extractBlockedSlots(value: string): Array<keyof typeof SLOT_HOURS> {
  const blocked = new Set<keyof typeof SLOT_HOURS>()
  const normalized = normalizeComparableText(value)

  if (/manana/.test(normalized)) blocked.add('morning')
  if (/tarde/.test(normalized)) blocked.add('afternoon')
  if (/noche/.test(normalized)) blocked.add('evening')

  const timeRangePattern = /(\d{1,2})(?::(\d{2}))?\s*(?:a|-)\s*(\d{1,2})(?::(\d{2}))?/g
  for (const match of normalized.matchAll(timeRangePattern)) {
    const startHour = Number.parseInt(match[1] || '0', 10)
    const endHour = Number.parseInt(match[3] || String(startHour), 10)

    if (startHour < 12) blocked.add('morning')
    if (startHour < 18 && endHour > 12) blocked.add('afternoon')
    if (startHour >= 18 || endHour >= 18) blocked.add('evening')
  }

  return [...blocked]
}

function buildBlockedSlotSet(profile: Perfil): Set<string> {
  const blocked = new Set<string>()
  const events = profile.participantes[0]?.calendario?.eventosInamovibles ?? []

  for (const event of events) {
    const schedule = normalizeText(event.horario)

    if (!schedule) {
      continue
    }

    const fragments = schedule
      .split(/[;,]|(?=\b(?:lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b)/i)
      .map((fragment) => fragment.trim())
      .filter(Boolean)

    for (const fragment of fragments) {
      const normalizedFragment = normalizeComparableText(fragment)
      const dayMatches = DAY_KEYS.filter((day) => normalizedFragment.includes(DAY_LABELS[day]))
      const blockedSlots = extractBlockedSlots(fragment)

      if (dayMatches.length === 0 || blockedSlots.length === 0) {
        continue
      }

      for (const day of dayMatches) {
        for (const slot of blockedSlots) {
          blocked.add(`${day}:${slot}`)
        }
      }
    }
  }

  return blocked
}

function buildAvailableSlots(grid: AvailabilityGrid, profile: Perfil): Array<AvailableSlot> {
  const slots: Array<AvailableSlot> = []
  const blockedSlots = buildBlockedSlotSet(profile)

  for (const day of DAY_KEYS) {
    for (const slot of Object.keys(SLOT_HOURS) as Array<keyof typeof SLOT_HOURS>) {
      if (grid[day][slot] && !blockedSlots.has(`${day}:${slot}`)) {
        slots.push({
          dayKey: day,
          day: DAY_LABELS[day],
          hour: SLOT_START[slot],
          slot
        })
      }
    }
  }

  if (slots.length === 0) {
    return [
      { dayKey: 'monday', day: 'lunes', hour: '19:30', slot: 'evening' },
      { dayKey: 'wednesday', day: 'miercoles', hour: '19:30', slot: 'evening' },
      { dayKey: 'saturday', day: 'sabado', hour: '10:00', slot: 'morning' }
    ]
  }

  return slots
}

function inferRequestedWeeklySessions(goal: GoalDraft): number | null {
  const text = normalizeComparableText(goal.text)
  const numericMatch = text.match(/(\d+)\s*(veces|x)\s*por\s*semana/)

  if (numericMatch) {
    return Math.max(1, Math.min(Number.parseInt(numericMatch[1] || '1', 10), 7))
  }

  if (/una vez por semana/.test(text)) return 1
  if (/dos veces por semana/.test(text)) return 2
  if (/tres veces por semana/.test(text)) return 3
  if (/cuatro veces por semana/.test(text)) return 4
  if (/cinco veces por semana/.test(text)) return 5
  if (/todos los dias|diario/.test(text)) return goal.isHabit ? 7 : 5

  return null
}

function resolveWeeklySessions(goal: GoalDraft): number {
  const requested = inferRequestedWeeklySessions(goal)

  if (requested) {
    return requested
  }

  if (goal.category === 'salud') {
    return Math.max(2, Math.min(4, Math.round(goal.hoursPerWeek / 2)))
  }

  return Math.max(1, Math.min(3, Math.ceil(goal.hoursPerWeek / 3)))
}

function resolveSessionDuration(goal: GoalDraft, sessions: number): number {
  const baseDuration = Math.ceil((goal.hoursPerWeek * 60) / Math.max(sessions, 1) / 15) * 15

  if (goal.category === 'salud') {
    return Math.max(45, Math.min(baseDuration, 90))
  }

  if (goal.category === 'carrera' || goal.category === 'educacion') {
    return Math.max(60, Math.min(baseDuration, 120))
  }

  return Math.max(30, Math.min(baseDuration, 90))
}

function resolveSessionCountAndDuration(goal: GoalDraft): { sessions: number; duration: number } {
  if (goal.isHabit) {
    return resolveHabitReminderPlan(goal)
  }

  const requestedSessions = inferRequestedWeeklySessions(goal)
  let sessions = requestedSessions ?? resolveWeeklySessions(goal)
  let duration = resolveSessionDuration(goal, sessions)
  const targetMinutes = goal.hoursPerWeek * 60
  let totalMinutes = sessions * duration

  while (requestedSessions === null && totalMinutes < targetMinutes && sessions < 7) {
    sessions += 1
    duration = resolveSessionDuration(goal, sessions)
    totalMinutes = sessions * duration
  }

  if (totalMinutes < targetMinutes && sessions > 0) {
    duration = Math.ceil(targetMinutes / sessions / 15) * 15
  }

  return {
    sessions,
    duration
  }
}

function resolveHabitReminderPlan(goal: GoalDraft): { sessions: number; duration: number } {
  const requestedSessions = inferRequestedWeeklySessions(goal)
  const text = normalizeComparableText(goal.text)

  if (goal.category === 'finanzas') {
    return {
      sessions: 1,
      duration: 30
    }
  }

  if (/todos los dias|diario|dejar de|meditar|mantener/.test(text)) {
    return {
      sessions: requestedSessions ?? 7,
      duration: 15
    }
  }

  return {
    sessions: requestedSessions ?? 3,
    duration: 30
  }
}

function sortSlotsForGoal(slots: AvailableSlot[], goal: GoalDraft): AvailableSlot[] {
  const slotPriority: Array<keyof typeof SLOT_HOURS> = goal.category === 'salud'
    ? ['morning', 'afternoon', 'evening']
    : goal.category === 'carrera'
      ? ['evening', 'morning', 'afternoon']
      : ['morning', 'evening', 'afternoon']

  return [...slots].sort((left, right) => {
    const slotDelta = slotPriority.indexOf(left.slot) - slotPriority.indexOf(right.slot)

    if (slotDelta !== 0) {
      return slotDelta
    }

    return DAY_KEYS.indexOf(left.dayKey) - DAY_KEYS.indexOf(right.dayKey)
  })
}

export function buildPlanEventsFromFlow(params: {
  goals: GoalDraft[]
  strategy: StrategicPlanDraft
  calendar: FlowState['calendar'] | null
  profile: Perfil
}): Array<{ semana: number; dia: string; hora: string; duracion: number; actividad: string; categoria: string; objetivoId: string }> {
  const slots = buildAvailableSlots(params.calendar?.grid ?? defaultAvailabilityGrid(), params.profile)
  const events: Array<{ semana: number; dia: string; hora: string; duracion: number; actividad: string; categoria: string; objetivoId: string }> = []
  const phaseByGoalId = new Map<string, StrategicPlanDraft['phases'][number]>()
  const slotCursorByGoalId = new Map<string, number>()

  for (const phase of params.strategy.phases) {
    for (const goalId of phase.goalIds) {
      phaseByGoalId.set(goalId, phase)
    }
  }

  const activeGoals = params.goals.filter((goal) => {
    const phase = phaseByGoalId.get(goal.id)
    return !phase || phase.startMonth <= 1
  })
  const scheduledGoals = activeGoals.length > 0 ? activeGoals : params.goals.slice(0, 1)

  for (let week = 1; week <= 4; week += 1) {
    const usedSlotKeys = new Set<string>()

    for (const goal of scheduledGoals) {
      const { sessions, duration } = resolveSessionCountAndDuration(goal)
      const orderedSlots = sortSlotsForGoal(slots, goal)
      let cursor = slotCursorByGoalId.get(goal.id) ?? 0
      const usedDays = new Set<string>()

      for (let session = 0; session < sessions; session += 1) {
        let slot = orderedSlots[cursor % orderedSlots.length]

        if (orderedSlots.length > 1) {
          for (let attempt = 0; attempt < orderedSlots.length; attempt += 1) {
            const candidate = orderedSlots[(cursor + attempt) % orderedSlots.length]
            const candidateKey = `${candidate.dayKey}:${candidate.hour}`

            if (
              (!usedDays.has(candidate.dayKey) && !usedSlotKeys.has(candidateKey))
              || attempt === orderedSlots.length - 1
            ) {
              slot = candidate
              cursor += attempt + 1
              break
            }
          }
        } else {
          cursor += 1
        }

        usedDays.add(slot.dayKey)
        usedSlotKeys.add(`${slot.dayKey}:${slot.hour}`)

        events.push({
          semana: week,
          dia: slot.day,
          hora: slot.hour,
          duracion: duration,
          actividad: `${goal.isHabit ? 'Recordatorio' : week === 1 ? 'Arranque' : 'Bloque'} de ${clipText(goal.text, 60)}`,
          categoria: categoryToPlanCategory(goal),
          objetivoId: goal.id
        })
      }

      slotCursorByGoalId.set(goal.id, cursor)
    }
  }

  return events
}

function shouldRebuildStrategyAfterResume(state: FlowState, normalizedSummary: string): boolean {
  if (!state.strategy || state.goals.length === 0) {
    return false
  }

  return /menos tiempo|menos horas|mas trabajo|mas tiempo|mas horas|nuevo trabajo|trabajo nuevo/.test(normalizedSummary)
}

export function applyResumePatch(
  profile: Perfil | null,
  state: FlowState,
  changeSummary: string
): { profile: Perfil | null; state: FlowState; patchSummary: string; strategyRebuilt: boolean } {
  const normalized = normalizeComparableText(changeSummary)
  if (!normalizeText(changeSummary)) {
    return {
      profile,
      state,
      patchSummary: 'No encontré cambios concretos, así que mantuve el plan como estaba.',
      strategyRebuilt: false
    }
  }

  if (!profile) {
    return {
      profile,
      state: {
        ...state,
        resume: {
          changeSummary,
          patchSummary: 'Guardé el cambio reportado para retomarlo apenas completes el intake.',
          askedAt: nowIso()
        }
      },
      patchSummary: 'Guardé el cambio reportado para retomarlo apenas completes el intake.',
      strategyRebuilt: false
    }
  }

  const participant = profile.participantes[0]
  const nextProfile: Perfil = {
    ...profile,
    participantes: [
      {
        ...participant,
        calendario: {
          ...participant.calendario,
          horasLibresEstimadas: {
            ...participant.calendario.horasLibresEstimadas,
            diasLaborales: /menos tiempo|menos horas|mas trabajo/.test(normalized)
              ? Math.max(participant.calendario.horasLibresEstimadas.diasLaborales - 1, 0)
              : /mas tiempo|mas horas/.test(normalized)
                ? participant.calendario.horasLibresEstimadas.diasLaborales + 1
                : participant.calendario.horasLibresEstimadas.diasLaborales,
            diasDescanso: /menos tiempo|menos horas|mas trabajo/.test(normalized)
              ? Math.max(participant.calendario.horasLibresEstimadas.diasDescanso - 1, 0)
              : /mas tiempo|mas horas/.test(normalized)
                ? participant.calendario.horasLibresEstimadas.diasDescanso + 1
                : participant.calendario.horasLibresEstimadas.diasDescanso
          }
        },
        datosPersonales: {
          ...participant.datosPersonales,
          narrativaPersonal: /nuevo trabajo|trabajo nuevo/.test(normalized)
            ? `Cambio reciente: ${changeSummary}`
            : participant.datosPersonales.narrativaPersonal
        }
      }
    ],
    estadoDinamico: {
      ...profile.estadoDinamico,
      ultimaActualizacion: nowIso(),
      notasTemporales: Array.from(new Set([
        ...profile.estadoDinamico.notasTemporales,
        changeSummary
      ]))
    }
  }

  const patchSummary = /menos tiempo|menos horas|mas trabajo/.test(normalized)
    ? 'Ajusté a la baja tu disponibilidad semanal para que el plan retome con menos carga.'
    : /mas tiempo|mas horas/.test(normalized)
      ? 'Aumenté un poco la disponibilidad disponible para reflejar el cambio.'
      : /nuevo trabajo|trabajo nuevo/.test(normalized)
        ? 'Dejé registrado el cambio laboral para que condicione las siguientes decisiones del plan.'
        : 'Guardé el cambio reportado y lo dejé visible para la próxima revisión.'

  const strategyRebuilt = shouldRebuildStrategyAfterResume(state, normalized)
  const rebuiltState = strategyRebuilt
    ? (() => {
        const newStrategy = buildStrategicPlanRefined(state.goals, nextProfile)
        const newReality = resolveRealityCheck(newStrategy, nextProfile, 'keep')

        return {
          ...state,
          strategy: newReality.strategy,
          realityCheck: newReality.result,
          simulation: null,
          presentation: null
        }
      })()
    : state

  return {
    profile: nextProfile,
    state: {
      ...rebuiltState,
      resume: {
        changeSummary,
        patchSummary,
        askedAt: nowIso()
      }
    },
    patchSummary,
    strategyRebuilt
  }
}
