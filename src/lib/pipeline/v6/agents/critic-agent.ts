import type { AgentRuntime } from '../../../runtime/types';
import { extractFirstJsonObject } from '../../../flow/agents/llm-json-parser';
import type {
  V6Agent,
  CriticReport,
  CriticFinding,
  DomainKnowledgeCard,
} from '../types';

// ─── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_APPROVAL_THRESHOLD = 75;

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

Domain knowledge:
${summarizeDomainCard(input.domainCard)}
${previousContext}

## Your evaluation

Analyze this plan against these 6 dimensions. For each dimension, think carefully about whether the plan would actually work for a real person with these constraints.

Dimensions:
1. SPECIFICITY — Are goals and milestones measurable and concrete?
2. PROGRESSION — Is the difficulty curve realistic for this person?
3. SCHEDULING — Are activities well-placed given energy patterns and commitments?
4. MOTIVATION — Will this person stay motivated? Are there early wins?
5. FEASIBILITY — Is anything critical missing or unrealistic?
6. DOMAIN — Does the plan follow domain best practices?

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
    return parseAndNormalize(raw);
  },

  fallback(input: CriticInput): CriticReport {
    return buildFallbackReport(input.goalText);
  },
};
