import type { GoalClassification } from '../../../domain/goal-taxonomy';
import { getKnowledgeCard, type DomainKnowledgeCard } from '../../../domain/domain-knowledge/bank';
import { generateDomainCard } from '../../../domain/domain-knowledge/generator';
import { guitarraCard } from '../../../domain/domain-knowledge/cards/guitarra';
import { idiomasCard } from '../../../domain/domain-knowledge/cards/idiomas';
import { runningCard } from '../../../domain/domain-knowledge/cards/running';
import type { AgentRuntime } from '../../../runtime/types';
import type { GoalType, V6Agent } from '../types';

export interface DomainExpertInput {
  domainLabel: string
  goalType: GoalType
  specificQuestion: string | null
}

export interface DomainExpertOutput {
  card: DomainKnowledgeCard | null
  specificAdvice: string | null
  warnings: string[]
}

const STATIC_CARDS: DomainKnowledgeCard[] = [
  runningCard,
  guitarraCard,
  idiomasCard,
];

function normalizeDomainLabel(domainLabel: string): string {
  return domainLabel.trim().toLowerCase();
}

function buildSyntheticClassification(goalType: GoalType): GoalClassification {
  return {
    goalType,
    confidence: 0.5,
    risk: 'LOW',
    extractedSignals: {
      isRecurring: goalType === 'RECURRENT_HABIT',
      hasDeliverable: goalType === 'FINITE_PROJECT',
      hasNumericTarget: goalType === 'QUANT_TARGET_TRACKING',
      requiresSkillProgression: goalType === 'SKILL_ACQUISITION',
      dependsOnThirdParties: goalType === 'HIGH_UNCERTAINTY_TRANSFORM',
      isOpenEnded: goalType === 'IDENTITY_EXPLORATION',
      isRelational: goalType === 'RELATIONAL_EMOTIONAL',
    },
  };
}

function summarizeCard(card: DomainKnowledgeCard): string {
  return [
    `Dominio: ${card.domainLabel}`,
    `Compatibilidad: ${card.goalTypeCompatibility.join(', ')}`,
    `Tasks: ${card.tasks.slice(0, 5).map((task) => task.label).join(', ')}`,
    `Constraints: ${card.constraints.slice(0, 4).map((constraint) => `[${constraint.severity}] ${constraint.description}`).join(' | ')}`,
    `Confianza: ${card.generationMeta.confidence}`,
  ].join('\n');
}

function buildWarnings(
  card: DomainKnowledgeCard | null,
  goalType: GoalType,
  extraWarnings: string[] = [],
): string[] {
  const warnings = new Set(extraWarnings);

  if (card && !card.goalTypeCompatibility.includes(goalType)) {
    warnings.add(`La card de ${card.domainLabel} no declara compatibilidad explicita con ${goalType}.`);
  }

  if (card && card.generationMeta.confidence < 0.7) {
    warnings.add(`La card de ${card.domainLabel} tiene confianza media y conviene validarla rapido.`);
  }

  return Array.from(warnings);
}

function lookupStaticCard(domainLabel: string): DomainKnowledgeCard | null {
  const normalizedDomainLabel = normalizeDomainLabel(domainLabel);
  return STATIC_CARDS.find((card) => normalizeDomainLabel(card.domainLabel) === normalizedDomainLabel) ?? null;
}

async function resolveCard(
  runtime: AgentRuntime,
  input: DomainExpertInput,
): Promise<{ card: DomainKnowledgeCard | null; warnings: string[] }> {
  const staticCard = await getKnowledgeCard(input.domainLabel);
  if (staticCard) {
    return {
      card: staticCard,
      warnings: buildWarnings(staticCard, input.goalType),
    };
  }

  try {
    const generatedCard = await generateDomainCard(runtime, {
      goalText: `Quiero avanzar en ${input.domainLabel}`,
      classification: buildSyntheticClassification(input.goalType),
      domainLabel: input.domainLabel,
    });

    return {
      card: generatedCard,
      warnings: buildWarnings(generatedCard, input.goalType),
    };
  } catch {
    return {
      card: null,
      warnings: buildWarnings(null, input.goalType, [
        `No se pudo cargar una card especifica para ${input.domainLabel}.`,
      ]),
    };
  }
}

async function answerSpecificQuestion(
  runtime: AgentRuntime,
  card: DomainKnowledgeCard,
  specificQuestion: string,
): Promise<string | null> {
  const response = await runtime.chat([{
    role: 'user',
    content: [
      'Responde como experto de dominio para planes personales.',
      'Usa espanol simple y practico.',
      'No menciones modelos, prompts ni limitaciones.',
      'Da una respuesta breve, accionable y aterrizada al contexto de la card.',
      '',
      summarizeCard(card),
      '',
      `Pregunta: ${specificQuestion}`,
    ].join('\n'),
  }]);

  const advice = response.content.trim();
  return advice.length > 0 ? advice : null;
}

export const domainExpertAgent: V6Agent<DomainExpertInput, DomainExpertOutput> = {
  name: 'domain-expert',

  async execute(input: DomainExpertInput, runtime: AgentRuntime): Promise<DomainExpertOutput> {
    const { card, warnings } = await resolveCard(runtime, input);

    if (!input.specificQuestion || !card) {
      return {
        card,
        specificAdvice: null,
        warnings,
      };
    }

    try {
      const specificAdvice = await answerSpecificQuestion(runtime, card, input.specificQuestion);
      return {
        card,
        specificAdvice,
        warnings,
      };
    } catch {
      return {
        card,
        specificAdvice: null,
        warnings: buildWarnings(card, input.goalType, [
          ...warnings,
          'No se pudo generar consejo puntual adicional.',
        ]),
      };
    }
  },

  fallback(input: DomainExpertInput): DomainExpertOutput {
    const card = lookupStaticCard(input.domainLabel);
    return {
      card,
      specificAdvice: null,
      warnings: buildWarnings(card, input.goalType),
    };
  },
};
