import { describe, expect, it } from 'vitest';

import {
  normalizeHardFindings,
  normalizeSoftFindings,
  normalizeCoveFindings,
  normalizeRepairAttempts,
  normalizeAllFindings,
  type NormalizedFinding,
} from '../scripts/diagnostic-findings';
import { DiagnosticCollector } from '../scripts/diagnostic-collector';
import { renderDiagnosticReport } from '../scripts/diagnostic-renderer';
import type { HardFinding, SoftFinding, CoVeFinding, RepairAttemptRecord } from '../src/lib/pipeline/v5/phase-io-v5';

// ─── Findings normalizer ────────────────────────────────────────────────────

describe('diagnostic-findings', () => {
  describe('normalizeHardFindings', () => {
    it('maps known hard finding codes with correct metadata', () => {
      const findings: HardFinding[] = [
        { code: 'HV-OVERLAP', severity: 'FAIL', description: 'Overlap detected', affectedItems: ['e1', 'e2'] },
        { code: 'HV-OUTSIDE_AWAKE_HOURS', severity: 'FAIL', description: 'Outside hours', affectedItems: ['e3'] },
      ];
      const result = normalizeHardFindings(findings);

      expect(result).toHaveLength(2);
      expect(result[0].phase).toBe('hardValidate');
      expect(result[0].category).toBe('scheduling');
      expect(result[0].code).toBe('HV-OVERLAP');
      expect(result[0].probableRootCause).toContain('overlapping');
      expect(result[0].relatedFiles.length).toBeGreaterThan(0);
    });

    it('uses default meta for unknown codes', () => {
      const findings: HardFinding[] = [
        { code: 'HV-UNKNOWN', severity: 'FAIL', description: 'Mystery', affectedItems: [] },
      ];
      const result = normalizeHardFindings(findings);
      expect(result[0].category).toBe('unknown');
    });
  });

  describe('normalizeSoftFindings', () => {
    it('maps soft findings preserving severity', () => {
      const findings: SoftFinding[] = [
        { code: 'SV-CONTEXT-SWITCH', severity: 'WARN', suggestion_esAR: 'Muchos cambios' },
        { code: 'SV-RAMP-UP', severity: 'INFO', suggestion_esAR: 'Muchas horas' },
      ];
      const result = normalizeSoftFindings(findings);

      expect(result).toHaveLength(2);
      expect(result[0].severity).toBe('WARN');
      expect(result[0].category).toBe('energy');
      expect(result[1].severity).toBe('INFO');
      expect(result[1].category).toBe('capacity');
    });
  });

  describe('normalizeCoveFindings', () => {
    it('maps cove findings with grounding context', () => {
      const findings: CoVeFinding[] = [
        {
          code: 'COVE-REST',
          question: 'Rest?',
          answer: 'No rest',
          severity: 'FAIL',
          groundedByFacts: true,
          supportingFacts: ['restDays=0'],
        },
      ];
      const result = normalizeCoveFindings(findings);

      expect(result[0].phase).toBe('coveVerify');
      expect(result[0].message).toBe('No rest');
      expect(result[0].category).toBe('energy');
    });
  });

  describe('normalizeRepairAttempts', () => {
    it('converts non-committed attempts to findings', () => {
      const attempts: RepairAttemptRecord[] = [
        {
          candidate: { type: 'MOVE', targetId: 'e1' },
          source: 'deterministic',
          baselineScore: 0.7,
          candidateScore: 0.6,
          decision: 'reverted',
          remainingFindings: [],
        },
        {
          candidate: { type: 'DROP', targetId: 'e2' },
          source: 'llm-ranked',
          baselineScore: 0.7,
          candidateScore: 0.5,
          decision: 'escalated',
          remainingFindings: [{ severity: 'FAIL', message: 'still broken' }],
        },
        {
          candidate: { type: 'SWAP', targetId: 'e3', extraId: 'e4' },
          source: 'deterministic',
          baselineScore: 0.7,
          candidateScore: 0.9,
          decision: 'committed',
          remainingFindings: [],
        },
      ];
      const result = normalizeRepairAttempts(attempts);

      expect(result).toHaveLength(2);
      expect(result[0].severity).toBe('INFO');
      expect(result[0].code).toBe('REPAIR-REVERTED');
      expect(result[1].severity).toBe('WARN');
      expect(result[1].code).toBe('REPAIR-ESCALATED');
    });
  });

  describe('normalizeAllFindings', () => {
    it('sorts by severity (FAIL first, then WARN, then INFO)', () => {
      const hard: HardFinding[] = [{ code: 'HV-OVERLAP', severity: 'FAIL', description: 'x', affectedItems: [] }];
      const soft: SoftFinding[] = [{ code: 'SV-NO-REST', severity: 'WARN', suggestion_esAR: 'y' }];
      const cove: CoVeFinding[] = [
        { code: 'COVE-REST', question: 'q', answer: 'ok', severity: 'INFO', groundedByFacts: true, supportingFacts: [] },
      ];
      const result = normalizeAllFindings(hard, soft, cove, []);

      expect(result[0].severity).toBe('FAIL');
      expect(result[1].severity).toBe('WARN');
      expect(result[2].severity).toBe('INFO');
    });
  });
});

// ─── Collector ──────────────────────────────────────────────────────────────

describe('DiagnosticCollector', () => {
  function createCollector(): DiagnosticCollector {
    const c = new DiagnosticCollector();
    c.setRunMeta({
      modelId: 'test-model',
      authMode: 'API key',
      outputFile: 'tmp/test.json',
      startedAt: '2026-03-26T10:00:00.000Z',
      command: 'npx tsx scripts/lap-runner-v5-real.ts --diagnostic',
    });
    return c;
  }

  it('produces a report with run metadata', () => {
    const c = createCollector();
    c.setRunCompletion('success', 0.85);
    const report = c.getReport();

    expect(report.run.modelId).toBe('test-model');
    expect(report.run.status).toBe('success');
    expect(report.run.qualityScore).toBe(0.85);
  });

  it('records phase success with key metrics', () => {
    const c = createCollector();
    c.recordPhaseSuccess('classify', {
      input: { text: 'test' },
      output: {
        goalType: 'SKILL_ACQUISITION',
        confidence: 0.9,
        risk: 'LOW',
        extractedSignals: {},
      },
      processing: 'test',
      startedAt: '2026-03-26T10:00:00.000Z',
      finishedAt: '2026-03-26T10:00:02.000Z',
      durationMs: 2000,
    });
    c.setRunCompletion('success');
    const report = c.getReport();

    expect(report.phases).toHaveLength(1);
    expect(report.phases[0].phase).toBe('classify');
    expect(report.phases[0].status).toBe('ok');
    expect(report.phases[0].durationMs).toBe(2000);
    expect(report.phases[0].keyMetric).toContain('SKILL_ACQUISITION');
  });

  it('marks hardValidate as fail when findings exist', () => {
    const c = createCollector();
    c.recordPhaseSuccess('hardValidate', {
      input: {},
      output: {
        findings: [
          { code: 'HV-OVERLAP', severity: 'FAIL', description: 'overlap', affectedItems: [] },
        ],
      },
      processing: 'test',
      startedAt: '2026-03-26T10:00:00.000Z',
      finishedAt: '2026-03-26T10:00:01.000Z',
      durationMs: 1000,
    });
    c.setRunCompletion('success');
    const report = c.getReport();

    expect(report.phases[0].status).toBe('fail');
    expect(report.firstFailingPhase).toBe('hardValidate');
  });

  it('records skipped phases', () => {
    const c = createCollector();
    c.recordPhaseSkipped('repair');
    c.setRunCompletion('success');
    const report = c.getReport();

    expect(report.phases[0].status).toBe('skipped');
    expect(report.repair.status).toBe('clean');
  });

  it('records phase failure', () => {
    const c = createCollector();
    c.recordPhaseFailure('strategy', new Error('V5_STRATEGY_NEEDS_PROFILE'));
    c.setRunCompletion('error');
    const report = c.getReport();

    expect(report.phases[0].status).toBe('fail');
    expect(report.phases[0].keyMetric).toContain('V5_STRATEGY_NEEDS_PROFILE');
  });

  it('extracts scheduler diagnostics from schedule output', () => {
    const c = createCollector();
    c.recordPhaseSuccess('template', {
      input: {},
      output: {
        activities: [
          { id: 'a1', label: 'Test', frequencyPerWeek: 3, durationMin: 30 },
          { id: 'a2', label: 'Test2', frequencyPerWeek: 2, durationMin: 45 },
        ],
      },
      processing: 'test',
      startedAt: '2026-03-26T10:00:00.000Z',
      finishedAt: '2026-03-26T10:00:00.100Z',
      durationMs: 100,
    });
    c.recordPhaseSuccess('schedule', {
      input: {},
      output: {
        events: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }],
        unscheduled: [{ activityId: 'a2', reason: 'no slots', suggestion_esAR: '' }],
        tradeoffs: [],
        metrics: { fillRate: 0.6, solverTimeMs: 250, solverStatus: 'optimal' },
      },
      processing: 'test',
      startedAt: '2026-03-26T10:00:00.000Z',
      finishedAt: '2026-03-26T10:00:00.250Z',
      durationMs: 250,
    });
    c.setRunCompletion('success');
    const report = c.getReport();

    expect(report.scheduler.fillRate).toBe(0.6);
    expect(report.scheduler.solverStatus).toBe('optimal');
    expect(report.scheduler.eventsPlaced).toBe(3);
    expect(report.scheduler.eventsRequested).toBe(5);
    expect(report.scheduler.unscheduled).toHaveLength(1);
  });
});

// ─── Renderer ───────────────────────────────────────────────────────────────

describe('diagnostic-renderer', () => {
  function createMinimalReport() {
    const c = new DiagnosticCollector();
    c.setRunMeta({
      modelId: 'test-model',
      authMode: 'API key',
      outputFile: 'tmp/test.json',
      startedAt: '2026-03-26T10:00:00.000Z',
      command: 'npx tsx scripts/lap-runner-v5-real.ts --diagnostic',
    });
    c.recordPhaseSuccess('classify', {
      input: { text: 'test' },
      output: { goalType: 'SKILL_ACQUISITION', confidence: 0.9, risk: 'LOW', extractedSignals: {} },
      processing: 'test',
      startedAt: '2026-03-26T10:00:00.000Z',
      finishedAt: '2026-03-26T10:00:01.000Z',
      durationMs: 1000,
    });
    c.recordPhaseSkipped('repair');
    c.setRunCompletion('success', 0.85);
    return c.getReport();
  }

  it('renders human mode with stderr and stdout', () => {
    const report = createMinimalReport();
    const output = renderDiagnosticReport(report, 'human');

    expect(output.stderr).toContain('LAP V5 Pipeline Diagnostic Report');
    expect(output.stderr).toContain('test-model');
    expect(output.stderr).toContain('Phase Status');
    expect(output.stderr).toContain('classify');
    expect(output.stdout).toContain('V5 DIAGNOSTIC JSON START');
    expect(output.stdout).toContain('"diagnostic": true');
  });

  it('renders json mode with only stdout', () => {
    const report = createMinimalReport();
    const output = renderDiagnosticReport(report, 'json');

    expect(output.stderr).toBe('');
    const parsed = JSON.parse(output.stdout);
    expect(parsed.diagnostic).toBe(true);
    expect(parsed.version).toBe(1);
    expect(parsed.modelId).toBe('test-model');
    expect(parsed.qualityScore).toBe(0.85);
  });

  it('renders verbose mode with phase IO details', () => {
    const report = createMinimalReport();
    const output = renderDiagnosticReport(report, 'verbose');

    expect(output.stderr).toContain('Phase IO Details');
    expect(output.stdout).toContain('V5 DIAGNOSTIC JSON START');
  });

  it('renders findings when present', () => {
    const c = new DiagnosticCollector();
    c.setRunMeta({
      modelId: 'test-model',
      authMode: 'API key',
      outputFile: 'tmp/test.json',
      startedAt: '2026-03-26T10:00:00.000Z',
      command: 'test',
    });
    c.recordPhaseSuccess('hardValidate', {
      input: {},
      output: {
        findings: [
          { code: 'HV-OVERLAP', severity: 'FAIL', description: 'Overlap entre A y B', affectedItems: ['e1', 'e2'] },
        ],
      },
      processing: 'test',
      startedAt: '2026-03-26T10:00:00.000Z',
      finishedAt: '2026-03-26T10:00:01.000Z',
      durationMs: 1000,
    });
    c.setRunCompletion('success', 0.5);
    const report = c.getReport();
    const output = renderDiagnosticReport(report, 'human');

    expect(output.stderr).toContain('Findings');
    expect(output.stderr).toContain('1 FAIL');
    expect(output.stderr).toContain('HV-OVERLAP');
    expect(output.stderr).toContain('Root cause');
    expect(output.stderr).toContain('Next check');
  });

  it('agent JSON has correct structure for machine parsing', () => {
    const report = createMinimalReport();
    const output = renderDiagnosticReport(report, 'json');
    const parsed = JSON.parse(output.stdout);

    expect(parsed).toHaveProperty('diagnostic', true);
    expect(parsed).toHaveProperty('version', 1);
    expect(parsed).toHaveProperty('status');
    expect(parsed).toHaveProperty('phases');
    expect(parsed).toHaveProperty('findings');
    expect(parsed).toHaveProperty('scheduler');
    expect(parsed).toHaveProperty('repair');
    expect(parsed).toHaveProperty('quality');
    expect(parsed).toHaveProperty('firstFailingPhase');
    expect(parsed).toHaveProperty('suggestedInspectionOrder');
  });
});
