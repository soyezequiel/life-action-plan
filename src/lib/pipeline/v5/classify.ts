import { GoalClassification, GoalSignals, GoalType, GoalDomainRisk } from '@lib/domain/goal-taxonomy';

export function classifyGoal(rawText: string): GoalClassification {
  const text = rawText.toLowerCase();
  const cadenceHabitPattern =
    /(\d+\s+veces por semana|todos los d[ií]as|diario|cada (lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo))/i;

  // Paso 1: regex patterns para señales obvias
  const signals: GoalSignals = {
    isRecurring: /todos los días|diario|veces por semana|cada (lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)|cada mes/i.test(text),
    hasDeliverable: /terminar|entregar|publicar|completar|lanzar|armar/i.test(text),
    hasNumericTarget: /\$|ahorrar|kg|kilos|libros|p[aá]ginas|veces/i.test(text),
    requiresSkillProgression: /aprender|mejorar en|estudiar|practicar|entrenar/i.test(text),
    dependsOnThirdParties: /junto a|con mi|esperar a|delegar|contratar/i.test(text),
    isOpenEnded: /explorar|descubrir|encontrar|buscar/i.test(text),
    isRelational: /relaci[oó]n|pareja|hijo|padre|madre|hermano|amigo|conocer gente/i.test(text),
  };

  // Risk detection
  let risk: GoalDomainRisk = 'LOW';
  if (/salud|m[eé]dico|enfermedad|operaci[oó]n|lesi[oó]n|dolor|hueso/i.test(text)) risk = 'HIGH_HEALTH';
  else if (/inversi[oó]n|invertir|pr[eé]stamo|deuda|acciones/i.test(text)) risk = 'HIGH_FINANCE';
  else if (/juicio|abogado|divorcio|demanda/i.test(text)) risk = 'HIGH_LEGAL';
  else if (signals.hasNumericTarget || signals.dependsOnThirdParties) risk = 'MEDIUM';

  // Paso 2: mapear señales a GoalType
  let goalType: GoalType = 'RECURRENT_HABIT';
  let confidence = 0.5;

  if (text.includes('mudar') || text.includes('cambiar de vida')) {
    goalType = 'HIGH_UNCERTAINTY_TRANSFORM';
    confidence = 0.7;
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

  // Paso 3 (opcional): LLM logic fallback could go here
  if (confidence < 0.7) {
    // If we wanted to use LLM, we would invoke it here for better clarification.
  }

  return {
    goalType,
    confidence,
    risk,
    extractedSignals: signals,
  };
}
