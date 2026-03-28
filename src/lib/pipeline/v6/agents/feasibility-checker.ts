import type { AgentRuntime } from '../../../runtime/types';
import { extractFirstJsonObject } from '../../../flow/agents/llm-json-parser';
import type {
  V6Agent,
  FeasibilityReport,
  FeasibilityConflict,
  FeasibilityAdjustment,
  StrategicDraft,
} from '../types';

// ─── Input type ────────────────────────────────────────────────────────────

export interface FeasibilityInput {
  strategicDraft: StrategicDraft;
  freeHoursWeekday: number;
  freeHoursWeekend: number;
  energyPattern: string;
  fixedCommitments: string[];
  scheduleConstraints: string[];
}

// ─── Phase extraction ──────────────────────────────────────────────────────

interface ExtractedPhase {
  id: string;
  label: string;
  hoursPerWeek: number;
  energyLevel: string;
  startWeek: number;
  endWeek: number;
  dependsOn: string[];
}

function extractPhases(draft: StrategicDraft): ExtractedPhase[] {
  return draft.phases.map((p, i) => {
    const raw = p as unknown as Record<string, unknown>;
    return {
      id: String(raw.id ?? raw.phaseId ?? `phase-${i}`),
      label: p.name,
      hoursPerWeek: Number(raw.hoursPerWeek ?? raw.hsSemanales ?? 0),
      energyLevel: String(raw.energyLevel ?? raw.energia ?? 'medium'),
      startWeek: Number(raw.startWeek ?? raw.semanaInicio ?? 0),
      endWeek: Number(raw.endWeek ?? raw.semanaFin ?? (p.durationWeeks ? (Number(raw.startWeek ?? 0) + (p.durationWeeks - 1)) : Number(raw.startWeek ?? 0))),
      dependsOn: Array.isArray(raw.dependsOn) ? (raw.dependsOn as string[]) : [],
    };
  });
}

// ─── Deterministic checks ──────────────────────────────────────────────────

function computeWeeklyAvailable(input: FeasibilityInput): number {
  return (input.freeHoursWeekday * 5) + (input.freeHoursWeekend * 2);
}

interface HourBudgetResult {
  required: number;
  gap: number;
  conflicts: FeasibilityConflict[];
}

function checkHourBudget(phases: ExtractedPhase[], availableHours: number): HourBudgetResult {
  const weekLoads = new Map<number, { hours: number; phaseIds: string[] }>();

  for (const phase of phases) {
    const end = Math.max(phase.endWeek, phase.startWeek);
    for (let week = phase.startWeek; week <= end; week++) {
      const existing = weekLoads.get(week) ?? { hours: 0, phaseIds: [] };
      existing.hours += phase.hoursPerWeek;
      existing.phaseIds.push(phase.id);
      weekLoads.set(week, existing);
    }
  }

  let peakWeek = 0;
  let peakHours = 0;
  let peakPhaseIds: string[] = [];

  for (const [week, load] of weekLoads) {
    if (load.hours > peakHours) {
      peakWeek = week;
      peakHours = load.hours;
      peakPhaseIds = load.phaseIds;
    }
  }

  const totalRequired = phases.reduce((sum, p) => sum + p.hoursPerWeek, 0);
  const gap = peakHours - availableHours;
  const conflicts: FeasibilityConflict[] = [];

  if (gap > 0) {
    conflicts.push({
      description: `Peak load in week ${peakWeek}: ${peakHours}h required but only ${availableHours}h available (gap: ${gap}h).`,
      severity: gap > availableHours * 0.5 ? 'blocking' : 'warning',
      affectedPhases: [...new Set(peakPhaseIds)],
    });
  }

  return { required: totalRequired, gap: Math.max(0, gap), conflicts };
}

interface EnergyBudgetResult {
  highEnergyNeeded: number;
  highEnergyAvailable: number;
  conflicts: FeasibilityConflict[];
}

function checkEnergyBudget(phases: ExtractedPhase[], energyPattern: string): EnergyBudgetResult {
  const highEnergyPhases = phases.filter(
    (p) => p.energyLevel === 'high' || p.energyLevel === 'alta',
  );

  const patternLower = energyPattern.toLowerCase();
  const estimatedDailyHighEnergy =
    patternLower.includes('morning') || patternLower.includes('matutino') || patternLower.includes('mañana')
      ? 4
      : patternLower.includes('night') || patternLower.includes('nocturno') || patternLower.includes('noche')
        ? 3
        : 3.5;

  const weeklyHighEnergy = estimatedDailyHighEnergy * 5;
  const totalHighEnergyNeeded = highEnergyPhases.reduce(
    (sum, p) => sum + Math.min(p.hoursPerWeek, estimatedDailyHighEnergy),
    0,
  );

  const conflicts: FeasibilityConflict[] = [];
  if (highEnergyPhases.length > 1 && totalHighEnergyNeeded > weeklyHighEnergy) {
    conflicts.push({
      description: `${highEnergyPhases.length} phases require high-energy slots (${totalHighEnergyNeeded}h/week needed) but estimated availability is ${weeklyHighEnergy}h/week.`,
      severity: 'warning',
      affectedPhases: highEnergyPhases.map((p) => p.id),
    });
  }

  return { highEnergyNeeded: totalHighEnergyNeeded, highEnergyAvailable: weeklyHighEnergy, conflicts };
}

function checkOverlaps(phases: ExtractedPhase[]): FeasibilityConflict[] {
  const conflicts: FeasibilityConflict[] = [];

  for (let i = 0; i < phases.length; i++) {
    for (let j = i + 1; j < phases.length; j++) {
      const a = phases[i];
      const b = phases[j];
      const overlapStart = Math.max(a.startWeek, b.startWeek);
      const overlapEnd = Math.min(
        Math.max(a.endWeek, a.startWeek),
        Math.max(b.endWeek, b.startWeek),
      );

      if (overlapStart <= overlapEnd) {
        const combinedLoad = a.hoursPerWeek + b.hoursPerWeek;
        if (combinedLoad > 15) {
          conflicts.push({
            description: `"${a.label}" and "${b.label}" overlap in weeks ${overlapStart}-${overlapEnd} with combined load of ${combinedLoad}h/week.`,
            severity: combinedLoad > 25 ? 'blocking' : 'warning',
            affectedPhases: [a.id, b.id],
          });
        }
      }
    }
  }

  return conflicts;
}

function checkDependencyCycles(phases: ExtractedPhase[]): FeasibilityConflict[] {
  const phaseMap = new Map(phases.map((p) => [p.id, p]));
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const conflicts: FeasibilityConflict[] = [];

  function dfs(phaseId: string, path: string[]): boolean {
    if (inStack.has(phaseId)) {
      const cycleStart = path.indexOf(phaseId);
      const cycle = path.slice(cycleStart);
      conflicts.push({
        description: `Dependency cycle detected: ${cycle.join(' → ')} → ${phaseId}.`,
        severity: 'blocking',
        affectedPhases: cycle,
      });
      return true;
    }
    if (visited.has(phaseId)) return false;

    visited.add(phaseId);
    inStack.add(phaseId);

    const phase = phaseMap.get(phaseId);
    if (phase) {
      for (const dep of phase.dependsOn) {
        if (dfs(dep, [...path, phaseId])) return true;
      }
    }

    inStack.delete(phaseId);
    return false;
  }

  for (const phase of phases) {
    for (const depId of phase.dependsOn) {
      const dep = phaseMap.get(depId);
      if (dep && dep.endWeek > phase.startWeek) {
        conflicts.push({
          description: `"${phase.label}" depends on "${dep.label}" but "${dep.label}" ends in week ${dep.endWeek} while "${phase.label}" starts in week ${phase.startWeek}.`,
          severity: 'blocking',
          affectedPhases: [phase.id, depId],
        });
      }
    }
  }

  for (const phase of phases) {
    if (!visited.has(phase.id)) {
      dfs(phase.id, []);
    }
  }

  return conflicts;
}

// ─── Status determination ──────────────────────────────────────────────────

function determineStatus(
  conflicts: FeasibilityConflict[],
  gap: number,
  availableHours: number,
): 'feasible' | 'tight' | 'infeasible' {
  if (conflicts.some((c) => c.severity === 'blocking')) return 'infeasible';
  if (conflicts.some((c) => c.severity === 'warning') || (gap > 0 && gap <= availableHours * 0.2)) return 'tight';
  return 'feasible';
}

// ─── LLM suggestion generation ─────────────────────────────────────────────

function buildPhaseSummary(phases: ExtractedPhase[]): string {
  return phases.map((p) =>
    `- ${p.label} (${p.id}): ${p.hoursPerWeek}h/week, weeks ${p.startWeek}-${p.endWeek}, energy: ${p.energyLevel}`,
  ).join('\n');
}

function buildFindingsSummary(conflicts: FeasibilityConflict[]): string {
  if (conflicts.length === 0) return 'No issues found.';
  return conflicts.map((c, i) =>
    `${i + 1}. [${c.severity}] ${c.description} (phases: ${c.affectedPhases.join(', ')})`,
  ).join('\n');
}

async function generateLlmSuggestions(
  runtime: AgentRuntime,
  input: FeasibilityInput,
  phases: ExtractedPhase[],
  conflicts: FeasibilityConflict[],
  requiredHours: number,
  availableHours: number,
  gap: number,
): Promise<FeasibilityAdjustment[]> {
  const commitments = input.fixedCommitments.length > 0
    ? input.fixedCommitments.join(', ')
    : 'None declared';

  const response = await runtime.chat([{
    role: 'user',
    content: `You are evaluating whether a personal plan is feasible given the user's real constraints.

Plan summary:
${buildPhaseSummary(phases)}

User constraints:
- Free hours weekday: ${input.freeHoursWeekday}h
- Free hours weekend: ${input.freeHoursWeekend}h
- Total weekly available: ${availableHours}h
- Energy pattern: ${input.energyPattern}
- Fixed commitments: ${commitments}

Hour budget analysis:
- Required: ${requiredHours}h/week
- Available: ${availableHours}h/week
- Gap: ${gap}h/week

Issues found:
${buildFindingsSummary(conflicts)}

For each issue, suggest a concrete adjustment. Adjustments must be specific:
- "Reduce Phase 2 from 8h/week to 5h/week by focusing only on X"
- "Extend timeline from 12 weeks to 16 weeks to reduce weekly load"
- NOT "consider reducing hours" (too vague)

Output ONLY JSON:
{
  "suggestions": [{ "type": "reduce_hours|extend_timeline|drop_phase|reorder", "description": "specific change", "impact": "what improves and what is sacrificed" }]
}`,
  }]);

  const raw = extractFirstJsonObject(response.content);
  const parsed = JSON.parse(raw) as { suggestions?: FeasibilityAdjustment[] };

  if (!Array.isArray(parsed.suggestions)) return [];

  const validTypes = ['reduce_hours', 'extend_timeline', 'drop_phase', 'reorder'];
  return parsed.suggestions.filter(
    (s) =>
      typeof s.type === 'string'
      && validTypes.includes(s.type)
      && typeof s.description === 'string'
      && typeof s.impact === 'string',
  );
}

// ─── Agent export ──────────────────────────────────────────────────────────

export const feasibilityCheckerAgent: V6Agent<FeasibilityInput, FeasibilityReport> = {
  name: 'feasibility-checker',

  async execute(input: FeasibilityInput, runtime: AgentRuntime): Promise<FeasibilityReport> {
    const phases = extractPhases(input.strategicDraft);
    const availableHours = computeWeeklyAvailable(input);

    const hourResult = checkHourBudget(phases, availableHours);
    const energyResult = checkEnergyBudget(phases, input.energyPattern);
    const overlapConflicts = checkOverlaps(phases);
    const dependencyConflicts = checkDependencyCycles(phases);

    const allConflicts = [
      ...hourResult.conflicts,
      ...energyResult.conflicts,
      ...overlapConflicts,
      ...dependencyConflicts,
    ];

    const status = determineStatus(allConflicts, hourResult.gap, availableHours);

    let suggestions: FeasibilityAdjustment[] = [];
    if (allConflicts.length > 0 || status === 'tight') {
      try {
        suggestions = await generateLlmSuggestions(
          runtime,
          input,
          phases,
          allConflicts,
          hourResult.required,
          availableHours,
          hourResult.gap,
        );
      } catch {
        // Fallback: deterministic analysis only, no suggestions
      }
    }

    return {
      status,
      hoursBudget: {
        available: availableHours,
        required: hourResult.required,
        gap: hourResult.gap,
      },
      energyAnalysis: {
        highEnergyNeeded: energyResult.highEnergyNeeded,
        highEnergyAvailable: energyResult.highEnergyAvailable,
      },
      conflicts: allConflicts,
      suggestions,
    };
  },

  fallback(input: FeasibilityInput): FeasibilityReport {
    const availableHours = computeWeeklyAvailable(input);
    const highEnergyAvailable = checkEnergyBudget([], input.energyPattern).highEnergyAvailable;

    return {
      status: 'feasible',
      hoursBudget: { available: availableHours, required: 0, gap: 0 },
      energyAnalysis: { highEnergyNeeded: 0, highEnergyAvailable: highEnergyAvailable },
      conflicts: [],
      suggestions: [],
    };
  },
};
