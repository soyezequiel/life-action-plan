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

const MAX_CLARIFICATION_QUESTIONS = 3;

const CLARIFIER_SYSTEM_PROMPT = [
  'You are the LAP v6 clarifier.',
  'Your job is to decide whether planning can start now and, if not, ask the minimum number of critical questions.',
  'Return JSON only. Do not add markdown, explanations, or any text outside the JSON object.',
].join(' ');

const CLARIFIER_INVARIANTS = [
  'Treat previous answers as an immutable answer ledger. Never paraphrase, merge, reinterpret, or contradict them.',
  'Never ask again for a field that already has an explicit answer in the answer ledger or in the profile context.',
  'Ask only CRITICAL missing data that changes safety, feasibility, scope, schedule, or success criteria.',
  'Each question must ask for exactly one missing variable.',
  'Prefer closed questions: select, number, or range. Use text only when a closed format would distort the answer.',
  'Avoid broad prompts such as "contame mas", "describi", "explica", or multi-part questions.',
  'Minimize rounds: ask the smallest complete batch that unlocks planning, usually 1 to 3 questions.',
  'If you ask at least one question, set readyToAdvance=false.',
  'If no critical gaps remain, return questions=[], informationGaps=[], readyToAdvance=true.',
  'Questions and purpose must be in Spanish.',
  'informationGaps must use short stable snake_case keys, one per question, in the same order.',
  'Keep reasoning short and limited to unresolved critical gaps only.',
];

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringList(value: unknown, maxItems = Number.POSITIVE_INFINITY): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueValues: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const normalized = normalizeText(item);
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    uniqueValues.push(normalized);

    if (uniqueValues.length >= maxItems) {
      break;
    }
  }

  return uniqueValues;
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
    'cuanta',
    'cuantas',
    'cuantos',
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
    'queres',
    'ser',
    'sin',
    'sobre',
    'tenes',
    'una',
    'uno',
    'podes',
    'user',
  ]);

  return normalizeWhitespace(value)
    .split(' ')
    .filter((token) => token.length >= 4 && !stopWords.has(token));
}

function formatPreviousAnswers(previousAnswers: Record<string, string>): string {
  const entries = Object.entries(previousAnswers)
    .map(([key, value]) => [key.trim(), value.trim()] as const)
    .filter(([, value]) => value.length > 0);

  if (entries.length === 0) {
    return '[]';
  }

  return JSON.stringify(
    entries.map(([question, answer]) => ({ question, answer })),
    null,
    2,
  );
}

function formatAmbiguities(ambiguities: string[]): string {
  if (ambiguities.length === 0) {
    return '[]';
  }

  return JSON.stringify(ambiguities, null, 2);
}

function formatInvariants(): string {
  return CLARIFIER_INVARIANTS
    .map((invariant, index) => `${index + 1}. ${invariant}`)
    .join('\n');
}

function buildDomainClarificationGuidance(input: ClarifierInput): string {
  const goalText = `${input.interpretation.parsedGoal} ${input.interpretation.suggestedDomain ?? ''}`.toLowerCase();

  if (/\b(bajar de peso|perder peso|adelgaz|peso|kg\b|kilos?|obesidad|sobrepeso|salud|cintura|medidas|imc|bmi)\b/.test(goalText)) {
    return [
      'Health-domain priorities:',
      '- Ask only for missing baseline metrics that materially affect the plan, preferably as number or range.',
      '- Ask about medical context, pain, medication, or contraindications only if missing and plan-critical.',
      '- Ask which activities are realistically viable only if the goal depends on exercise selection.',
      '- Ask whether the user already has or wants professional supervision when it changes safety or scope.',
    ].join('\n');
  }

  if (/\bcocin|receta|plato|gastronom|pasta|pastas\b/.test(goalText)) {
    return [
      'Cooking-domain priorities:',
      '- Ask for current level only if it changes the starting difficulty.',
      '- Ask for the concrete dish family or subtopic only if the scope is still broad.',
      '- Ask for time horizon only if it changes pacing or sequencing.',
      '- Ask for the learning format only if it changes the plan structure in a material way.',
    ].join('\n');
  }

  return [
    'Generic priorities:',
    '- Consider deadline, current baseline, real availability, hard constraints, and success criteria.',
    '- Ask only for the missing details that materially change the plan.',
  ].join('\n');
}

function buildClarifierPrompt(input: ClarifierInput): string {
  return `
Decide whether the planner still needs clarification before building the action plan.

Goal context:
- Goal: "${input.interpretation.parsedGoal}"
- Goal type: ${input.interpretation.goalType}
- Suggested domain: ${input.interpretation.suggestedDomain ?? 'null'}
- Candidate ambiguities from interpretation. They are only candidates, not proof of missing data:
${formatAmbiguities(input.interpretation.ambiguities)}

Authoritative answer ledger from previous rounds:
${formatPreviousAnswers(input.previousAnswers)}

Known profile context:
${input.profileSummary || 'null'}

${buildDomainClarificationGuidance(input)}

Critical-gap rubric:
- A gap is CRITICAL only if it changes safety, feasibility, scope, schedule, or success criteria.
- A gap is NOT critical if the planner can make a reasonable best-effort assumption without asking.
- Minimize rounds by asking the smallest complete batch that unlocks planning.

Output invariants:
${formatInvariants()}

Silent checklist:
1. Review each candidate ambiguity against the answer ledger and profile context.
2. Mark a gap as CLOSED when there is already an explicit answer.
3. Never reopen a CLOSED gap.
4. Ask 0 questions if the current information is enough for a realistic best-effort plan.
5. If you ask questions, ask 1 to 3 questions total.
6. Keep each question concrete, answerable in one shot, and as closed as possible.

Return ONLY this JSON shape:
{
  "questions": [
    {
      "id": "q1",
      "text": "pregunta concreta en espanol",
      "purpose": "motivo concreto en espanol",
      "type": "text|number|select|range",
      "options": ["only for select type"],
      "min": null,
      "max": null
    }
  ],
  "reasoning": "explicacion breve solo sobre faltantes criticos",
  "informationGaps": ["snake_case_gap_key"],
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

function looksEnglishText(value: string): boolean {
  const normalized = normalizeWhitespace(value);

  return /\b(what|why|how|when|which|where|should|would|could|can|are|is|do|does|your)\b/.test(normalized);
}

function normalizeQuestion(
  value: unknown,
): ClarificationQuestion | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const type = normalizeQuestionType(record.type);
  const text = normalizeText(record.text);
  const purpose = normalizeText(record.purpose);

  if (text.length === 0 || purpose.length === 0 || looksEnglishText(text) || looksEnglishText(purpose)) {
    return null;
  }

  const options = type === 'select'
    ? normalizeStringList(record.options, 6)
    : undefined;
  const normalizedType = type === 'select' && (!options || options.length === 0)
    ? 'text'
    : type;

  const question: ClarificationQuestion = {
    id: 'q',
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

function normalizeGapKey(value: string): string {
  return normalizeWhitespace(value)
    .split(' ')
    .filter((token) => token.length > 0)
    .slice(0, 6)
    .join('_');
}

function deriveGapKeyFromQuestion(question: ClarificationQuestion, index: number): string {
  const derivedTokens = tokenize(question.text).slice(0, 6);
  if (derivedTokens.length === 0) {
    return `gap_${index + 1}`;
  }

  return derivedTokens.join('_');
}

function normalizeConfidence(value: unknown, fallback = 0.6): number {
  const numericValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, numericValue));
}

function normalizeClarificationRound(
  payload: Record<string, unknown>,
  previousAnswers: Record<string, string>,
): ClarificationRound {
  const answeredQuestions = new Set(
    Object.keys(previousAnswers)
      .map((question) => normalizeWhitespace(question))
      .filter((question) => question.length > 0),
  );
  const seenQuestions = new Set<string>();

  const normalizedQuestions = Array.isArray(payload.questions)
    ? payload.questions
        .map((question) => normalizeQuestion(question))
        .filter((question): question is ClarificationQuestion => question !== null)
        .filter((question) => {
          const normalizedText = normalizeWhitespace(question.text);
          if (normalizedText.length === 0 || answeredQuestions.has(normalizedText) || seenQuestions.has(normalizedText)) {
            return false;
          }

          seenQuestions.add(normalizedText);
          return true;
        })
        .slice(0, MAX_CLARIFICATION_QUESTIONS)
    : [];
  const questions = normalizedQuestions.map((question, index) => ({
    ...question,
    id: `q${index + 1}`,
  }));

  const rawInformationGaps = normalizeStringList(payload.informationGaps, MAX_CLARIFICATION_QUESTIONS)
    .map((gap) => normalizeGapKey(gap))
    .filter((gap) => gap.length > 0);
  const informationGaps = questions.map((question, index) => rawInformationGaps[index] || deriveGapKeyFromQuestion(question, index));
  const confidence = normalizeConfidence(payload.confidence);
  const readyToAdvance = questions.length === 0;

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
    const response = await runtime.chat([
      {
        role: 'system',
        content: CLARIFIER_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: buildClarifierPrompt(input),
      },
    ]);
    const raw = extractFirstJsonObject(response.content);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return normalizeClarificationRound(parsed, input.previousAnswers);
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
