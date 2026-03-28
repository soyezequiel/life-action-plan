export interface RevisionCriticFinding {
  severity: 'critical' | 'warning' | 'info';
  category: 'feasibility' | 'specificity' | 'progression' | 'scheduling' | 'motivation' | 'domain';
  message: string;
  suggestion: string | null;
  affectedPhaseIds: string[];
}

export interface RevisionCriticReport {
  overallScore: number;
  mustFix: RevisionCriticFinding[];
  shouldFix: RevisionCriticFinding[];
  verdict: 'approve' | 'revise' | 'rethink';
  reasoning: string;
}

export function formatCriticFindingsForRevision(findings: RevisionCriticFinding[]): string {
  if (findings.length === 0) return '';

  return findings
    .map((finding, index) => {
      const parts = [`${index + 1}. [${finding.severity}/${finding.category}] ${finding.message}`];
      if (finding.suggestion) {
        parts.push(`   Sugerencia: ${finding.suggestion}`);
      }
      if (finding.affectedPhaseIds.length > 0) {
        parts.push(`   Fases afectadas: ${finding.affectedPhaseIds.join(', ')}`);
      }
      return parts.join('\n');
    })
    .join('\n');
}

export function formatCriticReportSummary(report: RevisionCriticReport): string {
  const parts: string[] = [
    `Puntuacion: ${report.overallScore}/100`,
    `Veredicto: ${report.verdict}`,
    `Razonamiento: ${report.reasoning}`,
  ];

  if (report.mustFix.length > 0) {
    parts.push(`\nProblemas criticos (${report.mustFix.length}):`);
    parts.push(formatCriticFindingsForRevision(report.mustFix));
  }

  if (report.shouldFix.length > 0) {
    parts.push(`\nMejoras sugeridas (${report.shouldFix.length}):`);
    parts.push(formatCriticFindingsForRevision(report.shouldFix));
  }

  return parts.join('\n');
}

export function buildRevisionContext(criticReports: RevisionCriticReport[]): string {
  if (criticReports.length === 0) return '';

  return criticReports
    .map((report, index) => {
      const header = criticReports.length > 1
        ? `### Revision ${index + 1}`
        : '### Hallazgos del critico';
      return `${header}\n${formatCriticReportSummary(report)}`;
    })
    .join('\n\n');
}
