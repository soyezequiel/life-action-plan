import type { HardFinding, SoftFinding, CoVeFinding, RepairAttemptRecord } from '../src/lib/pipeline/v5/phase-io-v5';

export interface NormalizedFinding {
  severity: 'FAIL' | 'WARN' | 'INFO';
  phase: string;
  category: string;
  code: string;
  message: string;
  probableRootCause: string;
  suggestedNextCheck: string;
  relatedFiles: string[];
}

interface FindingMeta {
  category: string;
  rootCause: string;
  nextCheck: string;
  relatedFiles: string[];
}

const HARD_FINDING_META: Record<string, FindingMeta> = {
  'HV-OVERLAP': {
    category: 'scheduling',
    rootCause: 'Solver placed two events in overlapping time slots',
    nextCheck: 'Check solver constraint matrix for non-overlap enforcement',
    relatedFiles: ['src/lib/scheduler/solver.ts', 'src/lib/pipeline/v5/hard-validator.ts'],
  },
  'HV-OUTSIDE_AWAKE_HOURS': {
    category: 'scheduling',
    rootCause: 'Activity placed outside user availability window after timezone conversion',
    nextCheck: 'Verify availability config and timezone handling in scheduler',
    relatedFiles: ['src/lib/scheduler/solver.ts', 'src/lib/pipeline/v5/scheduling-context.ts'],
  },
  'HV-OVERLAPS_WORK': {
    category: 'scheduling',
    rootCause: 'Activity scheduled during declared work/blocked hours',
    nextCheck: 'Check blocked slots definition passed to solver',
    relatedFiles: ['src/lib/scheduler/solver.ts', 'src/lib/pipeline/v5/hard-validator.ts'],
  },
  'HV-OVERLAPS_BLOCKED': {
    category: 'scheduling',
    rootCause: 'Activity falls on a user-declared blocked slot',
    nextCheck: 'Check blocked slots config and solver constraint generation',
    relatedFiles: ['src/lib/scheduler/solver.ts', 'src/lib/pipeline/v5/hard-validator.ts'],
  },
  'HV-DURATION': {
    category: 'consistency',
    rootCause: 'Scheduled event duration differs from requested activity duration',
    nextCheck: 'Check template-builder output vs scheduler event construction',
    relatedFiles: ['src/lib/pipeline/v5/template-builder.ts', 'src/lib/scheduler/solver.ts'],
  },
  'HV-FREQUENCY': {
    category: 'scheduling',
    rootCause: 'Not enough slots available to satisfy hard-constraint frequency',
    nextCheck: 'Check availability windows vs activity count and duration demands',
    relatedFiles: ['src/lib/scheduler/solver.ts', 'src/lib/pipeline/v5/template-builder.ts'],
  },
  'HV-DAY-OVER-CAPACITY': {
    category: 'capacity',
    rootCause: 'Total scheduled minutes on a single day exceed profile free hours',
    nextCheck: 'Review profile freeHoursWeekday/Weekend vs template activity load',
    relatedFiles: ['src/lib/pipeline/v5/hard-validator.ts', 'src/lib/pipeline/v5/profile.ts'],
  },
};

const SOFT_FINDING_META: Record<string, FindingMeta> = {
  'SV-CONTEXT-SWITCH': {
    category: 'energy',
    rootCause: 'A→B→A pattern detected within same day, causing unnecessary context switches',
    nextCheck: 'Review scheduler preference constraints for activity grouping',
    relatedFiles: ['src/lib/pipeline/v5/soft-validator.ts', 'src/lib/scheduler/solver.ts'],
  },
  'SV-LATE-DEEPWORK': {
    category: 'energy',
    rootCause: 'Long activity (>=60min) scheduled after 21:00 local time',
    nextCheck: 'Check availability end time and scheduler time-of-day preferences',
    relatedFiles: ['src/lib/pipeline/v5/soft-validator.ts', 'src/lib/scheduler/solver.ts'],
  },
  'SV-NO-REST': {
    category: 'energy',
    rootCause: 'Activities scheduled on all 7 days with no full rest day',
    nextCheck: 'Consider adding rest-day constraint or reducing weekly frequency',
    relatedFiles: ['src/lib/pipeline/v5/soft-validator.ts', 'src/lib/pipeline/v5/template-builder.ts'],
  },
  'SV-RAMP-UP': {
    category: 'capacity',
    rootCause: 'Total weekly activity load exceeds 15 hours (aggressive for new habits)',
    nextCheck: 'Review template activity durations and frequencies',
    relatedFiles: ['src/lib/pipeline/v5/soft-validator.ts', 'src/lib/pipeline/v5/template-builder.ts'],
  },
  'SV-MONOTONY': {
    category: 'energy',
    rootCause: 'Same activity scheduled 7+ times per week without variation',
    nextCheck: 'Review strategy phase diversification and template frequency',
    relatedFiles: ['src/lib/pipeline/v5/soft-validator.ts', 'src/lib/pipeline/v5/strategy.ts'],
  },
};

const COVE_FINDING_META: Record<string, FindingMeta> = {
  'COVE-REST': {
    category: 'energy',
    rootCause: 'Chain-of-verification detected rest day insufficiency',
    nextCheck: 'Check weekly event distribution and rest day gaps',
    relatedFiles: ['src/lib/pipeline/v5/cove-verifier.ts'],
  },
  'COVE-DISTRIBUTION': {
    category: 'scheduling',
    rootCause: 'Sessions concentrated in few days rather than spread across week',
    nextCheck: 'Review scheduler distribution constraints and preferences',
    relatedFiles: ['src/lib/pipeline/v5/cove-verifier.ts', 'src/lib/scheduler/solver.ts'],
  },
  'COVE-OVERLAP': {
    category: 'scheduling',
    rootCause: 'Calendar events have real temporal overlaps',
    nextCheck: 'Check solver non-overlap constraint enforcement',
    relatedFiles: ['src/lib/pipeline/v5/cove-verifier.ts', 'src/lib/scheduler/solver.ts'],
  },
  'COVE-OTHER': {
    category: 'consistency',
    rootCause: 'LLM-generated verification finding outside standard categories',
    nextCheck: 'Review the specific finding message for domain-specific guidance',
    relatedFiles: ['src/lib/pipeline/v5/cove-verifier.ts'],
  },
};

const DEFAULT_META: FindingMeta = {
  category: 'unknown',
  rootCause: 'Unknown finding code — review the finding message for context',
  nextCheck: 'Check the validator that produced this code',
  relatedFiles: [],
};

function getMeta(code: string, table: Record<string, FindingMeta>): FindingMeta {
  return table[code] ?? DEFAULT_META;
}

export function normalizeHardFindings(findings: HardFinding[]): NormalizedFinding[] {
  return findings.map((f) => {
    const meta = getMeta(f.code, HARD_FINDING_META);
    return {
      severity: f.severity,
      phase: 'hardValidate',
      category: meta.category,
      code: f.code,
      message: f.description,
      probableRootCause: meta.rootCause,
      suggestedNextCheck: meta.nextCheck,
      relatedFiles: meta.relatedFiles,
    };
  });
}

export function normalizeSoftFindings(findings: SoftFinding[]): NormalizedFinding[] {
  return findings.map((f) => {
    const meta = getMeta(f.code, SOFT_FINDING_META);
    return {
      severity: f.severity,
      phase: 'softValidate',
      category: meta.category,
      code: f.code,
      message: f.suggestion_esAR,
      probableRootCause: meta.rootCause,
      suggestedNextCheck: meta.nextCheck,
      relatedFiles: meta.relatedFiles,
    };
  });
}

export function normalizeCoveFindings(findings: CoVeFinding[]): NormalizedFinding[] {
  return findings.map((f) => {
    const meta = getMeta(f.code, COVE_FINDING_META);
    return {
      severity: f.severity,
      phase: 'coveVerify',
      category: meta.category,
      code: f.code,
      message: f.answer,
      probableRootCause: meta.rootCause,
      suggestedNextCheck: meta.nextCheck,
      relatedFiles: meta.relatedFiles,
    };
  });
}

export function normalizeRepairAttempts(attempts: RepairAttemptRecord[]): NormalizedFinding[] {
  return attempts
    .filter((a) => a.decision !== 'committed')
    .map((a) => ({
      severity: (a.decision === 'escalated' ? 'WARN' : 'INFO') as 'WARN' | 'INFO',
      phase: 'repair',
      category: 'repair',
      code: `REPAIR-${a.decision.toUpperCase()}`,
      message: a.decision === 'escalated'
        ? `Repair escalated: score ${a.baselineScore} -> ${a.candidateScore}, patch ${a.candidate?.type ?? 'none'} on ${a.candidate?.targetId ?? 'unknown'}`
        : `Repair reverted: candidate score ${a.candidateScore} did not improve baseline ${a.baselineScore}`,
      probableRootCause: a.decision === 'escalated'
        ? 'Repair manager could not find a viable patch for remaining findings'
        : 'Candidate patch degraded or did not improve the schedule quality',
      suggestedNextCheck: 'Review remaining findings and consider manual schedule adjustment',
      relatedFiles: ['src/lib/pipeline/v5/repair-manager.ts'],
    }));
}

export function normalizeAllFindings(
  hard: HardFinding[],
  soft: SoftFinding[],
  cove: CoVeFinding[],
  repairAttempts: RepairAttemptRecord[],
): NormalizedFinding[] {
  const all = [
    ...normalizeHardFindings(hard),
    ...normalizeSoftFindings(soft),
    ...normalizeCoveFindings(cove),
    ...normalizeRepairAttempts(repairAttempts),
  ];

  const severityOrder: Record<string, number> = { FAIL: 0, WARN: 1, INFO: 2 };
  return all.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));
}
