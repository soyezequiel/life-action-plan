import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

import { hydrateRuntimeSnapshotWithRunnerResult, type LatestRunnerPlanResult } from '../src/lib/debug/v5-runner-results';
import { createEmptyPipelineRuntimeData } from '../src/lib/flow/pipeline-runtime-data';
import { getPlanPackageMock } from '../src/lib/pipeline/v5/__mocks__/plan-package.mock';

describe('v5 runner results', () => {
  it('hidrata el package phase con el paquete final del runner cuando coincide el output file', () => {
    const outputFile = resolve(process.cwd(), 'tmp/pipeline-v5-real.json');
    const snapshot = createEmptyPipelineRuntimeData({
      source: 'cli-v5',
      modelId: 'openai:gpt-4o-mini',
      goalText: 'Aprender ingles',
      outputFile,
    });
    const pkg = getPlanPackageMock('v5-runner-hydrated');
    const result: LatestRunnerPlanResult = {
      package: pkg,
      outputFile,
      source: 'latest',
    };

    snapshot.phaseStatuses.package = 'success';
    snapshot.phases.package = {
      input: { previous: true },
      output: { qualityScore: 0.25 },
      processing: 'Empaqueta el resultado.',
      startedAt: '2026-03-30T00:00:00.000Z',
      finishedAt: '2026-03-30T00:00:01.000Z',
      durationMs: 1000,
    };

    const hydrated = hydrateRuntimeSnapshotWithRunnerResult(snapshot, result);

    expect(hydrated?.phases.package?.processing).toBe('Empaqueta el resultado.');
    expect(hydrated?.phases.package?.output).toEqual(pkg);
    expect((hydrated?.phases.package?.output as typeof pkg).plan.detail.weeks.length).toBe(pkg.plan.detail.weeks.length);
  });

  it('deja intacto el snapshot si el output file no coincide', () => {
    const snapshot = createEmptyPipelineRuntimeData({
      source: 'cli-v5',
      modelId: 'openai:gpt-4o-mini',
      goalText: 'Aprender ingles',
      outputFile: resolve(process.cwd(), 'tmp/otro-resultado.json'),
    });
    const result: LatestRunnerPlanResult = {
      package: getPlanPackageMock('v5-runner-miss'),
      outputFile: resolve(process.cwd(), 'tmp/pipeline-v5-real.json'),
      source: 'latest',
    };

    const hydrated = hydrateRuntimeSnapshotWithRunnerResult(snapshot, result);

    expect(hydrated).toBe(snapshot);
  });
});
