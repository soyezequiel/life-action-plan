import { z } from 'zod';

import { t } from '../../../i18n';
import type { DomainKnowledgeCard } from '../../domain/domain-knowledge/bank';
import { extractFirstJsonObject } from '../../flow/agents/llm-json-parser';
import type { AgentRuntime } from '../../runtime/types';
import { buildRevisionContext } from '../v6/prompts/critic-reasoning';
import { buildStrategyPrompt } from '../v6/prompts/strategy-reasoning';
import type { StrategyInput, StrategyOutput } from './phase-io';

const strategicRoadmapPhaseSchema = z.object({
  name: z.string().trim().min(1),
  durationWeeks: z.number().optional(),
  focus_esAR: z.string().trim().min(1),
}).strict();

const strategyOutputSchema = z.object({
  phases: z.array(strategicRoadmapPhaseSchema).min(1),
  milestones: z.array(z.string().trim().min(1)),
}).strict();

const strategyReasoningPhaseSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  startMonth: z.number(),
  endMonth: z.number(),
}).strict();

const strategyReasoningOutputSchema = z.object({
  phases: z.array(strategyReasoningPhaseSchema).min(1),
  milestones: z.array(z.object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1),
    targetMonth: z.number(),
    phaseId: z.string().trim().min(1),
  }).strict()).min(1),
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

function normalizeReasoningOutput(raw: unknown): StrategyOutput {
  const output = strategyReasoningOutputSchema.parse(raw);

  return normalizeStrategyOutput({
    phases: output.phases.map((phase) => ({
      name: phase.title,
      durationWeeks: Math.max(1, Math.round((phase.endMonth - phase.startMonth + 1) * 4)),
      focus_esAR: phase.summary,
    })),
    milestones: output.milestones.map((milestone) => milestone.label),
  });
}

function buildHabitStateBlock(input: StrategyInput): string {
  return (input.habitStates?.length ?? 0) > 0
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
}

function buildLegacyStrategyPrompt(input: StrategyInput, domainCard?: DomainKnowledgeCard): string {
  return `
Eres un planificador estrategico experto.
Tu objetivo es generar un roadmap estrategico basado en la clasificacion del objetivo y el perfil del usuario.

Objetivo literal del usuario:
${input.goalText}

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
${buildHabitStateBlock(input)}
El roadmap debe tener:
- listado de fases logicas (ej: "fundamentos", "consolidacion", "avanzado")
- hitos concretos con su orden o estimacion
- foco suficiente para distinguir este objetivo de otro del mismo GoalType

Si el objetivo tiene alta incertidumbre o depende de terceros:
- baja la incertidumbre en pasos verificables
- identifica validaciones externas, requisitos o pruebas de realidad
- evita nombres de fase intercambiables como "fase 1" o "base"

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
}

export async function generateStrategy(
  runtime: AgentRuntime,
  input: StrategyInput,
  domainCard?: DomainKnowledgeCard,
): Promise<StrategyOutput> {
  const planningContext = input.planningContext;
  const prompt = planningContext?.interpretation
    ? buildStrategyPrompt({
        goalText: input.goalText,
        goalType: input.classification.goalType,
        interpretation: planningContext.interpretation,
        userProfile: {
          freeHoursWeekday: input.profile.freeHoursWeekday,
          freeHoursWeekend: input.profile.freeHoursWeekend,
          energyLevel: input.profile.energyLevel,
          fixedCommitments: input.profile.fixedCommitments,
        },
        domainContext: planningContext.domainContext ?? (domainCard ? { card: domainCard } : null),
        clarificationAnswers: planningContext.clarificationAnswers ?? {},
        previousCriticFindings: planningContext.previousCriticFindings,
        revisionContext: planningContext.previousCriticReports?.length
          ? buildRevisionContext(planningContext.previousCriticReports)
          : undefined,
      })
    : buildLegacyStrategyPrompt(input, domainCard);

  const response = await runtime.chat([{ role: 'user', content: prompt }]);

  try {
    const cleanRaw = response.content
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .trim();

    const parsed = JSON.parse(planningContext?.interpretation
      ? extractFirstJsonObject(cleanRaw)
      : cleanRaw);

    return planningContext?.interpretation
      ? normalizeReasoningOutput(parsed)
      : normalizeStrategyOutput(strategyOutputSchema.parse(parsed));
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
