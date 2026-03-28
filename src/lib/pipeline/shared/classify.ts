import { z } from 'zod';

import {
  GoalClassification,
  GoalDomainRisk,
  GoalDomainRiskSchema,
  GoalSignals,
  GoalType,
  GoalTypeSchema,
} from '@lib/domain/goal-taxonomy';
import type { AgentRuntime } from '../../runtime/types';

const llmClassificationSchema = z.object({
  goalType: GoalTypeSchema,
  confidence: z.number().min(0).max(1),
  risk: GoalDomainRiskSchema,
  signals: z.array(z.string().trim().min(1)).max(6).default([]),
}).strict();

const RISK_ORDER: Record<GoalDomainRisk, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH_HEALTH: 2,
  HIGH_FINANCE: 2,
  HIGH_LEGAL: 2,
};

const NEARBY_TYPES = new Set<string>([
  'RECURRENT_HABIT::SKILL_ACQUISITION',
  'SKILL_ACQUISITION::RECURRENT_HABIT',
  'FINITE_PROJECT::QUANT_TARGET_TRACKING',
  'QUANT_TARGET_TRACKING::FINITE_PROJECT',
  'IDENTITY_EXPLORATION::HIGH_UNCERTAINTY_TRANSFORM',
  'HIGH_UNCERTAINTY_TRANSFORM::IDENTITY_EXPLORATION',
]);

const EXTERNAL_GATE_PATTERN = /entrevista|selecci[oó]n|admisi[oó]n|aprobaci[oó]n|permiso|visa|licencia|habilitaci[oó]n|beca|concurso|casting|audici[oó]n|elecci[oó]n(?:es)?|candidatura|postulaci[oó]n|postular|nombramiento|votos?|electo|elegid[oa]/i;

function stripFormatting(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

function extractFirstJsonObject(content: string): string {
  const cleaned = stripFormatting(content);
  const firstBrace = cleaned.indexOf('{');

  if (firstBrace < 0) {
    return cleaned;
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = firstBrace; index < cleaned.length; index += 1) {
    const char = cleaned[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return cleaned.slice(firstBrace, index + 1);
      }
    }
  }

  return cleaned.slice(firstBrace);
}

function isNearbyType(left: GoalType, right: GoalType): boolean {
  return NEARBY_TYPES.has(`${left}::${right}`);
}

function chooseMostConservativeRisk(left: GoalDomainRisk, right: GoalDomainRisk): GoalDomainRisk {
  return RISK_ORDER[right] > RISK_ORDER[left] ? right : left;
}

export function classifyGoal(rawText: string): GoalClassification {
  const text = rawText.toLowerCase();
  const cadenceHabitPattern =
    /(\d+\s+veces por semana|todos los d[ií]as|diario|cada (lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo))/i;

  const signals: GoalSignals = {
    isRecurring: /todos los d[ií]as|diario|veces por semana|cada (lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)|cada mes/i.test(text),
    hasDeliverable: /terminar|entregar|publicar|completar|lanzar|armar/i.test(text),
    hasNumericTarget: /\$|ahorrar|kg|kilos|libros|p[aá]ginas|veces/i.test(text),
    requiresSkillProgression: /aprender|mejorar en|estudiar|practicar|entrenar/i.test(text),
    dependsOnThirdParties: /junto a|con mi|esperar a|delegar|contratar|equipo|cliente|socios?|jurado|votaci[oó]n|votos?|elecci[oó]n(?:es)?|candidatura|postulaci[oó]n|postular|entrevista|selecci[oó]n|admisi[oó]n|aprobaci[oó]n|permiso|visa|licencia|habilitaci[oó]n|beca|concurso|casting|audici[oó]n|nombramiento|electo|elegid[oa]/i.test(text),
    isOpenEnded: /explorar|descubrir|encontrar|buscar/i.test(text),
    isRelational: /relaci[oó]n|pareja|hijo|padre|madre|hermano|amigo|conocer gente/i.test(text),
  };

  let risk: GoalDomainRisk = 'LOW';
  if (/salud|m[eé]dico|enfermedad|operaci[oó]n|lesi[oó]n|dolor|hueso/i.test(text)) risk = 'HIGH_HEALTH';
  else if (/inversi[oó]n|invertir|pr[eé]stamo|deuda|acciones/i.test(text)) risk = 'HIGH_FINANCE';
  else if (/juicio|abogado|divorcio|demanda/i.test(text)) risk = 'HIGH_LEGAL';
  else if (signals.hasNumericTarget || signals.dependsOnThirdParties) risk = 'MEDIUM';

  let goalType: GoalType = 'RECURRENT_HABIT';
  let confidence = 0.5;

  if (text.includes('mudar') || text.includes('cambiar de vida') || EXTERNAL_GATE_PATTERN.test(text)) {
    goalType = 'HIGH_UNCERTAINTY_TRANSFORM';
    confidence = 0.78;
  } else if (
    signals.dependsOnThirdParties
    && !signals.hasDeliverable
    && !signals.hasNumericTarget
    && !signals.requiresSkillProgression
    && !signals.isRecurring
    && !signals.isRelational
  ) {
    goalType = 'HIGH_UNCERTAINTY_TRANSFORM';
    confidence = 0.72;
  } else if (signals.isOpenEnded && !signals.hasDeliverable) {
    goalType = 'IDENTITY_EXPLORATION';
    confidence = 0.8;
  } else if (signals.isRelational) {
    goalType = 'RELATIONAL_EMOTIONAL';
    confidence = 0.9;
  } else if (cadenceHabitPattern.test(text) && !signals.hasDeliverable) {
    goalType = 'RECURRENT_HABIT';
    confidence = 0.9;
  } else if (signals.hasNumericTarget && !signals.requiresSkillProgression) {
    goalType = 'QUANT_TARGET_TRACKING';
    confidence = 0.8;
  } else if (signals.hasDeliverable && !signals.isRecurring) {
    goalType = 'FINITE_PROJECT';
    confidence = 0.8;
  } else if (signals.requiresSkillProgression) {
    goalType = 'SKILL_ACQUISITION';
    confidence = 0.8;
  } else if (signals.isRecurring) {
    goalType = 'RECURRENT_HABIT';
    confidence = 0.9;
  }

  return {
    goalType,
    confidence,
    risk,
    extractedSignals: signals,
  };
}

function adjudicateClassification(
  heuristic: GoalClassification,
  llm: z.infer<typeof llmClassificationSchema>,
): GoalClassification {
  const conservativeRisk = chooseMostConservativeRisk(heuristic.risk, llm.risk);

  if (heuristic.goalType === llm.goalType) {
    return {
      ...heuristic,
      confidence: Math.max(heuristic.confidence, llm.confidence),
      risk: conservativeRisk,
    };
  }

  const llmClearlyBetter = llm.confidence >= heuristic.confidence + 0.15;
  const heuristicAmbiguous = heuristic.confidence < 0.7;
  const nearbyDisagreement = isNearbyType(heuristic.goalType, llm.goalType) && llmClearlyBetter;

  if (heuristicAmbiguous || nearbyDisagreement) {
    return {
      ...heuristic,
      goalType: llm.goalType,
      confidence: Math.max(heuristic.confidence, llm.confidence),
      risk: conservativeRisk,
    };
  }

  return {
    ...heuristic,
    risk: conservativeRisk,
  };
}

async function readLlmClassification(runtime: AgentRuntime, text: string): Promise<z.infer<typeof llmClassificationSchema> | null> {
  const response = await runtime.chat([{
    role: 'user',
    content: `
Clasifica este objetivo personal para un pipeline operativo.

Objetivo:
${text}

Devuelve SOLO JSON estricto:
{
  "goalType": "RECURRENT_HABIT|SKILL_ACQUISITION|FINITE_PROJECT|QUANT_TARGET_TRACKING|IDENTITY_EXPLORATION|RELATIONAL_EMOTIONAL|HIGH_UNCERTAINTY_TRANSFORM",
  "confidence": 0.0,
  "risk": "LOW|MEDIUM|HIGH_HEALTH|HIGH_FINANCE|HIGH_LEGAL",
  "signals": ["razones cortas"]
}

No expliques nada fuera del JSON.
`.trim(),
  }]);

  const raw = extractFirstJsonObject(response.content);
  const parsed = JSON.parse(raw);
  return llmClassificationSchema.parse(parsed);
}

export async function classifyGoalWithRuntime(runtime: AgentRuntime, rawText: string): Promise<GoalClassification> {
  const heuristic = classifyGoal(rawText);

  try {
    const llm = await readLlmClassification(runtime, rawText);
    if (!llm) {
      return heuristic;
    }
    return adjudicateClassification(heuristic, llm);
  } catch {
    return heuristic;
  }
}
