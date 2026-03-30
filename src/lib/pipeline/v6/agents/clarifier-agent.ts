import type { AgentRuntime } from '../../../runtime/types';
import { extractFirstJsonObject } from '../../../flow/agents/llm-json-parser';
import type {
  ClarificationQuestion,
  ClarificationRound,
  GoalInterpretation,
  GoalSignalKey,
  GoalSignalsSnapshot,
  V6Agent,
} from '../types';
import {
  ClarificationRoundSchema,
  GoalSignalsSnapshotSchema,
  normalizeGoalSignalKey,
} from '../types';

export interface ClarifierInput {
  interpretation: GoalInterpretation
  previousAnswers: Record<string, string>
  goalSignalsSnapshot?: GoalSignalsSnapshot
  profileSummary: string | null
  skipClarification?: boolean
}

const MAX_CLARIFICATION_QUESTIONS = 3;

const CLARIFIER_SYSTEM_PROMPT = [
  'You are the LAP v6 clarifier.',
  'Your job is to decide whether planning can start now and, if not, ask the minimum number of critical questions.',
  'Follow the control-plane snapshot exactly: universal critical signals override domain hunches.',
  'Return JSON only. Do not add markdown, explanations, or any text outside the JSON object.',
].join(' ');

const CLARIFIER_INVARIANTS = [
  'Treat previous answers as an immutable answer ledger. Never paraphrase, merge, reinterpret, or contradict them.',
  'Never ask again for a signal that already has an explicit answer in the signal ledger or in the profile context.',
  'Ask only for the missing critical signals listed in the control-plane snapshot.',
  'Prefer universal questions about outcome, timeframe, baseline, constraints, or safety before any domain wording.',
  'Each question must ask for exactly one missing variable.',
  'Prefer closed questions: select, number, or range. Use text only when a closed format would distort the answer.',
  'Avoid broad prompts such as "contame mas", "describi", "explica", or multi-part questions.',
  'Minimize rounds: ask the smallest complete batch that unlocks planning, usually 1 to 3 questions.',
  'If at least one critical signal is still missing, set readyToAdvance=false.',
  'Questions and purpose must be in Spanish.',
  'informationGaps must use the exact stable signal keys provided by the control-plane snapshot.',
  'Keep reasoning short and limited to unresolved critical gaps only.',
];

const SIGNAL_QUESTION_TEMPLATES: Record<GoalSignalKey, Omit<ClarificationQuestion, 'id'>> = {
  metric: {
    text: 'Que numero o resultado medible queres alcanzar?',
    purpose: 'Definir una meta observable para el plan',
    type: 'text',
  },
  timeframe: {
    text: 'En que plazo queres ver un primer resultado claro?',
    purpose: 'Ajustar el horizonte del plan',
    type: 'text',
  },
  current_baseline: {
    text: 'Cual es tu punto de partida hoy respecto de este objetivo?',
    purpose: 'Ubicar el nivel inicial real',
    type: 'text',
  },
  success_criteria: {
    text: 'Como vas a reconocer que este plan salio bien?',
    purpose: 'Alinear el criterio de exito',
    type: 'text',
  },
  constraints: {
    text: 'Que limites reales de tiempo, energia o agenda tenemos que respetar?',
    purpose: 'Evitar un plan imposible de sostener',
    type: 'text',
  },
  modality: {
    text: 'Que modalidad preferis para avanzar con este objetivo?',
    purpose: 'Elegir un formato de ejecucion realista',
    type: 'text',
  },
  resources: {
    text: 'Con que recursos concretos contas hoy para avanzar?',
    purpose: 'Ajustar el plan a los recursos reales disponibles',
    type: 'text',
  },
  safety_context: {
    text: 'Hay limites, riesgos o supervision profesional que debamos respetar antes de avanzar?',
    purpose: 'Cuidar el contexto de seguridad del plan',
    type: 'text',
  },
};

const SIGNAL_KEYWORD_PATTERNS: Array<{ signalKey: GoalSignalKey; pattern: RegExp }> = [
  { signalKey: 'metric', pattern: /\b(numero|medible|medir|resultado|meta numerica|objetivo numerico)\b/ },
  { signalKey: 'timeframe', pattern: /\b(plazo|fecha|cuando|semana|mes|ano|horizonte|deadline)\b/ },
  { signalKey: 'current_baseline', pattern: /\b(hoy|actual|actualmente|partida|punto de partida|nivel|experiencia|situacion actual|situacion financiera)\b/ },
  { signalKey: 'success_criteria', pattern: /\b(exito|exitoso|reconocer|listo|bien|funciono|funciono bien)\b/ },
  { signalKey: 'constraints', pattern: /\b(horas|tiempo|agenda|disponibilidad|limite|restriccion|energia|presupuesto)\b/ },
  { signalKey: 'modality', pattern: /\b(modalidad|formato|camino|via|freelancing|empleo|remoto)\b/ },
  { signalKey: 'resources', pattern: /\b(recursos|herramientas|equipo|presupuesto|capital|apoyo)\b/ },
  { signalKey: 'safety_context', pattern: /\b(seguridad|riesgo|limites|supervision|profesional|medico|legal|deuda|contraindic)\b/ },
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

function formatSignalLedger(snapshot: GoalSignalsSnapshot): string {
  if (snapshot.normalizedUserAnswers.length === 0) {
    return '[]';
  }

  return JSON.stringify(
    snapshot.normalizedUserAnswers.map((entry) => ({
      signalKey: entry.signalKey,
      question: entry.question,
      answer: entry.answer,
    })),
    null,
    2,
  );
}

function resolveGoalSignalsSnapshot(input: ClarifierInput): GoalSignalsSnapshot {
  return input.goalSignalsSnapshot ?? GoalSignalsSnapshotSchema.parse({
    parsedGoal: input.interpretation.parsedGoal,
    goalType: input.interpretation.goalType,
    riskFlags: input.interpretation.riskFlags,
    suggestedDomain: input.interpretation.suggestedDomain,
    metric: null,
    timeframe: null,
    anchorTokens: [],
    informationGaps: [],
    clarifyConfidence: null,
    readyToAdvance: null,
    normalizedUserAnswers: [],
    missingCriticalSignals: [],
    hasSufficientSignalsForPlanning: true,
    clarificationMode: 'sufficient',
    degraded: false,
    fallbackCount: 0,
    phase: 'clarify',
    clarifyRounds: 0,
  });
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

function buildClarifierPrompt(input: ClarifierInput): string {
  const snapshot = resolveGoalSignalsSnapshot(input);

  return `
Decide whether the planner still needs clarification before building the action plan.

Goal context:
- Goal: "${input.interpretation.parsedGoal}"
- Goal type: ${input.interpretation.goalType}
- Suggested domain: ${input.interpretation.suggestedDomain ?? 'null'}
- Candidate ambiguities from interpretation. They are only hints, not proof of a gap:
${formatAmbiguities(input.interpretation.ambiguities)}

Control-plane snapshot:
- Missing critical signals: ${JSON.stringify(snapshot.missingCriticalSignals)}
- Has sufficient signals for planning: ${snapshot.hasSufficientSignalsForPlanning}
- Clarification mode: ${snapshot.clarificationMode}
- Existing metric anchor: ${snapshot.metric ?? 'null'}
- Existing timeframe anchor: ${snapshot.timeframe ?? 'null'}

Stable answered signal ledger:
${formatSignalLedger(snapshot)}

Authoritative previous answers:
${formatPreviousAnswers(input.previousAnswers)}

Known profile context:
${input.profileSummary || 'null'}

Clarification policy:
- Universal critical signals come first.
- Use the suggested domain only to word the question better after you respect the signal list.
- Never invent a domain-specific gap outside the missing critical signals list.
- If the user chose to keep going with incomplete info (${input.skipClarification === true}), keep the unanswered critical signals explicit anyway.

Output invariants:
${formatInvariants()}

Silent checklist:
1. Review each missing critical signal against the answered signal ledger and profile context.
2. Mark a signal as CLOSED when there is already an explicit answer.
3. Never reopen a CLOSED signal.
4. Ask 0 questions only when the control-plane snapshot already has enough context for best-effort planning.
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
  "informationGaps": ["metric|timeframe|current_baseline|success_criteria|constraints|modality|resources|safety_context"],
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

function normalizeQuestion(value: unknown): ClarificationQuestion | null {
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
    id: normalizeText(record.id),
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

function inferGoalSignalKey(value: string): GoalSignalKey | null {
  const normalizedSignal = normalizeGoalSignalKey(value);
  if (normalizedSignal) {
    return normalizedSignal;
  }

  const normalizedText = normalizeWhitespace(value);
  for (const { signalKey, pattern } of SIGNAL_KEYWORD_PATTERNS) {
    if (pattern.test(normalizedText)) {
      return signalKey;
    }
  }

  return null;
}

function buildDeterministicQuestions(signalKeys: GoalSignalKey[]): Array<ClarificationQuestion & { signalKey: GoalSignalKey }> {
  return signalKeys.slice(0, MAX_CLARIFICATION_QUESTIONS).map((signalKey, index) => ({
    id: `q${index + 1}`,
    signalKey,
    ...SIGNAL_QUESTION_TEMPLATES[signalKey],
  }));
}

function normalizeClarificationRound(
  payload: Record<string, unknown>,
  input: ClarifierInput,
): ClarificationRound {
  const snapshot = resolveGoalSignalsSnapshot(input);
  const missingCriticalSignals = snapshot.missingCriticalSignals.slice(0, MAX_CLARIFICATION_QUESTIONS);
  const allowedSignals = new Set(missingCriticalSignals);
  const seenSignals = new Set<GoalSignalKey>();
  const seenQuestions = new Set<string>();
  const rawInformationGaps = normalizeStringList(payload.informationGaps, MAX_CLARIFICATION_QUESTIONS);
  const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [];
  const normalizedQuestions = rawQuestions
    .map((question, index) => {
      const normalizedQuestion = normalizeQuestion(question);
      if (!normalizedQuestion) {
        return null;
      }

      const record = question as Record<string, unknown>;
      const rawSignal = typeof record.signalKey === 'string'
        ? record.signalKey
        : rawInformationGaps[index] ?? normalizedQuestion.text;
      const signalKey = inferGoalSignalKey(rawSignal);

      if (!signalKey || !allowedSignals.has(signalKey)) {
        return null;
      }

      const normalizedText = normalizeWhitespace(normalizedQuestion.text);
      if (seenSignals.has(signalKey) || seenQuestions.has(normalizedText)) {
        return null;
      }

      seenSignals.add(signalKey);
      seenQuestions.add(normalizedText);

      return {
        ...normalizedQuestion,
        signalKey,
      };
    })
    .filter((question): question is ClarificationQuestion & { signalKey: GoalSignalKey } => question !== null);

  const effectiveQuestions = snapshot.hasSufficientSignalsForPlanning
    ? []
    : normalizedQuestions.length > 0
      ? normalizedQuestions
      : buildDeterministicQuestions(missingCriticalSignals);
  const effectiveSignals = effectiveQuestions.map((question) => question.signalKey);
  const readyToAdvance = snapshot.hasSufficientSignalsForPlanning;
  const reasoning = normalizeText(payload.reasoning)
    || (
      readyToAdvance
        ? 'Ya hay contexto suficiente para planificar en modo best-effort.'
        : `Siguen faltando senales criticas: ${missingCriticalSignals.join(', ')}.`
    );

  return ClarificationRoundSchema.parse({
    questions: readyToAdvance
      ? []
      : effectiveQuestions.map(({ signalKey: _signalKey, ...question }, index) => ({
          ...question,
          id: `q${index + 1}`,
        })),
    reasoning,
    informationGaps: readyToAdvance ? [] : effectiveSignals,
    confidence: normalizeConfidence(payload.confidence, readyToAdvance ? 0.75 : 0.35),
    readyToAdvance,
  });
}

function buildDeterministicRound(input: ClarifierInput): ClarificationRound {
  const snapshot = resolveGoalSignalsSnapshot(input);

  return normalizeClarificationRound(
    {
      questions: [],
      reasoning: snapshot.hasSufficientSignalsForPlanning
        ? 'No quedan senales criticas pendientes.'
        : 'Faltan senales criticas universales para planificar con realismo.',
      informationGaps: snapshot.missingCriticalSignals,
      confidence: snapshot.hasSufficientSignalsForPlanning ? 0.75 : 0.35,
      readyToAdvance: snapshot.hasSufficientSignalsForPlanning,
    },
    input,
  );
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
    return normalizeClarificationRound(parsed, input);
  },

  fallback(input: ClarifierInput): ClarificationRound {
    return buildDeterministicRound(input);
  },
};
