import type { DomainKnowledgeCard } from '../../domain/domain-knowledge/bank';
import type { AgentRuntime } from '../../runtime/types';
import type { StrategyInput, StrategyOutput } from './phase-io-v5';

export async function generateStrategy(
  runtime: AgentRuntime,
  input: StrategyInput,
  domainCard?: DomainKnowledgeCard,
): Promise<StrategyOutput> {
  const habitStateBlock = (input.habitStates?.length ?? 0) > 0
    ? `
Estado actual del habito (adapta la estrategia a esto en vez de reiniciar desde cero):
${input.habitStates!.map((state) =>
  `- ${state.progressionKey}: weeksActive=${state.weeksActive}, level=${state.level}, sessionsPerWeek=${state.currentDose.sessionsPerWeek}, minimumViable=${state.currentDose.minimumViable.minutes}min, protectedFromReset=${state.protectedFromReset}`
).join('\n')}

Reglas adaptativas:
- Si weeksActive >= 4, evita una fase de "introduccion" o "fundamentos muy iniciales".
- Si protectedFromReset es true, trata el habito como ya instalado y enfocate en progresion, no en arrancar de cero.
- Si el nivel ya es alto, propon etapas de consolidacion o siguiente escalon, no repeticion basica.
`
    : '';

  const prompt = `
Eres un planificador estrategico experto.
Tu objetivo es generar un roadmap estrategico basado en la clasificacion del objetivo y el perfil del usuario.

Perfil del usuario:
- Horas libres lunes a viernes: ${input.profile.freeHoursWeekday}
- Horas libres fin de semana: ${input.profile.freeHoursWeekend}
- Nivel de energia: ${input.profile.energyLevel}

Clasificacion del objetivo:
- Tipo: ${input.classification.goalType}
- Riesgo: ${input.classification.risk}

${domainCard ? `Conocimiento de Dominio (usa esto para las fases, frecuencias y progresiones):
- Dominio: ${domainCard.domainLabel}
- Tareas tipicas: ${domainCard.tasks.map((task) => task.label).join(', ')}
- Progresiones: ${domainCard.progression?.levels.map((level) => level.description).join(' -> ') || 'N/A'}
` : ''}
${habitStateBlock}
El roadmap debe tener:
- listado de fases logicas (ej: "fundamentos", "consolidacion", "avanzado")
- hitos (milestones) concretos con su orden o estimacion

Genera un resultado en formato JSON valido que cumpla con esta interfaz original en TypeScript:
{
  "phases": [
    {
      "name": "string (nombre de la fase)",
      "durationWeeks": number,
      "focus_esAR": "string (enfoque de la fase en espanol argentino)"
    }
  ],
  "milestones": [
    "string (ej: Correr 5km sin detenerse)"
  ]
}

Responde SOLO con JSON valido, sin delimitadores de markdown (\`\`\`).
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
  } catch {
    return {
      phases: [
        { name: 'fundamentos', durationWeeks: 4, focus_esAR: 'Establecer bases iniciales y habito' },
        { name: 'desarrollo', durationWeeks: 4, focus_esAR: 'Incrementar la intensidad y el enfoque' },
      ],
      milestones: ['Completar el primer mes con 80% de adherencia'],
    };
  }
}
