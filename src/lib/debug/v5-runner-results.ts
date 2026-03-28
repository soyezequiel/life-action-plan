import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import type { PhaseIO } from '../pipeline/phase-io';
import type { PlanPackage } from '../pipeline/v5/phase-io-v5';
import type { PipelineRuntimeData } from '../flow/pipeline-runtime-data';
import { readLatestSuccessfulRuntimeData, readPipelineRuntimeData } from '../flow/pipeline-runtime-data';

const DEFAULT_OUTPUT_FILE = resolve(process.cwd(), 'tmp/pipeline-v5-real.json');

export interface LatestRunnerPlanResult {
  package: PlanPackage | null;
  outputFile: string | null;
  source: 'latest' | 'latest-success' | 'default-file' | 'missing';
}

function resolveCandidateFiles(): string[] {
  const latest = readPipelineRuntimeData()?.run.outputFile ?? null;
  const latestSuccess = readLatestSuccessfulRuntimeData()?.run.outputFile ?? null;

  return [latest, latestSuccess, DEFAULT_OUTPUT_FILE].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
}

function readPlanPackageFromFile(filePath: string): PlanPackage | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as PlanPackage;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function readLatestRunnerPlanResult(): LatestRunnerPlanResult {
  const candidates = resolveCandidateFiles();

  for (const [index, filePath] of candidates.entries()) {
    const pkg = readPlanPackageFromFile(filePath);
    if (pkg) {
      return {
        package: pkg,
        outputFile: filePath,
        source: index === 0 ? 'latest' : index === 1 ? 'latest-success' : 'default-file',
      };
    }
  }

  return {
    package: null,
    outputFile: candidates[0] ?? DEFAULT_OUTPUT_FILE,
    source: 'missing',
  };
}

function resolveComparablePath(filePath: string | null | undefined): string | null {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    return null;
  }

  return resolve(filePath);
}

function shouldHydrateSnapshot(
  snapshot: PipelineRuntimeData | null,
  result: LatestRunnerPlanResult,
): snapshot is PipelineRuntimeData {
  if (!snapshot || !result.package || !result.outputFile) {
    return false;
  }

  const snapshotOutputFile = resolveComparablePath(snapshot.run.outputFile);
  const resultOutputFile = resolveComparablePath(result.outputFile);

  return snapshotOutputFile !== null && snapshotOutputFile === resultOutputFile;
}

function buildHydratedPackagePhase(
  snapshot: PipelineRuntimeData,
  result: LatestRunnerPlanResult,
): PhaseIO<Record<string, unknown>, PlanPackage> {
  const existingPhase = snapshot.phases.package;
  const phaseTiming = snapshot.phaseTimeline.package;
  const startedAt = existingPhase?.startedAt ?? phaseTiming?.startedAt ?? snapshot.run.startedAt;
  const finishedAt = existingPhase?.finishedAt ?? phaseTiming?.finishedAt ?? snapshot.run.finishedAt ?? startedAt;
  const durationMs = existingPhase?.durationMs ?? phaseTiming?.durationMs ?? 0;

  return {
    input: (existingPhase?.input ?? {}) as Record<string, unknown>,
    output: result.package as PlanPackage,
    processing: existingPhase?.processing ?? '',
    startedAt,
    finishedAt,
    durationMs,
  };
}

export function hydrateRuntimeSnapshotWithRunnerResult(
  snapshot: PipelineRuntimeData | null,
  result: LatestRunnerPlanResult = readLatestRunnerPlanResult(),
): PipelineRuntimeData | null {
  if (!shouldHydrateSnapshot(snapshot, result)) {
    return snapshot;
  }

  return {
    ...snapshot,
    phases: {
      ...snapshot.phases,
      package: buildHydratedPackagePhase(snapshot, result),
    },
  };
}

const runnerResults = {
  readLatestRunnerPlanResult,
  hydrateRuntimeSnapshotWithRunnerResult,
};

export default runnerResults;
