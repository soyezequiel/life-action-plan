import { z } from 'zod';

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
  totalSpanWeeks: z.number().optional(),
}).strict();

// LLM responses often include extra keys beyond what we need.
// Use .passthrough() to accept them without failing validation,
// then normalizeReasoningOutput() picks only the fields we use.
const strategyReasoningPhaseSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  startMonth: z.number(),
  endMonth: z.number(),
}).passthrough();

const strategyReasoningOutputSchema = z.object({
  phases: z.array(strategyReasoningPhaseSchema).min(1),
  milestones: z.array(z.object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1),
    targetMonth: z.number(),
    phaseId: z.string().trim().min(1),
  }).passthrough()).min(1),
}).passthrough();

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
    ...(output.totalSpanWeeks != null ? { totalSpanWeeks: output.totalSpanWeeks } : {}),
  };
}

function normalizeReasoningOutput(raw: unknown): StrategyOutput {
  const output = strategyReasoningOutputSchema.parse(raw);

  const minStart = Math.min(...output.phases.map((p) => p.startMonth));
  const maxEnd = Math.max(...output.phases.map((p) => p.endMonth));
  const totalSpanWeeks = Math.max(1, (maxEnd - minStart + 1) * 4);

  // Compute raw durations and their sum to distribute proportionally within the span.
  // When multiple phases overlap (e.g. all within month 1), summing their individual
  // month-based durations inflates the total beyond the actual plan span.
  const rawDurations = output.phases.map((p) => Math.max(1, p.endMonth - p.startMonth + 1));
  const rawSum = rawDurations.reduce((a, b) => a + b, 0);
  const spanMonths = maxEnd - minStart + 1;
  const needsRescale = rawSum > spanMonths;

  return normalizeStrategyOutput({
    phases: output.phases.map((phase, i) => ({
      name: phase.title,
      durationWeeks: needsRescale
        ? Math.max(1, Math.round(totalSpanWeeks * rawDurations[i] / rawSum))
        : Math.max(1, Math.round((phase.endMonth - phase.startMonth + 1) * 4)),
      focus_esAR: phase.summary,
    })),
    milestones: output.milestones.map((milestone) => milestone.label),
    totalSpanWeeks,
  });
}

interface CookingSignals {
  level: string | null;
  subtopic: string | null;
  learningMethod: string | null;
  horizon: string | null;
  references: string[];
}

interface HealthSignals {
  weight: string | null;
  height: string | null;
  medicalContext: string | null;
  aggressive: string | null;
  preferredActivities: string[];
  support: string | null;
  supervision: string | null;
  highRisk: boolean;
}

interface GenericPlanAnchors {
  metric: string | null;
  timeframe: string | null;
  anchorTokens: string[];
}

interface TypedClarificationSignals {
  cooking: CookingSignals;
  health: HealthSignals;
  general: GenericPlanAnchors;
}

interface StrategyValidationResult {
  valid: boolean;
  failedCheck: string | null;
}

const VALID_STRATEGY_OUTPUT: StrategyValidationResult = {
  valid: true,
  failedCheck: null,
};

const COOKING_SUBTOPIC_PATTERN = /\b(pasta|pastas|salsa|salsas|risotto|pizza|pizzas|gnocchi|lasagna|lasa[Ã±n]a|focaccia|pesto|ravioli)\b/i;

function normalizeSignalText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function includesAny(text: string, fragments: string[]): boolean {
  const normalized = normalizeSignalText(text);
  return fragments.some((fragment) => normalized.includes(normalizeSignalText(fragment)));
}

function canonicalizeCookingSubtopicToken(value: string): string {
  const normalized = normalizeSignalText(value);

  switch (normalized) {
    case 'pastas':
      return 'pasta';
    case 'salsas':
      return 'salsa';
    case 'pizzas':
      return 'pizza';
    case 'lasaÃ±a':
    case 'lasana':
      return 'lasagna';
    default:
      return normalized;
  }
}

function buildCookingSubtopicVariants(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const variants = new Set<string>([trimmed]);
  const matchedToken = trimmed.match(COOKING_SUBTOPIC_PATTERN)?.[0];

  if (!matchedToken) {
    return [...variants];
  }

  const canonical = canonicalizeCookingSubtopicToken(matchedToken);
  variants.add(matchedToken);
  variants.add(canonical);

  switch (canonical) {
    case 'pasta':
      variants.add('pastas');
      break;
    case 'salsa':
      variants.add('salsas');
      break;
    case 'pizza':
      variants.add('pizzas');
      break;
    case 'lasagna':
      variants.add('lasaÃ±a');
      variants.add('lasana');
      break;
    default:
      break;
  }

  return uniqueNonEmpty([...variants]);
}

function collectSignalValue(values: string[], patterns: RegExp[]): string | null {
  for (const value of values) {
    if (patterns.some((pattern) => pattern.test(value))) {
      return value;
    }
  }

  return null;
}

function collectMatchedSignalValue(values: string[], patterns: RegExp[]): string | null {
  for (const value of values) {
    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (match) {
        return match[0];
      }
    }
  }

  return null;
}

function collectBestMatchedSignalValue(values: string[], patterns: RegExp[]): string | null {
  let bestMatch: { fragment: string; surroundingNoise: number; valueLength: number; index: number } | null = null;

  for (const [index, value] of values.entries()) {
    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (!match) {
        continue;
      }

      const fragment = match[0];
      const candidate = {
        fragment,
        surroundingNoise: Math.max(0, value.length - fragment.length),
        valueLength: value.length,
        index,
      };

      if (
        !bestMatch
        || candidate.surroundingNoise < bestMatch.surroundingNoise
        || (
          candidate.surroundingNoise === bestMatch.surroundingNoise
          && candidate.valueLength < bestMatch.valueLength
        )
        || (
          candidate.surroundingNoise === bestMatch.surroundingNoise
          && candidate.valueLength === bestMatch.valueLength
          && candidate.index < bestMatch.index
        )
      ) {
        bestMatch = candidate;
      }
    }
  }

  return bestMatch?.fragment ?? null;
}

/**
 * Like collectSignalValue but returns the matched fragment instead of the full
 * value. Useful when `values` may contain long sentences (e.g. the goal text)
 * where returning the whole string would produce an unmatchable signal.
 */
function extractMatchedFragment(values: string[], pattern: RegExp): string | null {
  for (const value of values) {
    const match = value.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return null;
}

function usesCookingDomainSignals(domainCard?: DomainKnowledgeCard | null): boolean {
  const normalized = normalizeSignalText(domainCard?.domainLabel ?? '');
  return normalized === 'cocina-italiana' || normalized.startsWith('cocina ');
}

function extractCookingSignals(
  goalText: string,
  answers: Record<string, string>,
  domainCard?: DomainKnowledgeCard | null,
): CookingSignals {
  if (!usesCookingDomainSignals(domainCard)) {
    return {
      level: null,
      subtopic: null,
      learningMethod: null,
      horizon: null,
      references: [],
    };
  }

  const answerValues = uniqueNonEmpty(Object.values(answers));
  const allValues = uniqueNonEmpty([...answerValues, goalText]);
  const lowerGoal = goalText.toLowerCase();

  // For short answer values, collectSignalValue works fine.
  // For goalText (a full sentence), extractMatchedFragment avoids returning the
  // entire sentence as the "signal".
  const subtopicPattern = /\b(pasta|pastas|salsa|salsas|risotto|pizza|gnocchi|lasagna|lasa[ñn]a|focaccia|pesto|ravioli)\b/i;
  const subtopic = collectMatchedSignalValue(answerValues, [subtopicPattern, COOKING_SUBTOPIC_PATTERN])
    ?? extractMatchedFragment([goalText], subtopicPattern)
    ?? (/\b(pasta|pastas)\b/i.test(lowerGoal)
      ? 'pastas'
      : /\b(salsa|salsas)\b/i.test(lowerGoal)
        ? 'salsas'
        : /\b(pizzas?)\b/i.test(lowerGoal)
          ? 'pizza'
          : /\bitalian[oa]s?\b/i.test(lowerGoal)
            ? 'cocina italiana'
            : null);
  const level = collectMatchedSignalValue(answerValues, [
    /\b(principiante|basico|b[aá]sico|intermedio|avanzado|experto|novato)\b/i,
  ]) ?? extractMatchedFragment([goalText], /\b(principiante|basico|b[aá]sico|intermedio|avanzado|experto|novato)\b/i);
  const learningMethod = collectMatchedSignalValue(answerValues, [
    /\b(libro|libros|recetario|recetarios|curso|clase|tutor|tutora|autodidacta|youtube|video|videos|canal|apunte|apuntes|manual)\b/i,
  ]) ?? extractMatchedFragment([goalText], /\b(libro|libros|recetario|recetarios|curso|clase|tutor|tutora|autodidacta|youtube|video|videos|canal|apunte|apuntes|manual)\b/i);
  const horizon = collectMatchedSignalValue(answerValues, [
    /\b\d+\s*(a[ñn]o|a[ñn]os|ano|anos|mes|meses|semana|semanas|year|years|month|months|week|weeks)\b/i,
  ]) ?? extractMatchedFragment([goalText], /\b\d+\s*(a[ñn]o|a[ñn]os|ano|anos|mes|meses|semana|semanas|year|years|month|months|week|weeks)\b/i);
  const references = uniqueNonEmpty(allValues.filter((value) => /\b(libro|libros|recetario|recetarios)\b/i.test(value)));

  return {
    level,
    subtopic,
    learningMethod,
    horizon,
    references,
  };
}

function humanizeLabel(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

const GENERIC_ANCHOR_STOPWORDS = new Set([
  'actual',
  'actuales',
  'actualmente',
  'alguna',
  'alguno',
  'algun',
  'ano',
  'anos',
  'aprovechar',
  'aproximadamente',
  'cada',
  'como',
  'con',
  'cuenta',
  'de',
  'del',
  'digamos',
  'el',
  'en',
  'es',
  'esta',
  'este',
  'flujo',
  'fuente',
  'fuentes',
  'generar',
  'habilidad',
  'habilidades',
  'hacer',
  'ingreso',
  'ingresos',
  'la',
  'las',
  'lograr',
  'los',
  'me',
  'mes',
  'meses',
  'meta',
  'mi',
  'mis',
  'no',
  'obtener',
  'objetivo',
  'para',
  'pero',
  'plata',
  'por',
  'prefiere',
  'prefieres',
  'preferir',
  'priorizar',
  'puede',
  'puedes',
  'que',
  'quiero',
  'recurso',
  'recursos',
  'se',
  'semana',
  'semanas',
  'ser',
  'soy',
  'su',
  'tengo',
  'tener',
  'tipo',
  'tu',
  'un',
  'una',
  'usd',
  'y',
  'ya',
]);

const GENERIC_TECH_TOKENS = new Set([
  'aws',
  'backend',
  'css',
  'frontend',
  'gcp',
  'github',
  'html',
  'java',
  'javascript',
  'linkedin',
  'nextjs',
  'node',
  'nodejs',
  'php',
  'portfolio',
  'portafolio',
  'python',
  'react',
  'remote',
  'remoto',
  'sql',
  'typescript',
]);

function canonicalizeAnchorToken(token: string): string {
  const normalized = normalizeSignalText(token);

  switch (normalized) {
    case '3k':
      return '3000';
    case 'dolar':
    case 'dolares':
    case 'us':
    case 'us$':
      return 'usd';
    case 'pizzas':
      return 'pizza';
    case 'pastas':
      return 'pasta';
    case 'clientes':
      return 'cliente';
    case 'entrevistas':
      return 'entrevista';
    case 'nodejs':
      return 'node';
    case 'reactjs':
      return 'react';
    default:
      return normalized;
  }
}

function tokenizeAnchorText(value: string): string[] {
  return uniqueNonEmpty(
    normalizeSignalText(value)
      .match(/[a-z0-9.+#-]+/g) ?? [],
  )
    .map((token) => canonicalizeAnchorToken(token))
    .filter((token) => token.length >= 2)
    .filter((token) => !GENERIC_ANCHOR_STOPWORDS.has(token));
}

function extractGenericPlanAnchors(goalText: string, answers: Record<string, string>): GenericPlanAnchors {
  const answerValues = uniqueNonEmpty(Object.values(answers));
  const metric = extractMatchedFragment([goalText], /\b\d+(?:[.,]\d+)?k?\s*(?:usd|us\$|dolar(?:es)?|kg|kilos?|lb|lbs|cm|m|%|por ciento|paginas?|libros?|veces?|clientes?|entrevistas?)\b/i)
    ?? collectBestMatchedSignalValue(answerValues, [
    /\b\d+(?:[.,]\d+)?k?\s*(?:usd|us\$|dolar(?:es)?|kg|kilos?|lb|lbs|cm|m|%|por ciento|paginas?|libros?|veces?|clientes?|entrevistas?)\b/i,
  ]);
  const timeframe = extractMatchedFragment([goalText], /\b\d+\s*(?:a[ñn]o|a[ñn]os|ano|anos|mes|meses|semana|semanas|year|years|month|months|week|weeks)\b/i)
    ?? collectBestMatchedSignalValue(answerValues, [
    /\b\d+\s*(?:a[ñn]o|a[ñn]os|ano|anos|mes|meses|semana|semanas|year|years|month|months|week|weeks)\b/i,
  ]);
  const metricTokens = new Set(metric ? tokenizeAnchorText(metric) : []);
  const timeframeTokens = new Set(timeframe ? tokenizeAnchorText(timeframe) : []);
  const goalTokens = new Set(tokenizeAnchorText(goalText));
  const tokenScores = new Map<string, number>();

  for (const answerValue of answerValues) {
    const tokens = tokenizeAnchorText(answerValue);
    const isShortAnswer = tokens.length > 0 && tokens.length <= 4;

    for (const token of tokens) {
      if (metricTokens.has(token) || timeframeTokens.has(token) || /^\d+(?:\.\d+)?$/.test(token)) {
        continue;
      }

      let score = isShortAnswer ? 3 : 1;
      if (goalTokens.has(token)) score += 2;
      if (GENERIC_TECH_TOKENS.has(token)) score += 3;
      if (token.length >= 6) score += 2;
      else if (token.length >= 4) score += 1;

      tokenScores.set(token, (tokenScores.get(token) ?? 0) + score);
    }
  }

  const rankedTokens = [...tokenScores.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length || left[0].localeCompare(right[0]))
    .map(([token]) => token);
  const fallbackGoalTokens = [...goalTokens].filter((token) =>
    !metricTokens.has(token)
    && !timeframeTokens.has(token)
    && !/^\d+(?:\.\d+)?$/.test(token),
  );
  const baseTokens = rankedTokens.length > 0 ? rankedTokens : fallbackGoalTokens;

  return {
    metric,
    timeframe,
    anchorTokens: uniqueNonEmpty(baseTokens).slice(0, 6),
  };
}

function canonicalizeNumericMetricToken(token: string): string | null {
  const normalized = normalizeSignalText(token).replace(/\s+/g, '');
  if (!normalized) {
    return null;
  }

  if (/^\d+(?:[.,]\d+)?k$/.test(normalized)) {
    const scaled = Number(normalized.slice(0, -1).replace(',', '.'));
    return Number.isFinite(scaled) ? String(Math.round(scaled * 1000)) : null;
  }

  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(normalized)) {
    return normalized.replace(/[.,]/g, '');
  }

  if (/^\d+$/.test(normalized)) {
    return normalized;
  }

  if (/^\d+[.,]\d+$/.test(normalized)) {
    const decimal = normalized.replace(',', '.');
    const parsed = Number(decimal);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return decimal
      .replace(/(\.\d*?[1-9])0+$/, '$1')
      .replace(/\.0+$/, '');
  }

  return null;
}

function collectCanonicalNumericMetricTokens(text: string): Set<string> {
  const matches = normalizeSignalText(text).match(/\b\d{1,3}(?:[.,\s]\d{3})+\b|\b\d+(?:[.,]\d+)?\s*k\b|\b\d+(?:[.,]\d+)?\b/gi) ?? [];
  return new Set(
    matches
      .map((match) => canonicalizeNumericMetricToken(match))
      .filter((value): value is string => Boolean(value)),
  );
}

function hasGenericMetricAlignment(text: string, metric: string | null): boolean {
  if (!metric) {
    return true;
  }

  const metricTokens = tokenizeAnchorText(metric);
  if (metricTokens.length === 0) {
    return true;
  }

  const normalizedText = normalizeSignalText(text);
  const numericTokens = metricTokens.filter((token) => /\d/.test(token));
  const descriptorTokens = metricTokens.filter((token) => !/\d/.test(token));
  const normalizedNumericTokens = collectCanonicalNumericMetricTokens(text);

  const hasNumbers = numericTokens.length === 0 || numericTokens.some((token) =>
    normalizedNumericTokens.has(token) || normalizedText.includes(token));
  const hasDescriptors = descriptorTokens.length === 0 || descriptorTokens.some((token) => normalizedText.includes(token));

  return hasNumbers && hasDescriptors;
}

function extractClarificationSignals(answers: Record<string, string>) {
  const values = uniqueNonEmpty(Object.values(answers));
  const lower = values.map((value) => value.toLowerCase());

  const mastery = values.find((_, index) => /\b(principiante|basico|básico|intermedio|avanzado|profesional|experto)\b/.test(lower[index])) ?? null;
  const deadline = values.find((_, index) => /\b(fin de ano|fin de año|antes de|mes|meses|semana|semanas|ano|año|year|years|month|months|week|weeks)\b/.test(lower[index])) ?? null;
  const learningMode = values.find((_, index) => /\b(curso|clase|mentor|tutor|autodidact|por mi cuenta|combinacion)\b/.test(lower[index])) ?? null;
  const constraints = values.find((_, index) =>
    !/\b(no|ninguna|ninguno|sin restricciones?)\b/.test(lower[index])
    && /\b(restric|presupuesto|veg|veget|gluten|lact|alerg)\b/.test(lower[index]),
  ) ?? null;

  const reserved = new Set([mastery, deadline, learningMode, constraints].filter(Boolean));
  const priority = values.find((value) => {
    if (reserved.has(value)) return false;
    return !/^\s*(no|ninguna|ninguno|sin restricciones?)\s*$/i.test(value);
  }) ?? null;

  const subtopic = values.find((_, index) =>
    /\b(pasta|pastas|salsa|salsas|pizza|pizzas|cocina|cocinar|receta|recetas|italian[oa]s?)\b/.test(lower[index]),
  ) ?? null;

  return { mastery, deadline, learningMode, constraints, priority, subtopic, level: mastery };
}

function extractHealthSignals(goalText: string, answers: Record<string, string>) {
  const values = uniqueNonEmpty(Object.values(answers));
  const lowerGoal = goalText.toLowerCase();
  const lowerValues = values.map((value) => value.toLowerCase());

  const weight = values.find((_, index) =>
    /\b(\d+(?:[.,]\d+)?)\s?(kg|kilos?|lb|lbs|pounds?)\b/.test(lowerValues[index])
    || /\b(peso|peso actual|peso objetivo|kg|kilos?)\b/.test(lowerValues[index]),
  ) ?? null;
  const height = values.find((_, index) =>
    /\b(\d+(?:[.,]\d+)?)\s?(cm|m)\b/.test(lowerValues[index])
    || /\b(altura|estatura)\b/.test(lowerValues[index]),
  ) ?? null;
  const medicalContext = values.find((_, index) =>
    /\b(medic|doctor|clinica|lesion|dolor|hipertens|diabet|colesterol|corazon|cardio|cirugia|operacion|rodilla|espalda|medicacion)\b/.test(lowerValues[index]),
  ) ?? null;
  const aggressive = values.find((_, index) =>
    /\b(rapido|urgente|drastic|extrem|en un mes|en 30 dias|sin comer|ayuno extremo)\b/.test(lowerValues[index]),
  ) ?? null;
  const support = values.find((_, index) =>
    /\b(apoyo|acompa[ñn]amiento|supervision|supervisi[oó]n|nutri|medic|doctor|entrenador|coach|familia|amigo)\b/.test(lowerValues[index]),
  ) ?? null;

  const preferredActivities = uniqueNonEmpty([
    ...values.flatMap((value) => {
      const lower = value.toLowerCase();
      const activities: string[] = [];

      if (/\b(cicl|bici|bike|cycling)\b/.test(lower)) activities.push('Ciclismo suave');
      if (/\b(natac|swim|pileta|agua)\b/.test(lower)) activities.push('Natacion o aquagym');
      if (/\b(camina|walk|pasos?)\b/.test(lower)) activities.push('Caminata constante');
      if (/\b(fuerza|pesas|gym|muscul)\b/.test(lower)) activities.push('Fuerza basica y movilidad');
      if (/\b(movilidad|estir|flexibil)\b/.test(lower)) activities.push('Movilidad y recuperacion');

      return activities;
    }),
    /\b(cicl|bici|bike|cycling)\b/.test(lowerGoal) ? 'Ciclismo suave' : '',
    /\b(natac|swim|pileta|agua)\b/.test(lowerGoal) ? 'Natacion o aquagym' : '',
    /\b(camina|walk|pasos?)\b/.test(lowerGoal) ? 'Caminata constante' : '',
    /\b(fuerza|pesas|gym|muscul)\b/.test(lowerGoal) ? 'Fuerza basica y movilidad' : '',
  ]);

  const highRisk = Boolean(
    medicalContext
    || aggressive
    || /\b(bajar de peso|perder peso|adelgaz|obesidad|sobrepeso|kg\b|kilos?|imc|bmi|cintura|medidas)\b/.test(lowerGoal),
  );
  const supervision = highRisk
    ? (support ?? 'Supervision profesional recomendada')
    : support;

  return {
    weight,
    height,
    medicalContext,
    aggressive,
    preferredActivities,
    support,
    supervision,
    highRisk,
  };
}

function buildTypedClarificationAnswers(
  goalText: string,
  clarificationAnswers: Record<string, string>,
  domainCard?: DomainKnowledgeCard,
): Record<string, string> {
  const cooking = extractCookingSignals(goalText, clarificationAnswers, domainCard);
  const health = extractHealthSignals(goalText, clarificationAnswers);
  const general = extractGenericPlanAnchors(goalText, clarificationAnswers);
  const typedAnswers: Record<string, string> = {};

  if (cooking.level) typedAnswers['senal tipada - cocina: nivel'] = cooking.level;
  if (cooking.subtopic) typedAnswers['senal tipada - cocina: subtema'] = cooking.subtopic;
  if (cooking.learningMethod) typedAnswers['senal tipada - cocina: metodo'] = cooking.learningMethod;
  if (cooking.horizon) typedAnswers['senal tipada - cocina: horizonte'] = cooking.horizon;
  if (cooking.references.length > 0) typedAnswers['senal tipada - cocina: referencias'] = cooking.references.join(', ');

  if (health.weight) typedAnswers['senal tipada - salud: peso'] = health.weight;
  if (health.height) typedAnswers['senal tipada - salud: altura'] = health.height;
  if (health.medicalContext) typedAnswers['senal tipada - salud: contexto medico'] = health.medicalContext;
  if (health.support) typedAnswers['senal tipada - salud: apoyo'] = health.support;
  if (health.supervision) typedAnswers['senal tipada - salud: supervision'] = health.supervision;
  if (health.preferredActivities.length > 0) {
    typedAnswers['senal tipada - salud: actividades viables'] = health.preferredActivities.join(', ');
  }

  if (general.metric) typedAnswers['senal tipada - general: metrica'] = general.metric;
  if (general.timeframe) typedAnswers['senal tipada - general: plazo'] = general.timeframe;
  if (general.anchorTokens.length > 0) typedAnswers['senal tipada - general: anclas'] = general.anchorTokens.join(', ');

  if (domainCard?.domainLabel) {
    typedAnswers['senal tipada - dominio'] = domainCard.domainLabel;
  }

  const summaryParts = [
    cooking.level ? `cocina.nivel=${cooking.level}` : null,
    cooking.subtopic ? `cocina.subtema=${cooking.subtopic}` : null,
    cooking.learningMethod ? `cocina.metodo=${cooking.learningMethod}` : null,
    cooking.horizon ? `cocina.horizonte=${cooking.horizon}` : null,
    health.weight ? `salud.peso=${health.weight}` : null,
    health.height ? `salud.altura=${health.height}` : null,
    health.highRisk ? 'salud.alto_riesgo=true' : null,
    health.supervision ? `salud.supervision=${health.supervision}` : null,
    general.metric ? `general.metrica=${general.metric}` : null,
    general.timeframe ? `general.plazo=${general.timeframe}` : null,
    general.anchorTokens.length > 0 ? `general.anclas=${general.anchorTokens.join(',')}` : null,
  ].filter((part): part is string => Boolean(part));

  if (summaryParts.length > 0) {
    typedAnswers['senal tipada - resumen'] = summaryParts.join(' | ');
  }

  return typedAnswers;
}

function collectTextFields(output: StrategyOutput): string[] {
  return [
    ...output.phases.map((phase) => `${phase.name} ${phase.focus_esAR}`),
    ...output.milestones,
  ];
}

const STRUCTURAL_PHASE_TITLE_PATTERN = /^(fase\s*\d+|base|fundamentos?|intro|introduccion|practica guiada|consolidacion|avance|nivel\s*\d+)(?:\s*[-:.]?\s*(?:fase\s*\d+|base|fundamentos?|intro|introduccion|practica guiada|consolidacion|avance|nivel\s*\d+|\S{1,15})\s*)?$/;
const STRUCTURAL_GUIDED_PRACTICE_PATTERN = /^practica guiada en (principiante|basico|intermedio|avanzado|profesional|experto)\s*$/;

/**
 * @internal
 */
export function isStructuralPhaseTitle(value: string): boolean {
  const normalized = normalizeSignalText(value);
  const words = normalized.split(/\s+/).filter(Boolean);

  if (STRUCTURAL_GUIDED_PRACTICE_PATTERN.test(normalized)) {
    return true;
  }

  if (words.length >= 4) {
    return false;
  }

  return STRUCTURAL_PHASE_TITLE_PATTERN.test(normalized);
}

function buildHorizonVariants(horizon: string): string[] {
  const variants = new Set<string>([horizon]);
  const numberWords: Record<number, string[]> = {
    1: ['un', 'uno', 'una', 'one', 'a'],
    2: ['dos', 'two'],
    3: ['tres', 'three'],
    4: ['cuatro', 'four'],
    5: ['cinco', 'five'],
    6: ['seis', 'six'],
    12: ['doce', 'twelve'],
  };
  const match = normalizeSignalText(horizon).match(/(\d+)\s*(año|años|ano|anos|year|years|mes|meses|month|months|semana|semanas|week|weeks)\b/);

  if (!match) {
    return [...variants];
  }

  const amount = Number(match[1]);
  const rawUnit = match[2];
  const isMonthUnit = /\b(mes|meses|month|months)\b/.test(rawUnit);
  const isYearUnit = /\b(año|años|ano|anos|year|years)\b/.test(rawUnit);
  const isWeekUnit = /\b(semana|semanas|week|weeks)\b/.test(rawUnit);

  if (isMonthUnit) {
    variants.add(`${amount} mes`);
    variants.add(`${amount} meses`);
    variants.add(`${amount} month`);
    variants.add(`${amount} months`);
  }

  if (isYearUnit) {
    variants.add(`${amount} ano`);
    variants.add(`${amount} anos`);
    variants.add(`${amount} año`);
    variants.add(`${amount} años`);
    variants.add(`${amount} year`);
    variants.add(`${amount} years`);
  }

  if (isWeekUnit) {
    variants.add(`${amount} semana`);
    variants.add(`${amount} semanas`);
    variants.add(`${amount} week`);
    variants.add(`${amount} weeks`);
  }

  for (const word of numberWords[amount] ?? []) {
    if (isMonthUnit) {
      variants.add(`${word} mes`);
      variants.add(`${word} meses`);
      variants.add(`${word} month`);
      variants.add(`${word} months`);
    }

    if (isYearUnit) {
      variants.add(`${word} ano`);
      variants.add(`${word} anos`);
      variants.add(`${word} año`);
      variants.add(`${word} años`);
      variants.add(`${word} year`);
      variants.add(`${word} years`);
    }

    if (isWeekUnit) {
      variants.add(`${word} semana`);
      variants.add(`${word} semanas`);
      variants.add(`${word} week`);
      variants.add(`${word} weeks`);
    }
  }

  if (isMonthUnit && amount === 6) {
    variants.add('medio ano');
    variants.add('medio año');
    variants.add('half year');
  }

  if ((isMonthUnit && amount === 12) || (isYearUnit && amount === 1)) {
    variants.add('un ano');
    variants.add('un año');
    variants.add('one year');
    variants.add('a year');
  }

  return [...variants];
}

function isDurationCloseToTarget(totalPlanWeeks: number, targetWeeks: number | null): boolean {
  if (!targetWeeks) {
    return false;
  }

  return totalPlanWeeks >= Math.max(1, targetWeeks * 0.5)
    && totalPlanWeeks <= targetWeeks * 1.5;
}

function validateStrategyOutput(
  output: StrategyOutput,
  input: StrategyInput,
  typedSignals: TypedClarificationSignals,
): StrategyValidationResult {
  if (output.phases.length === 0 || output.milestones.length === 0) {
    return { valid: false, failedCheck: 'output.required_content' };
  }

  if (output.phases.some((phase) => isStructuralPhaseTitle(phase.name))) {
    return { valid: false, failedCheck: 'output.structural_phase_title' };
  }

  const textFields = collectTextFields(output).join(' ');
  const totalPlanWeeks = output.totalSpanWeeks
    ?? output.phases.reduce((sum, phase) => sum + Math.max(1, phase.durationWeeks ?? 4), 0);

  if (typedSignals.cooking.subtopic && !includesAny(textFields, buildCookingSubtopicVariants(typedSignals.cooking.subtopic))) {
    return { valid: false, failedCheck: 'cooking.subtopic' };
  }

  if (
    shouldPreserveItalianCookingBreadth(input.goalText, typedSignals.cooking.subtopic)
    && !includesAny(textFields, buildCookingSubtopicVariants('pasta'))
  ) {
    return { valid: false, failedCheck: 'cooking.domain_scope' };
  }

  if (typedSignals.cooking.learningMethod && !includesAny(textFields, [typedSignals.cooking.learningMethod])) {
    return { valid: false, failedCheck: 'cooking.learning_method' };
  }

  if (typedSignals.cooking.horizon) {
    const textMentionsHorizon = includesAny(textFields, buildHorizonVariants(typedSignals.cooking.horizon));
    const targetHorizonWeeks = extractTargetHorizonWeeks(input.goalText, typedSignals.cooking.horizon);
    const durationMatchesHorizon = isDurationCloseToTarget(totalPlanWeeks, targetHorizonWeeks);

    if (targetHorizonWeeks && !durationMatchesHorizon) {
      return { valid: false, failedCheck: 'cooking.horizon' };
    }

    if (!textMentionsHorizon && targetHorizonWeeks === null) {
      return { valid: false, failedCheck: 'cooking.horizon' };
    }
  }

  if (typedSignals.health.highRisk) {
    if (!includesAny(textFields, ['supervision', 'supervision profesional', 'seguimiento', 'medico', 'nutricionista'])) {
      return { valid: false, failedCheck: 'health.supervision' };
    }
  }

  if (typedSignals.health.preferredActivities.length > 0) {
    const hasActivity = typedSignals.health.preferredActivities.some((activity) => includesAny(textFields, [activity]));
    if (!hasActivity) {
      return { valid: false, failedCheck: 'health.preferred_activities' };
    }
  }

  if (typedSignals.general.metric && !hasGenericMetricAlignment(textFields, typedSignals.general.metric)) {
    return { valid: false, failedCheck: 'intake.metric' };
  }

  if (typedSignals.general.timeframe) {
    const textMentionsHorizon = includesAny(textFields, buildHorizonVariants(typedSignals.general.timeframe));
    const targetHorizonWeeks = extractTargetHorizonWeeks(input.goalText, typedSignals.general.timeframe);
    const durationMatchesHorizon = isDurationCloseToTarget(totalPlanWeeks, targetHorizonWeeks);

    if (targetHorizonWeeks && !durationMatchesHorizon) {
      return { valid: false, failedCheck: 'intake.timeframe' };
    }

    if (!textMentionsHorizon && targetHorizonWeeks === null) {
      return { valid: false, failedCheck: 'intake.timeframe' };
    }
  }

  if (typedSignals.general.anchorTokens.length >= 3) {
    const coveredAnchors = typedSignals.general.anchorTokens.filter((token) => includesAny(textFields, [token]));
    const minimumCoverage = Math.min(3, Math.max(2, Math.ceil(typedSignals.general.anchorTokens.length * 0.4)));

    if (coveredAnchors.length < minimumCoverage) {
      return { valid: false, failedCheck: 'intake.anchor_coverage' };
    }
  }

  if (input.classification.goalType === 'SKILL_ACQUISITION' && typedSignals.cooking.level) {
    if (!includesAny(textFields, [typedSignals.cooking.level])) {
      return { valid: false, failedCheck: 'cooking.level' };
    }
  }

  return VALID_STRATEGY_OUTPUT;
}

function isHealthWeightGoal(input: StrategyInput, domainCard?: DomainKnowledgeCard): boolean {
  const lowerGoal = `${input.goalText} ${domainCard?.domainLabel ?? ''}`.toLowerCase();
  return (
    input.classification.risk === 'HIGH_HEALTH'
    || /\b(bajar de peso|perder peso|adelgaz|peso|kg\b|kilos?|obesidad|sobrepeso|cintura|medidas|imc|bmi|fitness|condicion fisica|salud)\b/.test(lowerGoal)
  );
}

function buildTaskLabels(domainCard?: DomainKnowledgeCard): string[] {
  return uniqueNonEmpty((domainCard?.tasks ?? []).map((task) => humanizeLabel(task.label)));
}

function buildDomainLabel(input: StrategyInput, domainCard?: DomainKnowledgeCard): string {
  if (domainCard?.domainLabel) {
    return humanizeLabel(domainCard.domainLabel);
  }

  const lowerGoal = input.goalText.toLowerCase();
  if (/\bcocin/.test(lowerGoal) && /\bitalian[oa]s?\b/.test(lowerGoal)) {
    return 'cocina italiana';
  }

  if (/\b(bajar de peso|perder peso|adelgaz|peso|kg\b|kilos?|obesidad|sobrepeso|cintura|medidas|imc|bmi|fitness|condicion fisica|salud)\b/.test(lowerGoal)) {
    return 'salud y peso';
  }

  const raw = input.goalText
    .replace(/^quiero\s+/i, '')
    .replace(/^me gustaria\s+/i, '')
    .replace(/^aprender a\s+/i, '')
    .replace(/^empezar a\s+/i, '')
    .trim();
  return raw.length > 0 ? raw : 'este objetivo';
}

function resolveDurations(mastery: string | null): number[] {
  const normalized = mastery?.toLowerCase() ?? '';
  if (normalized.includes('avanz')) return [3, 4, 5];
  if (normalized.includes('basic') || normalized.includes('basico') || normalized.includes('básico') || normalized.includes('princip')) return [5, 4, 3];
  return [4, 4, 4];
}

function extractTargetHorizonWeeks(goalText: string, deadline: string | null): number | null {
  const text = `${goalText} ${deadline ?? ''}`.toLowerCase();

  const yearMatch = text.match(/(\d+)\s*(año|años|ano|anos|year|years)\b/);
  if (yearMatch) {
    return Math.max(1, Math.min(Number(yearMatch[1]) * 52, 104));
  }

  const monthMatch = text.match(/(\d+)\s*(mes|meses|month|months)\b/);
  if (monthMatch) {
    return Math.max(1, Math.min(Number(monthMatch[1]) * 4, 104));
  }

  const weekMatch = text.match(/(\d+)\s*(semana|semanas|week|weeks)\b/);
  if (weekMatch) {
    return Math.max(1, Math.min(Number(weekMatch[1]), 104));
  }

  return null;
}

function stretchDurationsToTarget(baseDurations: number[], targetWeeks: number | null): number[] {
  const minimumDuration = 1;
  const sanitizedDurations = baseDurations.map((duration) => Math.max(minimumDuration, Math.round(duration)));
  const currentTotal = sanitizedDurations.reduce((total, duration) => total + duration, 0);

  if (!targetWeeks) {
    return sanitizedDurations;
  }

  if (sanitizedDurations.length === 0) {
    return [];
  }

  const desiredTotal = Math.max(sanitizedDurations.length, targetWeeks);
  if (desiredTotal === currentTotal) {
    return sanitizedDurations;
  }

  const weightedDurations = sanitizedDurations.map((duration, index) => {
    const raw = desiredTotal * (duration / currentTotal);
    return {
      index,
      baseDuration: duration,
      raw,
      remainder: raw - Math.floor(raw),
    };
  });

  const stretched = weightedDurations.map(({ raw }) =>
    Math.max(minimumDuration, Math.floor(raw)),
  );

  let assignedWeeks = stretched.reduce((total, duration) => total + duration, 0);
  const byLargestRemainder = [...weightedDurations].sort((left, right) =>
    right.remainder - left.remainder
    || right.baseDuration - left.baseDuration
    || left.index - right.index,
  );
  const byLargestAllocation = [...weightedDurations].sort((left, right) =>
    (stretched[right.index] ?? minimumDuration) - (stretched[left.index] ?? minimumDuration)
    || left.remainder - right.remainder
    || right.baseDuration - left.baseDuration
    || right.index - left.index,
  );

  let cursor = 0;
  while (assignedWeeks < desiredTotal) {
    const current = byLargestRemainder[cursor % byLargestRemainder.length];
    if (!current) {
      break;
    }
    stretched[current.index] = (stretched[current.index] ?? minimumDuration) + 1;
    assignedWeeks += 1;
    cursor += 1;
  }

  cursor = 0;
  while (assignedWeeks > desiredTotal) {
    const current = byLargestAllocation[cursor % byLargestAllocation.length];
    if (!current) {
      break;
    }

    const currentDuration = stretched[current.index] ?? minimumDuration;
    if (currentDuration > minimumDuration) {
      stretched[current.index] = currentDuration - 1;
      assignedWeeks -= 1;
    }

    cursor += 1;
  }

  return stretched;
}

function inferFocusLabel(goalText: string, domainLabel: string): string {
  const lowerGoal = goalText.toLowerCase();
  if (/\bcocin/.test(lowerGoal) && /\bitalian[oa]s?\b/.test(lowerGoal)) {
    if (/\bpostre/.test(lowerGoal)) return 'postres italianos clasicos';
    if (/\bpasta/.test(lowerGoal)) return 'pastas italianas';
    return 'platos italianos clasicos';
  }

  return domainLabel;
}

function isBroadItalianCookingGoal(goalText: string): boolean {
  const lowerGoal = normalizeSignalText(goalText);
  return (
    /\bitalian[oa]s?\b/.test(lowerGoal)
    && /\b(cocina|cocinar|plato|platos|receta|recetas|gastronom)\b/.test(lowerGoal)
    && !/\b(pasta|pastas|pizza|pizzas|risotto|gnocchi|lasagna|lasa[ñn]a|ravioli|postre|postres|tiramisu|cannoli)\b/.test(lowerGoal)
  );
}

function shouldPreserveItalianCookingBreadth(goalText: string, rawTopic: string | null): boolean {
  const normalizedTopic = rawTopic ? canonicalizeCookingSubtopicToken(rawTopic) : '';
  return isBroadItalianCookingGoal(goalText)
    && normalizedTopic.length > 0
    && normalizedTopic !== 'pasta'
    && !normalizedTopic.includes('cocina italiana');
}

function normalizeCookingMethodPreference(value: string | null): 'videos' | 'libros' | 'clases' | 'mentor' | 'autodidacta' | null {
  const normalized = normalizeSignalText(value ?? '');
  if (!normalized) {
    return null;
  }

  if (/\b(video|videos|youtube|tutorial|tutoriales)\b/.test(normalized)) {
    return 'videos';
  }

  if (/\b(libro|libros|recetario|recetarios|manual|manuales)\b/.test(normalized)) {
    return 'libros';
  }

  if (/\b(clase|clases|curso|cursos)\b/.test(normalized)) {
    return 'clases';
  }

  if (/\b(mentor|mentoria|tutor|tutora)\b/.test(normalized)) {
    return 'mentor';
  }

  if (/\b(autodidact|por mi cuenta|autoestudio)\b/.test(normalized)) {
    return 'autodidacta';
  }

  return null;
}

function joinHumanList(values: string[]): string {
  const filtered = uniqueNonEmpty(values);
  if (filtered.length === 0) {
    return '';
  }

  if (filtered.length === 1) {
    return filtered[0] ?? '';
  }

  if (filtered.length === 2) {
    return `${filtered[0]} y ${filtered[1]}`;
  }

  return `${filtered.slice(0, -1).join(', ')} y ${filtered[filtered.length - 1]}`;
}

function formatCookingFocusTopic(rawTopic: string | null, isItalianCooking: boolean, fallbackLabel: string): string {
  const normalized = rawTopic ? canonicalizeCookingSubtopicToken(rawTopic) : '';
  if (!normalized) {
    return fallbackLabel;
  }

  switch (normalized) {
    case 'pasta':
      return isItalianCooking ? 'pastas italianas' : 'pastas';
    case 'pizza':
      return isItalianCooking ? 'pizza italiana' : 'pizza';
    case 'salsa':
      return isItalianCooking ? 'salsas italianas' : 'salsas';
    case 'risotto':
      return isItalianCooking ? 'risotto italiano' : 'risotto';
    case 'gnocchi':
      return isItalianCooking ? 'gnocchi italianos' : 'gnocchi';
    case 'lasagna':
      return isItalianCooking ? 'lasagna italiana' : 'lasagna';
    case 'ravioli':
      return isItalianCooking ? 'ravioli italianos' : 'ravioli';
    default:
      return normalized.includes('cocina italiana') ? 'cocina italiana' : rawTopic?.trim() || fallbackLabel;
  }
}

function buildCookingReferenceAnchors(rawTopic: string | null): [string, string, string] {
  const normalized = rawTopic ? canonicalizeCookingSubtopicToken(rawTopic) : '';

  switch (normalized) {
    case 'pasta':
      return ['pasta al pomodoro', 'cacio e pepe', 'aglio e olio'];
    case 'pizza':
      return ['masa napolitana', 'pizza marinara', 'pizza margherita'];
    case 'salsa':
      return ['salsa pomodoro', 'pesto alla genovese', 'emulsion cacio e pepe'];
    case 'risotto':
      return ['risotto alla milanese', 'risotto ai funghi', 'mantecatura final'];
    case 'gnocchi':
      return ['gnocchi de papa', 'gnocchi al pesto', 'gnocchi con pomodoro'];
    case 'lasagna':
      return ['lasagna clasica', 'bechamel', 'ragu sencillo'];
    case 'ravioli':
      return ['ravioli de ricota', 'masa fresca', 'manteca y salvia'];
    default:
      return ['mise en place italiana', 'una receta eje del repertorio', 'un menu corto italiano'];
  }
}

function buildItalianCookingFoundationAnchors(rawTopic: string | null): [string, string, string] {
  const normalized = rawTopic ? canonicalizeCookingSubtopicToken(rawTopic) : '';

  switch (normalized) {
    case 'pizza':
      return ['pizza napolitana', 'pasta al pomodoro', 'carbonara tradicional'];
    case 'salsa':
      return ['salsa pomodoro', 'pasta al pomodoro', 'cacio e pepe'];
    case 'risotto':
      return ['risotto alla milanese', 'pasta al pomodoro', 'cacio e pepe'];
    case 'gnocchi':
      return ['gnocchi de papa', 'pasta al pomodoro', 'cacio e pepe'];
    case 'lasagna':
      return ['lasagna clasica', 'pasta al pomodoro', 'cacio e pepe'];
    case 'ravioli':
      return ['ravioli de ricota', 'pasta al pomodoro', 'cacio e pepe'];
    default:
      return ['pasta al pomodoro', 'cacio e pepe', 'aglio e olio'];
  }
}

function buildCookingReferenceLead(
  methodPreference: ReturnType<typeof normalizeCookingMethodPreference>,
  anchors: string[],
): string {
  const anchorLabel = joinHumanList(anchors);

  switch (methodPreference) {
    case 'videos':
      return `Tomar videos paso a paso de ${anchorLabel} como referencia concreta.`;
    case 'libros':
      return `Tomar recetas escritas de ${anchorLabel} como referencia concreta.`;
    case 'clases':
      return `Usar clases o cursos sobre ${anchorLabel} como referencia concreta.`;
    case 'mentor':
      return `Alinear la practica con guia directa sobre ${anchorLabel}.`;
    case 'autodidacta':
      return `Elegir ${anchorLabel} como referencia concreta y repetirlo sin improvisar de entrada.`;
    default:
      return `Tomar ${anchorLabel} como referencia concreta del repertorio.`;
  }
}

function buildHealthFallbackStrategy(input: StrategyInput, domainCard?: DomainKnowledgeCard): StrategyOutput {
  const clarificationSignals = extractClarificationSignals(input.planningContext?.clarificationAnswers ?? {});
  const healthSignals = extractHealthSignals(input.goalText, input.planningContext?.clarificationAnswers ?? {});
  const domainLabel = buildDomainLabel(input, domainCard);
  const taskLabels = buildTaskLabels(domainCard);
  const activityLabels = uniqueNonEmpty([
    ...healthSignals.preferredActivities,
    ...taskLabels.slice(0, 4),
    'Caminata constante',
    'Ciclismo suave',
    'Natacion o aquagym',
    'Fuerza basica y movilidad',
  ]);
  const primaryActivity = activityLabels[0] ?? 'Caminata constante';
  const secondaryActivity = activityLabels[1] ?? 'Ciclismo suave';
  const tertiaryActivity = activityLabels[2] ?? 'Natacion o aquagym';
  const baseDurations = healthSignals.medicalContext || healthSignals.aggressive ? [3, 4, 4] : [3, 4, 5];
  const durations = stretchDurationsToTarget(
    baseDurations,
    extractTargetHorizonWeeks(input.goalText, clarificationSignals.deadline),
  );
  const safetyLead = healthSignals.medicalContext
    ? 'Validar la intensidad con criterio medico o nutricional antes de subir carga.'
    : 'Priorizar continuidad, bajo impacto y recuperacion por encima del apuro.';
  const aggressiveSafety = healthSignals.aggressive
    ? 'Si la meta es bajar rapido, bajale un cambio: la prioridad es sostener el proceso sin castigar el cuerpo ni hacer recortes extremos.'
    : null;
  const supervisionLead = healthSignals.supervision
    ? `Antes de tratar esto como aceptable, dejar claro ${healthSignals.supervision.toLowerCase()}.`
    : 'Antes de tratar esto como aceptable, dejar claro que necesita supervision profesional si hay dudas o sintomas.';
  const measurementLead = [
    healthSignals.weight ? `Tomar ${healthSignals.weight.toLowerCase()} como referencia inicial.` : 'Tomar el punto de partida como referencia inicial.',
    healthSignals.height ? `Registrar ${healthSignals.height.toLowerCase()} para ajustar expectativas y carga.` : null,
    healthSignals.medicalContext ? 'Respetar cualquier condicion o antecedente medico antes de subir intensidad.' : null,
  ].filter(Boolean).join(' ');

  return normalizeStrategyOutput({
    phases: [
      {
        name: `Base segura y chequeo inicial de ${domainLabel}`,
        durationWeeks: durations[0],
        focus_esAR: [
          measurementLead,
          safetyLead,
          aggressiveSafety,
          supervisionLead,
        ].filter(Boolean).join(' '),
      },
      {
        name: 'Constancia con actividad viable y bajo impacto',
        durationWeeks: durations[1],
        focus_esAR: [
          `Sostener ${primaryActivity.toLowerCase()} como actividad principal.`,
          secondaryActivity !== primaryActivity ? `Sumar ${secondaryActivity.toLowerCase()} como segunda opcion viable.` : null,
          tertiaryActivity !== primaryActivity && tertiaryActivity !== secondaryActivity ? `Dejar ${tertiaryActivity.toLowerCase()} como alternativa de bajo impacto.` : null,
          healthSignals.support ? `Buscar ${healthSignals.support.toLowerCase()} para no planear esto solo.` : null,
        ].filter(Boolean).join(' '),
      },
      {
        name: `Seguimiento sostenible y ajustes de ${domainLabel}`,
        durationWeeks: durations[2],
        focus_esAR: [
          'Buscar una tendencia estable, no una baja brusca.',
          healthSignals.preferredActivities.length > 0 ? `Las actividades viables guian el plan: ${healthSignals.preferredActivities.join(', ').toLowerCase()}.` : null,
          clarificationSignals.constraints ? `Respetar ${clarificationSignals.constraints.toLowerCase()} al definir el ritmo.` : null,
          healthSignals.highRisk ? 'No publicar esto como aceptable sin freno de seguridad y supervision.' : null,
        ].filter(Boolean).join(' '),
      },
    ],
    milestones: [
      healthSignals.weight || healthSignals.height
        ? 'Tener una referencia inicial clara de peso y medidas'
        : 'Tener una referencia inicial clara y segura',
      `Sostener ${primaryActivity.toLowerCase()} de forma repetible durante varias semanas`,
      healthSignals.aggressive
        ? 'Evitar atajos agresivos y mantener una progresion segura'
        : 'Ver una tendencia estable y sostenible',
    ],
  });
}

function buildSkillFallbackStrategy(input: StrategyInput, domainCard?: DomainKnowledgeCard): StrategyOutput {
  const signals = extractClarificationSignals(input.planningContext?.clarificationAnswers ?? {});
  const cookingSignals = extractCookingSignals(input.goalText, input.planningContext?.clarificationAnswers ?? {}, domainCard);
  const domainLabel = buildDomainLabel(input, domainCard);
  const taskLabels = buildTaskLabels(domainCard);
  const primaryTasks = taskLabels.slice(0, 3);
  const inferredFocusLabel = inferFocusLabel(input.goalText, domainLabel);
  const secondaryFocusLabel = primaryTasks[0] ?? inferredFocusLabel;
  const taskSummary = primaryTasks.length > 0
    ? primaryTasks.join(', ')
    : secondaryFocusLabel;
  const levelLabel = cookingSignals.level ?? signals.mastery ?? 'principiante';
  const subtopicLabel = cookingSignals.subtopic
    ?? signals.subtopic
    ?? primaryTasks[0]
    ?? inferredFocusLabel;
  const methodLabel = cookingSignals.learningMethod ?? signals.learningMode ?? null;
  const methodPreference = normalizeCookingMethodPreference(methodLabel);
  const horizonLabel = cookingSignals.horizon ?? signals.deadline ?? null;
  const isCookingGoal = /\b(cocina|cocinar|receta|plato|gastronom)\b/i.test(`${input.goalText} ${domainLabel}`);
  const isItalianCooking = /\bitalian[oa]s?|\bpastas?|\bsalsas?\b/i.test(`${input.goalText} ${subtopicLabel} ${domainLabel}`);
  const preserveItalianBreadth = isCookingGoal && shouldPreserveItalianCookingBreadth(input.goalText, cookingSignals.subtopic ?? subtopicLabel);
  const durations = stretchDurationsToTarget(
    resolveDurations(levelLabel),
    extractTargetHorizonWeeks(input.goalText, horizonLabel),
  );
  const focusTopic = isCookingGoal
    ? preserveItalianBreadth
      ? inferredFocusLabel
      : formatCookingFocusTopic(subtopicLabel, isItalianCooking, domainLabel)
    : subtopicLabel;
  const preferredTopicLabel = isCookingGoal
    ? formatCookingFocusTopic(cookingSignals.subtopic ?? subtopicLabel, isItalianCooking, focusTopic)
    : subtopicLabel;
  const learningLead = methodLabel
    ? `El aprendizaje debe apoyarse en ${methodLabel.toLowerCase()}.`
    : null;
  const horizonLead = horizonLabel
    ? `El horizonte de trabajo queda en ${horizonLabel.toLowerCase()} y no en una improvisacion corta.`
    : null;

  if (isCookingGoal) {
    const anchors = preserveItalianBreadth
      ? buildItalianCookingFoundationAnchors(cookingSignals.subtopic ?? subtopicLabel)
      : buildCookingReferenceAnchors(cookingSignals.subtopic ?? subtopicLabel);
    const explicitReferenceLead = cookingSignals.references.length > 0
      ? `Usar ${cookingSignals.references.join(', ').toLowerCase()} como referencia concreta.`
      : null;
    const breadthLead = preserveItalianBreadth && cookingSignals.subtopic
      ? `Usar ${preferredTopicLabel?.toLowerCase()} como puerta de entrada sin reducir el objetivo completo de cocina italiana.`
      : null;
    const stepByStepLabel = methodPreference === 'videos'
      ? 'video paso a paso'
      : methodPreference === 'libros'
        ? 'receta escrita'
        : 'paso a paso';

    return normalizeStrategyOutput({
      phases: [
        {
          name: methodLabel
            ? `Primer repertorio de ${focusTopic} con ${methodLabel.toLowerCase()}`
            : `Primer repertorio de ${focusTopic}`,
          durationWeeks: durations[0],
          focus_esAR: [
            `Construir una base repetible de ${focusTopic}.`,
            breadthLead,
            explicitReferenceLead ?? buildCookingReferenceLead(methodPreference, [anchors[0]]),
            `Fijar mise en place, punto de coccion y tecnica base alrededor de ${anchors[0]}.`,
            learningLead,
          ].filter(Boolean).join(' '),
        },
        {
          name: `Recetas repetibles de ${focusTopic}`,
          durationWeeks: durations[1],
          focus_esAR: [
            buildCookingReferenceLead(methodPreference, [anchors[1], anchors[2]]),
            `Repetir ${joinHumanList([anchors[1], anchors[2]])} hasta que deje de depender del ${stepByStepLabel}.`,
            preserveItalianBreadth ? 'Mantener al menos dos recetas de pasta dentro del repertorio base antes de dar por cumplido el objetivo.' : null,
            signals.priority ? `Priorizar ${signals.priority.toLowerCase()} dentro del repertorio principal.` : null,
            signals.level ? `Respetar el nivel actual ${signals.level.toLowerCase()} sin saltar etapas.` : null,
          ].filter(Boolean).join(' '),
        },
        {
          name: horizonLabel
            ? `Menu corto de ${focusTopic} para ${horizonLabel.toLowerCase()}`
            : `Menu corto y ejecucion consistente de ${focusTopic}`,
          durationWeeks: durations[2],
          focus_esAR: [
            `Cerrar el horizonte con un menu corto que combine ${joinHumanList([anchors[0], anchors[1]])}.`,
            horizonLead,
            signals.constraints ? `Respetar ${signals.constraints.toLowerCase()} al elegir el repertorio.` : null,
            cookingSignals.subtopic ? `Mantener ${cookingSignals.subtopic.toLowerCase()} como eje y no como detalle secundario.` : null,
            preserveItalianBreadth ? 'El cierre debe demostrar que pizza y pastas conviven dentro de una misma base italiana, no como aprendizajes aislados.' : null,
          ].filter(Boolean).join(' '),
        },
      ],
      milestones: [
        `Completar una rutina base estable de ${focusTopic} con ${anchors[0]}`,
        `Resolver ${joinHumanList([anchors[1], anchors[2]])} sin depender del ${stepByStepLabel}`,
        `Preparar un menu corto de ${focusTopic} con calidad consistente y referencias concretas`,
      ],
    });
  }

  const phases = [
    {
      name: focusTopic && methodLabel
        ? `Primer repertorio de ${focusTopic} con ${methodLabel.toLowerCase()}`
        : `Primer repertorio de ${focusTopic || domainLabel}`,
      durationWeeks: durations[0],
      focus_esAR: [
        `Construir una base repetible de ${focusTopic || domainLabel}.`,
        primaryTasks[0] ? `Primero fijar ${primaryTasks[0].toLowerCase()} como bloque estable.` : null,
        learningLead,
        cookingSignals.references.length > 0 ? `Usar ${cookingSignals.references.join(', ').toLowerCase()} como referencia concreta.` : null,
      ].filter(Boolean).join(' '),
    },
    {
      name: focusTopic
        ? `Recetas repetibles de ${focusTopic}`
        : primaryTasks[0]
          ? `Repeticiones utiles de ${primaryTasks[0]}`
          : `Repeticiones utiles de ${secondaryFocusLabel}`,
      durationWeeks: durations[1],
      focus_esAR: [
        focusTopic
          ? `Repetir y ajustar ${focusTopic.toLowerCase()} hasta que deje de depender de instrucciones paso a paso.`
          : `Repetir sesiones concretas para que el plan no quede en teoria.`,
        signals.priority ? `Priorizar ${signals.priority.toLowerCase()} dentro del repertorio principal.` : null,
        signals.level ? `Respetar el nivel actual ${signals.level.toLowerCase()} sin saltar etapas.` : null,
      ].filter(Boolean).join(' '),
    },
    {
      name: horizonLabel
        ? `Menu corto de ${focusTopic || domainLabel} para ${horizonLabel.toLowerCase()}`
        : `Menu corto y ejecucion consistente de ${focusTopic || domainLabel}`,
      durationWeeks: durations[2],
      focus_esAR: [
        isCookingGoal
          ? `Llevar el repertorio a ejecuciones completas, consistentes y presentables.`
          : `Llevar la practica a ejecuciones completas y consistentes.`,
        horizonLead,
        signals.constraints ? `Respetar ${signals.constraints.toLowerCase()} al elegir el repertorio.` : null,
        focusTopic && cookingSignals.subtopic ? `Mantener ${cookingSignals.subtopic.toLowerCase()} como eje y no como detalle secundario.` : null,
      ].filter(Boolean).join(' '),
    },
  ];

  const milestones = [
    focusTopic
      ? `Completar una rutina base estable de ${focusTopic.toLowerCase()}`
      : `Completar una rutina base estable de ${domainLabel}`,
    isCookingGoal
      ? `Resolver ${focusTopic ? focusTopic.toLowerCase() : taskSummary.toLowerCase()} sin depender paso a paso de la receta`
      : `Resolver ${taskSummary.toLowerCase()} con autonomia creciente`,
    isCookingGoal
      ? `Preparar un menu corto de ${domainLabel} con calidad consistente y base de libros`
      : `Completar una entrega final de ${domainLabel} al nivel ${levelLabel.toLowerCase()}`,
  ];

  return normalizeStrategyOutput({
    phases,
    milestones,
  });
}

function buildGenericFallbackStrategy(input: StrategyInput, domainCard?: DomainKnowledgeCard): StrategyOutput {
  const signals = extractClarificationSignals(input.planningContext?.clarificationAnswers ?? {});
  const cookingSignals = extractCookingSignals(input.goalText, input.planningContext?.clarificationAnswers ?? {}, domainCard);
  const anchors = extractGenericPlanAnchors(input.goalText, input.planningContext?.clarificationAnswers ?? {});
  const domainLabel = buildDomainLabel(input, domainCard);
  const anchorLabel = joinHumanList(anchors.anchorTokens.slice(0, 3));
  const topicLabel = cookingSignals.subtopic
    ?? signals.subtopic
    ?? (anchorLabel.length > 0 ? anchorLabel : domainLabel);
  const timeframeLabel = anchors.timeframe ?? cookingSignals.horizon ?? signals.deadline;
  const metricLabel = anchors.metric;
  const durations = stretchDurationsToTarget(
    resolveDurations(cookingSignals.level ?? signals.mastery),
    extractTargetHorizonWeeks(input.goalText, timeframeLabel),
  );
  const needsExternalValidation = input.classification.extractedSignals.dependsOnThirdParties
    || input.classification.goalType === 'HIGH_UNCERTAINTY_TRANSFORM'
    || input.classification.goalType === 'QUANT_TARGET_TRACKING';
  const needsSkillProgression = input.classification.extractedSignals.requiresSkillProgression;

  return normalizeStrategyOutput({
    phases: [
      {
        name: `Punto de partida y activos utiles de ${topicLabel}`,
        durationWeeks: durations[0],
        focus_esAR: [
          `Traducir el objetivo a bloques concretos y medibles en ${topicLabel}.`,
          metricLabel ? `La metrica que ordena el plan es ${metricLabel.toLowerCase()}.` : null,
          timeframeLabel ? `El horizonte de trabajo queda en ${timeframeLabel.toLowerCase()}.` : null,
          anchorLabel ? `Reutilizar las senales mas concretas del intake: ${anchorLabel.toLowerCase()}.` : null,
          needsSkillProgression
            ? 'Primero convertir conocimientos sueltos en una base repetible y usable.'
            : 'Primero ordenar el punto de partida real antes de ampliar el alcance.',
        ].filter(Boolean).join(' '),
      },
      {
        name: `Pruebas visibles y feedback externo para ${topicLabel}`,
        durationWeeks: durations[1],
        focus_esAR: [
          cookingSignals.learningMethod
            ? `Acumular repeticiones deliberadas con apoyo de ${cookingSignals.learningMethod.toLowerCase()} y feedback visible.`
            : 'Acumular repeticiones deliberadas y feedback visible sin caer en tareas intercambiables.',
          needsExternalValidation
            ? 'Bajar el objetivo a validaciones externas, respuesta de mercado o pruebas del mundo real.'
            : 'Bajar el objetivo a pruebas visibles y criterios de calidad observables.',
          anchorLabel ? `Mantener ${anchorLabel.toLowerCase()} como eje para no responder a otro objetivo.` : null,
        ].filter(Boolean).join(' '),
      },
      {
        name: metricLabel
          ? `Iteracion medible hacia ${metricLabel}`
          : `Cierre verificable de ${topicLabel}`,
        durationWeeks: durations[2],
        focus_esAR: [
          metricLabel
            ? `Cerrar una iteracion que ya muestre avance visible hacia ${metricLabel.toLowerCase()}.`
            : 'Cerrar una version demostrable del objetivo.',
          timeframeLabel ? `No extender el cierre mas alla de ${timeframeLabel.toLowerCase()}.` : null,
          needsExternalValidation
            ? 'Usar feedback real para ajustar sin perder las senales originales del intake.'
            : 'Dejar una rutina repetible y verificable despues del cierre.',
        ].filter(Boolean).join(' '),
      },
    ],
    milestones: [
      `Definir una base operativa clara de ${topicLabel}`,
      needsExternalValidation
        ? `Conseguir una prueba visible o feedback real relacionado con ${topicLabel}`
        : cookingSignals.subtopic
          ? `Completar una practica intermedia verificable de ${cookingSignals.subtopic.toLowerCase()}`
          : 'Completar una practica intermedia verificable',
      metricLabel
        ? `Cerrar una iteracion que muestre avance concreto hacia ${metricLabel}`
        : 'Cerrar una demostracion final del objetivo',
    ],
  });
}

export function buildFallbackStrategy(input: StrategyInput, domainCard?: DomainKnowledgeCard): StrategyOutput {
  if (isHealthWeightGoal(input, domainCard)) {
    return buildHealthFallbackStrategy(input, domainCard);
  }

  if (input.classification.goalType === 'SKILL_ACQUISITION') {
    return buildSkillFallbackStrategy(input, domainCard);
  }

  return buildGenericFallbackStrategy(input, domainCard);
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
  const result = await generateStrategyWithSource(runtime, input, domainCard);
  return result.output;
}

export interface StrategyGenerationResult {
  output: StrategyOutput;
  source: 'llm' | 'fallback';
  fallbackCode?: string;
  fallbackMessage?: string;
  failedCheck?: string | null;
  validationSummaryEs?: string | null;
  validationEvidence?: Record<string, unknown> | null;
}

function buildStrategyValidationDiagnosis(
  failedCheck: string,
  output: StrategyOutput,
  input: StrategyInput,
  typedSignals: TypedClarificationSignals,
): {
  summaryEs: string;
  evidence: Record<string, unknown>;
} {
  const textFields = collectTextFields(output);
  const totalPlanWeeks = output.totalSpanWeeks
    ?? output.phases.reduce((sum, phase) => sum + Math.max(1, phase.durationWeeks ?? 4), 0);
  const truncatedTexts = textFields.slice(0, 6);

  switch (failedCheck) {
    case 'output.required_content':
      return {
        summaryEs: 'El borrador del planificador no trajo el contenido mínimo requerido.',
        evidence: {
          phasesCount: output.phases.length,
          milestonesCount: output.milestones.length,
        },
      };
    case 'output.structural_phase_title':
      return {
        summaryEs: 'El borrador del planificador usó nombres de fase demasiado genéricos.',
        evidence: {
          invalidPhaseTitles: output.phases
            .filter((phase) => isStructuralPhaseTitle(phase.name))
            .map((phase) => phase.name),
        },
      };
    case 'cooking.subtopic':
      return {
        summaryEs: `El borrador no preservó el subtema clave "${typedSignals.cooking.subtopic ?? 'sin dato'}".`,
        evidence: {
          expectedSubtopic: typedSignals.cooking.subtopic,
          observedTexts: truncatedTexts,
        },
      };
    case 'cooking.domain_scope':
      return {
        summaryEs: 'El borrador redujo demasiado el alcance de cocina italiana y perdió amplitud de dominio.',
        evidence: {
          goalText: input.goalText,
          expectedAnchor: 'pasta',
          observedTexts: truncatedTexts,
        },
      };
    case 'cooking.learning_method':
      return {
        summaryEs: `El borrador ignoró el método de aprendizaje pedido: "${typedSignals.cooking.learningMethod ?? 'sin dato'}".`,
        evidence: {
          expectedLearningMethod: typedSignals.cooking.learningMethod,
          observedTexts: truncatedTexts,
        },
      };
    case 'cooking.horizon': {
      const targetHorizonWeeks = typedSignals.cooking.horizon
        ? extractTargetHorizonWeeks(input.goalText, typedSignals.cooking.horizon)
        : null;
      return {
        summaryEs: 'El borrador no respetó el horizonte temporal detectado para este objetivo.',
        evidence: {
          expectedHorizon: typedSignals.cooking.horizon,
          targetHorizonWeeks,
          observedTotalPlanWeeks: totalPlanWeeks,
          observedTexts: truncatedTexts,
        },
      };
    }
    case 'health.supervision':
      return {
        summaryEs: 'El borrador omitió la referencia de supervisión profesional necesaria para un objetivo de salud de alto riesgo.',
        evidence: {
          highRisk: typedSignals.health.highRisk,
          expectedTerms: ['supervision', 'seguimiento', 'medico', 'nutricionista'],
          observedTexts: truncatedTexts,
        },
      };
    case 'health.preferred_activities':
      return {
        summaryEs: 'El borrador no incorporó las actividades viables detectadas para este objetivo de salud.',
        evidence: {
          expectedActivities: typedSignals.health.preferredActivities,
          observedTexts: truncatedTexts,
        },
      };
    case 'intake.metric':
      return {
        summaryEs: 'El borrador perdiÃ³ la metrica o el resultado medible que el intake dejaba explÃ­cito.',
        evidence: {
          expectedMetric: typedSignals.general.metric,
          observedTexts: truncatedTexts,
        },
      };
    case 'intake.timeframe': {
      const targetHorizonWeeks = typedSignals.general.timeframe
        ? extractTargetHorizonWeeks(input.goalText, typedSignals.general.timeframe)
        : null;
      return {
        summaryEs: 'El borrador no respetÃ³ el plazo detectado en el intake.',
        evidence: {
          expectedTimeframe: typedSignals.general.timeframe,
          targetHorizonWeeks,
          observedTotalPlanWeeks: totalPlanWeeks,
          observedTexts: truncatedTexts,
        },
      };
    }
    case 'intake.anchor_coverage':
      return {
        summaryEs: 'El borrador no reutilizÃ³ suficientes seÃ±ales concretas del intake y quedÃ³ demasiado intercambiable.',
        evidence: {
          expectedAnchors: typedSignals.general.anchorTokens,
          observedTexts: truncatedTexts,
        },
      };
    case 'cooking.level':
      return {
        summaryEs: `El borrador no respetó el nivel declarado por la persona usuaria: "${typedSignals.cooking.level ?? 'sin dato'}".`,
        evidence: {
          expectedLevel: typedSignals.cooking.level,
          observedTexts: truncatedTexts,
        },
      };
    default:
      return {
        summaryEs: `El borrador no pasó la validación "${failedCheck}".`,
        evidence: {
          failedCheck,
          observedTexts: truncatedTexts,
        },
      };
  }
}

export async function generateStrategyWithSource(
  runtime: AgentRuntime,
  input: StrategyInput,
  domainCard?: DomainKnowledgeCard,
): Promise<StrategyGenerationResult> {
  const planningContext = input.planningContext;
  const clarificationAnswers = planningContext?.clarificationAnswers ?? {};
  const typedClarificationAnswers = buildTypedClarificationAnswers(input.goalText, clarificationAnswers, domainCard);
  const typedSignals: TypedClarificationSignals = {
    cooking: extractCookingSignals(input.goalText, clarificationAnswers, domainCard),
    health: extractHealthSignals(input.goalText, clarificationAnswers),
    general: extractGenericPlanAnchors(input.goalText, clarificationAnswers),
  };
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
        clarificationAnswers: {
          ...clarificationAnswers,
          ...typedClarificationAnswers,
        },
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

    const output = planningContext?.interpretation
      ? normalizeReasoningOutput(parsed)
      : normalizeStrategyOutput(strategyOutputSchema.parse(parsed));

    const validation = validateStrategyOutput(output, input, typedSignals);
    if (!validation.valid) {
      const diagnosis = buildStrategyValidationDiagnosis(
        validation.failedCheck ?? 'unknown',
        output,
        input,
        typedSignals,
      );
      return {
        output: buildFallbackStrategy(input, domainCard),
        source: 'fallback',
        fallbackCode: 'STRATEGY_VALIDATION_FAILED',
        fallbackMessage: `Planner output failed validation: check "${validation.failedCheck}" did not pass. Fallback strategy was used.`,
        failedCheck: validation.failedCheck,
        validationSummaryEs: diagnosis.summaryEs,
        validationEvidence: diagnosis.evidence,
      };
    }

    return {
      output,
      source: 'llm',
    };
  } catch (error) {
    const fallbackMessage = error instanceof Error && error.message.trim().length > 0
      ? `Planner output could not be parsed and fallback strategy was used: ${error.message}`
      : 'Planner output could not be parsed and fallback strategy was used.';
    return {
      output: buildFallbackStrategy(input, domainCard),
      source: 'fallback',
      fallbackCode: 'STRATEGY_PARSE_FAILED',
      fallbackMessage,
      failedCheck: null,
      validationSummaryEs: 'El borrador del planificador no se pudo parsear como JSON válido.',
      validationEvidence: {
        parseError: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
