import type { AgentRuntime } from '../../runtime/types';
import type { StrategyInput, StrategyOutput } from './phase-io-v5';
import type { DomainKnowledgeCard } from '../../domain/domain-knowledge/bank';

export async function generateStrategy(
  runtime: AgentRuntime,
  input: StrategyInput,
  domainCard?: DomainKnowledgeCard
): Promise<StrategyOutput> {
  const prompt = `
Eres un planificador estratégico experto.
Tu objetivo es generar un roadmap estratégico basado en la clasificación del objetivo y el perfil del usuario.

Perfil del usuario:
- Horas libres lunes a viernes: ${input.profile.freeHoursWeekday}
- Horas libres fin de semana: ${input.profile.freeHoursWeekend}
- Nivel de energía: ${input.profile.energyLevel}

Clasificación del objetivo:
- Tipo: ${input.classification.goalType}
- Riesgo: ${input.classification.risk}

${domainCard ? `Conocimiento de Dominio (usa esto para las fases, frecuencias y progresiones):
- Dominio: ${domainCard.domainLabel}
- Tareas típicas: ${domainCard.tasks.map(t => t.label).join(', ')}
- Progresiones: ${domainCard.progression?.levels.map(l => l.description).join(' -> ') || 'N/A'}
` : ''}
El roadmap debe tener:
- listado de fases lógicas (ej: "fundamentos", "consolidación", "avanzado")
- hitos (milestones) concretos con su orden o estimación

Genera un resultado en formato JSON válido que cumpla con esta interfaz original en TypeScript:
{
  "phases": [
    {
      "name": "string (nombre de la fase)",
      "durationWeeks": number, // Opcional
      "focus_esAR": "string (enfoque de la fase en español argentino)"
    }
  ],
  "milestones": [
    "string (ej: Correr 5km sin detenerse)"
  ]
}

Responde SOLO con JSON válido, sin delimitadores de markdown (\`\`\`).
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
    return JSON.parse(cleanRaw) as StrategyOutput;
  } catch (e) {
    // Fallback safe en caso de timeout del LLM o parsing malo
    return {
      phases: [
        { name: 'fundamentos', durationWeeks: 4, focus_esAR: 'Establecer bases iniciales y hábito' },
        { name: 'desarrollo', durationWeeks: 4, focus_esAR: 'Incrementar la intensidad y el enfoque' }
      ],
      milestones: ['Completar el primer mes con 80% de adherencia']
    };
  }
}
