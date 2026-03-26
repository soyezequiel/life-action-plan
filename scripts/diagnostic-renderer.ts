import type { DiagnosticReport, PhaseRow } from './diagnostic-collector';
import type { NormalizedFinding } from './diagnostic-findings';

export type RenderMode = 'human' | 'json' | 'verbose';

// ─── Formatting helpers ─────────────────────────────────────────────────────

function pad(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function formatMs(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusIcon(status: PhaseRow['status']): string {
  switch (status) {
    case 'ok': return '[ok]';
    case 'warn': return '[!!]';
    case 'fail': return '[XX]';
    case 'skipped': return '[--]';
  }
}

function severityTag(severity: string): string {
  return `[${severity}]`;
}

function line(char: string, len: number): string {
  return char.repeat(len);
}

// ─── Section renderers ──────────────────────────────────────────────────────

function renderRunSummary(report: DiagnosticReport): string {
  const r = report.run;
  const border = line('=', 56);
  const dateStr = r.startedAt ? new Date(r.startedAt).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : 'unknown';
  const lines = [
    border,
    ' LAP V5 Pipeline Diagnostic Report',
    border,
    ` Date:      ${dateStr}`,
    ` Model:     ${r.modelId}`,
    ` Auth:      ${r.authMode}`,
    ` Duration:  ${formatMs(r.durationMs)}`,
    ` Result:    ${r.status.toUpperCase()}`,
    ` Quality:   ${r.qualityScore !== null ? r.qualityScore.toFixed(2) : 'N/A'}`,
    ` Output:    ${r.outputFile}`,
    border,
  ];
  return lines.join('\n');
}

function renderClassification(report: DiagnosticReport): string {
  const c = report.classification;
  if (!c.goalType) return '';
  return [
    '',
    '--- Classification ---',
    `  Goal type:   ${c.goalType}`,
    `  Confidence:  ${c.confidence !== null ? c.confidence.toFixed(2) : 'N/A'}`,
    `  Risk:        ${c.risk ?? 'N/A'}`,
  ].join('\n');
}

function renderProfile(report: DiagnosticReport): string {
  const p = report.profile;
  if (p.freeHoursWeekday === null) return '';
  return [
    '',
    '--- Profile ---',
    `  Free hours:    ${p.freeHoursWeekday}h weekday / ${p.freeHoursWeekend}h weekend`,
    `  Energy:        ${p.energyLevel ?? 'N/A'}`,
    `  Constraints:   ${p.constraintsCount}`,
  ].join('\n');
}

function renderPhaseTable(report: DiagnosticReport): string {
  const header = `${pad('Phase', 16)} ${pad('Status', 6)} ${pad('Time', 9)} Key Metric`;
  const separator = line('-', 80);
  const rows = report.phases.map((p) =>
    `${pad(p.phase, 16)} ${pad(statusIcon(p.status), 6)} ${pad(formatMs(p.durationMs), 9)} ${p.keyMetric}`,
  );

  const totalMs = report.phases.reduce((sum, p) => sum + (p.durationMs ?? 0), 0);
  const completedCount = report.phases.filter((p) => p.status !== 'skipped').length;
  const totalRow = `${pad('Total', 16)} ${pad('', 6)} ${pad(formatMs(totalMs), 9)} ${completedCount}/${report.phases.length} phases complete`;

  return ['', '--- Phase Status ---', header, separator, ...rows, separator, totalRow].join('\n');
}

function renderFindings(findings: NormalizedFinding[]): string {
  if (findings.length === 0) return '';

  const failCount = findings.filter((f) => f.severity === 'FAIL').length;
  const warnCount = findings.filter((f) => f.severity === 'WARN').length;
  const infoCount = findings.filter((f) => f.severity === 'INFO').length;

  const parts: string[] = [];
  if (failCount > 0) parts.push(`${failCount} FAIL`);
  if (warnCount > 0) parts.push(`${warnCount} WARN`);
  if (infoCount > 0) parts.push(`${infoCount} INFO`);

  const lines: string[] = ['', `--- Findings (${parts.join(', ')}) ---`];

  for (const f of findings) {
    lines.push('');
    lines.push(`  ${severityTag(f.severity)} ${f.phase} | ${f.category} | ${f.code}`);
    lines.push(`    ${f.message}`);
    lines.push(`    Root cause: ${f.probableRootCause}`);
    lines.push(`    Next check: ${f.suggestedNextCheck}`);
    if (f.relatedFiles.length > 0) {
      lines.push(`    Files: ${f.relatedFiles.join(', ')}`);
    }
  }

  return lines.join('\n');
}

function renderSchedulerBlock(report: DiagnosticReport): string {
  const s = report.scheduler;
  if (s.fillRate === null) return '';

  const lines = [
    '',
    '--- Scheduler ---',
    `  Fill rate:       ${s.fillRate.toFixed(2)}`,
    `  Solver status:   ${s.solverStatus ?? 'N/A'}`,
    `  Solver time:     ${formatMs(s.solverTimeMs)}`,
    `  Events placed:   ${s.eventsPlaced} / ${s.eventsRequested} requested`,
  ];

  if (s.unscheduled.length > 0) {
    lines.push(`  Unscheduled (${s.unscheduled.length}):`);
    for (const u of s.unscheduled) {
      lines.push(`    - ${u.activityId}: ${u.reason}`);
    }
  }

  return lines.join('\n');
}

function renderRepairBlock(report: DiagnosticReport): string {
  const r = report.repair;
  if (r.status === 'none' || r.status === 'clean') {
    return ['', '--- Repair Loop ---', `  Status: ${r.status === 'clean' ? 'Clean pass - no repair needed' : 'Not triggered'}`].join('\n');
  }

  const lines = [
    '',
    '--- Repair Loop ---',
    `  Cycles:  ${r.cycles}`,
    `  Status:  ${r.status}`,
  ];

  for (const cycle of r.timeline) {
    lines.push(`  Cycle ${cycle.cycle}: ${cycle.findingsBefore} findings -> ${cycle.patchesApplied} patches (${cycle.scoreBefore?.toFixed(2) ?? '?'} -> ${cycle.scoreAfter?.toFixed(2) ?? '?'}) [${cycle.status}]`);
  }

  return lines.join('\n');
}

function renderQualityBlock(report: DiagnosticReport): string {
  const q = report.quality;
  const lines = [
    '',
    '--- Quality Gate ---',
    `  Score:     ${q.qualityScore !== null ? q.qualityScore.toFixed(2) : 'N/A'}`,
    `  Items:     ${q.itemsCount}`,
    `  Warnings:  ${q.warningsCount}`,
  ];

  if (q.warnings.length > 0) {
    for (const w of q.warnings) {
      lines.push(`    - ${w}`);
    }
  }

  return lines.join('\n');
}

// ─── Agent JSON ─────────────────────────────────────────────────────────────

function buildAgentJson(report: DiagnosticReport): Record<string, unknown> {
  const phasesMap: Record<string, unknown> = {};
  for (const p of report.phases) {
    phasesMap[p.phase] = {
      status: p.status,
      durationMs: p.durationMs,
      keyMetric: p.keyMetric,
    };
  }

  return {
    diagnostic: true,
    version: 1,
    status: report.run.status,
    modelId: report.run.modelId,
    durationMs: report.run.durationMs,
    qualityScore: report.run.qualityScore,
    classification: report.classification,
    profile: report.profile,
    phases: phasesMap,
    findings: report.findings.map((f) => ({
      severity: f.severity,
      phase: f.phase,
      category: f.category,
      code: f.code,
      message: f.message,
      probableRootCause: f.probableRootCause,
      suggestedNextCheck: f.suggestedNextCheck,
      relatedFiles: f.relatedFiles,
    })),
    scheduler: {
      fillRate: report.scheduler.fillRate,
      solverStatus: report.scheduler.solverStatus,
      solverTimeMs: report.scheduler.solverTimeMs,
      eventsPlaced: report.scheduler.eventsPlaced,
      eventsRequested: report.scheduler.eventsRequested,
      unscheduled: report.scheduler.unscheduled,
    },
    repair: {
      cycles: report.repair.cycles,
      status: report.repair.status,
      timeline: report.repair.timeline,
    },
    quality: {
      score: report.quality.qualityScore,
      items: report.quality.itemsCount,
      warnings: report.quality.warningsCount,
    },
    firstFailingPhase: report.firstFailingPhase,
    suggestedInspectionOrder: report.suggestedInspectionOrder,
    outputFile: report.run.outputFile,
  };
}

// ─── Verbose extras ─────────────────────────────────────────────────────────

function renderVerbosePhaseIO(report: DiagnosticReport): string {
  // In verbose mode, we show the phase IO details that are embedded in keyMetric
  // The collector already extracts key metrics; verbose just shows the full detail
  return [
    '',
    '--- Phase IO Details (verbose) ---',
    ...report.phases.map((p) => `  ${pad(p.phase, 16)} ${p.keyMetric}`),
  ].join('\n');
}

// ─── Public render ──────────────────────────────────────────────────────────

export function renderDiagnosticReport(report: DiagnosticReport, mode: RenderMode): {
  stderr: string;
  stdout: string;
} {
  if (mode === 'json') {
    return {
      stderr: '',
      stdout: JSON.stringify(buildAgentJson(report), null, 2),
    };
  }

  const sections: string[] = [
    renderRunSummary(report),
    renderClassification(report),
    renderProfile(report),
    renderPhaseTable(report),
    renderFindings(report.findings),
    renderSchedulerBlock(report),
    renderRepairBlock(report),
    renderQualityBlock(report),
  ];

  if (mode === 'verbose') {
    sections.push(renderVerbosePhaseIO(report));
  }

  const agentJson = buildAgentJson(report);
  const stdout = [
    '--- V5 DIAGNOSTIC JSON START ---',
    JSON.stringify(agentJson, null, 2),
    '--- V5 DIAGNOSTIC JSON END ---',
  ].join('\n');

  return {
    stderr: sections.filter(Boolean).join('\n'),
    stdout,
  };
}
