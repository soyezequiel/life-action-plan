import { z } from 'zod'
import type { AgentRuntime, SkillContext, SkillResult, Skill } from './skill-interface'
import type { Perfil } from '../../shared/schemas/perfil'
import type { PlanEvent } from './plan-builder'
import type { SimulationFinding } from '../../shared/types/lap-api'

// ─── Re-export the PlanEvent schema via plan-builder ─────────────────────────
// (planEventSchema is not yet exported from plan-builder.ts, so we redeclare)
const validCategories = ['estudio', 'ejercicio', 'trabajo', 'habito', 'descanso', 'otro'] as const

const planEventSchema = z.object({
  semana: z.number().int().min(1),
  dia: z.string().min(1),
  hora: z.string().regex(/^\d{2}:\d{2}$/),
  duracion: z.number().int().positive(),
  actividad: z.string().min(1),
  categoria: z.enum(validCategories),
  objetivoId: z.string().min(1)
}).strict()

// ─── Result type ──────────────────────────────────────────────────────────────

export interface RepairResult {
  repairedEvents: PlanEvent[]
  tokensUsed: { input: number; output: number }
  repairNotes: string
}

export interface RepairOptions {
  onStatus?: (msg: string) => void
}

// ─── Skill declaration ────────────────────────────────────────────────────────

export const planRepairer: Skill = {
  name: 'plan-repairer',
  tier: 'alto',
  getSystemPrompt(_ctx: SkillContext): string {
    return [
      'You are a plan repair specialist. A life action plan was generated but FAILED',
      'simulation checks. Your ONLY job is to fix the specific issues listed by the user.',
      '',
      'RULES:',
      '- Do NOT regenerate the entire plan. Fix ONLY the broken events.',
      '- For schedule conflicts (outside awake hours): move the activity to a valid time slot.',
      '- For work overlap: reschedule before or after work hours.',
      '- For overload (day over capacity): reduce duration OR move to a lighter day.',
      '- For goal coverage: add ONE minimal event per uncovered objective.',
      '- For commitment collision: reschedule conflicting activities.',
      '- Preserve the overall structure, week distribution, and intent of the plan.',
      '- Every event in the output MUST have all required fields: semana, dia, hora, duracion, actividad, categoria, objetivoId.',
      '- hora must be HH:MM format (24h).',
      '- duracion must be positive integer (minutes).',
      '- categoria must be one of: estudio, ejercicio, trabajo, habito, descanso, otro.',
      '- semana must be 1–4.',
      '',
      'OUTPUT: respond ONLY with a JSON array of ALL eventos (not just the changed ones).',
      'No markdown, no explanation, no wrapper object — just the raw array starting with [.'
    ].join('\n')
  },
  async run(_runtime: AgentRuntime, _ctx: SkillContext): Promise<SkillResult> {
    return {
      success: true,
      filesWritten: [],
      summary: 'Plan repairer ready — call repairPlan() directly',
      tokensUsed: { input: 0, output: 0 }
    }
  }
}

// ─── Repair function ──────────────────────────────────────────────────────────

function stripFormatting(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()
}

function extractFirstJsonArray(content: string): string {
  const cleaned = stripFormatting(content)
  const firstBracket = cleaned.indexOf('[')
  if (firstBracket < 0) return '[]'
  let depth = 0
  let inString = false
  let escaping = false
  for (let i = firstBracket; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (inString) {
      if (escaping) { escaping = false; continue }
      if (ch === '\\') { escaping = true; continue }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '[') { depth++; continue }
    if (ch === ']') { depth--; if (depth === 0) return cleaned.slice(firstBracket, i + 1) }
  }
  return cleaned.slice(firstBracket)
}

function buildFindingsSummary(findings: SimulationFinding[]): string {
  const failed = findings.filter(f => f.status === 'FAIL' || f.status === 'WARN')
  if (failed.length === 0) return 'No specific failures — improve general quality.'
  return failed.map(f => {
    const params = f.params
      ? ' (' + Object.entries(f.params).map(([k, v]) => `${k}: ${v}`).join(', ') + ')'
      : ''
    return `[${f.status}] ${f.code}${params}`
  }).join('\n')
}

function buildRepairUserPrompt(
  events: PlanEvent[],
  findings: SimulationFinding[],
  profile: Perfil,
  attemptNumber: number
): string {
  const p = profile.participantes[0]
  const routine = p.rutinaDiaria.porDefecto
  const calendar = p.calendario
  const objectives = profile.objetivos

  const urgencyNote = attemptNumber >= 2
    ? '\nCRITICAL: This is the LAST repair attempt. Be very conservative — only schedule activities within clear free windows.\n'
    : ''

  return [
    urgencyNote,
    '=== FAILED SIMULATION FINDINGS ===',
    buildFindingsSummary(findings),
    '',
    '=== USER CONSTRAINTS ===',
    `Awake: ${routine.despertar} to ${routine.dormir}`,
    `Work: ${routine.trabajoInicio ?? 'none'} to ${routine.trabajoFin ?? 'none'} (weekdays Mon-Fri)`,
    `Commute: ${routine.tiempoTransporte} min each way`,
    `Free hours weekdays: ${calendar.horasLibresEstimadas.diasLaborales}h`,
    `Free hours weekends: ${calendar.horasLibresEstimadas.diasDescanso}h`,
    '',
    '=== OBJECTIVES (every objetivoId must appear in at least 1 event) ===',
    objectives.map(o => `- id: "${o.id}" → ${o.descripcion}`).join('\n'),
    '',
    '=== CURRENT PLAN (fix only what is needed) ===',
    JSON.stringify(events, null, 2)
  ].join('\n')
}

export async function repairPlan(
  runtime: AgentRuntime,
  events: PlanEvent[],
  findings: SimulationFinding[],
  profile: Perfil,
  ctx: SkillContext,
  attemptNumber: number,
  options?: RepairOptions
): Promise<RepairResult> {
  options?.onStatus?.('Preparando reparación del plan...')

  const systemPrompt = planRepairer.getSystemPrompt(ctx)
  const userPrompt = buildRepairUserPrompt(events, findings, profile, attemptNumber)
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt }
  ]

  options?.onStatus?.('Enviando al agente reparador...')
  const response = await runtime.chat(messages)
  options?.onStatus?.('Validando eventos reparados...')

  try {
    const arrayStr = extractFirstJsonArray(response.content)
    const rawArray = JSON.parse(arrayStr)

    if (!Array.isArray(rawArray)) {
      throw new Error('Response is not a JSON array')
    }

    const repairedEvents = rawArray
      .flatMap((item: unknown) => {
        const parsed = planEventSchema.safeParse(item)
        return parsed.success ? [parsed.data as PlanEvent] : []
      })

    if (repairedEvents.length === 0 && events.length > 0) {
      throw new Error('All events were dropped during repair')
    }

    return {
      repairedEvents,
      tokensUsed: {
        input: response.usage.promptTokens,
        output: response.usage.completionTokens
      },
      repairNotes: `Attempt ${attemptNumber}: ${repairedEvents.length} events after repair (was ${events.length})`
    }
  } catch (err) {
    // Repair failed → return original events unchanged
    const msg = err instanceof Error ? err.message : String(err)
    return {
      repairedEvents: events,
      tokensUsed: {
        input: response.usage.promptTokens,
        output: response.usage.completionTokens
      },
      repairNotes: `Attempt ${attemptNumber}: repair parsing failed (${msg}), original events preserved`
    }
  }
}
