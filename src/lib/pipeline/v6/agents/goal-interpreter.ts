import type { AgentRuntime } from '../../../runtime/types';
import { extractFirstJsonObject } from '../../../flow/agents/llm-json-parser';
import { classifyGoal } from '../../shared/classify';
import type {
  GoalDomainRisk,
  GoalInterpretation,
  GoalType,
  V6Agent,
} from '../types';
import {
  GoalDomainRiskSchema,
  GoalInterpretationSchema,
  GoalTypeSchema,
} from '../types';

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueValues = new Set<string>();

  for (const item of value) {
    const normalized = normalizeText(item);
    if (normalized.length > 0) {
      uniqueValues.add(normalized);
    }
    if (uniqueValues.size >= maxItems) {
      break;
    }
  }

  return Array.from(uniqueValues);
}

function normalizeGoalType(value: unknown, fallback: GoalType): GoalType {
  const parsed = GoalTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function normalizeRiskFlags(value: unknown, fallback: GoalDomainRisk): GoalDomainRisk[] {
  const parsedFlags = Array.isArray(value)
    ? value
        .map((item) => GoalDomainRiskSchema.safeParse(item))
        .filter((result): result is { success: true; data: GoalDomainRisk } => result.success)
        .map((result) => result.data)
    : [];

  const uniqueFlags = Array.from(new Set(parsedFlags));

  if (uniqueFlags.length === 0) {
    return [fallback];
  }

  if (fallback !== 'LOW' && !uniqueFlags.includes(fallback)) {
    uniqueFlags.push(fallback);
  }

  const nonLowFlags = uniqueFlags.filter((flag) => flag !== 'LOW');
  return nonLowFlags.length > 0 ? nonLowFlags : ['LOW'];
}

function normalizeConfidence(value: unknown, fallback: number): number {
  const numericValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, numericValue));
}

function buildGoalInterpreterPrompt(goalText: string, heuristicSummary: string): string {
  return `
Analyze this personal goal step by step:

Goal: "${goalText}"

Existing heuristic signals from the v5 classifier:
${heuristicSummary}

Step 1 — Classification: What type of goal is this? Consider these types: RECURRENT_HABIT, SKILL_ACQUISITION, FINITE_PROJECT, QUANT_TARGET_TRACKING, IDENTITY_EXPLORATION, RELATIONAL_EMOTIONAL, HIGH_UNCERTAINTY_TRANSFORM

Step 2 — Risk assessment: Does this goal involve health, finance, legal, or other high-risk domains?

Step 3 — Implicit assumptions: What is the user probably assuming without stating it? List 2-4 assumptions.

Step 4 — Ambiguities: What critical information is missing that would change the plan? List 2-5 ambiguities ordered by importance.

Step 5 — Domain: What knowledge domain does this fall into? (e.g., "running", "guitar", "programming", "weight-loss")

After reasoning, output ONLY this JSON:
{
  "parsedGoal": "clear reformulation of the goal",
  "goalType": "one of the 7 types",
  "confidence": 0.0-1.0,
  "implicitAssumptions": ["..."],
  "ambiguities": ["..."],
  "riskFlags": ["LOW" | "MEDIUM" | "HIGH_HEALTH" | "HIGH_FINANCE" | "HIGH_LEGAL"],
  "suggestedDomain": "domain label or null"
}
`.trim();
}

function normalizeInterpretation(
  payload: Record<string, unknown>,
  goalText: string,
  heuristic: ReturnType<typeof classifyGoal>,
): GoalInterpretation {
  return GoalInterpretationSchema.parse({
    parsedGoal: normalizeText(payload.parsedGoal) || goalText.trim(),
    goalType: normalizeGoalType(payload.goalType, heuristic.goalType),
    confidence: normalizeConfidence(payload.confidence, heuristic.confidence),
    implicitAssumptions: normalizeStringList(payload.implicitAssumptions, 4),
    ambiguities: normalizeStringList(payload.ambiguities, 5),
    riskFlags: normalizeRiskFlags(payload.riskFlags, heuristic.risk),
    suggestedDomain: normalizeOptionalText(payload.suggestedDomain),
  });
}

export const goalInterpreterAgent: V6Agent<{ goalText: string }, GoalInterpretation> = {
  name: 'goal-interpreter',

  async execute(
    input: { goalText: string },
    runtime: AgentRuntime,
  ): Promise<GoalInterpretation> {
    const heuristic = classifyGoal(input.goalText);
    const heuristicSummary = JSON.stringify({
      goalType: heuristic.goalType,
      confidence: heuristic.confidence,
      risk: heuristic.risk,
      extractedSignals: heuristic.extractedSignals,
    }, null, 2);

    try {
      const response = await runtime.chat([{
        role: 'user',
        content: buildGoalInterpreterPrompt(input.goalText, heuristicSummary),
      }]);
      const raw = extractFirstJsonObject(response.content);
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return normalizeInterpretation(parsed, input.goalText, heuristic);
    } catch {
      return goalInterpreterAgent.fallback(input);
    }
  },

  fallback(input: { goalText: string }): GoalInterpretation {
    const heuristic = classifyGoal(input.goalText);

    return GoalInterpretationSchema.parse({
      parsedGoal: input.goalText.trim(),
      goalType: heuristic.goalType,
      confidence: heuristic.confidence,
      implicitAssumptions: [],
      ambiguities: [],
      riskFlags: [heuristic.risk],
      suggestedDomain: null,
    });
  },
};
