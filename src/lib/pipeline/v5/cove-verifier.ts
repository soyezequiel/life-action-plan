import type { AgentRuntime } from '../../runtime/types';
import type { CoVeVerifyInput, CoVeVerifyOutput } from './phase-io-v5';

export async function executeCoVeVerifier(
  runtime: AgentRuntime,
  input: CoVeVerifyInput
): Promise<CoVeVerifyOutput> {
  const eventsList = input.schedule.events
    .map(e => `- ID: ${e.id} | ${e.title}: inicio ${e.startAt} (${e.durationMin}m)`)
    .join('\n');

  const prompt = `
Eres un agente de verificación (Chain-of-Verification o CoVe) de un plan.
Tu objetivo es examinar el calendario y generar preguntas fundamentales ("¿Hay días de descanso?", "¿Las sesiones están bien distribuidas?"), responderlas analizando los eventos programados y reportar problemas (es decir, hallazgos o findings).

Eventos programados en el calendario:
${eventsList || 'Ninguno'}

Instrucciones:
1. Genera de 2 a 4 preguntas concretas para verificar dependencias, saturación o requerimientos del plan.
2. Responde cada pregunta de forma determinística basándote exclusivamente en la lista de eventos programados (si no hay, la respuesta es "No hay eventos").
3. Asigna a cada afirmación una de las siguientes severidades dependiendo de su impacto en el plan:
   - 'FAIL': Si rompe una regla fundamental (ej: actividades sin descanso crítico o dependencias lógicas solapadas).
   - 'WARN': Si es una advertencia de desgaste (ej: todo concentrado en un solo día).
   - 'INFO': Si es un dato neutro o está todo en orden.

Devuelve SOLO JSON válido con la siguiente estructura y en español:
{
  "findings": [
    {
      "question": "¿El plan incluye descanso después de 2 días de running?",
      "answer": "Sí, las sesiones no están pegadas en días consecutivos.",
      "severity": "INFO"
    }
  ]
}

Responde SOLO con JSON válido, sin usar bloques delimitadores de markdown (\`\`\`).
`;

  try {
    const response = await runtime.chat([{ role: 'user', content: prompt }]);
    let raw = response.content.trim();
    
    if (raw.startsWith('\`\`\`json')) {
      raw = raw.slice(7);
    } else if (raw.startsWith('\`\`\`')) {
      raw = raw.slice(3);
    }
    if (raw.endsWith('\`\`\`')) {
      raw = raw.slice(0, -3);
    }
    
    // Remover tokens de <think>
    const cleanRaw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    return JSON.parse(cleanRaw) as CoVeVerifyOutput;
  } catch (e) {
    // Modo de falla seguro
    return {
      findings: [
        {
          question: "¿Existen eventos programados suficientes para el plan?",
          answer: "No se pudo invocar el proceso de verificación adecuadamente.",
          severity: "WARN"
        }
      ]
    };
  }
}
