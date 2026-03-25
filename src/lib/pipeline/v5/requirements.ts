import type { AgentRuntime } from '../../runtime/types';
import type { GoalClassification } from '../../domain/goal-taxonomy';
import type { RequirementsOutput } from './phase-io-v5';

/**
 * Fase 2: Dado un GoalClassification, genera un set de preguntas concretas
 * para entender los requerimientos del plan.
 */
export async function generateRequirements(
  runtime: AgentRuntime,
  classification: GoalClassification
): Promise<RequirementsOutput> {
  const prompt = `
Eres un asistente que formula preguntas clave para planificar un objetivo particular.
El sistema acaba de clasificar este objetivo general como: ${classification.goalType} (Riesgo: ${classification.risk}).

Dependiendo del GoalType enfócate en:
- SKILL_ACQUISITION: nivel actual, tiempo disponible, experiencia previa.
- QUANT_TARGET_TRACKING: target numérico, plazo, situación actual.
- FINITE_PROJECT: deadline, entregables, recursos.
- RECURRENT_HABIT: triggers actuales, consistencia pasada, bloqueos.
- IDENTITY_EXPLORATION: valores relevantes, qué le genera sentido, mentores locales.
- RELATIONAL_EMOTIONAL: dinámicas vinculares actuales, nivel de comunicación.
- HIGH_UNCERTAINTY_TRANSFORM: expectativas realistas, riesgos importantes, bloqueos emocionales.

Señales extraídas automáticamente: ${JSON.stringify(classification.extractedSignals)}

Generá un JSON con un array "questions" de strings con exactamente entre 3 y 4 preguntas puntuales en español argentino ("¿Qué querés...", "¿Podés...").
Responde SOLO con JSON válido, sin formati de markdown (\`\`\`), por ejemplo: {"questions": ["¿Cuántas horas libres tenés a la semana?"]}
`;

  const response = await runtime.chat([{ role: 'user', content: prompt }]);
  
  try {
    let raw = response.content.trim();
    if (raw.startsWith('\`\`\`json')) {
      raw = raw.slice(7);
    } else if (raw.startsWith('\`\`\`')) {
      raw = raw.slice(3);
    }
    if (raw.endsWith('\`\`\`')) {
      raw = raw.slice(0, -3);
    }
    const cleanRaw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return JSON.parse(cleanRaw) as RequirementsOutput;
  } catch (e) {
    // Fallback silencioso por timeout o parsing malformado
    const fb = ["¿Cuántas horas a la semana tenés para dedicarle a este objetivo?"];
    if (classification.goalType === 'SKILL_ACQUISITION') fb.push("¿Qué nivel de experiencia ya tenés en esto?");
    if (classification.goalType === 'FINITE_PROJECT') fb.push("¿Para cuándo necesitás tener esto terminado?");
    if (classification.goalType === 'QUANT_TARGET_TRACKING') fb.push("¿Cuál es tu número meta exacto a alcanzar?");
    return { questions: fb };
  }
}
