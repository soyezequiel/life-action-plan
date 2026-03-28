import { describe, expect, it } from 'vitest';

import {
  buildPendingAdaptiveState,
  buildPlanManifest,
  readPlanV5Manifest,
  updatePlanManifestV5,
} from '../../src/lib/domain/plan-helpers';
import { getPlanPackageMock } from '../helpers/plan-package.mock';

describe('plan v5 manifest helpers', () => {
  it('persiste package, adaptive pending y run snapshot dentro de manifest.v5', () => {
    const pkg = getPlanPackageMock('plan-v5-manifest');
    const manifest = buildPlanManifest({
      nombre: 'Plan V5',
      fallbackUsed: false,
      modelId: 'openrouter:openai/gpt-4o-mini',
      tokensInput: 100,
      tokensOutput: 200,
      costUsd: 0.01,
      costSats: 10,
      v5: {
        package: pkg,
        adaptive: buildPendingAdaptiveState('2026-03-30T00:00:00.000Z'),
        run: {
          runId: 'run-v5-1',
          modelId: 'openrouter:openai/gpt-4o-mini',
          qualityScore: pkg.qualityScore,
          startedAt: '2026-03-30T00:00:00.000Z',
          finishedAt: '2026-03-30T00:00:10.000Z',
          phaseTimeline: {
            package: {
              startedAt: '2026-03-30T00:00:09.000Z',
              finishedAt: '2026-03-30T00:00:10.000Z',
              durationMs: 1000,
            },
          },
          phaseStatuses: {
            package: 'success',
            adapt: 'pending',
          },
          repairTimeline: [],
        },
      },
    });

    const stored = readPlanV5Manifest(manifest);

    expect(stored?.package?.summary_esAR).toBe(pkg.summary_esAR);
    expect(stored?.adaptive?.status).toBe('pending');
    expect(stored?.run?.runId).toBe('run-v5-1');
  });

  it('actualiza adaptive sin perder package ni run', () => {
    const pkg = getPlanPackageMock('plan-v5-manifest-update');
    const manifest = buildPlanManifest({
      nombre: 'Plan V5',
      fallbackUsed: false,
      modelId: 'openrouter:openai/gpt-4o-mini',
      tokensInput: 100,
      tokensOutput: 200,
      costUsd: 0.01,
      costSats: 10,
      v5: {
        package: pkg,
        adaptive: buildPendingAdaptiveState('2026-03-30T00:00:00.000Z'),
        run: {
          runId: 'run-v5-2',
          modelId: 'openrouter:openai/gpt-4o-mini',
          qualityScore: pkg.qualityScore,
          startedAt: '2026-03-30T00:00:00.000Z',
          finishedAt: '2026-03-30T00:00:10.000Z',
          phaseTimeline: {},
          phaseStatuses: {
            package: 'success',
            adapt: 'pending',
          },
          repairTimeline: [],
        },
      },
    });

    const updated = updatePlanManifestV5(manifest, {
      adaptive: {
        status: 'ready',
        output: {
          mode: 'ABSORB',
          overallRisk: 'SAFE',
          assessments: [],
          dispatch: {
            rerunFromPhase: 'schedule',
            phasesToRun: ['schedule', 'hardValidate', 'softValidate', 'coveVerify', 'repair', 'package'],
            preserveSkeleton: true,
            preserveHabitState: true,
            allowSlackRecovery: true,
            relaxSoftConstraints: false,
            maxChurnMoves: 3,
            affectedProgressionKeys: [],
            activityAdjustments: [],
            slackPolicy: pkg.slackPolicy,
            reason: 'No hace falta cambiar nada.',
          },
          summary_esAR: 'Sin cambios por ahora.',
          recommendations: [],
          changesMade: [],
        },
        updatedAt: '2026-03-31T00:00:00.000Z',
        lastError: null,
      },
    });

    const stored = readPlanV5Manifest(updated);

    expect(stored?.package?.summary_esAR).toBe(pkg.summary_esAR);
    expect(stored?.run?.runId).toBe('run-v5-2');
    expect(stored?.adaptive?.status).toBe('ready');
    expect(stored?.adaptive?.output?.mode).toBe('ABSORB');
  });
});
