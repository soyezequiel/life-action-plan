import type { CriticFinding, CriticReport } from '../types';

export function formatCriticFindingsForRevision(findings: CriticFinding[]): string {
  if (findings.length === 0) return '';

  return findings
    .map((f, i) => {
      const parts = [`${i + 1}. [${f.severity}/${f.category}] ${f.message}`];
      if (f.suggestion) {
        parts.push(`   Sugerencia: ${f.suggestion}`);
      }
      if (f.affectedPhaseIds.length > 0) {
        parts.push(`   Fases afectadas: ${f.affectedPhaseIds.join(', ')}`);
      }
      return parts.join('\n');
    })
    .join('\n');
}

export function formatCriticReportSummary(report: CriticReport): string {
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

export function buildRevisionContext(criticReports: CriticReport[]): string {
  if (criticReports.length === 0) return '';

  return criticReports
    .map((report, i) => {
      const header = criticReports.length > 1
        ? `### Revision ${i + 1}`
        : '### Hallazgos del critico';
      return `${header}\n${formatCriticReportSummary(report)}`;
    })
    .join('\n\n');
}
