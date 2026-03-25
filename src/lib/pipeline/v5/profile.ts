import type { AgentRuntime } from '../../runtime/types';
import type { UserProfileV5 } from './phase-io-v5';

/**
 * Fase 3: Extrae info estructurada (incluyendo anclas numéricos) 
 * a partir de lo que el usuario respondió a la entrevista de requerimientos.
 */
export async function buildProfile(
  runtime: AgentRuntime,
  answers: Record<string, string>
): Promise<UserProfileV5> {
  const prompt = `
Leé estas respuestas de un usuario que quiere empezar un objetivo, acerca de su disponibilidad y restricciones físicas o temporales.

Respuestas dadas por el usuario:
${Object.entries(answers).map(([q, a]) => `- Pregunta: ${q}\n  Respuesta: ${a}`).join('\n')}

Extrae estas métricas y reglas:
- freeHoursWeekday (número estimativo, horas libres de tiempo propio por cada día hábil)
- freeHoursWeekend (número estimativo, horas libres de tiempo propio en todo un día de fin de semana)
- energyLevel: usar estrictamente un término entre "low", "medium" o "high"
- fixedCommitments: array con strings (ej. "Trabajo lunes a viernes de 9 a 18", "Curso los Lunes a las 19hs")
- scheduleConstraints: array con strings listando restricciones de horario para cualquier actividad opcional (ej. "No correr de noche", "Disponibilidad fuerte recién sábados")

Devuelve SOLO este formato JSON exacto sin bloques markdown ni comentarios explicativos extra:
{
  "freeHoursWeekday": 3.0,
  "freeHoursWeekend": 6.5,
  "energyLevel": "medium",
  "fixedCommitments": ["Trabajo 9 a 18"],
  "scheduleConstraints": ["Evitar madrugar demasiado"]
}
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
    const data = JSON.parse(cleanRaw);
    
    return {
      freeHoursWeekday: Number(data.freeHoursWeekday) || 2,
      freeHoursWeekend: Number(data.freeHoursWeekend) || 4,
      energyLevel: ['low', 'medium', 'high'].includes(data.energyLevel) ? data.energyLevel : 'medium',
      fixedCommitments: Array.isArray(data.fixedCommitments) ? data.fixedCommitments : [],
      scheduleConstraints: Array.isArray(data.scheduleConstraints) ? data.scheduleConstraints : []
    };
  } catch (e) {
    // Fallback determinístico si falla LLM
    return {
      freeHoursWeekday: 2,
      freeHoursWeekend: 5,
      energyLevel: 'medium',
      fixedCommitments: [],
      scheduleConstraints: ["Recuperación automática de perfil"]
    };
  }
}
