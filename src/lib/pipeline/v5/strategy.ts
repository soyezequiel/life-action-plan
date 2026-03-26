import { z } from 'zod';

import { t } from '../../../i18n';
import type { DomainKnowledgeCard } from '../../domain/domain-knowledge/bank';
import type { AgentRuntime } from '../../runtime/types';
import type { StrategyInput, StrategyOutput } from './phase-io-v5';

const strategicRoadmapPhaseSchema = z.object({
  name: z.string().trim().min(1),
  durationWeeks: z.number().optional(),
  focus_esAR: z.string().trim().min(1),
}).strict();

const strategyOutputSchema = z.object({
  phases: z.array(strategicRoadmapPhaseSchema).min(1),
  milestones: z.array(z.string().trim().min(1)),
}).strict();

function normalizeStrategyOutput(output: StrategyOutput): StrategyOutput {
  const phases = output.phases.map((phase) => ({
    name: phase.name.trim(),
    durationWeeks: phase.durationWeeks,
    focus_esAR: phase.focus_esAR.trim(),
  }));

  const uniqueMilestones = Array.from(
    new Set(output.milestones.map((milestone) => milestone.trim()).filter(Boolean)),
  );

  return {
    phases,
    milestones: phases.map((phase, index) => uniqueMilestones[index] ?? phase.focus_esAR),
  };
}

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

${domainCard ? `Conocimiento de dominio (usa esto para las fases, frecuencias y progresiones):
- Dominio: ${domainCard.domainLabel}
- Tareas tipicas: ${domainCard.tasks.map((task) => task.label).join(', ')}
- Progresiones: ${domainCard.progression?.levels.map((level) => level.description).join(' -> ') || 'N/A'}
` : ''}
${habitStateBlock}
El roadmap debe tener:
- listado de fases logicas (ej: "fundamentos", "consolidacion", "avanzado")
- hitos concretos con su orden o estimacion

Genera un resultado en formato JSON valido que cumpla con esta interfaz:
{
  "phases": [
    {
      "name": "string",
      "durationWeeks": number,
      "focus_esAR": "string"
    }
  ],
  "milestones": [
    "string"
  ]
}

Responde SOLO con JSON valido, sin markdown.
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
    return normalizeStrategyOutput(strategyOutputSchema.parse(JSON.parse(cleanRaw)));
  } catch {
    return normalizeStrategyOutput({
      phases: [
        {
          name: t('pipeline.v5.strategy.fallback.phase_foundations_name'),
          durationWeeks: 4,
          focus_esAR: t('pipeline.v5.strategy.fallback.phase_foundations_focus'),
        },
        {
          name: t('pipeline.v5.strategy.fallback.phase_development_name'),
          durationWeeks: 4,
          focus_esAR: t('pipeline.v5.strategy.fallback.phase_development_focus'),
        },
      ],
      milestones: [t('pipeline.v5.strategy.fallback.milestone_first_month')],
    });
  }
}
