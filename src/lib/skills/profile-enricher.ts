import { z } from 'zod'
import type { AgentRuntime, SkillContext, SkillResult, Skill } from './skill-interface'
import type { Perfil } from '../../shared/schemas/perfil'
import { perfilSchema } from '../../shared/schemas/perfil'

// ─── Enrichment output ────────────────────────────────────────────────────────

export interface EnrichmentInference {
  field: string
  value?: unknown
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export interface EnrichmentResult {
  enrichedProfile: Perfil
  inferences: EnrichmentInference[]
  warnings: string[]
  tokensUsed: { input: number; output: number }
}

// ─── Skill ────────────────────────────────────────────────────────────────────

export const profileEnricher: Skill = {
  name: 'profile-enricher',
  tier: 'medio',
  getSystemPrompt(_ctx: SkillContext): string {
    return [
      'You are a life context analyst. Given partial user data, infer the missing',
      'fields needed to create a realistic action plan.',
      '',
      'For each inference record:',
      '  - field: the profile field being inferred',
      '  - value: the inferred value',
      '  - confidence: "high" | "medium" | "low"',
      '  - reason: one sentence explaining why you inferred this',
      '',
      'CRITICAL RULES:',
      '- NEVER assume more free time than physically possible.',
      '- If occupation suggests irregular hours (nurse, driver, freelancer,',
      '  docente, cuidador) do NOT default to 09-18.',
      '- If the user says they work 10h but claims 8h free, flag the contradiction.',
      '- If sleep + work + commute leaves < 4h free, cap free hours at what is real.',
      '- Infer chronotype from occupation/wake-time only if high confidence.',
      '',
      'OUTPUT: respond ONLY with valid JSON in this exact shape:',
      '{',
      '  "enrichedPartial": {',
      '    "despertar": "HH:MM or null",',
      '    "dormir": "HH:MM or null",',
      '    "trabajoInicio": "HH:MM or null",',
      '    "trabajoFin": "HH:MM or null",',
      '    "tiempoTransporte": number_or_null,',
      '    "cronotipo": "matutino|vespertino|neutro",',
      '    "horasProductivasMaximas": number,',
      '    "horarioPicoEnergia": "HH:MM-HH:MM",',
      '    "horarioBajoEnergia": "HH:MM-HH:MM",',
      '    "nivelEnergia": "alto|medio|bajo",',
      '    "motivacion": 1-5,',
      '    "estres": 1-5,',
      '    "horasLibresLaborales": number,',
      '    "horasLibresFDS": number',
      '  },',
      '  "inferences": [{ "field": "", "value": "", "confidence": "", "reason": "" }],',
      '  "warnings": ["contradiction or concern string"]',
      '}'
    ].join('\n')
  },
  async run(_runtime: AgentRuntime, _ctx: SkillContext): Promise<SkillResult> {
    return {
      success: true,
      filesWritten: [],
      summary: 'Profile enricher ready — call enrichProfile() directly',
      tokensUsed: { input: 0, output: 0 }
    }
  }
}

// ─── Rich enrichment function ─────────────────────────────────────────────────

function stripFormatting(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()
}

function extractFirstJson(content: string): string {
  const cleaned = stripFormatting(content)
  const firstBrace = cleaned.indexOf('{')
  if (firstBrace < 0) return cleaned
  let depth = 0
  let inString = false
  let escaping = false
  for (let i = firstBrace; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (inString) {
      if (escaping) { escaping = false; continue }
      if (ch === '\\') { escaping = true; continue }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') { depth++; continue }
    if (ch === '}') { depth--; if (depth === 0) return cleaned.slice(firstBrace, i + 1) }
  }
  return cleaned.slice(firstBrace)
}

const enrichedPartialSchema = z.object({
  despertar: z.string().nullable().optional(),
  dormir: z.string().nullable().optional(),
  trabajoInicio: z.string().nullable().optional(),
  trabajoFin: z.string().nullable().optional(),
  tiempoTransporte: z.number().nullable().optional(),
  cronotipo: z.enum(['matutino', 'vespertino', 'neutro']).optional(),
  horasProductivasMaximas: z.number().min(0).max(24).optional(),
  horarioPicoEnergia: z.string().optional(),
  horarioBajoEnergia: z.string().optional(),
  nivelEnergia: z.enum(['alto', 'medio', 'bajo']).optional(),
  motivacion: z.number().int().min(1).max(5).optional(),
  estres: z.number().int().min(1).max(5).optional(),
  horasLibresLaborales: z.number().min(0).optional(),
  horasLibresFDS: z.number().min(0).optional()
})

const enrichResponseSchema = z.object({
  enrichedPartial: enrichedPartialSchema,
  inferences: z.array(z.object({
    field: z.string(),
    value: z.unknown(),
    confidence: z.enum(['high', 'medium', 'low']),
    reason: z.string()
  })).default([]),
  warnings: z.array(z.string()).default([])
})

function buildEnrichmentUserPrompt(profile: Perfil): string {
  const p = profile.participantes[0]
  const obj = profile.objetivos[0]

  const lines: string[] = [
    `Nombre: ${p.datosPersonales.nombre}`,
    `Edad: ${p.datosPersonales.edad}`,
    `Ocupación: ${p.datosPersonales.narrativaPersonal}`,
    `Ciudad: ${p.datosPersonales.ubicacion.ciudad}`,
    `Nivel económico: ${p.datosPersonales.nivelEconomico}`,
    `Objetivo principal: ${obj?.descripcion ?? 'No especificado'}`,
    `Horas libres declaradas (laborales): ${p.calendario.horasLibresEstimadas.diasLaborales}h`,
    `Horas libres declaradas (FDS): ${p.calendario.horasLibresEstimadas.diasDescanso}h`,
    `Despertar declarado: ${p.rutinaDiaria.porDefecto.despertar ?? 'no especificado'}`,
    `Dormir declarado: ${p.rutinaDiaria.porDefecto.dormir ?? 'no especificado'}`,
    `Trabajo inicio declarado: ${p.rutinaDiaria.porDefecto.trabajoInicio ?? 'no especificado'}`,
    `Trabajo fin declarado: ${p.rutinaDiaria.porDefecto.trabajoFin ?? 'no especificado'}`,
    `Tiempo de transporte: ${p.rutinaDiaria.porDefecto.tiempoTransporte ?? 0} min`,
    `Cronotipo declarado: ${p.patronesEnergia.cronotipo}`,
    `Problemas actuales: ${p.problemasActuales.join(', ') || 'ninguno'}`,
    `Dependientes: ${p.dependientes.length > 0 ? p.dependientes.map(d => `${d.nombre} (${d.relacion})`).join(', ') : 'ninguno'}`,
    `Compromisos: ${p.compromisos.length > 0 ? p.compromisos.map(c => c.descripcion).join(', ') : 'ninguno'}`,
    `Estado emocional: motivación ${profile.estadoDinamico.estadoEmocional.motivacion}/5, estrés ${profile.estadoDinamico.estadoEmocional.estres}/5`,
    `Nivel de energía actual: ${profile.estadoDinamico.nivelEnergia}`
  ]

  return lines.join('\n')
}

function applyEnrichmentToProfile(
  profile: Perfil,
  partial: z.infer<typeof enrichedPartialSchema>
): Perfil {
  // Deep-clone via JSON round-trip (safe since Perfil is JSON-serializable)
  const cloned: Perfil = JSON.parse(JSON.stringify(profile))
  const p = cloned.participantes[0]

  if (partial.despertar) p.rutinaDiaria.porDefecto.despertar = partial.despertar
  if (partial.dormir) p.rutinaDiaria.porDefecto.dormir = partial.dormir
  if (partial.trabajoInicio !== undefined) p.rutinaDiaria.porDefecto.trabajoInicio = partial.trabajoInicio
  if (partial.trabajoFin !== undefined) p.rutinaDiaria.porDefecto.trabajoFin = partial.trabajoFin
  if (partial.tiempoTransporte !== null && partial.tiempoTransporte !== undefined) {
    p.rutinaDiaria.porDefecto.tiempoTransporte = partial.tiempoTransporte
  }
  if (partial.cronotipo) p.patronesEnergia.cronotipo = partial.cronotipo
  if (partial.horasProductivasMaximas !== undefined) p.patronesEnergia.horasProductivasMaximas = partial.horasProductivasMaximas
  if (partial.horarioPicoEnergia) p.patronesEnergia.horarioPicoEnergia = partial.horarioPicoEnergia
  if (partial.horarioBajoEnergia) p.patronesEnergia.horarioBajoEnergia = partial.horarioBajoEnergia
  if (partial.horasLibresLaborales !== undefined) p.calendario.horasLibresEstimadas.diasLaborales = partial.horasLibresLaborales
  if (partial.horasLibresFDS !== undefined) p.calendario.horasLibresEstimadas.diasDescanso = partial.horasLibresFDS
  if (partial.nivelEnergia) cloned.estadoDinamico.nivelEnergia = partial.nivelEnergia
  if (partial.motivacion !== undefined) cloned.estadoDinamico.estadoEmocional.motivacion = partial.motivacion
  if (partial.estres !== undefined) cloned.estadoDinamico.estadoEmocional.estres = partial.estres

  return perfilSchema.parse(cloned)
}

export async function enrichProfile(
  runtime: AgentRuntime,
  profile: Perfil,
  ctx: SkillContext
): Promise<EnrichmentResult> {
  const { traceCollector } = await import('../../debug/trace-collector')
  const traceId = traceCollector.startTrace('profile-enricher', 'openrouter', {
    profileId: profile.participantes[0]?.datosPersonales?.nombre,
  })

  const systemPrompt = profileEnricher.getSystemPrompt(ctx)
  const userPrompt = buildEnrichmentUserPrompt(profile)
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt }
  ]

  const response = await runtime.chat(messages)

  try {
    const raw = JSON.parse(extractFirstJson(response.content))
    const parsed = enrichResponseSchema.parse(raw)

    const enrichedProfile = applyEnrichmentToProfile(profile, parsed.enrichedPartial)

    traceCollector.completeTrace(traceId)

    return {
      enrichedProfile,
      inferences: parsed.inferences,
      warnings: parsed.warnings,
      tokensUsed: {
        input: response.usage.promptTokens,
        output: response.usage.completionTokens
      }
    }
  } catch (e: any) {
    console.error('[LAP] Profile enricher runtime error:', e)
    traceCollector.failTrace(traceId, 'Parse error on enrichment results')
    return {
      enrichedProfile: profile,
      inferences: [],
      warnings: ['El agente de enriquecimiento no pudo procesar el perfil. Se continúa con los datos originales.'],
      tokensUsed: {
        input: response.usage.promptTokens,
        output: response.usage.completionTokens
      }
    }
  }
}
