import { z } from 'zod';

import { t } from '../../../i18n';
import type { AgentRuntime } from '../../runtime/types';
import type { RequirementsInput, RequirementsOutput } from './phase-io-v5';

const requirementsOutputSchema = z.object({
  questions: z.array(z.string().trim().min(1)).min(2).max(6),
}).strict();

/**
 * Fase 2: Dado un GoalClassification, genera un set de preguntas concretas
 * para entender los requerimientos del plan.
 */
export async function generateRequirements(
  runtime: AgentRuntime,
  input: RequirementsInput,
): Promise<RequirementsOutput> {
  const prompt = `
Eres un asistente que formula preguntas clave para planificar un objetivo particular.
Objetivo literal del usuario:
${input.goalText}

El sistema acaba de clasificar este objetivo general como: ${input.classification.goalType} (Riesgo: ${input.classification.risk}).

Dependiendo del GoalType enfocate en:
- SKILL_ACQUISITION: nivel actual, tiempo disponible, experiencia previa.
- QUANT_TARGET_TRACKING: target numerico, plazo, situacion actual.
- FINITE_PROJECT: deadline, entregables, recursos.
- RECURRENT_HABIT: triggers actuales, consistencia pasada, bloqueos.
- IDENTITY_EXPLORATION: valores relevantes, que le genera sentido, mentores locales.
- RELATIONAL_EMOTIONAL: dinamicas vinculares actuales, nivel de comunicacion.
- HIGH_UNCERTAINTY_TRANSFORM: expectativas realistas, riesgos importantes, bloqueos emocionales.

Ademas, sin importar el GoalType, cubri:
- como se veria un primer avance verificable
- horizonte o ventana de decision relevante
- punto de partida actual del usuario
- dependencias externas, permisos o terceros relevantes
- restricciones fuertes de tiempo, dinero, energia o contexto

Senales extraidas automaticamente: ${JSON.stringify(input.classification.extractedSignals)}

Genera un JSON con un array "questions" de strings con exactamente entre 3 y 4 preguntas puntuales en espanol argentino.
Responde SOLO con JSON valido, sin markdown, por ejemplo: {"questions": ["Cuantas horas libres tenes a la semana?"]}
`;

  const response = await runtime.chat([{ role: 'user', content: prompt }]);

  try {
    let raw = response.content.trim();
    if (raw.startsWith('```json')) {
      raw = raw.slice(7);
    } else if (raw.startsWith('```')) {
      raw = raw.slice(3);
    }
    if (raw.endsWith('```')) {
      raw = raw.slice(0, -3);
    }
    const cleanRaw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return requirementsOutputSchema.parse(JSON.parse(cleanRaw));
  } catch {
    const questions = [t('pipeline.v5.requirements.fallback.hours')];

    if (input.classification.goalType === 'SKILL_ACQUISITION') {
      questions.push(t('pipeline.v5.requirements.fallback.skill_level'));
    } else if (input.classification.goalType === 'FINITE_PROJECT') {
      questions.push(t('pipeline.v5.requirements.fallback.deadline'));
    } else if (input.classification.goalType === 'QUANT_TARGET_TRACKING') {
      questions.push(t('pipeline.v5.requirements.fallback.numeric_target'));
    } else {
      questions.push(t('pipeline.v5.requirements.fallback.current_state'));
    }

    return { questions };
  }
}
