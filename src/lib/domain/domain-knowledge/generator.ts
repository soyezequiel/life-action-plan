import { GoalTypeSchema, type GoalClassification } from '../goal-taxonomy';
import type { AgentRuntime } from '../../runtime/types';
import {
  DomainKnowledgeCardSchema,
  type DomainKnowledgeCard,
  registerCard,
} from './bank';

export interface GenerateCardInput {
  /** El texto original del objetivo del usuario, ej: "Quiero aprender a invertir en bolsa" */
  goalText: string;
  /** La clasificacion ya computada por la fase 1 (CLASSIFY) */
  classification: GoalClassification;
  /** Etiqueta de dominio inferida, ej: "inversion", "nutricion", "mudanza" */
  domainLabel: string;
}

const JSON_FENCE_REGEX = /^```(?:json)?\s*/i;
const THINK_TAG_REGEX = /<think>[\s\S]*?<\/think>/gi;
const ALLOWED_DYNAMIC_EVIDENCE = new Set(['D_HEURISTIC', 'E_UNKNOWN']);
const FORCED_GENERATION_META = {
  method: 'LLM_ONLY' as const,
  confidence: 0.6,
};

function buildPrompt(input: GenerateCardInput, normalizedDomainLabel: string): string {
  const goalTypes = GoalTypeSchema.options.map((goalType) => `"${goalType}"`).join(',');

  return [
    'Genera una DomainKnowledgeCard para un plan personal.',
    'Responde SOLO con JSON valido, sin markdown y sin campos extra.',
    'Usa espanol argentino simple, claro y sin jerga tecnica.',
    `Objetivo: "${input.goalText}"`,
    `Tipo de objetivo: ${input.classification.goalType}`,
    `Dominio: ${normalizedDomainLabel}`,
    'Schema exacto:',
    `{"domainLabel":"string","goalTypeCompatibility":[${goalTypes}],"tasks":[{"id":"string","label":"string","typicalDurationMin":30,"tags":["string"],"equivalenceGroupId":"string"}],"metrics":[{"id":"string","label":"string","unit":"string","direction":"increase|decrease"}],"progression":{"levels":[{"levelId":"string","description":"string","exitCriteria":["string"]}]},"constraints":[{"id":"string","description":"string","severity":"INFO|WARNING|BLOCKER"}],"sources":[{"title":"string","evidence":"D_HEURISTIC|E_UNKNOWN"}],"generationMeta":{"method":"LLM_ONLY","confidence":0.6}}`,
    'Reglas: minimo 3 tasks, minimo 1 metric, progression solo si aplica, cada task con equivalenceGroupId coherente, constraints con severidad, sources solo D_HEURISTIC o E_UNKNOWN, labels abuela-proof.',
  ].join('\n');
}

function normalizeDomainLabel(domainLabel: string): string {
  return domainLabel.trim().toLowerCase().replace(/\s+/g, '-');
}

function extractJsonFromContent(content: string): string {
  const withoutThink = content.replace(THINK_TAG_REGEX, '').trim();

  if (!withoutThink.startsWith('```')) {
    return withoutThink;
  }

  return withoutThink
    .replace(JSON_FENCE_REGEX, '')
    .replace(/\s*```$/, '')
    .trim();
}

function clipForError(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 180);
}

function enforceDynamicCardGuards(card: DomainKnowledgeCard, normalizedDomainLabel: string): void {
  GoalTypeSchema.array().parse(card.goalTypeCompatibility);

  if (card.tasks.length < 3) {
    throw new Error(`La card generada para "${normalizedDomainLabel}" debe incluir al menos 3 tasks.`);
  }

  if (card.metrics.length < 1) {
    throw new Error(`La card generada para "${normalizedDomainLabel}" debe incluir al menos 1 metric.`);
  }

  const invalidSource = card.sources.find((source) => !ALLOWED_DYNAMIC_EVIDENCE.has(source.evidence));
  if (invalidSource) {
    throw new Error(
      `La card generada para "${normalizedDomainLabel}" tiene una source con evidence no permitido: ${invalidSource.evidence}.`,
    );
  }
}

export async function generateDomainCard(
  runtime: AgentRuntime,
  input: GenerateCardInput,
): Promise<DomainKnowledgeCard> {
  const normalizedDomainLabel = normalizeDomainLabel(input.domainLabel);
  const prompt = buildPrompt(input, normalizedDomainLabel);
  const response = await runtime.chat([{ role: 'user', content: prompt }]);

  let parsed: unknown;

  try {
    parsed = JSON.parse(extractJsonFromContent(response.content));
  } catch {
    throw new Error(
      `No se pudo parsear JSON para "${normalizedDomainLabel}". Respuesta recibida: ${clipForError(response.content)}`,
    );
  }

  const card = DomainKnowledgeCardSchema.parse(parsed);
  enforceDynamicCardGuards(card, normalizedDomainLabel);

  const finalCard: DomainKnowledgeCard = {
    ...card,
    domainLabel: normalizedDomainLabel,
    generationMeta: FORCED_GENERATION_META,
  };

  await registerCard(finalCard);

  return finalCard;
}
