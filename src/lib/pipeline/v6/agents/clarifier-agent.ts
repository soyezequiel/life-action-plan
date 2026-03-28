import type { AgentRuntime } from '../../../runtime/types';
import { extractFirstJsonObject } from '../../../flow/agents/llm-json-parser';
import type {
  ClarificationQuestion,
  ClarificationRound,
  GoalInterpretation,
  V6Agent,
} from '../types';
import { ClarificationRoundSchema } from '../types';

export interface ClarifierInput {
  interpretation: GoalInterpretation
  previousAnswers: Record<string, string>
  profileSummary: string | null
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(
    value
      .map((item) => normalizeText(item))
      .filter((item) => item.length > 0),
  ));
}

function normalizeWhitespace(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  const stopWords = new Set([
    'ante',
    'bajo',
    'cada',
    'como',
    'con',
    'cual',
    'cuando',
    'cuanto',
    'de',
    'del',
    'donde',
    'el',
    'en',
    'es',
    'esta',
    'este',
    'hay',
    'la',
    'las',
    'los',
    'para',
    'por',
    'que',
    'ser',
    'sin',
    'sobre',
    'una',
    'uno',
    'user',
  ]);

  return normalizeWhitespace(value)
    .split(' ')
    .filter((token) => token.length >= 4 && !stopWords.has(token));
}

function detectResolvedAmbiguities(
  ambiguities: string[],
  previousAnswers: Record<string, string>,
): string[] {
  const answerEntries = Object.entries(previousAnswers)
    .map(([key, value]) => `${key} ${value}`.trim())
    .filter((entry) => normalizeText(entry).length > 0);

  if (answerEntries.length === 0) {
    return [];
  }

  return ambiguities.filter((ambiguity) => {
    const ambiguityTokens = tokenize(ambiguity);

    if (ambiguityTokens.length === 0) {
      return false;
    }

    return answerEntries.some((answer) => {
      const answerTokens = new Set(tokenize(answer));
      let overlap = 0;

      for (const token of ambiguityTokens) {
        if (answerTokens.has(token)) {
          overlap += 1;
        }
      }

      return overlap >= Math.min(2, ambiguityTokens.length);
    });
  });
}

function formatPreviousAnswers(previousAnswers: Record<string, string>): string {
  const entries = Object.entries(previousAnswers)
    .map(([key, value]) => [key.trim(), value.trim()] as const)
    .filter(([, value]) => value.length > 0);

  if (entries.length === 0) {
    return 'None';
  }

  return entries
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');
}

function formatResolvedAmbiguities(resolvedAmbiguities: string[]): string {
  if (resolvedAmbiguities.length === 0) {
    return 'None identified yet';
  }

  return resolvedAmbiguities
    .map((ambiguity) => `- ${ambiguity}`)
    .join('\n');
}

function buildClarifierPrompt(input: ClarifierInput): string {
  const resolvedAmbiguities = detectResolvedAmbiguities(
    input.interpretation.ambiguities,
    input.previousAnswers,
  );

  return `
You are a planning assistant gathering information to create a personal action plan.

Goal: "${input.interpretation.parsedGoal}"
Goal type: ${input.interpretation.goalType}
Known ambiguities: ${JSON.stringify(input.interpretation.ambiguities)}

Ambiguities already resolved by previous answers:
${formatResolvedAmbiguities(resolvedAmbiguities)}

Information already collected:
${formatPreviousAnswers(input.previousAnswers)}

Existing profile data available:
${input.profileSummary || 'None'}

Analyze what information is still missing to create a realistic, executable plan.
For each remaining gap, decide if it is CRITICAL (plan quality depends on it) or NICE-TO-HAVE.

Then generate 2-4 questions that address the CRITICAL gaps first.
Each question must have a clear purpose explaining why you need this information.
Ask ONLY about remaining gaps.
Questions MUST be in Spanish.
If confidence >= 0.8 or there are no more critical gaps, return an empty questions array and set readyToAdvance to true.

Output ONLY this JSON:
{
  "questions": [
    {
      "id": "unique-id",
      "text": "question in Spanish",
      "purpose": "why this matters for the plan",
      "type": "text|number|select|range",
      "options": ["only for select type"],
      "min": null,
      "max": null
    }
  ],
  "reasoning": "what information gaps remain and why",
  "informationGaps": ["remaining unknowns"],
  "confidence": 0.0-1.0,
  "readyToAdvance": true/false
}
`.trim();
}

function normalizeQuestionType(value: unknown): ClarificationQuestion['type'] {
  if (value === 'number' || value === 'select' || value === 'range') {
    return value;
  }
  return 'text';
}

function normalizeNumericBound(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return undefined;
}

function looksEnglishQuestion(value: string): boolean {
  const normalized = normalizeWhitespace(value);

  return /\b(what|why|how|when|which|where|should|would|could|can|are|is|do|does|your)\b/.test(normalized);
}

function normalizeQuestion(
  value: unknown,
  index: number,
): ClarificationQuestion | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const type = normalizeQuestionType(record.type);
  const text = normalizeText(record.text);
  const purpose = normalizeText(record.purpose);

  if (text.length === 0 || purpose.length === 0 || looksEnglishQuestion(text)) {
    return null;
  }

  const options = type === 'select'
    ? normalizeStringList(record.options)
    : undefined;
  const normalizedType = type === 'select' && (!options || options.length === 0)
    ? 'text'
    : type;

  const question: ClarificationQuestion = {
    id: normalizeText(record.id) || `clarify-${index + 1}`,
    text,
    purpose,
    type: normalizedType,
  };

  const min = normalizeNumericBound(record.min);
  const max = normalizeNumericBound(record.max);

  if (normalizedType === 'select' && options && options.length > 0) {
    question.options = options;
  }

  if (typeof min === 'number') {
    question.min = min;
  }

  if (typeof max === 'number') {
    question.max = max;
  }

  return question;
}

function normalizeConfidence(value: unknown, fallback = 0.6): number {
  const numericValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, numericValue));
}

function normalizeClarificationRound(payload: Record<string, unknown>): ClarificationRound {
  const questions = Array.isArray(payload.questions)
    ? payload.questions
        .map((question, index) => normalizeQuestion(question, index))
        .filter((question): question is ClarificationQuestion => question !== null)
        .slice(0, 4)
    : [];

  const informationGaps = normalizeStringList(payload.informationGaps);
  const confidence = normalizeConfidence(payload.confidence);
  const readyToAdvance = payload.readyToAdvance === true
    || confidence >= 0.8
    || informationGaps.length === 0
    || questions.length === 0;

  return ClarificationRoundSchema.parse({
    questions: readyToAdvance ? [] : questions,
    reasoning: normalizeText(payload.reasoning) || 'Insufficient clarification output.',
    informationGaps: readyToAdvance ? [] : informationGaps,
    confidence,
    readyToAdvance,
  });
}

export const clarifierAgent: V6Agent<ClarifierInput, ClarificationRound> = {
  name: 'clarifier',

  async execute(input: ClarifierInput, runtime: AgentRuntime): Promise<ClarificationRound> {
    try {
      const response = await runtime.chat([{
        role: 'user',
        content: buildClarifierPrompt(input),
      }]);
      const raw = extractFirstJsonObject(response.content);
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return normalizeClarificationRound(parsed);
    } catch {
      return clarifierAgent.fallback(input);
    }
  },

  fallback(): ClarificationRound {
    return ClarificationRoundSchema.parse({
      questions: [],
      reasoning: 'Clarifier unavailable, proceeding with current information.',
      informationGaps: [],
      confidence: 0.6,
      readyToAdvance: true,
    });
  },
};
