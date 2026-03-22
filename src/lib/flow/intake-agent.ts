import { z } from 'zod'
import type { AgentRuntime, LLMMessage } from '../runtime/types'
import {
  intakeBlockSchema,
  type GoalDraft,
  type IntakeBlock,
  type IntakeQuestion
} from '../../shared/schemas/flow'

const supportedIntakeFieldKeys = [
  'goalClarity',
  'ocupacion',
  'despertar',
  'dormir',
  'trabajoInicio',
  'trabajoFin',
  'horasLibresLaborales',
  'horasLibresDescanso',
  'mejorMomento',
  'restricciones',
  'horariosFijos'
] as const

const supportedIntakeFieldKeySchema = z.enum(supportedIntakeFieldKeys)

type SupportedIntakeFieldKey = z.infer<typeof supportedIntakeFieldKeySchema>

interface IntakeFieldTemplate {
  id: string
  type: IntakeQuestion['type']
  defaultLabel: string
  defaultPlaceholder: string | null
  options: string[]
  min: number | null
  max: number | null
  step: number | null
  unit: string | null
  purpose: string
  pairWith?: SupportedIntakeFieldKey
}

const intakeFieldCatalog: Record<SupportedIntakeFieldKey, IntakeFieldTemplate> = {
  goalClarity: {
    id: 'goal-clarity',
    type: 'textarea',
    defaultLabel: 'Para poder aterrizar esa meta, ¿cómo se vería un avance concreto?',
    defaultPlaceholder: 'Ej: cerrar 3 entrevistas, bajar 4 kg o practicar inglés 4 veces por semana',
    options: [],
    min: null,
    max: null,
    step: null,
    unit: null,
    purpose: 'Solo si la meta es ambigua y necesitás definir qué cuenta como avance real.'
  },
  ocupacion: {
    id: 'occupation',
    type: 'text',
    defaultLabel: '¿A qué te dedicás hoy?',
    defaultPlaceholder: 'Trabajo, estudio, crianza, mezcla...',
    options: [],
    min: null,
    max: null,
    step: null,
    unit: null,
    purpose: 'Sirve para entender tu punto de partida cuando la meta toca carrera, estudio o cambio de rumbo.'
  },
  despertar: {
    id: 'wake',
    type: 'time',
    defaultLabel: '¿A qué hora suele arrancar tu día?',
    defaultPlaceholder: '07:00',
    options: [],
    min: null,
    max: null,
    step: null,
    unit: null,
    purpose: 'Solo si hace falta ubicar bloques dentro del día.',
    pairWith: 'dormir'
  },
  dormir: {
    id: 'sleep',
    type: 'time',
    defaultLabel: '¿A qué hora suele terminar tu día?',
    defaultPlaceholder: '23:00',
    options: [],
    min: null,
    max: null,
    step: null,
    unit: null,
    purpose: 'Solo si hace falta ubicar bloques dentro del día.',
    pairWith: 'despertar'
  },
  trabajoInicio: {
    id: 'work-start',
    type: 'time',
    defaultLabel: '¿Tenés un horario fijo de trabajo o estudio? ¿Cuándo empieza?',
    defaultPlaceholder: '09:00 o dejalo vacío',
    options: [],
    min: null,
    max: null,
    step: null,
    unit: null,
    purpose: 'Útil cuando el plan depende de una rutina fija entre semana.',
    pairWith: 'trabajoFin'
  },
  trabajoFin: {
    id: 'work-end',
    type: 'time',
    defaultLabel: '¿Y a qué hora termina ese horario fijo?',
    defaultPlaceholder: '18:00 o dejalo vacío',
    options: [],
    min: null,
    max: null,
    step: null,
    unit: null,
    purpose: 'Útil cuando el plan depende de una rutina fija entre semana.',
    pairWith: 'trabajoInicio'
  },
  horasLibresLaborales: {
    id: 'weekday-free',
    type: 'range',
    defaultLabel: 'En un día laboral normal, ¿cuántas horas reales podés dedicarle a tus metas?',
    defaultPlaceholder: null,
    options: [],
    min: 0,
    max: 6,
    step: 1,
    unit: 'hs',
    purpose: 'Siempre necesaria para estimar cuánto entra de verdad en tu semana.'
  },
  horasLibresDescanso: {
    id: 'weekend-free',
    type: 'range',
    defaultLabel: 'En fines de semana o días más libres, ¿cuántas horas reales podrías dedicarle a tus metas?',
    defaultPlaceholder: null,
    options: [],
    min: 0,
    max: 10,
    step: 1,
    unit: 'hs',
    purpose: 'Siempre necesaria para estimar cuánto aire extra tenés fuera de la rutina laboral.'
  },
  mejorMomento: {
    id: 'best-time',
    type: 'select',
    defaultLabel: '¿Cuándo rendís mejor: mañana, tarde o noche?',
    defaultPlaceholder: null,
    options: ['mañana', 'tarde', 'noche'],
    min: null,
    max: null,
    step: null,
    unit: null,
    purpose: 'Útil cuando la meta pide concentración, estudio o trabajo creativo.'
  },
  restricciones: {
    id: 'constraints',
    type: 'textarea',
    defaultLabel: '¿Hay algo que sí o sí haya que respetar?',
    defaultPlaceholder: 'Crianza, salud, viajes, cuidado de alguien, turnos...',
    options: [],
    min: null,
    max: null,
    step: null,
    unit: null,
    purpose: 'Solo si hay riesgo de armar un plan inviable sin conocer límites reales.'
  },
  horariosFijos: {
    id: 'fixed-schedule',
    type: 'textarea',
    defaultLabel: 'Además de tu horario principal, contame si hay bloques semanales fijos que no se pueden mover.',
    defaultPlaceholder: 'Ej: lunes y miércoles 19 a 21, clases martes 20 a 22',
    options: [],
    min: null,
    max: null,
    step: null,
    unit: null,
    purpose: 'Útil cuando hay compromisos recurrentes que compiten con el plan.'
  }
}

const generatedQuestionDraftSchema = z.object({
  key: supportedIntakeFieldKeySchema,
  label: z.string().trim().min(1).max(160),
  placeholder: z.string().trim().max(160).nullable().default(null)
}).strict()

const generatedBlockDraftSchema = z.object({
  id: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(240),
  questions: z.array(generatedQuestionDraftSchema).min(1).max(5)
}).strict()

const generatedIntakePlanSchema = z.object({
  rationale: z.string().trim().min(1).max(320),
  blocks: z.array(generatedBlockDraftSchema).min(1).max(3)
}).strict()

interface IntakeQuestionDraft {
  key: SupportedIntakeFieldKey
  label: string
  placeholder: string | null
}

interface IntakeBlockDraft {
  id: string
  title: string
  description: string
  questions: IntakeQuestionDraft[]
}

export interface GeneratedIntakePlan {
  rationale: string
  blocks: IntakeBlock[]
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

function buildProgressLabel(index: number, total: number): string {
  if (total <= 1) {
    return '100%'
  }

  return `${Math.round(((index + 1) / total) * 100)}%`
}

function stripFormatting(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()
}

function extractFirstJsonObject(content: string): string {
  const cleaned = stripFormatting(content)
  const firstBrace = cleaned.indexOf('{')

  if (firstBrace < 0) {
    return cleaned
  }

  let depth = 0
  let inString = false
  let escaping = false

  for (let index = firstBrace; index < cleaned.length; index += 1) {
    const char = cleaned[index]

    if (inString) {
      if (escaping) {
        escaping = false
      } else if (char === '\\') {
        escaping = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      depth += 1
      continue
    }

    if (char === '}') {
      depth -= 1

      if (depth === 0) {
        return cleaned.slice(firstBrace, index + 1)
      }
    }
  }

  return cleaned.slice(firstBrace)
}

function questionFromCatalog(
  key: SupportedIntakeFieldKey,
  override?: Partial<Pick<IntakeQuestion, 'label' | 'placeholder'>>
): IntakeQuestion {
  const template = intakeFieldCatalog[key]

  return {
    id: template.id,
    key,
    label: normalizeText(override?.label) || template.defaultLabel,
    type: template.type,
    placeholder: normalizeText(override?.placeholder) || template.defaultPlaceholder,
    options: [...template.options],
    min: template.min,
    max: template.max,
    step: template.step,
    unit: template.unit
  }
}

function markBlockCompletion(blocks: IntakeBlock[], answers: Record<string, string>): IntakeBlock[] {
  return blocks.map((block, index, allBlocks) => intakeBlockSchema.parse({
    ...block,
    progressLabel: normalizeText(block.progressLabel) || buildProgressLabel(index, allBlocks.length),
    completed: block.questions.every((question) => normalizeText(answers[question.key]).length > 0)
  }))
}

function splitOverflowBlock(block: IntakeBlockDraft, startIndex: number): IntakeBlockDraft[] {
  const slices: IntakeBlockDraft[] = []

  for (let index = 0; index < block.questions.length; index += 5) {
    slices.push({
      id: slices.length === 0 ? block.id : `${block.id}-${slices.length + 1}`,
      title: slices.length === 0 ? block.title : `${block.title} (${slices.length + 1})`,
      description: block.description,
      questions: block.questions.slice(index, index + 5)
    })
  }

  if (slices.length > 0) {
    return slices
  }

  return [{
    id: `block-${startIndex + 1}`,
    title: 'Tu semana real',
    description: 'Necesito estos datos para que el plan sea viable.',
    questions: []
  }]
}

function finalizeIntakeBlocks(rawBlocks: IntakeBlockDraft[], goals: GoalDraft[], answers: Record<string, string>): IntakeBlock[] {
  const sanitizedBlocks = rawBlocks
    .map((block, blockIndex) => ({
      id: normalizeText(block.id) || `block-${blockIndex + 1}`,
      title: normalizeText(block.title) || 'Ajustemos tu plan',
      description: normalizeText(block.description) || 'Necesito estas respuestas para no inventarte un plan idealizado.',
      questions: block.questions
        .map((question) => generatedQuestionDraftSchema.safeParse(question))
        .filter((result): result is { success: true; data: IntakeQuestionDraft } => result.success)
        .map((result) => result.data)
    }))
    .filter((block) => block.questions.length > 0)

  if (sanitizedBlocks.length === 0) {
    return createFallbackIntakeBlocks(goals, answers)
  }

  const customCopy = new Map<SupportedIntakeFieldKey, { label: string; placeholder: string | null }>()
  const targetBlockIndex = new Map<SupportedIntakeFieldKey, number>()
  const orderedKeys: SupportedIntakeFieldKey[] = []

  sanitizedBlocks.forEach((block, blockIndex) => {
    block.questions.forEach((question) => {
      if (!customCopy.has(question.key)) {
        customCopy.set(question.key, {
          label: question.label,
          placeholder: question.placeholder
        })
        targetBlockIndex.set(question.key, blockIndex)
        orderedKeys.push(question.key)
      }
    })
  })

  const insertAfter = (baseKey: SupportedIntakeFieldKey, requiredKey: SupportedIntakeFieldKey): void => {
    if (orderedKeys.includes(requiredKey)) {
      return
    }

    const baseIndex = orderedKeys.indexOf(baseKey)
    if (baseIndex < 0) {
      orderedKeys.push(requiredKey)
      return
    }

    orderedKeys.splice(baseIndex + 1, 0, requiredKey)
    targetBlockIndex.set(requiredKey, targetBlockIndex.get(baseKey) ?? sanitizedBlocks.length - 1)
  }

  const ensureKey = (key: SupportedIntakeFieldKey, blockIndex = sanitizedBlocks.length - 1): void => {
    if (orderedKeys.includes(key)) {
      return
    }

    orderedKeys.push(key)
    targetBlockIndex.set(key, Math.max(blockIndex, 0))
  }

  for (const key of [...orderedKeys]) {
    const pairKey = intakeFieldCatalog[key].pairWith

    if (pairKey) {
      insertAfter(key, pairKey)
    }
  }

  ensureKey('horasLibresLaborales')
  ensureKey('horasLibresDescanso')

  const mutableBlocks: IntakeBlockDraft[] = sanitizedBlocks.map((block) => ({
    id: block.id,
    title: block.title,
    description: block.description,
    questions: []
  }))

  const appendToBlock = (question: IntakeQuestionDraft, preferredIndex: number): void => {
    let targetIndex = Math.min(Math.max(preferredIndex, 0), Math.max(mutableBlocks.length - 1, 0))

    while (mutableBlocks[targetIndex] && mutableBlocks[targetIndex].questions.length >= 5) {
      targetIndex += 1
    }

    if (!mutableBlocks[targetIndex]) {
      mutableBlocks[targetIndex] = {
        id: `block-${targetIndex + 1}`,
        title: 'Tu semana real',
        description: 'Necesito estos datos para que el plan sea viable.',
        questions: []
      }
    }

    mutableBlocks[targetIndex].questions.push(question)
  }

  orderedKeys.forEach((key) => {
    appendToBlock({
      key,
      label: customCopy.get(key)?.label || intakeFieldCatalog[key].defaultLabel,
      placeholder: customCopy.get(key)?.placeholder ?? intakeFieldCatalog[key].defaultPlaceholder
    }, targetBlockIndex.get(key) ?? mutableBlocks.length - 1)
  })

  const compactedBlocks = mutableBlocks
    .filter((block) => block.questions.length > 0)
    .flatMap((block, blockIndex) => (
      block.questions.length > 5
        ? splitOverflowBlock(block, blockIndex)
        : [block]
    ))
    .slice(0, 3)

  const hydratedBlocks = compactedBlocks.map((block, blockIndex, allBlocks) => intakeBlockSchema.parse({
    id: block.id,
    title: block.title,
    description: block.description,
    questions: block.questions.map((question) => questionFromCatalog(question.key, question)),
    progressLabel: buildProgressLabel(blockIndex, allBlocks.length),
    completed: false
  }))

  return markBlockCompletion(hydratedBlocks, answers)
}

function needsGoalClarity(goals: GoalDraft[]): boolean {
  return goals.some((goal) => {
    const text = normalizeComparableText(goal.text)
    const hasTimeframe = /(\d+\s*(mes|meses|ano|anos|año|años|semana|semanas)|diario|semanal|mensual)/.test(text)
    const hasConcreteMetric = /(\d+\s*(kg|kilo|kilos|hora|horas|vez|veces|entrevista|cliente|sesion|sesiones)|certificacion|portfolio|empleo|trabajo nuevo|ahorrar)/.test(text)
    return !(hasTimeframe && hasConcreteMetric)
  })
}

function needsWorkContext(goals: GoalDraft[]): boolean {
  return goals.some((goal) => goal.category === 'carrera' || goal.category === 'educacion')
}

function needsSchedulePrecision(goals: GoalDraft[]): boolean {
  const totalHours = goals.reduce((total, goal) => total + goal.hoursPerWeek, 0)
  return goals.length > 1 || totalHours >= 8 || needsWorkContext(goals)
}

function needsBestMoment(goals: GoalDraft[]): boolean {
  return goals.some((goal) => (
    goal.category === 'educacion'
    || goal.category === 'carrera'
    || goal.category === 'hobby'
    || goal.category === 'salud'
  ))
}

function needsConstraints(goals: GoalDraft[]): boolean {
  const categories = new Set(goals.map((goal) => goal.category))
  return goals.length > 1 || categories.has('salud') || goals.reduce((total, goal) => total + goal.hoursPerWeek, 0) >= 12
}

export function markIntakeBlocksComplete(blocks: IntakeBlock[], answers: Record<string, string>): IntakeBlock[] {
  return markBlockCompletion(blocks, answers)
}

export function createFallbackIntakeBlocks(goals: GoalDraft[], answers: Record<string, string> = {}): IntakeBlock[] {
  const firstBlockQuestions: IntakeQuestionDraft[] = []
  const secondBlockQuestions: IntakeQuestionDraft[] = []
  const thirdBlockQuestions: IntakeQuestionDraft[] = []

  if (needsGoalClarity(goals)) {
    firstBlockQuestions.push({
      key: 'goalClarity',
      label: intakeFieldCatalog.goalClarity.defaultLabel,
      placeholder: intakeFieldCatalog.goalClarity.defaultPlaceholder
    })
  }

  if (needsWorkContext(goals)) {
    firstBlockQuestions.push({
      key: 'ocupacion',
      label: intakeFieldCatalog.ocupacion.defaultLabel,
      placeholder: intakeFieldCatalog.ocupacion.defaultPlaceholder
    })
  }

  if (needsSchedulePrecision(goals)) {
    secondBlockQuestions.push(
      {
        key: 'trabajoInicio',
        label: intakeFieldCatalog.trabajoInicio.defaultLabel,
        placeholder: intakeFieldCatalog.trabajoInicio.defaultPlaceholder
      },
      {
        key: 'trabajoFin',
        label: intakeFieldCatalog.trabajoFin.defaultLabel,
        placeholder: intakeFieldCatalog.trabajoFin.defaultPlaceholder
      },
      {
        key: 'horariosFijos',
        label: intakeFieldCatalog.horariosFijos.defaultLabel,
        placeholder: intakeFieldCatalog.horariosFijos.defaultPlaceholder
      }
    )
  }

  if (needsBestMoment(goals)) {
    secondBlockQuestions.push({
      key: 'mejorMomento',
      label: intakeFieldCatalog.mejorMomento.defaultLabel,
      placeholder: intakeFieldCatalog.mejorMomento.defaultPlaceholder
    })
  }

  if (needsConstraints(goals)) {
    thirdBlockQuestions.push({
      key: 'restricciones',
      label: intakeFieldCatalog.restricciones.defaultLabel,
      placeholder: intakeFieldCatalog.restricciones.defaultPlaceholder
    })
  }

  thirdBlockQuestions.push(
    {
      key: 'horasLibresLaborales',
      label: intakeFieldCatalog.horasLibresLaborales.defaultLabel,
      placeholder: intakeFieldCatalog.horasLibresLaborales.defaultPlaceholder
    },
    {
      key: 'horasLibresDescanso',
      label: intakeFieldCatalog.horasLibresDescanso.defaultLabel,
      placeholder: intakeFieldCatalog.horasLibresDescanso.defaultPlaceholder
    }
  )

  const fallbackDrafts: IntakeBlockDraft[] = [
    {
      id: 'goal-fit',
      title: 'Aterricemos tu meta',
      description: 'Lo justo para entender qué significa avanzar en tu caso.',
      questions: firstBlockQuestions
    },
    {
      id: 'week-shape',
      title: 'Cómo entra en tu semana',
      description: 'Necesito ubicar el plan dentro de tu rutina real.',
      questions: secondBlockQuestions
    },
    {
      id: 'availability',
      title: 'Tu disponibilidad real',
      description: 'Con esto ajusto la carga para que el plan sea sostenible.',
      questions: thirdBlockQuestions
    }
  ].filter((block) => block.questions.length > 0)

  return finalizeIntakeBlocks(fallbackDrafts, goals, answers)
}

function buildPlannerMessages(goals: GoalDraft[], answers: Record<string, string>): LLMMessage[] {
  const answeredKeys = Object.keys(answers)
    .filter((key) => normalizeText(answers[key]).length > 0)
    .sort()

  const goalsPayload = goals.map((goal) => ({
    id: goal.id,
    text: goal.text,
    category: goal.category,
    effort: goal.effort,
    priority: goal.priority,
    horizonMonths: goal.horizonMonths,
    hoursPerWeek: goal.hoursPerWeek
  }))

  const fieldCatalogPayload = supportedIntakeFieldKeys.map((key) => ({
    key,
    type: intakeFieldCatalog[key].type,
    purpose: intakeFieldCatalog[key].purpose,
    options: intakeFieldCatalog[key].options,
    min: intakeFieldCatalog[key].min,
    max: intakeFieldCatalog[key].max,
    step: intakeFieldCatalog[key].step,
    unit: intakeFieldCatalog[key].unit
  }))

  return [
    {
      role: 'system',
      content: [
        'Sos el planner de intake de LAP.',
        'Tu trabajo es elegir solo las preguntas estrictamente necesarias para crear un plan personal realista.',
        'Reglas:',
        '- Escribí en español rioplatense, claro y humano.',
        '- Preguntá lo mínimo indispensable.',
        '- Siempre incluí `horasLibresLaborales` y `horasLibresDescanso`.',
        '- No preguntes datos decorativos como nombre, edad o ciudad.',
        '- Solo podés usar keys del catálogo.',
        '- Si elegís `trabajoInicio`, también tenés que incluir `trabajoFin`.',
        '- Si elegís `despertar`, también tenés que incluir `dormir`.',
        '- No repitas keys ya respondidas salvo que sean imprescindibles para entender disponibilidad.',
        '- Máximo 3 bloques.',
        '- Máximo 5 preguntas por bloque.',
        '- Devolvé solo JSON válido, sin markdown ni comentarios.'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        goals: goalsPayload,
        answeredKeys,
        fieldCatalog: fieldCatalogPayload,
        responseFormat: {
          rationale: 'string breve explicando por qué esas preguntas alcanzan',
          blocks: [
            {
              id: 'string corto',
              title: 'string',
              description: 'string',
              questions: [
                {
                  key: 'uno de los keys permitidos',
                  label: 'pregunta final para la persona usuaria',
                  placeholder: 'string o null'
                }
              ]
            }
          ]
        }
      })
    }
  ]
}

export async function generateIntakeBlocksWithAgent(input: {
  runtime: AgentRuntime
  goals: GoalDraft[]
  answers?: Record<string, string>
}): Promise<GeneratedIntakePlan> {
  const answers = input.answers ?? {}
  const response = await input.runtime.chat(buildPlannerMessages(input.goals, answers))
  const extractedJson = extractFirstJsonObject(response.content)
  const parsed = generatedIntakePlanSchema.parse(JSON.parse(extractedJson))

  return {
    rationale: parsed.rationale,
    blocks: finalizeIntakeBlocks(parsed.blocks, input.goals, answers)
  }
}
