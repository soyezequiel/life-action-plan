import type { AgentRuntime } from '../../../runtime/types';
import { extractFirstJsonObject } from '../../../flow/agents/llm-json-parser';
import type {
  V6Agent,
  CriticReport,
  CriticFinding,
  DomainKnowledgeCard,
  GoalSignalsSnapshot,
} from '../types';

// ─── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_APPROVAL_THRESHOLD = 75;
const BUDGET_CONTEXT_PATTERN = /\b(presupuesto|budget|costo|coste|gasto|gastos|ingrediente|ingredientes|ahorro|dinero)\b/i;

type CriticCategory = CriticFinding['category'];

const ALL_CATEGORIES: CriticCategory[] = [
  'feasibility',
  'specificity',
  'progression',
  'scheduling',
  'motivation',
  'domain',
];

// ─── Input type ────────────────────────────────────────────────────────────

export interface CriticInput {
  goalText: string;
  goalType: string;
  profileSummary: string;
  strategicDraft: Record<string, unknown>;
  scheduleQualityScore: number;
  unscheduledCount: number;
  scheduleTradeoffs: string[];
  goalSignalsSnapshot: GoalSignalsSnapshot;
  domainCard: DomainKnowledgeCard | null;
  previousCriticReports: CriticReport[];
}

// ─── Domain card summary ───────────────────────────────────────────────────

function summarizeDomainCard(card: DomainKnowledgeCard | null): string {
  if (!card) return 'No domain card available';

  const constraints = card.constraints
    .map((c) => `- [${c.severity}] ${c.description}`)
    .join('\n');

  const progression = card.progression
    ? card.progression.levels
        .map((l) => `  ${l.levelId}: ${l.description} (exit: ${l.exitCriteria.join(', ')})`)
        .join('\n')
    : 'No progression ladder defined';

  return [
    `Domain: ${card.domainLabel}`,
    `Tasks: ${card.tasks.map((t) => t.label).join(', ')}`,
    `Constraints:\n${constraints}`,
    `Progression:\n${progression}`,
    `Evidence confidence: ${card.generationMeta.confidence}`,
  ].join('\n');
}

// ─── Previous reports context ──────────────────────────────────────────────

function summarizePreviousReports(reports: CriticReport[]): string {
  if (reports.length === 0) return '';

  const latest = reports[reports.length - 1];
  const criticalFindings = latest.mustFix
    .map((f) => `- [${f.category}] ${f.message}`)
    .join('\n');

  return [
    '\n## Previous critic feedback (most recent)',
    `Verdict: ${latest.verdict} (score: ${latest.overallScore})`,
    `Critical findings that were flagged:\n${criticalFindings || 'None'}`,
    'Evaluate whether these issues have been addressed in the current version.',
  ].join('\n');
}

function summarizeGoalSignalsSnapshot(snapshot: GoalSignalsSnapshot): string {
  const normalizedAnswers = snapshot.normalizedUserAnswers.length > 0
    ? snapshot.normalizedUserAnswers
      .map((entry) => `- [${entry.signalKey ?? 'sin-clave'}] ${entry.question}: ${entry.answer}`)
      .join('\n')
    : '- Ninguna respuesta normalizada';

  return [
    `Parsed goal: ${snapshot.parsedGoal ?? 'sin confirmar'}`,
    `Goal type: ${snapshot.goalType ?? 'sin confirmar'}`,
    `Metric: ${snapshot.metric ?? 'sin confirmar'}`,
    `Timeframe: ${snapshot.timeframe ?? 'sin confirmar'}`,
    `Anchor tokens: ${snapshot.anchorTokens.length > 0 ? snapshot.anchorTokens.join(', ') : 'ninguno'}`,
    `Risk flags: ${snapshot.riskFlags.length > 0 ? snapshot.riskFlags.join(', ') : 'ninguno'}`,
    `Clarification mode: ${snapshot.clarificationMode}`,
    `Has sufficient signals for planning: ${snapshot.hasSufficientSignalsForPlanning ? 'true' : 'false'}`,
    `Missing critical signals: ${snapshot.missingCriticalSignals.length > 0 ? snapshot.missingCriticalSignals.join(', ') : 'ninguno'}`,
    'Normalized user answers:',
    normalizedAnswers,
  ].join('\n');
}

// ─── LLM prompt ────────────────────────────────────────────────────────────

function buildCriticPrompt(input: CriticInput): string {
  const tradeoffs = input.scheduleTradeoffs.length > 0
    ? input.scheduleTradeoffs.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')
    : 'None reported';

  const previousContext = summarizePreviousReports(input.previousCriticReports);

  return `You are a plan quality critic. Your job is to find weaknesses that would cause this plan to fail in real life.

## The plan
Goal: ${input.goalText} (type: ${input.goalType})
User profile: ${input.profileSummary}

Strategy:
${JSON.stringify(input.strategicDraft, null, 2)}

Schedule quality score: ${input.scheduleQualityScore}
Unscheduled items: ${input.unscheduledCount}
Schedule tradeoffs:
${tradeoffs}

Universal goal signals (PRIMARY source of truth):
${summarizeGoalSignalsSnapshot(input.goalSignalsSnapshot)}

Domain overlay:
${summarizeDomainCard(input.domainCard)}
${previousContext}

## Important context about the pipeline

The strategy above is a HIGH-LEVEL roadmap of phases and milestones. A separate scheduler component (already executed) converts these phases into concrete weekly sessions with specific activities, durations, and frequencies. Do NOT penalize the strategy for lacking session-level detail (e.g. "how many times per week" or "what to do each day") — that is handled downstream and is already reflected in the schedule quality score above. Focus your evaluation on whether the strategic direction, progression, and signal alignment are sound.

Treat the provided goal, profile, signals snapshot, tradeoffs, and optional domain overlay as the full context. Do NOT invent hidden constraints. If budget, ingredient cost, equipment, allergies, family support, or deadlines are not explicitly present in that context, do not penalize the plan for ignoring them.
If clarificationMode is "degraded_skip" or missingCriticalSignals is non-empty, treat that as a quality/specificity risk in the available context. It is NOT permission to invent a different domain, a new mechanism, a new metric, or a new timeframe.

## Your evaluation

Analyze this plan in this order:
0. SIGNAL ALIGNMENT FIRST — before scoring anything else, verify whether the draft preserves the consolidated signals snapshot: metric, timeframe, anchor tokens, confirmed baseline, modality, constraints, risk flags, and normalized user answers. If the plan drifts from these signals, raise findings under specificity or feasibility.
1. SPECIFICITY
2. PROGRESSION
3. SCHEDULING
4. MOTIVATION
5. FEASIBILITY
6. DOMAIN OVERLAY

For each dimension, think carefully about whether the plan would actually work for a real person with these constraints.

Dimensions:
1. SPECIFICITY — Are phase goals and milestones measurable and concrete at a strategic level?
2. PROGRESSION — Is the difficulty curve realistic for this person?
3. SCHEDULING — Given the schedule quality score and tradeoffs above, are there red flags?
4. MOTIVATION — Will this person stay motivated? Are there early wins?
5. FEASIBILITY — Is anything critical missing or unrealistic at the strategic level?
6. DOMAIN — Only evaluate domain best practices if a domain card is explicitly available. If domainCard is null, do not penalize the plan for lacking domain-specific best practices. Without a domain card, only mention domain if the plan invents a new domain or mechanism that is unsupported by the goal/signals.

Score the overall plan 0-100 using weighted average:
- Specificity: 20%
- Progression: 25%
- Scheduling: 15%
- Motivation: 15%
- Feasibility: 15%
- Domain: 10%

For findings with severity 'critical', the verdict MUST be 'revise' or 'rethink'.
For findings with only 'warning' or 'info', the verdict can be 'approve' if overall score >= 75.

If the problem is fixable by adjusting the plan → verdict: 'revise'
If the problem requires more information from the user → verdict: 'rethink'

Output ONLY JSON:
{
  "overallScore": number,
  "findings": [{ "id": "f-1", "severity": "critical|warning|info", "category": "feasibility|specificity|progression|scheduling|motivation|domain", "message": "what is wrong", "suggestion": "how to fix it or null", "affectedPhaseIds": ["..."] }],
  "verdict": "approve|revise|rethink",
  "reasoning": "2-3 sentences explaining the verdict"
}`;
}

// ─── Response validation and normalization ─────────────────────────────────

function isValidCategory(value: string): value is CriticCategory {
  return ALL_CATEGORIES.includes(value as CriticCategory);
}

function isValidSeverity(value: string): value is CriticFinding['severity'] {
  return value === 'critical' || value === 'warning' || value === 'info';
}

function isValidVerdict(value: string): value is CriticReport['verdict'] {
  return value === 'approve' || value === 'revise' || value === 'rethink';
}

function normalizeFindings(raw: unknown[]): CriticFinding[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
    .map((f, i) => ({
      id: String(f.id ?? `f-${i + 1}`),
      severity: isValidSeverity(String(f.severity))
        ? String(f.severity) as CriticFinding['severity']
        : 'info',
      category: isValidCategory(String(f.category))
        ? String(f.category) as CriticCategory
        : 'feasibility',
      message: String(f.message ?? ''),
      suggestion: typeof f.suggestion === 'string' ? f.suggestion : null,
      affectedPhaseIds: Array.isArray(f.affectedPhaseIds) ? f.affectedPhaseIds.map(String) : [],
    }))
    .filter((f) => f.message.length > 0);
}

function enforceVerdictConsistency(report: CriticReport): CriticReport {
  const hasCritical = report.findings.some((f) => f.severity === 'critical');

  if (hasCritical && report.verdict === 'approve') {
    return { ...report, verdict: 'revise' };
  }

  if (!hasCritical && report.overallScore >= DEFAULT_APPROVAL_THRESHOLD && report.verdict === 'revise') {
    return { ...report, verdict: 'approve' };
  }

  if (report.overallScore < DEFAULT_APPROVAL_THRESHOLD && report.verdict === 'approve') {
    return { ...report, verdict: 'revise' };
  }

  return report;
}

function buildEvidenceContext(input: CriticInput): string {
  return [
    input.goalText,
    input.profileSummary,
    JSON.stringify(input.strategicDraft),
    input.scheduleTradeoffs.join('\n'),
    summarizeDomainCard(input.domainCard),
  ].join('\n');
}

function mentionsBudgetConstraint(finding: CriticFinding): boolean {
  return BUDGET_CONTEXT_PATTERN.test(`${finding.message} ${finding.suggestion ?? ''}`);
}

function reconcileUnsupportedFindings(report: CriticReport, input: CriticInput): CriticReport {
  const evidenceContext = buildEvidenceContext(input);
  const hasBudgetContext = BUDGET_CONTEXT_PATTERN.test(evidenceContext);
  let removedUnsupportedCritical = false;

  const findings = report.findings.filter((finding) => {
    if (!input.domainCard && finding.category === 'domain') {
      if (finding.severity === 'critical') {
        removedUnsupportedCritical = true;
      }
      return false;
    }

    if (mentionsBudgetConstraint(finding) && !hasBudgetContext) {
      if (finding.severity === 'critical') {
        removedUnsupportedCritical = true;
      }
      return false;
    }

    return true;
  });

  if (findings.length === report.findings.length) {
    return report;
  }

  const mustFix = findings.filter((finding) => finding.severity === 'critical');
  const shouldFix = findings.filter((finding) => finding.severity === 'warning');
  const overallScore = removedUnsupportedCritical && mustFix.length === 0
    ? Math.max(report.overallScore, DEFAULT_APPROVAL_THRESHOLD)
    : report.overallScore;

  return enforceVerdictConsistency({
    ...report,
    findings,
    mustFix,
    shouldFix,
    overallScore,
    reasoning: `${report.reasoning} Se descartaron hallazgos sin respaldo explicito en el contexto del usuario.`.trim(),
  });
}

function parseAndNormalize(raw: string): CriticReport {
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  const overallScore = Math.max(0, Math.min(100, Math.round(Number(parsed.overallScore ?? 50))));
  const findings = normalizeFindings(parsed.findings as unknown[]);
  const mustFix = findings.filter((f) => f.severity === 'critical');
  const shouldFix = findings.filter((f) => f.severity === 'warning');

  const verdict = isValidVerdict(String(parsed.verdict))
    ? String(parsed.verdict) as CriticReport['verdict']
    : mustFix.length > 0
      ? 'revise'
      : overallScore >= DEFAULT_APPROVAL_THRESHOLD
        ? 'approve'
        : 'revise';

  const reasoning = typeof parsed.reasoning === 'string' && parsed.reasoning.length > 0
    ? parsed.reasoning
    : `Score: ${overallScore}. ${mustFix.length} critical finding(s), ${shouldFix.length} warning(s).`;

  const report: CriticReport = {
    overallScore,
    findings,
    mustFix,
    shouldFix,
    verdict,
    reasoning,
  };

  return enforceVerdictConsistency(report);
}

// ─── Agent export ──────────────────────────────────────────────────────────

function buildFallbackReport(goalText: string): CriticReport {
  const finding = {
    id: 'f-fallback',
    severity: 'critical' as const,
    category: 'feasibility' as const,
    message: `Critic unavailable while reviewing "${goalText}". The plan cannot be approved without a real quality review.`,
    suggestion: 'Re-run the critic with a working provider before treating the plan as ready.',
    affectedPhaseIds: [],
  };

  return {
    overallScore: 35,
    findings: [finding],
    mustFix: [finding],
    shouldFix: [],
    verdict: 'revise',
    reasoning: `Critic unavailable while reviewing "${goalText}". Returning a degraded report, so the plan is not approved.`,
  };
}

export const criticAgent: V6Agent<CriticInput, CriticReport> = {
  name: 'critic',

  async execute(input: CriticInput, runtime: AgentRuntime): Promise<CriticReport> {
    const prompt = buildCriticPrompt(input);
    const response = await runtime.chat([{ role: 'user', content: prompt }]);
    const raw = extractFirstJsonObject(response.content);
    return reconcileUnsupportedFindings(parseAndNormalize(raw), input);
  },

  fallback(input: CriticInput): CriticReport {
    return buildFallbackReport(input.goalText);
  },
};
